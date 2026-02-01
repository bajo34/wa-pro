import { useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import openSocket from "../../services/socket-io";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useAuth = () => {
  const history = useHistory();
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({});

  // helper: set/clear Authorization correctamente (sin "undefined")
  const setAuthHeader = (token) => {
    if (token) {
      api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  };

  useEffect(() => {
    // ✅ Registrar interceptors UNA sola vez (evita duplicados por rerender)
    const reqId = api.interceptors.request.use(
      (config) => {
        const raw = localStorage.getItem("token");

        // si no hay token, asegurá que NO se mande Authorization
        if (!raw) {
          if (config?.headers) delete config.headers.Authorization;
          return config;
        }

        // token guardado como JSON.stringify(token)
        let token;
        try {
          token = JSON.parse(raw);
        } catch {
          // si quedó guardado sin JSON, usalo igual
          token = raw;
        }

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          setIsAuth(true);
        } else {
          delete config.headers.Authorization;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    const resId = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // refresh token
        if (error?.response?.status === 403 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const { data } = await api.post("/auth/refresh_token");
            if (data?.token) {
              localStorage.setItem("token", JSON.stringify(data.token));
              setAuthHeader(data.token);
            }
            return api(originalRequest);
          } catch (err) {
            // si refresh falla, limpiamos sesión
            localStorage.removeItem("token");
            setAuthHeader(null);
            setIsAuth(false);
            return Promise.reject(err);
          }
        }

        // 401 => limpiar token y header (SIN setear undefined)
        if (error?.response?.status === 401) {
          localStorage.removeItem("token");
          setAuthHeader(null);
          setIsAuth(false);
        }

        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(reqId);
      api.interceptors.response.eject(resId);
    };
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("token");

    (async () => {
      try {
        if (raw) {
          const { data } = await api.post("/auth/refresh_token");
          if (data?.token) {
            setAuthHeader(data.token);
            setIsAuth(true);
          }
          if (data?.user) setUser(data.user);
        }
      } catch (err) {
        // si refresh falla, limpiar para evitar loops
        localStorage.removeItem("token");
        setAuthHeader(null);
        setIsAuth(false);
        toastError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    // Avoid connecting with token=null (backend will disconnect immediately).
    // Only connect after we have an authenticated user.
    if (!isAuth || !user?.id) return;

    const socket = openSocket();

    socket.on("user", (data) => {
      if (data.action === "update" && data.user.id === user.id) {
        setUser(data.user);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuth, user?.id]);

  const handleLogin = async (userData) => {
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", userData);

      // importante: setear token y header correctamente
      localStorage.setItem("token", JSON.stringify(data.token));
      setAuthHeader(data.token);

      setUser(data.user);
      setIsAuth(true);

      toast.success(i18n.t("auth.toasts.success"));
      history.push("/tickets");
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);

    try {
      await api.delete("/auth/logout");
    } catch (err) {
      // aunque falle, limpiamos local
      toastError(err);
    } finally {
      setIsAuth(false);
      setUser({});
      localStorage.removeItem("token");
      setAuthHeader(null);
      setLoading(false);
      history.push("/login");
    }
  };

  return { isAuth, user, loading, handleLogin, handleLogout };
};

export default useAuth;
