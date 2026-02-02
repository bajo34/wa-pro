import { Message as WbotMessage } from "whatsapp-web.js";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import GetWbotMessage from "../../helpers/GetWbotMessage";
import SerializeWbotMsgId from "../../helpers/SerializeWbotMsgId";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";

import formatBody from "../../helpers/Mustache";

import { evolutionSendText } from "../EvolutionServices/evolutionApi";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { botSetConversationMode } from "../BotServices/botApi";

const useEvolution = () => {
  return (
    String(process.env.WHATSAPP_PROVIDER || "").toUpperCase() === "EVOLUTION" ||
    !!process.env.EVOLUTION_API_URL
  );
};

interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: Message;
}

const SendWhatsAppMessage = async ({
  body,
  ticket,
  quotedMsg
}: Request): Promise<WbotMessage> => {
  // Evolution provider: send via Evolution API and create the message record ourselves.
  if (useEvolution()) {
    try {
      const instanceName = ticket.whatsapp?.name || process.env.EVOLUTION_INSTANCE || "";
      if (!instanceName) throw new Error("Missing instanceName for Evolution");

      const to = `${ticket.contact.number}`;
      const rendered = formatBody(body, ticket.contact);

      const resp = await evolutionSendText({
        instanceName,
        to,
        text: rendered
      });

      const msgId =
        String(resp?.key?.id || resp?.messageId || resp?.id || "").trim() ||
        `ev-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      await ticket.update({ lastMessage: body });

      await CreateMessageService({
        messageData: {
          id: msgId,
          ticketId: ticket.id,
          body: rendered,
          fromMe: true,
          read: true,
          // When using Evolution, we don't get WWebJS ack events. Mark as "sent" so the UI
          // doesn't keep the clock forever.
          ack: 1,
          quotedMsgId: quotedMsg?.id
        }
      } as any);

      // Operator replied => disable bot for this conversation (prevents bot answering after takeover)
      // Safe no-op if BOT_URL/BOT_ADMIN_TOKEN are not configured.
      try {
        const remoteJid = ticket.isGroup
          ? `${ticket.contact.number}@g.us`
          : `${ticket.contact.number}@s.whatsapp.net`;
        void botSetConversationMode({
          instance: instanceName,
          remoteJid,
          botMode: "HUMAN_ONLY",
          notes: "operator_reply"
        });
      } catch {
        // ignore
      }

      // Return a dummy object to satisfy the previous signature.
      return { id: { id: msgId } } as any;
    } catch (err) {
      throw new AppError("ERR_SENDING_WAPP_MSG");
    }
  }

  let quotedMsgSerializedId: string | undefined;
  if (quotedMsg) {
    await GetWbotMessage(ticket, quotedMsg.id);
    quotedMsgSerializedId = SerializeWbotMsgId(ticket, quotedMsg);
  }

  const wbot = await GetTicketWbot(ticket);

  try {
    const sentMessage = await wbot.sendMessage(
      `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`,
      formatBody(body, ticket.contact),
      {
        quotedMessageId: quotedMsgSerializedId,
        linkPreview: false
      }
    );

    await ticket.update({ lastMessage: body });
    return sentMessage;
  } catch (err) {
    throw new AppError("ERR_SENDING_WAPP_MSG");
  }
};

export default SendWhatsAppMessage;
