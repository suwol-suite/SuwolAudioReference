import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { LocalizedErrorBoundary } from "./components/ui/ErrorBoundary";
import { ToastProvider } from "./components/ui/ToastProvider";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <LocalizedErrorBoundary>
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </LocalizedErrorBoundary>
    </I18nProvider>
  </React.StrictMode>,
);
