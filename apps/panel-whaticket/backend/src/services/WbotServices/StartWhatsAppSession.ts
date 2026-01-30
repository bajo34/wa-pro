import { initWbot } from "../../libs/wbot";
import Whatsapp from "../../models/Whatsapp";
import { wbotMessageListener } from "./wbotMessageListener";
import { getIO } from "../../libs/socket";
import wbotMonitor from "./wbotMonitor";
import { logger } from "../../utils/logger";
import { startEvolutionSession } from "../EvolutionServices/evolutionSessionManager";

const useEvolution = () => {
  return (
    String(process.env.WHATSAPP_PROVIDER || "").toUpperCase() === "EVOLUTION" ||
    !!process.env.EVOLUTION_API_URL
  );
};

export const StartWhatsAppSession = async (whatsapp: Whatsapp): Promise<void> => {
  // Evolution provider: do NOT start whatsapp-web.js; use Evolution session manager.
  if (useEvolution()) {
    try {
      await startEvolutionSession(whatsapp);
    } catch (err) {
      logger.error(err);
    }
    return;
  }

  await whatsapp.update({ status: "OPENING" });

  const io = getIO();
  io.emit("whatsappSession", {
    action: "update",
    session: whatsapp
  });

  try {
    const wbot = await initWbot(whatsapp);
    wbotMessageListener(wbot);
    wbotMonitor(wbot, whatsapp);
  } catch (err) {
    logger.error(err);
  }
};
