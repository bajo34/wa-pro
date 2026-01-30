import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode.react";
import openSocket from "../../services/socket-io";
import toastError from "../../errors/toastError";

import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Typography
} from "@material-ui/core";
import RefreshIcon from "@material-ui/icons/Refresh";
import { makeStyles } from "@material-ui/core/styles";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";

const useStyles = makeStyles((theme) => ({
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  contentRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 16,
    [theme.breakpoints.down("sm")]: {
      flexDirection: "column"
    }
  },
  instructions: {
    flex: 1,
    minWidth: 260
  },
  qrPaper: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 320,
    padding: 16
  },
  qrEmpty: {
    display: "flex",
    alignItems: "center",
    gap: 12
  }
}));

const QrcodeModal = ({ open, onClose, whatsAppId }) => {
  const classes = useStyles();
  const [qrCode, setQrCode] = useState("");
  const [status, setStatus] = useState("OPENING");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const statusChip = useMemo(() => {
    const s = String(status || "").toUpperCase();
    if (s === "CONNECTED") return { label: "Connected", color: "primary" };
    if (s === "QRCODE" || s === "PAIRING") return { label: "Scan QR", color: "secondary" };
    if (s === "DISCONNECTED" || s === "TIMEOUT") return { label: "Disconnected", color: "default" };
    return { label: "Connecting", color: "default" };
  }, [status]);

  useEffect(() => {
    const fetchSession = async () => {
      if (!whatsAppId || !open) return;
      setLoading(true);
      try {
        const { data } = await api.get(`/whatsapp/${whatsAppId}`);
        setQrCode(data?.qrcode || "");
        setStatus(data?.status || "OPENING");
      } catch (err) {
        toastError(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [whatsAppId, open]);

  useEffect(() => {
    if (!whatsAppId || !open) return;
    const socket = openSocket();

    socket.on("whatsappSession", (data) => {
      if (data?.action === "update" && data?.session?.id === whatsAppId) {
        setQrCode(data?.session?.qrcode || "");
        setStatus(data?.session?.status || status);

        // Auto-close when it becomes connected (Evolution clears qrcode)
        if (String(data?.session?.status || "").toUpperCase() === "CONNECTED") {
          onClose();
        }
      }
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsAppId, open, onClose]);

  const handleRefresh = async () => {
    if (!whatsAppId) return;
    setActionLoading(true);
    try {
      await api.put(`/whatsappsession/${whatsAppId}`);
      const { data } = await api.get(`/whatsapp/${whatsAppId}`);
      setQrCode(data?.qrcode || "");
      setStatus(data?.status || "OPENING");
    } catch (err) {
      toastError(err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>
        <Box className={classes.titleRow}>
          <Typography variant="h6">{i18n.t("qrCode.message")}</Typography>
          <Chip label={statusChip.label} color={statusChip.color} size="small" />
        </Box>
      </DialogTitle>
      <Divider />
      <DialogContent>
        <Box className={classes.contentRow}>
          <Box className={classes.instructions}>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              1) WhatsApp → <b>Dispositivos vinculados</b>
              <br />
              2) <b>Vincular un dispositivo</b>
              <br />
              3) Escaneá el QR
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Tip: si el QR expira, tocá <b>Refresh</b>.
            </Typography>
          </Box>

          <Paper variant="outlined" className={classes.qrPaper}>
            {loading ? (
              <CircularProgress />
            ) : qrCode ? (
              <QRCode value={qrCode} size={280} includeMargin />
            ) : (
              <Box className={classes.qrEmpty}>
                <CircularProgress size={22} />
                <Typography variant="body2" color="textSecondary">
                  Waiting for QR…
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="default">
          Close
        </Button>
        <Button
          onClick={handleRefresh}
          color="primary"
          variant="contained"
          startIcon={<RefreshIcon />}
          disabled={actionLoading}
        >
          {actionLoading ? "Refreshing…" : "Refresh"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(QrcodeModal);
