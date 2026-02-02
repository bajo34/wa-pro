import express from "express";
import isAuth from "../middleware/isAuth";

import * as TicketController from "../controllers/TicketController";
import * as TicketNotesController from "../controllers/TicketNotesController";
import * as TicketTagsController from "../controllers/TicketTagsController";

const ticketRoutes = express.Router();

ticketRoutes.get("/tickets", isAuth, TicketController.index);

ticketRoutes.get("/tickets/:ticketId", isAuth, TicketController.show);

ticketRoutes.post("/tickets", isAuth, TicketController.store);

ticketRoutes.put("/tickets/:ticketId", isAuth, TicketController.update);

// Bot/Operator handoff controls
ticketRoutes.put(
  "/tickets/:ticketId/bot-mode",
  isAuth,
  TicketController.updateBotMode
);

// Internal notes (not sent to the customer)
ticketRoutes.get(
  "/tickets/:ticketId/notes",
  isAuth,
  TicketNotesController.index
);
ticketRoutes.post(
  "/tickets/:ticketId/notes",
  isAuth,
  TicketNotesController.store
);
ticketRoutes.delete(
  "/tickets/:ticketId/notes/:noteId",
  isAuth,
  TicketNotesController.remove
);

// Ticket tags
ticketRoutes.get(
  "/tickets/:ticketId/tags",
  isAuth,
  TicketTagsController.index
);
ticketRoutes.put(
  "/tickets/:ticketId/tags",
  isAuth,
  TicketTagsController.update
);

ticketRoutes.delete("/tickets/:ticketId", isAuth, TicketController.remove);

export default ticketRoutes;
