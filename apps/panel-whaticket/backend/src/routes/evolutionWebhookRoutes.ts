import { Router } from "express";

import { evolutionWebhook } from "../controllers/EvolutionWebhookController";

const evolutionWebhookRoutes = Router();

// Evolution webhook (unauthenticated; protected by EVOLUTION_WEBHOOK_SECRET)
evolutionWebhookRoutes.post("/evolution/:instanceName", evolutionWebhook);

export default evolutionWebhookRoutes;
