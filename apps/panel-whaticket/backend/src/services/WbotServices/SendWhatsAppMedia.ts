import fs from "fs";
import {
  MessageMedia,
  Message as WbotMessage,
  MessageSendOptions
} from "whatsapp-web.js";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Ticket from "../../models/Ticket";

import formatBody from "../../helpers/Mustache";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { evolutionSendMedia } from "../EvolutionServices/evolutionApi";
import { botSetConversationMode } from "../BotServices/botApi";

const useEvolution = () => {
  return (
    String(process.env.WHATSAPP_PROVIDER || "").toUpperCase() === "EVOLUTION" ||
    !!process.env.EVOLUTION_API_URL
  );
};

function backendBaseUrl(): string {
  return (
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    process.env.PUBLIC_URL ||
    ""
  ).replace(/\/$/, "");
}

interface Request {
  media: Express.Multer.File;
  ticket: Ticket;
  body?: string;
}

const SendWhatsAppMedia = async ({
  media,
  ticket,
  body
}: Request): Promise<WbotMessage> => {
  // Evolution provider: send via Evolution API and create the message record ourselves.
  if (useEvolution()) {
    try {
      const base = backendBaseUrl();
      if (!base) throw new Error("BACKEND_URL is required to send media via Evolution");

      const instanceName = ticket.whatsapp?.name || process.env.EVOLUTION_INSTANCE || "";
      if (!instanceName) throw new Error("Missing instanceName for Evolution");

      // Keep the uploaded file so it is served by /public (Whaticket default).
      const publicUrl = `${base}/public/${encodeURIComponent(media.filename)}`;
      const caption = body ? formatBody(body as string, ticket.contact) : undefined;

      const mimetype = String(media.mimetype || "");
      const major = mimetype.split("/")[0];
      const mediaType =
        major === "image" || major === "video" || major === "audio"
          ? (major as any)
          : "document";

      const resp = await evolutionSendMedia({
        instanceName,
        to: `${ticket.contact.number}`,
        mediaUrl: publicUrl,
        mediaType,
        caption,
        fileName: media.originalname
      });

      const msgId =
        String(resp?.key?.id || resp?.messageId || resp?.id || "").trim() ||
        `ev-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      await ticket.update({ lastMessage: body || media.filename });

      await CreateMessageService({
        messageData: {
          id: msgId,
          ticketId: ticket.id,
          body: caption || media.filename,
          fromMe: true,
          read: true,
          // When using Evolution, we don't get WWebJS ack events. Mark as "sent" so the UI
          // doesn't keep the clock forever.
          ack: 1,
          mediaUrl: media.filename,
          mediaType
        }
      } as any);

      // Operator replied => disable bot for this conversation (prevents bot answering after takeover)
      // Safe no-op if BOT_URL/BOT_ADMIN_TOKEN are not configured.
      try {
        const remoteJid = ticket.isGroup
          ? `${ticket.contact.number}@g.us`
          : `${ticket.contact.number}@s.whatsapp.net`;
        void botSetConversationMode({
          instance: instanceName,
          remoteJid,
          botMode: "HUMAN_ONLY",
          notes: "operator_reply"
        });
      } catch {
        // ignore
      }

      // Do NOT delete the file; Evolution needs it accessible and WhatsApp history benefits from it.
      return { id: { id: msgId } } as any;
    } catch (err) {
      throw new AppError("ERR_SENDING_WAPP_MSG");
    }
  }

  try {
    const wbot = await GetTicketWbot(ticket);
    const hasBody = body
      ? formatBody(body as string, ticket.contact)
      : undefined;

    const newMedia = MessageMedia.fromFilePath(media.path);

    let mediaOptions: MessageSendOptions = {
      caption: hasBody,
      sendAudioAsVoice: true
    };

    if (
      newMedia.mimetype.startsWith("image/") &&
      !/^.*\.(jpe?g|png|gif)?$/i.exec(media.filename)
    ) {
      mediaOptions["sendMediaAsDocument"] = true;
    }

    const sentMessage = await wbot.sendMessage(
      `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`,
      newMedia,
      mediaOptions
    );

    await ticket.update({ lastMessage: body || media.filename });

    fs.unlinkSync(media.path);

    return sentMessage;
  } catch (err) {
    console.log(err);
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMedia;
