import React, { useEffect, useMemo, useState } from "react";

import { makeStyles } from "@material-ui/core/styles";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import Drawer from "@material-ui/core/Drawer";
import Link from "@material-ui/core/Link";
import InputLabel from "@material-ui/core/InputLabel";
import Avatar from "@material-ui/core/Avatar";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Divider from "@material-ui/core/Divider";
import Chip from "@material-ui/core/Chip";
import TextField from "@material-ui/core/TextField";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";

import { i18n } from "../../translate/i18n";

import ContactModal from "../ContactModal";
import ContactDrawerSkeleton from "../ContactDrawerSkeleton";
import MarkdownWrapper from "../MarkdownWrapper";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const drawerWidth = 320;

const useStyles = makeStyles(theme => ({
	drawer: {
		width: drawerWidth,
		flexShrink: 0,
	},
	drawerPaper: {
		width: drawerWidth,
		display: "flex",
		borderTop: "1px solid rgba(0, 0, 0, 0.12)",
		borderRight: "1px solid rgba(0, 0, 0, 0.12)",
		borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
		borderTopRightRadius: 4,
		borderBottomRightRadius: 4,
	},
	header: {
		display: "flex",
		borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
		backgroundColor: "#eee",
		alignItems: "center",
		padding: theme.spacing(0, 1),
		minHeight: "73px",
		justifyContent: "flex-start",
	},
	content: {
		display: "flex",
		backgroundColor: "#eee",
		flexDirection: "column",
		padding: "8px 0px 8px 8px",
		height: "100%",
		overflowY: "scroll",
		...theme.scrollbarStyles,
	},

	contactAvatar: {
		margin: 15,
		width: 160,
		height: 160,
	},

	contactHeader: {
		display: "flex",
		padding: 8,
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		"& > *": {
			margin: 4,
		},
	},

	contactDetails: {
		marginTop: 8,
		padding: 8,
		display: "flex",
		flexDirection: "column",
	},
	contactExtraInfo: {
		marginTop: 4,
		padding: 6,
	},
}));

