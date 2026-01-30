import fetch from "node-fetch";
import { env } from "../lib/env.js";

async function fetchJsonWithTimeout(url: string, opts: any) {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(env.evolutionFetchTimeoutMs) ? env.evolutionFetchTimeoutMs : 8000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: controller.signal as any });
    const data: any = await r.json().catch(() => ({}));
    return { r, data };
  } finally {
    clearTimeout(t);
  }
}

function isRetriableStatus(status: number) {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headers(extra?: Record<string, string>) {
  return {
    "content-type": "application/json",
    apikey: env.evolutionApiKey,
    ...(extra ?? {})
  };
}

export async function evolutionCreateInstance(params: {
  instanceName: string;
  withQr?: boolean;
  webhookUrl: string;
  webhookSecret: string;
}) {
  const body = {
    instanceName: params.instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: !!params.withQr,
    groupsIgnore: true,
    readMessages: true,
    webhook: {
      enabled: true,
      url: params.webhookUrl,
      events: ["MESSAGES_UPSERT"],
      headers: {
        "x-bot-secret": params.webhookSecret
      },
      byEvents: false,
      base64: false
    }
  };

  const { r, data } = await fetchJsonWithTimeout(`${env.evolutionUrl}/instance/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const msg = typeof data?.message === "string" ? data.message : JSON.stringify(data);
    throw new Error(`Evolution createInstance failed (${r.status}): ${msg}`);
  }
  return data as any;
}

export async function evolutionConnect(instanceName: string) {
  const { r, data } = await fetchJsonWithTimeout(
    `${env.evolutionUrl}/instance/connect/${encodeURIComponent(instanceName)}`,
    {
      method: "GET",
      headers: headers()
    }
  );
  if (!r.ok) {
    const msg = typeof data?.message === "string" ? data.message : JSON.stringify(data);
    throw new Error(`Evolution connect failed (${r.status}): ${msg}`);
  }
  return data;
}

export async function evolutionSendText(instanceName: string, to: string, text: string) {
  // Evolution SendTextDto expects: { number: string, text: string }
  const body = { number: to, text };
  const url = `${env.evolutionUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
  let attempt = 0;
  let lastErr: any = null;

  while (attempt < 2) {
    attempt += 1;
    const { r, data } = await fetchJsonWithTimeout(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body)
    });

    if (r.ok) return data;

    const msg = typeof data?.message === "string" ? data.message : JSON.stringify(data);
    lastErr = new Error(`Evolution sendText failed (${r.status}): ${msg}`);

    if (attempt < 2 && isRetriableStatus(r.status)) {
      await sleep(350);
      continue;
    }
    throw lastErr;
  }

  throw lastErr ?? new Error("Evolution sendText failed");
}

export type PresenceType = "unavailable" | "available" | "composing" | "recording" | "paused";

export async function evolutionSendPresence(instanceName: string, to: string, presence: PresenceType, delayMs: number) {
  // Evolution PresenceDto expects: { number: string, presence: enum, delay: number }
  const body = { number: to, presence, delay: Math.max(0, Math.floor(delayMs)) };
  const url = `${env.evolutionUrl}/chat/sendPresence/${encodeURIComponent(instanceName)}`;
  try {
    const { r, data } = await fetchJsonWithTimeout(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body)
    });
    // Presence is best-effort; don't fail the reply if presence fails.
    if (!r.ok) return { ok: false, error: data };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * Media (image/video/document/audio). We’ll mainly use image for product pics.
 * Evolution SendMediaDto commonly expects:
 * { number, mediatype: 'image', media: '<url>', caption?: '<text>' }
 */
export type MediaType = "image" | "video" | "document" | "audio";

export async function evolutionSendMedia(params: {
  instanceName: string;
  to: string;
  mediaUrl: string;
  mediaType: MediaType;
  caption?: string;
  fileName?: string; // useful for documents
}) {
  const body: any = {
    number: params.to,
    mediatype: params.mediaType,
    media: params.mediaUrl
  };

  if (params.caption) body.caption = params.caption;
  if (params.fileName) body.fileName = params.fileName;

  const url = `${env.evolutionUrl}/message/sendMedia/${encodeURIComponent(params.instanceName)}`;

  let attempt = 0;
  let lastErr: any = null;

  while (attempt < 2) {
    attempt += 1;
    const { r, data } = await fetchJsonWithTimeout(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body)
    });

    if (r.ok) return data;

    const msg = typeof data?.message === "string" ? data.message : JSON.stringify(data);
    lastErr = new Error(`Evolution sendMedia failed (${r.status}): ${msg}`);

    if (attempt < 2 && isRetriableStatus(r.status)) {
      await sleep(350);
      continue;
    }
    throw lastErr;
  }

  throw lastErr ?? new Error("Evolution sendMedia failed");
}

/** Convenience helper for product images */
export async function evolutionSendImage(instanceName: string, to: string, imageUrl: string, caption?: string) {
  return evolutionSendMedia({
    instanceName,
    to,
    mediaUrl: imageUrl,
    mediaType: "image",
    caption
  });
}
