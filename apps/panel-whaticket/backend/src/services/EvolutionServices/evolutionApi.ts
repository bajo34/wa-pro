import fetch from "node-fetch";

import { logger } from "../../utils/logger";

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";

function assertConfigured() {
  if (!EVOLUTION_API_URL) {
    throw new Error("EVOLUTION_API_URL is not set");
  }
  if (!EVOLUTION_API_KEY) {
    throw new Error("EVOLUTION_API_KEY is not set");
  }
}

function headers(extra?: Record<string, string>) {
  return {
    "content-type": "application/json",
    apikey: EVOLUTION_API_KEY,
    ...(extra || {})
  } as any;
}

async function fetchJson(url: string, init: any) {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

export type EvolutionQrCode = {
  count?: number;
  pairingCode?: string;
  base64?: string;
  code?: string;
};

export function evolutionExtractQrCode(payload: any): string {
  // Evolution may return a QrCode object directly, or wrapped.
  const qr: any = payload?.qrcode || payload?.qrCode || payload?.instance?.qrcode || payload;

  // Prefer the raw QR string (some builds expose it as `code` or `qr`).
  const code = qr?.code ?? qr?.qr ?? qr?.text;
  if (typeof code === "string" && code.trim().length > 0) return code.trim();

  // Some builds expose a pairing code.
  const pairing = qr?.pairingCode;
  if (typeof pairing === "string" && pairing.trim().length > 0) return pairing.trim();

  // Many builds return the QR image as base64. We pass it through so the frontend can render it.
  const base64 = qr?.base64 ?? payload?.base64;
  if (typeof base64 === "string" && base64.trim().length > 0) {
    const b = base64.trim();
    return b.startsWith("data:image") ? b : `data:image/png;base64,${b}`;
  }

  // Last resort: if it's already a string
  if (typeof qr === "string") return qr;

  return "";
}

export async function evolutionSetWebhook(params: {
  instanceName: string;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<any> {
  assertConfigured();
  // Evolution v2 exposes a webhook set endpoint; we keep this tolerant to different minor versions.
  const base = EVOLUTION_API_URL.replace(/\/$/, "");
  const url = `${base}/webhook/set/${encodeURIComponent(params.instanceName)}`;
  const body = {
    enabled: true,
    url: params.webhookUrl,
    webhook_by_events: false,
    webhook_base64: String(process.env.EVOLUTION_WEBHOOK_BASE64 || "").toLowerCase() === "true",
    events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"],
    headers: {
      "x-evolution-secret": params.webhookSecret
    }
  };

  const { r, data } = await fetchJson(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    // Some Evolution builds may not support this route; don't hard-fail the whole flow.
    logger.warn({ status: r.status, data }, "Evolution setWebhook failed");
  }
  return data;
}

export async function evolutionConnectionState(instanceName: string): Promise<string> {
  assertConfigured();
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(
    instanceName
  )}`;

  const { r, data } = await fetchJson(url, { method: "GET", headers: headers() });
  if (!r.ok) {
    logger.warn({ status: r.status, data }, "Evolution connectionState failed");
    return "";
  }
  const state = data?.instance?.state;
  return typeof state === "string" ? state : "";
}

export async function evolutionCreateInstance(params: {
  instanceName: string;
  webhookUrl: string;
  webhookSecret: string;
  withQr?: boolean;
}): Promise<any> {
  assertConfigured();
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/create`;
  const body = {
    instanceName: params.instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: !!params.withQr,
    groupsIgnore: true,
    readMessages: true,
    webhook: {
      enabled: true,
      url: params.webhookUrl,
      // Include QR + connection events so the panel can update instantly.
      events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"],
      headers: {
        "x-evolution-secret": params.webhookSecret
      },
      byEvents: false,
      base64: String(process.env.EVOLUTION_WEBHOOK_BASE64 || "").toLowerCase() === "true"
    }
  };

  const { r, data } = await fetchJson(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const msg = typeof data?.message === "string" ? data.message : JSON.stringify(data);
    throw new Error(`Evolution createInstance failed (${r.status}): ${msg}`);
  }
  return data;
}

export async function evolutionConnect(instanceName: string): Promise<any> {
  assertConfigured();
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/connect/${encodeURIComponent(
    instanceName
  )}`;
  const { r, data } = await fetchJson(url, { method: "GET", headers: headers() });
  if (!r.ok) {
    const msg = typeof data?.message === "string" ? data.message : JSON.stringify(data);
    throw new Error(`Evolution connect failed (${r.status}): ${msg}`);
  }
  return data;
}

export async function evolutionLogout(instanceName: string): Promise<void> {
  assertConfigured();
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/instance/logout/${encodeURIComponent(
    instanceName
  )}`;
  await fetchJson(url, { method: "DELETE", headers: headers() });
}

export async function evolutionSendText(params: {
  instanceName: string;
  to: string;
  text: string;
}): Promise<any> {
  assertConfigured();
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(
    params.instanceName
  )}`;
  const body = { number: params.to, text: params.text };
  const { r, data } = await fetchJson(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const msg = typeof data?.message === "string" ? data.message : JSON.stringify(data);
    throw new Error(`Evolution sendText failed (${r.status}): ${msg}`);
  }
  return data;
}

export async function evolutionSendMedia(params: {
  instanceName: string;
  to: string;
  mediaUrl: string;
  mediaType: "image" | "video" | "document" | "audio";
  caption?: string;
  fileName?: string;
}): Promise<any> {
  assertConfigured();
  const url = `${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(
    params.instanceName
  )}`;
  const body: any = {
    number: params.to,
    mediatype: params.mediaType,
    media: params.mediaUrl
  };
  if (params.caption) body.caption = params.caption;
  if (params.fileName) body.fileName = params.fileName;

  const { r, data } = await fetchJson(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const msg = typeof data?.message === "string" ? data.message : JSON.stringify(data);
    throw new Error(`Evolution sendMedia failed (${r.status}): ${msg}`);
  }
  return data;
}
