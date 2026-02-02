import { Request, Response } from "express";

import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import Queue from "../models/Queue";
import User from "../models/User";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { contactId } = req.params;
  const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 10)));

  const tickets = await Ticket.findAll({
    where: { contactId: Number(contactId) },
    include: [
      { model: Whatsapp, as: "whatsapp", attributes: ["name"] },
      { model: Queue, as: "queue", attributes: ["id", "name", "color"] },
      { model: User, as: "user", attributes: ["id", "name"] }
    ],
    order: [["updatedAt", "DESC"]],
    limit
  });

  return res.status(200).json({ tickets });
};
