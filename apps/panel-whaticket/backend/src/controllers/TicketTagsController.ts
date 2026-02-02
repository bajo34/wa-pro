import { Request, Response } from "express";

import TicketTag from "../models/TicketTag";
import ShowTicketService from "../services/TicketServices/ShowTicketService";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  await ShowTicketService(ticketId);

  const tags = await TicketTag.findAll({
    where: { ticketId },
    order: [["createdAt", "ASC"]]
  });

  return res.status(200).json({ tags: tags.map(t => t.tag) });
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const tags: string[] = Array.isArray(req.body?.tags) ? req.body.tags : [];

  await ShowTicketService(ticketId);

  const clean = Array.from(
    new Set(
      tags
        .map(t => String(t || "").trim())
        .filter(Boolean)
        .slice(0, 25)
    )
  );

  await TicketTag.destroy({ where: { ticketId } });
  if (clean.length) {
    await TicketTag.bulkCreate(
      clean.map(tag => ({ ticketId: Number(ticketId), tag })) as any[]
    );
  }

  return res.status(200).json({ tags: clean });
};
