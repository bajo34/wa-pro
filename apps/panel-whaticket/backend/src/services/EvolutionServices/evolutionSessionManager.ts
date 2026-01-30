import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";
import { logger } from "../../utils/logger";
import {
  evolutionConnectionState,
  evolutionCreateInstance,
  evolutionConnect,
  evolutionExtractQrCode
} from "./evolutionApi";

// One polling loop per WhatsApp connection (Whaticket Whatsapp model)
const pollers = new Map<number, NodeJS.Timeout>();

const POLL_MS = Number.isFinite(Number(process.env.EVOLUTION_POLL_MS))
  ? Math.max(1500, Number(process.env.EVOLUTION_POLL_MS))
  : 3000;

function emitUpdate(session: Whatsapp) {
  const io = getIO();
  io.emit("whatsappSession", {
    action: "update",
    session
  });
}

function backendBaseUrl(): string {
  // Prefer BACKEND_URL (whaticket default), fallback to PUBLIC_URL
  return (
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    process.env.PUBLIC_URL ||
    ""
  ).replace(/\/$/, "");
}

export function stopEvolutionPoller(whatsappId: number) {
  const t = pollers.get(whatsappId);
  if (t) {
    clearInterval(t as any);
    pollers.delete(whatsappId);
  }
}

export async function ensureEvolutionInstance(whatsapp: Whatsapp): Promise<void> {
  const instanceName = whatsapp.name;
  if (!instanceName) {
    throw new Error("WhatsApp connection must have a 'name' (used as Evolution instanceName)");
  }

  // If Evolution doesn't know this instance, create it with a webhook into this backend.
  const state = await evolutionConnectionState(instanceName);
  if (!state) {
    const base = backendBaseUrl();
    if (!base) {
      throw new Error("BACKEND_URL (or API_URL/PUBLIC_URL) is required to register Evolution webhook");
    }

    const secret = process.env.EVOLUTION_WEBHOOK_SECRET || "";
    if (!secret) {
      throw new Error("EVOLUTION_WEBHOOK_SECRET is not set");
    }

    const webhookUrl = `${base}/webhooks/evolution/${encodeURIComponent(instanceName)}?token=${encodeURIComponent(
      secret
    )}`;

    await evolutionCreateInstance({
      instanceName,
      webhookUrl,
      webhookSecret: secret,
      withQr: true
    });
  }
}

export async function startEvolutionSession(whatsapp: Whatsapp): Promise<void> {
  await whatsapp.update({ status: "OPENING" });
  emitUpdate(whatsapp);

  try {
    await ensureEvolutionInstance(whatsapp);

    // Request a QR code (or state). If already connected, Evolution may return connectionState.
    const payload = await evolutionConnect(whatsapp.name);
    const qr = evolutionExtractQrCode(payload);

    if (qr) {
      await whatsapp.update({ qrcode: qr, status: "qrcode" });
    } else {
      // If no QR, try reading state
      const state = await evolutionConnectionState(whatsapp.name);
      const status = state === "open" ? "CONNECTED" : state ? "DISCONNECTED" : "OPENING";
      await whatsapp.update({ qrcode: "", status });
    }
    emitUpdate(whatsapp);

    // Start poller to keep QR/state updated inside the panel.
    if (!pollers.has(whatsapp.id)) {
      const t = setInterval(async () => {
        try {
          const state = await evolutionConnectionState(whatsapp.name);
          if (state === "open") {
            if (whatsapp.status !== "CONNECTED" || whatsapp.qrcode) {
              await whatsapp.update({ status: "CONNECTED", qrcode: "" });
              emitUpdate(whatsapp);
            }
            return;
          }

          if (state === "connecting") {
            const payload2 = await evolutionConnect(whatsapp.name);
            const qr2 = evolutionExtractQrCode(payload2);
            if (qr2 && (whatsapp.qrcode !== qr2 || whatsapp.status !== "qrcode")) {
              await whatsapp.update({ status: "qrcode", qrcode: qr2 });
              emitUpdate(whatsapp);
            }
            return;
          }

          if (state === "close") {
            if (whatsapp.status !== "DISCONNECTED") {
              await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
              emitUpdate(whatsapp);
            }
          }
        } catch (e: any) {
          logger.warn({ err: e?.message ?? e }, "Evolution poller tick failed");
        }
      }, POLL_MS);

      pollers.set(whatsapp.id, t);
    }
  } catch (err) {
    logger.error(err);
    await whatsapp.update({ status: "DISCONNECTED" });
    emitUpdate(whatsapp);
  }
}
