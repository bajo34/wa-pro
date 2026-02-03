import React, { useContext, useEffect, useMemo, useState } from "react";
import { useHistory } from "react-router-dom";

import {
  Box,
  Button,
  Divider,
  makeStyles,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from "@material-ui/core";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  tabPanel: {
    paddingTop: theme.spacing(2),
  },
  rowActions: {
    display: "flex",
    gap: theme.spacing(1),
  },
  formRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: theme.spacing(2),
    alignItems: "start",
  },
  full: {
    gridColumn: "1 / -1",
  },
}));

function TabPanel({ value, index, children }) {
  if (value !== index) return null;
  return <Box>{children}</Box>;
}

function parseCsvTriggers(s) {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

const Bot = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);

  useEffect(() => {
    if (user && user.profile && user.profile !== "admin") {
      history.push("/");
    }
  }, [user, history]);

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);

  // Settings
  const [settingsRaw, setSettingsRaw] = useState("{}");

  // Lists
  const [faqs, setFaqs] = useState([]);
  const [playbooks, setPlaybooks] = useState([]);
  const [examples, setExamples] = useState([]);
  const [decisions, setDecisions] = useState([]);

  // Create forms
  const [faqForm, setFaqForm] = useState({ title: "", triggers: "", answer: "" });
  const [pbForm, setPbForm] = useState({ intent: "", triggers: "", template: "" });
  const [exForm, setExForm] = useState({ intent: "", user_text: "", ideal_answer: "", notes: "" });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, f, p, e, d] = await Promise.all([
        api.get("/bot/intelligence/settings"),
        api.get("/bot/intelligence/faqs"),
        api.get("/bot/intelligence/playbooks"),
        api.get("/bot/intelligence/examples"),
        api.get("/bot/intelligence/decisions", { params: { limit: 200 } }),
      ]);

      setSettingsRaw(JSON.stringify(s.data?.settings ?? {}, null, 2));
      setFaqs(f.data?.faqs ?? []);
      setPlaybooks(p.data?.playbooks ?? []);
      setExamples(e.data?.examples ?? []);
      setDecisions(d.data?.decisions ?? []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.profile === "admin") loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.profile]);

  const saveSettings = async () => {
    try {
      const parsed = JSON.parse(settingsRaw || "{}");
      await api.put("/bot/intelligence/settings", parsed);
      toast.success("Settings guardados");
      await loadAll();
    } catch (err) {
      if (err?.message?.includes("JSON")) {
        toast.error("JSON inválido en Settings");
        return;
      }
      toastError(err);
    }
  };

  const createFaqRow = async () => {
    try {
      await api.post("/bot/intelligence/faqs", {
        title: faqForm.title || null,
        triggers: parseCsvTriggers(faqForm.triggers),
        answer: faqForm.answer,
        enabled: true,
      });
      toast.success("FAQ creada");
      setFaqForm({ title: "", triggers: "", answer: "" });
      await loadAll();
    } catch (err) {
      toastError(err);
    }
  };

  const deleteFaqRow = async (id) => {
    try {
      await api.delete(`/bot/intelligence/faqs/${id}`);
      toast.success("FAQ eliminada");
      await loadAll();
    } catch (err) {
      toastError(err);
    }
  };

  const createPlaybookRow = async () => {
    try {
      await api.post("/bot/intelligence/playbooks", {
        intent: pbForm.intent,
        triggers: parseCsvTriggers(pbForm.triggers),
        template: pbForm.template,
        enabled: true,
      });
      toast.success("Playbook creado");
      setPbForm({ intent: "", triggers: "", template: "" });
      await loadAll();
    } catch (err) {
      toastError(err);
    }
  };

  const deletePlaybookRow = async (id) => {
    try {
      await api.delete(`/bot/intelligence/playbooks/${id}`);
      toast.success("Playbook eliminado");
      await loadAll();
    } catch (err) {
      toastError(err);
    }
  };

  const createExampleRow = async () => {
    try {
      await api.post("/bot/intelligence/examples", {
        intent: exForm.intent,
        user_text: exForm.user_text,
        ideal_answer: exForm.ideal_answer,
        notes: exForm.notes || null,
      });
      toast.success("Ejemplo guardado");
      setExForm({ intent: "", user_text: "", ideal_answer: "", notes: "" });
      await loadAll();
    } catch (err) {
      toastError(err);
    }
  };

  const deleteExampleRow = async (id) => {
    try {
      await api.delete(`/bot/intelligence/examples/${id}`);
      toast.success("Ejemplo eliminado");
      await loadAll();
    } catch (err) {
      toastError(err);
    }
  };

  const decisionRows = useMemo(() => decisions ?? [], [decisions]);

  return (
    <MainContainer>
      <MainHeader>
        <Title>Bot</Title>
        <MainHeaderButtonsWrapper>
          <Button variant="outlined" onClick={loadAll} disabled={loading}>
            Refrescar
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.mainPaper}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} indicatorColor="primary" textColor="primary">
          <Tab label="General" />
          <Tab label="FAQs" />
          <Tab label="Playbooks" />
          <Tab label="Training" />
          <Tab label="Decisions" />
        </Tabs>
        <Divider />

        <Box className={classes.tabPanel}>
          <TabPanel value={tab} index={0}>
            <Typography variant="body2" gutterBottom>
              Settings en JSON. Se usan para templates: {'{settings.algo}'}
            </Typography>
            <TextField
              value={settingsRaw}
              onChange={(e) => setSettingsRaw(e.target.value)}
              variant="outlined"
              fullWidth
              multiline
              rows={14}
            />
            <Box mt={2}>
              <Button color="primary" variant="contained" onClick={saveSettings} disabled={loading}>
                Guardar settings
              </Button>
            </Box>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Box className={classes.formRow}>
              <TextField label="Título" variant="outlined" value={faqForm.title} onChange={(e) => setFaqForm({ ...faqForm, title: e.target.value })} />
              <TextField label="Triggers (comma)" variant="outlined" value={faqForm.triggers} onChange={(e) => setFaqForm({ ...faqForm, triggers: e.target.value })} />
              <TextField className={classes.full} label="Respuesta" variant="outlined" multiline rows={4} value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} />
              <Box className={classes.full}>
                <Button color="primary" variant="contained" onClick={createFaqRow}>Crear FAQ</Button>
              </Box>
            </Box>

            <Box mt={2}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Título</TableCell>
                    <TableCell>Triggers</TableCell>
                    <TableCell>Respuesta</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {faqs.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.id}</TableCell>
                      <TableCell>{f.title || ""}</TableCell>
                      <TableCell>{(f.triggers || []).join(", ")}</TableCell>
                      <TableCell style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{f.answer}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" color="secondary" onClick={() => deleteFaqRow(f.id)}>Eliminar</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </TabPanel>

          <TabPanel value={tab} index={2}>
            <Box className={classes.formRow}>
              <TextField label="Intent" variant="outlined" value={pbForm.intent} onChange={(e) => setPbForm({ ...pbForm, intent: e.target.value })} />
              <TextField label="Triggers (comma)" variant="outlined" value={pbForm.triggers} onChange={(e) => setPbForm({ ...pbForm, triggers: e.target.value })} />
              <TextField className={classes.full} label="Template" variant="outlined" multiline rows={5} value={pbForm.template} onChange={(e) => setPbForm({ ...pbForm, template: e.target.value })} />
              <Box className={classes.full}>
                <Button color="primary" variant="contained" onClick={createPlaybookRow}>Crear Playbook</Button>
              </Box>
            </Box>

            <Box mt={2}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Intent</TableCell>
                    <TableCell>Triggers</TableCell>
                    <TableCell>Template</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {playbooks.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.id}</TableCell>
                      <TableCell>{p.intent}</TableCell>
                      <TableCell>{(p.triggers || []).join(", ")}</TableCell>
                      <TableCell style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{p.template}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" color="secondary" onClick={() => deletePlaybookRow(p.id)}>Eliminar</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </TabPanel>

          <TabPanel value={tab} index={3}>
            <Typography variant="body2" gutterBottom>
              Ejemplos: sirven como base para futuros upgrades (LLM), y hoy te dejan documentar respuestas ideales por intent.
            </Typography>
            <Box className={classes.formRow}>
              <TextField label="Intent" variant="outlined" value={exForm.intent} onChange={(e) => setExForm({ ...exForm, intent: e.target.value })} />
              <TextField label="Notas" variant="outlined" value={exForm.notes} onChange={(e) => setExForm({ ...exForm, notes: e.target.value })} />
              <TextField className={classes.full} label="User text" variant="outlined" multiline rows={3} value={exForm.user_text} onChange={(e) => setExForm({ ...exForm, user_text: e.target.value })} />
              <TextField className={classes.full} label="Ideal answer" variant="outlined" multiline rows={4} value={exForm.ideal_answer} onChange={(e) => setExForm({ ...exForm, ideal_answer: e.target.value })} />
              <Box className={classes.full}>
                <Button color="primary" variant="contained" onClick={createExampleRow}>Guardar ejemplo</Button>
              </Box>
            </Box>

            <Box mt={2}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Intent</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Ideal</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {examples.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>{x.id}</TableCell>
                      <TableCell>{x.intent}</TableCell>
                      <TableCell style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{x.user_text}</TableCell>
                      <TableCell style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>{x.ideal_answer}</TableCell>
                      <TableCell align="right">
                        <Button size="small" variant="outlined" color="secondary" onClick={() => deleteExampleRow(x.id)}>Eliminar</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </TabPanel>

          <TabPanel value={tab} index={4}>
            <Typography variant="body2" gutterBottom>
              Últimas decisiones. Útil para auditar por qué respondió FAQ/Playbook.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>At</TableCell>
                  <TableCell>Remote</TableCell>
                  <TableCell>Intent</TableCell>
                  <TableCell>Data</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {decisionRows.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{String(d.created_at || "").replace("T", " ").slice(0, 19)}</TableCell>
                    <TableCell>{d.remote_jid}</TableCell>
                    <TableCell>{d.intent || ""}</TableCell>
                    <TableCell style={{ maxWidth: 520, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(d.data ?? {}, null, 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabPanel>
        </Box>
      </Paper>
    </MainContainer>
  );
};

export default Bot;