const ContactDrawer = ({ open, handleDrawerClose, contact, ticket, loading }) => {
	const classes = useStyles();

	const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState(0);

  // Ticket tools state
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState([]);
  const [noteInput, setNoteInput] = useState("");
  const [historyTickets, setHistoryTickets] = useState([]);

  const ticketId = ticket?.id;
  const contactId = contact?.id;

  const botModeLabel = useMemo(() => {
    const mode = String(ticket?.botMode || "ON").toUpperCase();
    if (mode === "HUMAN_ONLY") return i18n.t("contactDrawer.ticket.botMode.human");
    if (mode === "OFF") return i18n.t("contactDrawer.ticket.botMode.off");
    return i18n.t("contactDrawer.ticket.botMode.on");
  }, [ticket?.botMode]);

  useEffect(() => {
    // Keep state in sync when switching tickets
    setTags([]);
    setNotes([]);
    setHistoryTickets([]);
    setTagInput("");
    setNoteInput("");
  }, [ticketId, contactId]);

  useEffect(() => {
    const loadTicketTools = async () => {
      try {
        if (ticketId) {
          const [tagsRes, notesRes] = await Promise.all([
            api.get(`/tickets/${ticketId}/tags`),
            api.get(`/tickets/${ticketId}/notes`)
          ]);
          setTags(tagsRes.data?.tags || []);
          setNotes(notesRes.data?.notes || []);
        }
      } catch (err) {
        toastError(err);
      }
    };
    if (open && tab === 1) loadTicketTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, ticketId]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        if (!contactId) return;
        const { data } = await api.get(`/contacts/${contactId}/tickets`, {
          params: { limit: 20 }
        });
        setHistoryTickets(data?.tickets || []);
      } catch (err) {
        toastError(err);
      }
    };
    if (open && tab === 2) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, contactId]);

  const saveTags = async (nextTags) => {
    if (!ticketId) return;
    try {
      const { data } = await api.put(`/tickets/${ticketId}/tags`, { tags: nextTags });
      setTags(data?.tags || nextTags);
    } catch (err) {
      toastError(err);
    }
  };

  const handleAddTag = async () => {
    const next = [...tags, tagInput].map(t => String(t || "").trim()).filter(Boolean);
    const uniq = Array.from(new Set(next));
    setTagInput("");
    await saveTags(uniq);
  };

  const handleRemoveTag = async (t) => {
    await saveTags(tags.filter(x => x !== t));
  };

  const handleAddNote = async () => {
    if (!ticketId) return;
    const body = String(noteInput || "").trim();
    if (!body) return;
    setNoteInput("");
    try {
      const { data } = await api.post(`/tickets/${ticketId}/notes`, { body });
      setNotes((prev) => [data, ...prev]);
    } catch (err) {
      toastError(err);
    }
  };

  const handleDeleteNote = async (noteId) => {
    if (!ticketId) return;
    try {
      await api.delete(`/tickets/${ticketId}/notes/${noteId}`);
      setNotes((prev) => prev.filter(n => n.id !== noteId));
    } catch (err) {
      toastError(err);
    }
  };

  const handleBotMode = async (mode) => {
    if (!ticketId) return;
    try {
      await api.put(`/tickets/${ticketId}/bot-mode`, { botMode: mode });
    } catch (err) {
      toastError(err);
    }
  };

	return (
		<Drawer
			className={classes.drawer}
			variant="persistent"
			anchor="right"
			open={open}
			PaperProps={{ style: { position: "absolute" } }}
			BackdropProps={{ style: { position: "absolute" } }}
			ModalProps={{
				container: document.getElementById("drawer-container"),
				style: { position: "absolute" },
			}}
			classes={{
				paper: classes.drawerPaper,
			}}
		>
			<div className={classes.header}>
				<IconButton onClick={handleDrawerClose}>
					<CloseIcon />
				</IconButton>
				<Typography style={{ justifySelf: "center" }}>
					{i18n.t("contactDrawer.header")}
				</Typography>
			</div>
			{loading ? (
				<ContactDrawerSkeleton classes={classes} />
			) : (
				<div className={classes.content}>
					<Paper square variant="outlined" className={classes.contactHeader}>
						<Avatar
							alt={contact.name}
							src={contact.profilePicUrl}
							className={classes.contactAvatar}
						></Avatar>

						<Typography>{contact.name}</Typography>
						<Typography>
							<Link href={`tel:${contact.number}`}>{contact.number}</Link>
						</Typography>
						<Button
							variant="outlined"
							color="primary"
							onClick={() => setModalOpen(true)}
						>
							{i18n.t("contactDrawer.buttons.edit")}
						</Button>
					</Paper>

					<Paper square variant="outlined" style={{ marginRight: 8 }}>
						<Tabs
							value={tab}
							onChange={(_, v) => setTab(v)}
							indicatorColor="primary"
							textColor="primary"
							variant="fullWidth"
						>
							<Tab label={i18n.t("contactDrawer.tabs.contact")} />
							<Tab label={i18n.t("contactDrawer.tabs.ticket")} disabled={!ticketId} />
							<Tab label={i18n.t("contactDrawer.tabs.history")} disabled={!contactId} />
						</Tabs>
					</Paper>

					{tab === 0 && (
						<Paper square variant="outlined" className={classes.contactDetails}>
						<ContactModal
							open={modalOpen}
							onClose={() => setModalOpen(false)}
							contactId={contact.id}
						></ContactModal>
						<Typography variant="subtitle1">
							{i18n.t("contactDrawer.extraInfo")}
						</Typography>
						{contact?.extraInfo?.map(info => (
							<Paper
								key={info.id}
								square
								variant="outlined"
								className={classes.contactExtraInfo}
							>
								<InputLabel>{info.name}</InputLabel>
								<Typography component="div" noWrap style={{ paddingTop: 2 }}>
									<MarkdownWrapper>{info.value}</MarkdownWrapper>
								</Typography>
							</Paper>
						))}
						</Paper>
					)}

					{tab === 1 && (
						<Paper square variant="outlined" className={classes.contactDetails}>
							<Typography variant="subtitle1">
								{i18n.t("contactDrawer.ticket.title")}
							</Typography>

							<Divider style={{ margin: "8px 0" }} />

							<Typography variant="subtitle2">
								{i18n.t("contactDrawer.ticket.botMode.label")}: {botModeLabel}
							</Typography>
							<div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
								<Button size="small" variant="outlined" onClick={() => handleBotMode("ON")}>
									{i18n.t("contactDrawer.ticket.botMode.actions.on")}
								</Button>
								<Button size="small" variant="contained" color="primary" onClick={() => handleBotMode("HUMAN_ONLY")}>
									{i18n.t("contactDrawer.ticket.botMode.actions.human")}
								</Button>
								<Button size="small" variant="outlined" onClick={() => handleBotMode("OFF")}>
									{i18n.t("contactDrawer.ticket.botMode.actions.off")}
								</Button>
							</div>

							<Divider style={{ margin: "16px 0" }} />

							<Typography variant="subtitle2">{i18n.t("contactDrawer.ticket.tags")}</Typography>
							<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
								<TextField
									size="small"
									variant="outlined"
									placeholder={i18n.t("contactDrawer.ticket.tagsPlaceholder")}
									value={tagInput}
									onChange={(e) => setTagInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleAddTag();
									}}
									fullWidth
								/>
								<Button size="small" variant="contained" color="primary" onClick={handleAddTag}>
									{i18n.t("contactDrawer.ticket.add")}
								</Button>
							</div>
							<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
								{tags.map((t) => (
									<Chip key={t} label={t} onDelete={() => handleRemoveTag(t)} />
								))}
								{!tags.length && (
									<Typography variant="body2" color="textSecondary">
										{i18n.t("contactDrawer.ticket.tagsEmpty")}
									</Typography>
								)}
							</div>

							<Divider style={{ margin: "16px 0" }} />

							<Typography variant="subtitle2">{i18n.t("contactDrawer.ticket.notes")}</Typography>
							<TextField
								multiline
								minRows={3}
								variant="outlined"
								placeholder={i18n.t("contactDrawer.ticket.notesPlaceholder")}
								value={noteInput}
								onChange={(e) => setNoteInput(e.target.value)}
								style={{ marginTop: 8 }}
								fullWidth
							/>
							<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
								<Button size="small" variant="contained" color="primary" onClick={handleAddNote}>
									{i18n.t("contactDrawer.ticket.add")}
								</Button>
							</div>
							<List dense>
								{notes.map((n) => (
									<ListItem key={n.id} divider>
										<ListItemText
											primary={<MarkdownWrapper>{n.body}</MarkdownWrapper>}
											secondary={new Date(n.createdAt).toLocaleString()}
										/>
										<IconButton size="small" onClick={() => handleDeleteNote(n.id)}>
											<DeleteOutlineIcon />
										</IconButton>
									</ListItem>
								))}
								{!notes.length && (
									<Typography variant="body2" color="textSecondary" style={{ marginTop: 8 }}>
										{i18n.t("contactDrawer.ticket.notesEmpty")}
									</Typography>
								)}
							</List>
						</Paper>
					)}

					{tab === 2 && (
						<Paper square variant="outlined" className={classes.contactDetails}>
							<Typography variant="subtitle1">
								{i18n.t("contactDrawer.history.title")}
							</Typography>
							<Divider style={{ margin: "8px 0" }} />
							<List dense>
								{historyTickets.map((t) => (
									<ListItem key={t.id} divider>
										<ListItemText
											primary={`#${t.id} • ${t.status}`}
											secondary={`${t.lastMessage || ""} • ${new Date(t.updatedAt).toLocaleString()}`}
										/>
									</ListItem>
								))}
								{!historyTickets.length && (
									<Typography variant="body2" color="textSecondary" style={{ marginTop: 8 }}>
										{i18n.t("contactDrawer.history.empty")}
									</Typography>
								)}
							</List>
						</Paper>
					)}
				</div>
			)}
		</Drawer>
	);
};

export default ContactDrawer;
