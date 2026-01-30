import React, { createContext, useEffect, useMemo, useState, useContext } from "react";
import PropTypes from "prop-types";
import { createMuiTheme, ThemeProvider as MUIThemeProvider } from "@material-ui/core/styles";
import { CssBaseline } from "@material-ui/core";
import { ptBR } from "@material-ui/core/locale";

const ThemeContext = createContext();

const STORAGE_KEY = "wa_panel_theme";

function getInitialDarkMode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.darkMode === "boolean") return parsed.darkMode;
    }
  } catch {
    // ignore
  }

  // fallback: system preference
  try {
    return !!window?.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  } catch {
    return false;
  }
}

function getMuiLocale() {
  // keep whaticket default behaviour: only load ptBR when i18next is pt-BR
  try {
    const i18nlocale = localStorage.getItem("i18nextLng") || "";
    const normalized = i18nlocale.replace("-", "");
    if (normalized.toLowerCase() === "ptbr") return ptBR;
  } catch {
    // ignore
  }
  return undefined;
}

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);

  const toggleTheme = () => {
    setDarkMode((prevMode) => !prevMode);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ darkMode }));
    } catch {
      // ignore
    }
  }, [darkMode]);

  const theme = useMemo(() => {
    const locale = getMuiLocale();

    const base = {
      scrollbarStyles: {
        "&::-webkit-scrollbar": {
          width: "8px",
          height: "8px"
        },
        "&::-webkit-scrollbar-thumb": {
          boxShadow: "inset 0 0 6px rgba(0, 0, 0, 0.25)",
          backgroundColor: darkMode ? "rgba(255,255,255,0.16)" : "#e8e8e8"
        }
      },
      palette: {
        type: darkMode ? "dark" : "light",
        primary: { main: "#2576d2" },
        secondary: { main: "#22c55e" },
        background: {
          default: darkMode ? "#0b1220" : "#f6f7f9",
          paper: darkMode ? "#0f1a2b" : "#ffffff"
        }
      },
      shape: { borderRadius: 12 },
      typography: {
        fontFamily:
          "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
        button: {
          textTransform: "none",
          fontWeight: 600
        }
      },
      overrides: {
        MuiPaper: {
          rounded: {
            borderRadius: 14
          }
        },
        MuiButton: {
          root: {
            borderRadius: 12
          }
        },
        MuiOutlinedInput: {
          root: {
            borderRadius: 12
          }
        },
        MuiAppBar: {
          colorPrimary: {
            backgroundColor: darkMode ? "#0f1a2b" : "#ffffff",
            color: darkMode ? "#e5e7eb" : "#111827",
            borderBottom: darkMode
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid rgba(17,24,39,0.08)"
          }
        },
        MuiTabs: {
          root: {
            minHeight: 44
          },
          indicator: {
            height: 3,
            borderTopLeftRadius: 3,
            borderTopRightRadius: 3
          }
        },
        MuiTab: {
          root: {
            minHeight: 44
          }
        }
      }
    };

    return locale ? createMuiTheme(base, locale) : createMuiTheme(base);
  }, [darkMode]);

  const contextValue = useMemo(() => ({ darkMode, toggleTheme }), [darkMode]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  );
};

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export const useThemeContext = () => useContext(ThemeContext);
