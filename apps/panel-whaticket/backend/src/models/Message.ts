import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  Default,
  BelongsTo,
  ForeignKey
} from "sequelize-typescript";
import Contact from "./Contact";
import Ticket from "./Ticket";

@Table
class Message extends Model<Message> {
  @PrimaryKey
  @Column
  id: string;

  @Default(0)
  @Column
  ack: number;

  @Default(false)
  @Column
  read: boolean;

  @Default(false)
  @Column
  fromMe: boolean;

  @Column(DataType.TEXT)
  body: string;

  @Column(DataType.STRING)
  get mediaUrl(): string | null {
    const v = this.getDataValue("mediaUrl");
    if (!v) return null;

    // If already an absolute URL (e.g., Evolution mediaUrl), return as-is.
    if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;

    const base = String(process.env.BACKEND_URL || process.env.API_URL || process.env.PUBLIC_URL || "").replace(/\/$/, "");
    const proxyPort = String(process.env.PROXY_PORT || "");

    const hasPort = /:\d+$/.test(base);
    const isHttps = base.startsWith("https://");
    const isHttp = base.startsWith("http://");
    const isDefaultPort = (proxyPort === "443" && isHttps) || (proxyPort === "80" && isHttp);

    const fullBase = base && proxyPort && !hasPort && !isDefaultPort ? `${base}:${proxyPort}` : base;

    return `${fullBase}/public/${v}`;
  }

  @Column
  mediaType: string;

  @Default(false)
  @Column
  isDeleted: boolean;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;

  @ForeignKey(() => Message)
  @Column
  quotedMsgId: string;

  @BelongsTo(() => Message, "quotedMsgId")
  quotedMsg: Message;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact, "contactId")
  contact: Contact;
}

export default Message;
