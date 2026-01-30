import { Request, Response } from "express";

import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import CreateMessageService from "../services/MessageServices/CreateMessageService";
import Whatsapp from "../models/Whatsapp";
import { logger } from "../utils/logger";

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
    const text = getText(msg);
    const mediaType = getMediaType(msg);
    const bodyText = text || (mediaType ? `[${mediaType}]` : "");

    // Contact
    const contact = await CreateOrUpdateContactService({
      name: number,
      number,
      profilePicUrl: "",
      isGroup: false
    });

    const ticket = await FindOrCreateTicketService(
      contact,
      whatsapp.id,
      fromMe ? 0 : 1
    );

    await ticket.update({ lastMessage: bodyText });

    await CreateMessageService({
      messageData: {
        id: msgId,
        ticketId: ticket.id,
        contactId: fromMe ? undefined : contact.id,
        body: bodyText,
        fromMe,
        read: fromMe,
        mediaType
      }
    } as any);

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    logger.error(err);
    return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
};
