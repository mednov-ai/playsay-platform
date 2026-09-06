import { installConnectionObservation } from "./shared/routing/connectionDiagnostics";
import { ConnectionDiagnostics } from "./app/ConnectionDiagnostics";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { AppProviders } from "./app/AppProviders";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/manrope";
import "@livekit/components-styles";
import "./shared/i18n/config";
import "./styles.css";
import "./styles/workspace.css";
import "./styles/schedule.css";
import "./styles/classroom.css";
import "./styles/chat.css";
import "./styles/materials.css";
import "./styles/responsive.css";

installConnectionObservation();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <App />
      <ConnectionDiagnostics />
    </AppProviders>
  </React.StrictMode>,
);
