import fetch from "node-fetch";

import { logger } from "../../utils/logger";

const BOT_URL = String(process.env.BOT_URL || "").replace(/\/$/, "");
const BOT_WEBHOOK_SECRET = String(process.env.BOT_WEBHOOK_SECRET || "");
const BOT_ADMIN_TOKEN = String(process.env.BOT_ADMIN_TOKEN || "");

function isConfigured(): boolean {
  return !!BOT_URL;
}

export async function botForwardEvolutionWebhook(payload: any): Promise<void> {
  if (!isConfigured() || !BOT_WEBHOOK_SECRET) return;

  try {
    const url = `${BOT_URL}/webhooks/evolution`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bot-secret": BOT_WEBHOOK_SECRET
      } as any,
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      logger.warn({ status: r.status, text }, "botForwardEvolutionWebhook failed");
    }
  } catch (err: any) {
    logger.warn({ err: String(err?.message ?? err) }, "botForwardEvolutionWebhook error");
  }
}

export async function botSetConversationMode(params: {
  instance: string;
  remoteJid: string;
  botMode: "ON" | "OFF" | "HUMAN_ONLY";
  notes?: string;
}): Promise<void> {
  if (!isConfigured() || !BOT_ADMIN_TOKEN) return;

  try {
    const url = `${BOT_URL}/admin/conversation-rules`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": BOT_ADMIN_TOKEN
      } as any,
      body: JSON.stringify({
        instance: params.instance,
        remoteJid: params.remoteJid,
        botMode: params.botMode,
        notes: params.notes
      })
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      logger.warn({ status: r.status, text }, "botSetConversationMode failed");
    }
  } catch (err: any) {
    logger.warn({ err: String(err?.message ?? err) }, "botSetConversationMode error");
  }
}

export async function botDeleteConversationRule(params: {
  instance: string;
  remoteJid: string;
}): Promise<void> {
  if (!isConfigured() || !BOT_ADMIN_TOKEN) return;

  try {
    const url = `${BOT_URL}/admin/conversation-rules/${encodeURIComponent(
      params.instance
    )}/${encodeURIComponent(params.remoteJid)}`;

    const r = await fetch(url, {
      method: "DELETE",
      headers: {
        "x-admin-token": BOT_ADMIN_TOKEN
      } as any
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      logger.warn({ status: r.status, text }, "botDeleteConversationRule failed");
    }
  } catch (err: any) {
    logger.warn({ err: String(err?.message ?? err) }, "botDeleteConversationRule error");
  }
}
