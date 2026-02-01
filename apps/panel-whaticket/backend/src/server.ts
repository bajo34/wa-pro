import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";

// 1) Healthcheck simple para Railway/Debug
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// 2) Hardening ante crashes silenciosos
process.on("unhandledRejection", (reason: any) => {
  logger.error({ reason }, "UnhandledRejection");
});

process.on("uncaughtException", (err: any) => {
  logger.error({ err }, "UncaughtException");
  // Opcional: salir para que Railway reinicie limpio
  // process.exit(1);
});

// 3) PORT robusto + bind externo
const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server started on port: ${PORT}`);
});

// 4) Socket IO
initIO(server);

// 5) Arranque WhatsApp sessions sin tumbar el server
Promise.resolve()
  .then(() => StartAllWhatsAppsSessions())
  .then(() => logger.info("StartAllWhatsAppsSessions completed"))
  .catch((err) => logger.error({ err }, "StartAllWhatsAppsSessions failed"));

gracefulShutdown(server);
