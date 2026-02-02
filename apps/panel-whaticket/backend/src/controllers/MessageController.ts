import { Request, Response } from "express";

import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import { getIO } from "../libs/socket";
import Message from "../models/Message";

import ListMessagesService from "../services/MessageServices/ListMessagesService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import DeleteWhatsAppMessage from "../services/WbotServices/DeleteWhatsAppMessage";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import { botSetConversationMode } from "../services/BotServices/botApi";

type IndexQuery = {
  pageNumber: string;
};

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { pageNumber } = req.query as IndexQuery;

  const { count, messages, ticket, hasMore } = await ListMessagesService({
    pageNumber,
    ticketId
  });

  SetTicketMessagesAsRead(ticket);

  return res.json({ count, messages, ticket, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  const ticket = await ShowTicketService(ticketId);

  // ✅ Human takeover rule:
  // - if an operator sends a message, we assign the ticket to that operator (if not assigned)
  // - and tell the bot to stop replying for this conversation.
  if (!ticket.userId) {
    const userId = Number(req.user.id);
    if (Number.isFinite(userId)) {
      await ticket.update({ userId, status: ticket.status === "closed" ? "open" : ticket.status });
    }
  }

  try {
    const instance = String(ticket.whatsapp?.name || "");
    const number = String(ticket.contact?.number || "");
    if (instance && number) {
      const remoteJid = `${number}@s.whatsapp.net`;
      void botSetConversationMode({
        instance,
        remoteJid,
        botMode: "HUMAN_ONLY",
        notes: "operator_message"
      });

      // Persist last selected bot mode in the panel.
      void ticket.update({ botMode: "HUMAN_ONLY" });
    }
  } catch {
    // best-effort
  }

  SetTicketMessagesAsRead(ticket);

  if (medias && medias.length > 0) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ media, ticket });
      })
    );
  } else {
    await SendWhatsAppMessage({ body, ticket, quotedMsg });
  }

  return res.send();
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { messageId } = req.params;

  const message = await DeleteWhatsAppMessage(messageId);

  const io = getIO();
  io.to(message.ticketId.toString()).emit("appMessage", {
    action: "update",
    message
  });

  return res.send();
};
