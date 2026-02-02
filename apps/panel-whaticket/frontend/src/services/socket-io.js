import socketIO from "socket.io-client";

import api from "./api";
import { getBackendUrl } from "../config";

// Single socket instance for the entire app.
let socket;
let refreshing = false;

// This project uses Vite (import.meta.env) or window.ENV in Docker.
// Using getBackendUrl() keeps it consistent with the API client.
const backendUrl = getBackendUrl();

const getStoredToken = () => {
  try {
    const raw = localStorage.getItem("token");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const refreshAccessToken = async () => {
  if (refreshing) return null;
  refreshing = true;
  try {
    const { data } = await api.post("/auth/refresh_token");
    if (data?.token) {
      localStorage.setItem("token", JSON.stringify(data.token));
      return data.token;
    }
    return null;
  } catch {
    return null;
  } finally {
    refreshing = false;
  }
};

const applyTokenToSocket = (s, token) => {
  // Backward compatible with backend expecting token in query.
  s.io.opts.query = { ...(s.io.opts.query || {}), token };
  // Also provide via auth, in case the backend was updated.
  s.auth = { ...(s.auth || {}), token };
};

const ensureConnected = async (s) => {
  const token = getStoredToken();
  applyTokenToSocket(s, token);
  if (!s.connected) s.connect();
};

export default function openSocket() {
  if (socket) return socket;

  socket = socketIO(backendUrl, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    withCredentials: true
  });

  socket.on("connect", () => {
    // nothing
  });

  // When the access token expires, the backend will disconnect the socket.
  // We try a refresh and reconnect with the new token.
  const tryRefreshAndReconnect = async () => {
    const newToken = await refreshAccessToken();
    if (newToken) {
      applyTokenToSocket(socket, newToken);
      socket.connect();
    }
  };

  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect" || reason === "transport close") {
      void tryRefreshAndReconnect();
    }
  });

  socket.on("connect_error", () => {
    void tryRefreshAndReconnect();
  });

  // Initial connect
  void ensureConnected(socket);

  return socket;
}
