import AppError from "../../errors/AppError";
import GetWbotMessage from "../../helpers/GetWbotMessage";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";

const useEvolution = () => {
  return (
    String(process.env.WHATSAPP_PROVIDER || "").toUpperCase() === "EVOLUTION" ||
    !!process.env.EVOLUTION_API_URL
  );
};

const DeleteWhatsAppMessage = async (messageId: string): Promise<Message> => {
  const message = await Message.findByPk(messageId, {
    include: [
      {
        model: Ticket,
        as: "ticket",
        include: ["contact"]
      }
    ]
  });

  if (!message) {
    throw new AppError("No message found with this ID.");
  }

  const { ticket } = message;

  // Evolution provider: deleting remotely is not supported in this MVP.
  if (useEvolution()) {
    await message.update({ isDeleted: true });
    return message;
  }

  const messageToDelete = await GetWbotMessage(ticket, messageId);

  try {
    await messageToDelete.delete(true);
  } catch (err) {
    throw new AppError("ERR_DELETE_WAPP_MSG");
  }

  await message.update({ isDeleted: true });

  return message;
};

export default DeleteWhatsAppMessage;
