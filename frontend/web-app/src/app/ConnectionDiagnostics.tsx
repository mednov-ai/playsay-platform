import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { useAppTranslation } from "../shared/i18n";
import { connectionObservations, diagnosticsShortcut, publicEndpoint, type ConnectionChannel } from "../shared/routing/connectionDiagnostics";
import { readRegionalRouteDiagnostics } from "../shared/api/regionalRouteDiagnostics";
import { authConfig } from "../shared/api/auth";
import "./connectionDiagnostics.css";

const channels: ConnectionChannel[] = ["api", "auth", "policy", "signaling", "collaboration", "publisher", "subscriber"];
export function ConnectionDiagnostics() {
  const { t } = useAppTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!diagnosticsShortcut(event, mac)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [mac]);
  useEffect(() => {
    if (!open) { dialog.current?.close(); return; }
    dialog.current?.showModal();
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [open]);
  const observations = connectionObservations();
  const host = publicEndpoint(window.location.origin);
  const rf = host?.endsWith("honeyschool.ru");
  const traces = open ? readRegionalRouteDiagnostics() : [];
  return <>
    <button type="button" className="connection-diagnostics-trigger" aria-label={t("routeDiagnostics.title")} title={t("routeDiagnostics.title")} onClick={() => setOpen(true)}><Activity size={18} /></button>
    <dialog ref={dialog} className="connection-diagnostics" aria-labelledby="connection-diagnostics-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header><h2 id="connection-diagnostics-title">{t("routeDiagnostics.title")}</h2><button type="button" onClick={() => setOpen(false)}>{t("common.actions.close")}</button></header>
      {open ? <>
        <p>{host?.startsWith("dev.") ? "dev" : host ? "prod" : t("routeDiagnostics.unknown")} · {host ?? t("routeDiagnostics.unknown")}</p>
        <p>{t("routeDiagnostics.explanation")}</p>
        <dl><dt>{t("routeDiagnostics.expected")}</dt><dd>{host ? (rf ? t("routeDiagnostics.rf") : t("routeDiagnostics.direct")) : t("routeDiagnostics.unknown")}</dd></dl>
        <div className="connection-diagnostics-rows">
          {channels.map((channel) => {
            const observation = observations.get(channel);
            const stale = observation && now - observation.at > 15_000;
            const status = !observation ? "unknown" : stale ? "stale" : observation.state;
            const media = channel === "publisher" || channel === "subscriber";
            const endpoint = observation?.endpoint ?? (channel === "auth" ? publicEndpoint(authConfig.issuer) : null);
            return <section key={channel} data-route-channel={channel} data-route-status={status}>
              <strong>{t(`routeDiagnostics.channels.${channel}`)}</strong>
              <span>{t(`routeDiagnostics.${channel === "policy" && observation?.policy && status === "connected" ? "configured" : status}`)}</span>
              <small>{endpoint ?? t("routeDiagnostics.unknown")}{channel === "auth" && !observation ? ` · ${t("routeDiagnostics.expected")}` : ""}</small>
              {channel === "policy" && observation?.policy ? <small>{t(`routeDiagnostics.policies.${observation.policy}`)}</small> : null}
              {channel === "subscriber" && observation ? <small>{t(`routeDiagnostics.${!stale && observation.received ? "receiving" : "noRecentMedia"}`)}</small> : null}
              {media && observation ? <small>{observation.transport ?? t("routeDiagnostics.unknown")} · {observation.relayMatched === true && !stale && observation.state === "connected" ? t("routeDiagnostics.relayConfirmed") : t("routeDiagnostics.relayUnconfirmed")}</small> : null}
            </section>;
          })}
        </div>
        <details><summary>{t("routeDiagnostics.events")}</summary><ol>{traces.slice(-12).map((event, index) => <li key={index}>{t(`routeDiagnostics.stages.${event.stage}`)} · {t(`routeDiagnostics.roles.${event.connectionRole}`)} · {t(`routeDiagnostics.outcomes.${event.outcome}`)} · {t("routeDiagnostics.secondsAgo", { count: Math.max(0, Math.floor((now - event.recordedAt) / 1000)) })}</li>)}</ol></details>
        <p><a href="https://ipinfo.io/developers/ipinfo-lite-database" target="_blank" rel="noreferrer">{t("routeDiagnostics.geoProvider")}</a></p>
        <p><kbd>{mac ? "⌘ + ⌥ + Shift + D" : "Ctrl + Alt + Shift + D"}</kbd> · Esc</p>
      </> : null}
    </dialog>
  </>;
}
