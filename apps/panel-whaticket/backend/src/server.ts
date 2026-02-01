import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";

app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

const PORT = Number(process.env.PORT || 3000);

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server started on port: ${PORT}`);
});

initIO(server);

Promise.resolve()
  .then(() => StartAllWhatsAppsSessions())
  .then(() => logger.info("StartAllWhatsAppsSessions completed"))
  .catch((err) => logger.error({ err }, "StartAllWhatsAppsSessions failed"));

gracefulShutdown(server);
