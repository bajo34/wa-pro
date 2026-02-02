import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import formatBody from "../helpers/Mustache";
import { botDeleteConversationRule, botSetConversationMode } from "../services/BotServices/botApi";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
  date: string;
  showAll: string;
  withUnreadMessages: string;
  queueIds: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  const userId = req.user.id;

  let queueIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsService({
    searchParam,
    pageNumber,
    status,
    date,
    showAll,
    userId,
    queueIds,
    withUnreadMessages
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId }: TicketData = req.body;

  const ticket = await CreateTicketService({ contactId, status, userId });

  const io = getIO();
  io.to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const contact = await ShowTicketService(ticketId);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const ticketData: TicketData = req.body;

  const { ticket, oldUserId } = await UpdateTicketService({
    ticketData,
    ticketId
  });

  // ✅ Bot handoff rule:
  // - when a ticket gets assigned to a user, stop the bot (conversation HUMAN_ONLY)
  // - when it becomes unassigned again, allow the bot back (delete conversation rule)
  try {
    const instance = String(ticket.whatsapp?.name || "");
    const number = String(ticket.contact?.number || "");
    if (instance && number) {
      const remoteJid = `${number}@s.whatsapp.net`;
      const wasAssigned = !!oldUserId;
      const isAssigned = !!ticket.userId;

      if (!wasAssigned && isAssigned) {
        void botSetConversationMode({
          instance,
          remoteJid,
          botMode: "HUMAN_ONLY",
          notes: "ticket_assigned"
        });

        // Persist last selected bot mode in the panel.
        void ticket.update({ botMode: "HUMAN_ONLY" });
      }

      if (wasAssigned && !isAssigned) {
        void botDeleteConversationRule({ instance, remoteJid });
        void ticket.update({ botMode: "ON" });
      }
    }
  } catch {
    // best-effort
  }

  if (ticket.status === "closed") {
    const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

    const { farewellMessage } = whatsapp;

    if (farewellMessage) {
      await SendWhatsAppMessage({
        body: formatBody(farewellMessage, ticket.contact),
        ticket
      });
    }
  }

  return res.status(200).json(ticket);
};

export const updateBotMode = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const raw = String(req.body?.botMode || "").toUpperCase();

  const ticket = await ShowTicketService(ticketId);

  const instance = String(ticket.whatsapp?.name || "");
  const number = String(ticket.contact?.number || "");
  const remoteJid = instance && number ? `${number}@s.whatsapp.net` : "";

  // Default behavior:
  // - ON  => bot can reply (delete any override rule)
  // - HUMAN_ONLY => bot muted (rule)
  // - OFF => bot disabled (rule)
  let next: "ON" | "OFF" | "HUMAN_ONLY" = "ON";
  if (raw === "OFF" || raw === "HUMAN_ONLY" || raw === "ON") next = raw as any;

  try {
    if (instance && remoteJid) {
      if (next === "ON") {
        void botDeleteConversationRule({ instance, remoteJid });
      } else {
        void botSetConversationMode({
          instance,
          remoteJid,
          botMode: next,
          notes: "panel_toggle"
        });
      }
    }
  } catch {
    // best-effort
  }

  await ticket.update({ botMode: next });

  const io = getIO();
  io.to(ticket.status).to(ticket.id.toString()).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const ticket = await DeleteTicketService(ticketId);

  const io = getIO();
  io.to(ticket.status).to(ticketId).to("notification").emit("ticket", {
    action: "delete",
    ticketId: +ticketId
  });

  return res.status(200).json({ message: "ticket deleted" });
};
