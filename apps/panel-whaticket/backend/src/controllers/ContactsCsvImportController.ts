import { Request, Response } from "express";
import AppError from "../errors/AppError";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";

type Row = { name?: string; number?: string; email?: string };

const normalizeNumber = (n: string) => n.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");

export const store = async (req: Request, res: Response): Promise<Response> => {
  const provider = String(process.env.WHATSAPP_PROVIDER || "").toUpperCase();
  const isEvolution = provider === "EVOLUTION" || !!process.env.EVOLUTION_API_URL;

  // This endpoint is provider-agnostic (works with Evolution).
  const rows: Row[] = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
  if (!rows.length) {
    throw new AppError("ERR_CONTACTS_IMPORT_EMPTY", 400);
  }

  const results = {
    createdOrUpdated: 0,
    skipped: 0,
    errors: 0
  };

  for (const row of rows.slice(0, 2000)) {
    try {
      const number = normalizeNumber(String(row.number || "").trim());
      const name = String(row.name || "").trim() || number;
      if (!number || !/^\d+$/.test(number)) {
        results.skipped += 1;
        continue;
      }

      await CreateOrUpdateContactService({
        name,
        number,
        email: row.email ? String(row.email).trim() : undefined,
        profilePicUrl: "",
        isGroup: false
      } as any);

      results.createdOrUpdated += 1;
    } catch {
      results.errors += 1;
    }
  }

  return res.status(200).json({ ok: true, provider: isEvolution ? "EVOLUTION" : provider, ...results });
};
