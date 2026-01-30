import React from "react";
import Routes from "./routes";
import "react-toastify/dist/ReactToastify.css";

// Theme + dark mode are handled in src/context/DarkMode (single source of truth).
const App = () => {
  return <Routes />;
};

export default App;
