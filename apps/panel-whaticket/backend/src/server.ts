import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";

// Healthcheck para Railway / monitoreo
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// Hardening: evita crashes silenciosos
process.on("unhandledRejection", (reason: any) => {
  logger.error({ reason }, "UnhandledRejection");
});

process.on("uncaughtException", (err: any) => {
  logger.error({ err }, "UncaughtException");
  // Opcional: cortar para que Railway reinicie limpio
  // process.exit(1);
});

const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT, "0.0.0.0", () => {
  // marcador inequívoco para confirmar que este build está corriendo
  logger.info(`BOOT_MARK_20260201_A | port=${PORT} | node=${process.version}`);
});

// Socket.IO
initIO(server);

// WhatsApp sessions (no tumbar el server si falla)
Promise.resolve()
  .then(() => StartAllWhatsAppsSessions())
  .then(() => logger.info("StartAllWhatsAppsSessions completed"))
  .catch((err) => logger.error({ err }, "StartAllWhatsAppsSessions failed"));

gracefulShutdown(server);
