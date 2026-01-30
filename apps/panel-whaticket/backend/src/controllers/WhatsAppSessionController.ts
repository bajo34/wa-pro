import { Request, Response } from "express";
import { getWbot } from "../libs/wbot";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import { startEvolutionSession, stopEvolutionPoller } from "../services/EvolutionServices/evolutionSessionManager";
import { evolutionLogout } from "../services/EvolutionServices/evolutionApi";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";

const useEvolution = () => {
  return (
    String(process.env.WHATSAPP_PROVIDER || "").toUpperCase() === "EVOLUTION" ||
    !!process.env.EVOLUTION_API_URL
  );
};

const store = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (useEvolution()) {
    await startEvolutionSession(whatsapp);
  } else {
    StartWhatsAppSession(whatsapp);
  }

  return res.status(200).json({ message: "Starting session." });
};

const update = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;

  const { whatsapp } = await UpdateWhatsAppService({
    whatsappId,
    whatsappData: { session: "" }
  });

  if (useEvolution()) {
    await startEvolutionSession(whatsapp);
  } else {
    StartWhatsAppSession(whatsapp);
  }

  return res.status(200).json({ message: "Starting session." });
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsapp = await ShowWhatsAppService(whatsappId);

  if (useEvolution()) {
    stopEvolutionPoller(whatsapp.id);
    try {
      await evolutionLogout(whatsapp.name);
    } catch {
      // best-effort
    }
    // Mark disconnected; Evolution logout is best-effort and handled in service.
    await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
  } else {
    const wbot = getWbot(whatsapp.id);
    wbot.logout();
  }

  return res.status(200).json({ message: "Session disconnected." });
};

export default { store, remove, update };
