import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";
import uploadConfig from "../config/upload";
import { botForwardEvolutionWebhook } from "../services/BotServices/botApi";

function getText(msg: any): string {
  const m = msg?.message || {};
  if (typeof m.conversation === "string") return m.conversation;
  if (typeof m.extendedTextMessage?.text === "string") return m.extendedTextMessage.text;
  if (typeof m.imageMessage?.caption === "string") return m.imageMessage.caption;
  if (typeof m.videoMessage?.caption === "string") return m.videoMessage.caption;
  if (typeof m.buttonsResponseMessage?.selectedDisplayText === "string") {
    return m.buttonsResponseMessage.selectedDisplayText;
  }
  if (typeof m.listResponseMessage?.title === "string") return m.listResponseMessage.title;
  return "";
}

function getMediaType(msg: any): string | undefined {
  const m = msg?.message || {};
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.audioMessage) return "audio";
  if (m.documentMessage) return "document";
  if (m.stickerMessage) return "sticker";
  if (m.locationMessage) return "location";
  return undefined;
}

function isMessagesUpsertEvent(body: any): boolean {
  const evRaw = String(body?.event ?? "");
  const ev = evRaw.toLowerCase();
  return (
    ev === "messages.upsert" ||
    ev === "messages_upsert" ||
    ev === "messagesupsert" ||
    evRaw === "MESSAGES_UPSERT"
  );
}

