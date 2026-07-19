import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { useAppController } from "./useAppController";
import { isStudentInvitePath, paymentTokenFromPath, registrationRouteFromPath, subscribeToPathnameHistory } from "./routes";
import { PublicPaymentPage } from "../features/payments";
import { RegistrationPage, StudentInvitePage } from "../features/registration";

export function App() {
  const [publicLocation, setPublicLocation] = useState(() => currentPublicLocation());

  useEffect(() => subscribeToPathnameHistory(window, () => {
    setPublicLocation(currentPublicLocation());
  }), []);

  const pathname = new URL(publicLocation, window.location.origin).pathname;
  const publicPaymentToken = paymentTokenFromPath(pathname);
  if (publicPaymentToken) {
    return <PublicPaymentPage publicToken={publicPaymentToken} />;
  }
  const registrationRoute = registrationRouteFromPath(pathname);
  if (registrationRoute) {
    return <RegistrationPage key={publicLocation} route={registrationRoute} />;
  }
  if (isStudentInvitePath(pathname)) {
    return <StudentInvitePage />;
  }
  return <AuthenticatedApp />;
}

function currentPublicLocation(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function AuthenticatedApp() {
  return <AppShell {...useAppController()} />;
}
