import { Router } from "express";

import userRoutes from "./userRoutes";
import authRoutes from "./authRoutes";
import settingRoutes from "./settingRoutes";
import contactRoutes from "./contactRoutes";
import ticketRoutes from "./ticketRoutes";
import whatsappRoutes from "./whatsappRoutes";
import messageRoutes from "./messageRoutes";
import whatsappSessionRoutes from "./whatsappSessionRoutes";
import queueRoutes from "./queueRoutes";
import quickAnswerRoutes from "./quickAnswerRoutes";
import apiRoutes from "./apiRoutes";
import evolutionWebhookRoutes from "./evolutionWebhookRoutes";
import botIntelligenceRoutes from "./botIntelligenceRoutes";

const routes = Router();

routes.get("/health", (req, res) => {
  res.json({
    ok: true,
    provider: String(process.env.WHATSAPP_PROVIDER || "").toUpperCase() || "WWEBJS",
    evolutionConfigured: !!process.env.EVOLUTION_API_URL,
    time: new Date().toISOString()
  });
});

// Webhooks (no auth)
routes.use("/webhooks", evolutionWebhookRoutes);

routes.use(userRoutes);
routes.use("/auth", authRoutes);
routes.use(settingRoutes);
routes.use(contactRoutes);
routes.use(ticketRoutes);
routes.use(whatsappRoutes);
routes.use(messageRoutes);
routes.use(whatsappSessionRoutes);
routes.use(queueRoutes);
routes.use(quickAnswerRoutes);
routes.use("/api/messages", apiRoutes);
routes.use(botIntelligenceRoutes);

export default routes;
