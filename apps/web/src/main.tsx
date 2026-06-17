import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { PublicConfigProvider } from "./config/PublicConfigContext";
import { ThemeProvider } from "./theme/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <PublicConfigProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </PublicConfigProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