function parseCsvSet(v: string | undefined): Set<string> {
  return new Set(
    String(v || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  );
}

function isAllowedNumber(number: string): boolean {
  const allow = parseCsvSet(process.env.WHATSAPP_ALLOWLIST);
  const block = parseCsvSet(process.env.WHATSAPP_BLOCKLIST);

  if (block.size && block.has(number)) return false;
  if (allow.size) return allow.has(number);
  return true;
}

function guessExt(mediaType?: string): string {
  switch (mediaType) {
    case "image":
      return "jpg";
    case "video":
      return "mp4";
    case "audio":
      return "ogg";
    case "document":
      return "bin";
    default:
      return "bin";
  }
}

function tryPersistBase64Media(msgId: string, mediaType: string | undefined, base64: string): string | null {
  if (!base64 || typeof base64 !== "string") return null;

  // ~20MB raw cap (base64 expands ~33%)
  const maxBase64Chars = 28_000_000;
  if (base64.length > maxBase64Chars) return null;

  try {
    const buf = Buffer.from(base64, "base64");
    if (buf.length > 20 * 1024 * 1024) return null;

    const ext = guessExt(mediaType);
    const filename = `ev_${Date.now()}_${msgId}.${ext}`;
    const out = path.join(uploadConfig.directory, filename);

    fs.mkdirSync(uploadConfig.directory, { recursive: true });
    fs.writeFileSync(out, buf);

    return filename;
  } catch {
    return null;
  }
}

async function downloadAndPersistRemoteMedia(
  msgId: string,
  mediaType: string | undefined,
  url: string
): Promise<string | null> {
  if (!url || typeof url !== "string") return null;
  if (!/^https?:\/\//i.test(url)) return null;

  try {
    const r = await fetch(url);
    if (!r.ok) return null;

    const contentType = String(r.headers.get("content-type") || "").toLowerCase();
    const lenHeader = r.headers.get("content-length");
    const len = lenHeader ? Number(lenHeader) : NaN;
    if (Number.isFinite(len) && len > 20 * 1024 * 1024) return null;

    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) return null;

    let ext = guessExt(mediaType);
    if (contentType.includes("image/")) ext = contentType.split("image/")[1].split(";")[0] || ext;
    if (contentType.includes("video/")) ext = contentType.split("video/")[1].split(";")[0] || ext;
    if (contentType.includes("audio/")) ext = contentType.split("audio/")[1].split(";")[0] || ext;

    // Normalize weird types.
    if (ext === "jpeg") ext = "jpg";

    const filename = `ev_${Date.now()}_${msgId}.${ext}`;
    const out = path.join(uploadConfig.directory, filename);

    fs.mkdirSync(uploadConfig.directory, { recursive: true });
    fs.writeFileSync(out, buf);

    return filename;
  } catch {
    return null;
  }
}

export const evolutionWebhook = async (req: Request, res: Response): Promise<Response> => {
  try {
    const instanceName = String(req.params.instanceName || "");

    const headerSecret = String(req.header("x-evolution-secret") ?? "");
    const queryToken = String((req.query as any)?.token ?? "");
    const secret = headerSecret || queryToken;
    const expected = String(process.env.EVOLUTION_WEBHOOK_SECRET || "");

    if (!expected || !secret || secret !== expected) {
      return res.status(401).json({ ok: false });
    }

    const body: any = req.body;
    if (!isMessagesUpsertEvent(body)) {
      return res.status(200).json({ ok: true, ignored: true, event: body?.event });
    }

    const msg = body?.data;
    const remoteJid = String(msg?.key?.remoteJid ?? "");
    const fromMe = !!msg?.key?.fromMe;
    const msgId = String(msg?.key?.id ?? "");

    if (!remoteJid || !msgId) {
      return res.status(200).json({ ok: true, ignored: true, reason: "missing_jid_or_id" });
    }
    if (remoteJid.endsWith("@g.us")) {
      return res.status(200).json({ ok: true, ignored: true, reason: "group" });
    }
    if (remoteJid === "status@broadcast") {
      return res.status(200).json({ ok: true, ignored: true, reason: "status" });
    }

    const whatsapp = await Whatsapp.findOne({ where: { name: instanceName } });
    if (!whatsapp) {
      return res.status(200).json({ ok: true, ignored: true, reason: "unknown_instance" });
    }

    const number = remoteJid.split("@")[0];

    if (!isAllowedNumber(number)) {
      return res.status(200).json({ ok: true, ignored: true, reason: "not_allowed" });
    }

    const text = getText(msg);
    const mediaType = getMediaType(msg);
    const pushName = String(msg?.pushName || "").trim();

    // Evolution may attach a public mediaUrl (S3/MinIO) OR base64 in webhook.
    const evoMediaUrl = msg?.message?.mediaUrl;
    const evoBase64 = msg?.message?.base64;

    let mediaUrl: string | undefined;

    if (typeof evoMediaUrl === "string" && /^https?:\/\//i.test(evoMediaUrl)) {
      // Prefer persisting media locally to avoid expiring URLs/CORS issues.
      const persisted = await downloadAndPersistRemoteMedia(msgId, mediaType, evoMediaUrl);
      mediaUrl = persisted || evoMediaUrl;
    } else if (typeof evoBase64 === "string" && mediaType) {
      const persisted = tryPersistBase64Media(msgId, mediaType, evoBase64);
      if (persisted) mediaUrl = persisted;
    }

    const bodyText = text || (mediaType ? `[${mediaType}]` : "");

    const contact = await CreateOrUpdateContactService({
      name: pushName || number,
      number,
      profilePicUrl: "",
      isGroup: false
    });

    const ticket = await FindOrCreateTicketService(contact, whatsapp.id, fromMe ? 0 : 1);

    await ticket.update({ lastMessage: bodyText });

    await CreateMessageService({
      messageData: {
        id: msgId,
        ticketId: ticket.id,
        contactId: fromMe ? undefined : contact.id,
        body: bodyText,
        fromMe,
        // Avoid the UI getting stuck on "clock" for bot/fromMe messages.
        ack: fromMe ? 1 : 0,
        read: fromMe,
        mediaType,
        mediaUrl
      }
    } as any);

    // Forward inbound messages to the bot (optional).
    // Human takeover is handled by the panel send flow: when an operator replies, we set
    // the bot conversation mode to HUMAN_ONLY. So here we can forward all inbound messages
    // and let the bot decide whether to answer.
    if (!fromMe && String(process.env.BOT_URL || "").trim()) {
      const forwardPayload = {
        ...(body || {}),
        // Ensure the bot sees the instance name even if Evolution didn't include it.
        instance: body?.instance ?? instanceName
      };

      // Fire-and-forget so we don't slow down Evolution webhook ACK.
      void botForwardEvolutionWebhook(forwardPayload);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    logger.error(err);
    return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
};
