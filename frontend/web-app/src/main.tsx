import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "@livekit/components-styles";
import "./shared/i18n/config";
import "./styles.css";
import "./styles/workspace.css";
import "./styles/classroom.css";
import "./styles/materials.css";
import "./styles/responsive.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
