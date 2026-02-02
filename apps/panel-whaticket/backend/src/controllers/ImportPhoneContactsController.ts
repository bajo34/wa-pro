import { Request, Response } from "express";
import AppError from "../errors/AppError";
import ImportContactsService from "../services/WbotServices/ImportContactsService";

export const store = async (req: Request, res: Response): Promise<Response> => {
  const provider = String(process.env.WHATSAPP_PROVIDER || "").toUpperCase();
  const isEvolution = provider === "EVOLUTION" || !!process.env.EVOLUTION_API_URL;

  // Phone contact import relies on whatsapp-web.js. When using Evolution as provider, there is
  // no WWebJS session available, so importing this way is not supported.
  if (isEvolution) {
    throw new AppError(
      "ERR_CONTACTS_IMPORT_UNSUPPORTED_PROVIDER",
      400
    );
  }

  const userId: number = parseInt(req.user.id);
  await ImportContactsService(userId);

  return res.status(200).json({ message: "contacts imported" });
};
