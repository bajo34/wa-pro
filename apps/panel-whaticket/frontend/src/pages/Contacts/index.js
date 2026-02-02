import React, { useState, useEffect, useReducer, useContext } from "react";
import openSocket from "../../services/socket-io";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core/styles";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Avatar from "@material-ui/core/Avatar";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import SearchIcon from "@material-ui/icons/Search";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";

import IconButton from "@material-ui/core/IconButton";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";

import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import ContactModal from "../../components/ContactModal";
import ConfirmationModal from "../../components/ConfirmationModal/";

import { i18n } from "../../translate/i18n";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import MainContainer from "../../components/MainContainer";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../../components/Can";

const parseCsv = (text) => {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return [];

  const split = (line) => {
    // Basic CSV split supporting quotes.
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (!inQ && (ch === "," || ch === ";" || ch === "\t")) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const idxName = header.findIndex((h) => ["name", "nombre", "nombre y apellido"].includes(h));
  const idxNumber = header.findIndex((h) => ["number", "telefono", "tel", "celular", "whatsapp"].includes(h));
  const idxEmail = header.findIndex((h) => ["email", "correo"].includes(h));

  const start = idxName !== -1 || idxNumber !== -1 || idxEmail !== -1 ? 1 : 0;

  const rows = [];
  for (const line of lines.slice(start)) {
    const cols = split(line);
    const name = cols[idxName] ?? cols[0] ?? "";
    const number = cols[idxNumber] ?? cols[1] ?? "";
    const email = idxEmail !== -1 ? cols[idxEmail] : "";
    rows.push({ name, number, email });
  }
  return rows;
};

const reducer = (state, action) => {
  if (action.type === "LOAD_CONTACTS") {
    const contacts = action.payload;
    const newContacts = [];

    contacts.forEach((contact) => {
      const contactIndex = state.findIndex((c) => c.id === contact.id);
      if (contactIndex !== -1) {
        state[contactIndex] = contact;
      } else {
        newContacts.push(contact);
      }
    });

    return [...state, ...newContacts];
  }

  if (action.type === "UPDATE_CONTACTS") {
    const contact = action.payload;
    const contactIndex = state.findIndex((c) => c.id === contact.id);

    if (contactIndex !== -1) {
      state[contactIndex] = contact;
      return [...state];
    } else {
      return [contact, ...state];
    }
  }

  if (action.type === "DELETE_CONTACT") {
    const contactId = action.payload;

    const contactIndex = state.findIndex((c) => c.id === contactId);
    if (contactIndex !== -1) {
      state.splice(contactIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
}));

const Contacts = () => {
  const classes = useStyles();
  const history = useHistory();

  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const [contacts, dispatch] = useReducer(reducer, []);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [canImportPhoneContacts, setCanImportPhoneContacts] = useState(true);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileInputId = "contacts-csv-file";

  useEffect(() => {
    // Determine feature availability based on backend provider.
    // In Evolution mode, /contacts/import (phone contacts via WWebJS) is not supported.
    const fetchProvider = async () => {
      try {
        const { data } = await api.get("/health");
        const provider = String(data?.provider || "").toUpperCase();
        setCanImportPhoneContacts(provider !== "EVOLUTION");
      } catch {
        // if we can't fetch, keep enabled to avoid blocking the UI
      }
    };
    fetchProvider();
  }, []);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchContacts = async () => {
        try {
          const { data } = await api.get("/contacts/", {
            params: { searchParam, pageNumber },
          });
          dispatch({ type: "LOAD_CONTACTS", payload: data.contacts });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
        }
      };
      fetchContacts();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber]);

  useEffect(() => {
    const socket = openSocket();

    socket.on("contact", (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_CONTACTS", payload: data.contact });
      }

      if (data.action === "delete") {
        dispatch({ type: "DELETE_CONTACT", payload: +data.contactId });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleSearch = (event) => {
    setSearchParam(event.target.value.toLowerCase());
  };

  const handleOpenContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(false);
  };

  const handleSaveTicket = async (contactId) => {
    if (!contactId) return;
    setLoading(true);
    try {
      const { data: ticket } = await api.post("/tickets", {
        contactId: contactId,
        userId: user?.id,
        status: "open",
      });
      history.push(`/tickets/${ticket.id}`);
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
  };

  const hadleEditContact = (contactId) => {
    setSelectedContactId(contactId);
    setContactModalOpen(true);
  };

  const handleDeleteContact = async (contactId) => {
    try {
      await api.delete(`/contacts/${contactId}`);
      toast.success(i18n.t("contacts.toasts.deleted"));
    } catch (err) {
      toastError(err);
    }
    setDeletingContact(null);
    setSearchParam("");
    setPageNumber(1);
  };

  const handleimportContact = async () => {
    try {
      await api.post("/contacts/import");
      history.go(0);
    } catch (err) {
      toastError(err);
    }
  };

  const handleCsvFile = async (file) => {
    if (!file) return;
    setCsvImporting(true);
    try {
      const text = await file.text();
      const contacts = parseCsv(text);
      const { data } = await api.post("/contacts/import/csv", { contacts });
      toast.success(
        i18n.t("contacts.toasts.imported") +
          ` (${data?.createdOrUpdated || 0} ok, ${data?.skipped || 0} skip, ${data?.errors || 0} err)`
      );
      history.go(0);
    } catch (err) {
      toastError(err);
    }
    setCsvImporting(false);
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  return (
    <MainContainer className={classes.mainContainer}>
      <ContactModal
        open={contactModalOpen}
        onClose={handleCloseContactModal}
        aria-labelledby="form-dialog-title"
        contactId={selectedContactId}
      ></ContactModal>
      <ConfirmationModal
        title={
          deletingContact
            ? `${i18n.t("contacts.confirmationModal.deleteTitle")} ${
                deletingContact.name
              }?`
            : `${i18n.t("contacts.confirmationModal.importTitlte")}`
        }
        open={confirmOpen}
        onClose={setConfirmOpen}
        onConfirm={(e) =>
          deletingContact
            ? handleDeleteContact(deletingContact.id)
            : handleimportContact()
        }
      >
        {deletingContact
          ? `${i18n.t("contacts.confirmationModal.deleteMessage")}`
          : `${i18n.t("contacts.confirmationModal.importMessage")}`}
      </ConfirmationModal>
      <MainHeader>
        <Title>{i18n.t("contacts.title")}</Title>
        <MainHeaderButtonsWrapper>
          <input
            id={fileInputId}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleCsvFile(file);
            }}
          />
          <TextField
            placeholder={i18n.t("contacts.searchPlaceholder")}
            type="search"
            value={searchParam}
            onChange={handleSearch}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon style={{ color: "gray" }} />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="contained"
            color="primary"
            disabled={csvImporting}
            onClick={() => {
              const el = document.getElementById(fileInputId);
              if (el) el.click();
            }}
          >
            {i18n.t("contacts.buttons.importCsv")}
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={!canImportPhoneContacts}
            onClick={(e) => {
              if (!canImportPhoneContacts) {
                toast.info(i18n.t("backendErrors.ERR_CONTACTS_IMPORT_UNSUPPORTED_PROVIDER"));
                return;
              }
              setConfirmOpen(true);
            }}
          >
            {i18n.t("contacts.buttons.import")}
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpenContactModal}
          >
            {i18n.t("contacts.buttons.add")}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>
      <Paper
        className={classes.mainPaper}
        variant="outlined"
        onScroll={handleScroll}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell>{i18n.t("contacts.table.name")}</TableCell>
              <TableCell align="center">
                {i18n.t("contacts.table.whatsapp")}
              </TableCell>
              <TableCell align="center">
                {i18n.t("contacts.table.email")}
              </TableCell>
              <TableCell align="center">
                {i18n.t("contacts.table.actions")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell style={{ paddingRight: 0 }}>
                    {<Avatar src={contact.profilePicUrl} />}
                  </TableCell>
                  <TableCell>{contact.name}</TableCell>
                  <TableCell align="center">{contact.number}</TableCell>
                  <TableCell align="center">{contact.email}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={() => handleSaveTicket(contact.id)}
                    >
                      <WhatsAppIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => hadleEditContact(contact.id)}
                    >
                      <EditIcon />
                    </IconButton>
                    <Can
                      role={user.profile}
                      perform="contacts-page:deleteContact"
                      yes={() => (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            setConfirmOpen(true);
                            setDeletingContact(contact);
                          }}
                        >
                          <DeleteOutlineIcon />
                        </IconButton>
                      )}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {loading && <TableRowSkeleton avatar columns={3} />}
            </>
          </TableBody>
        </Table>
      </Paper>
    </MainContainer>
  );
};

export default Contacts;
