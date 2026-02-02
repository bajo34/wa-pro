import express from "express";
import isAuth from "../middleware/isAuth";

import * as ContactController from "../controllers/ContactController";
import * as ImportPhoneContactsController from "../controllers/ImportPhoneContactsController";
import * as ContactsCsvImportController from "../controllers/ContactsCsvImportController";
import * as ContactTicketsController from "../controllers/ContactTicketsController";

const contactRoutes = express.Router();

contactRoutes.post(
  "/contacts/import",
  isAuth,
  ImportPhoneContactsController.store
);

// CSV import works with Evolution and whatsapp-web.js (provider-agnostic)
contactRoutes.post(
  "/contacts/import/csv",
  isAuth,
  ContactsCsvImportController.store
);

contactRoutes.get("/contacts", isAuth, ContactController.index);

contactRoutes.get("/contacts/:contactId", isAuth, ContactController.show);

contactRoutes.get(
  "/contacts/:contactId/tickets",
  isAuth,
  ContactTicketsController.index
);

contactRoutes.post("/contacts", isAuth, ContactController.store);

contactRoutes.post("/contact", isAuth, ContactController.getContact);

contactRoutes.put("/contacts/:contactId", isAuth, ContactController.update);

contactRoutes.delete("/contacts/:contactId", isAuth, ContactController.remove);

export default contactRoutes;
