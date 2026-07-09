import { AppShell } from "./AppShell";
import { useAppController } from "./useAppController";
import { isStudentInvitePath, paymentTokenFromPath, registrationRouteFromPath } from "./routes";
import { PublicPaymentPage } from "../features/payments";
import { RegistrationPage, StudentInvitePage } from "../features/registration";

export function App() {
  const publicPaymentToken = paymentTokenFromPath(window.location.pathname);
  if (publicPaymentToken) {
    return <PublicPaymentPage publicToken={publicPaymentToken} />;
  }
  const registrationRoute = registrationRouteFromPath(window.location.pathname);
  if (registrationRoute) {
    return <RegistrationPage route={registrationRoute} />;
  }
  if (isStudentInvitePath(window.location.pathname)) {
    return <StudentInvitePage />;
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  return <AppShell {...useAppController()} />;
}
