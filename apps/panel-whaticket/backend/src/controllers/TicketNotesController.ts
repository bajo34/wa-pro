import { Request, Response } from "express";

import TicketNote from "../models/TicketNote";
import ShowTicketService from "../services/TicketServices/ShowTicketService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  // Ensures auth + ticket exists (and loads relations used elsewhere)
  await ShowTicketService(ticketId);

  const notes = await TicketNote.findAll({
    where: { ticketId },
    order: [["createdAt", "DESC"]]
  });

  return res.status(200).json({ notes });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const body = String(req.body?.body || "").trim();

  if (!body) {
    return res.status(400).json({ error: "ERR_TICKET_NOTE_EMPTY" });
  }

  await ShowTicketService(ticketId);

  const userId = Number(req.user.id);

  const note = await TicketNote.create({
    ticketId: Number(ticketId),
    userId: Number.isFinite(userId) ? userId : null,
    body
  } as any);

  return res.status(200).json(note);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId, noteId } = req.params;
  await ShowTicketService(ticketId);

  await TicketNote.destroy({ where: { id: noteId, ticketId } });

  return res.status(200).json({ ok: true });
};
