import { AppShell } from "./AppShell";
import { useAppController } from "./useAppController";
import { paymentTokenFromPath, registrationRouteFromPath } from "./routes";
import { PublicPaymentPage } from "../features/payments";
import { RegistrationPage } from "../features/registration";

export function App() {
  const publicPaymentToken = paymentTokenFromPath(window.location.pathname);
  if (publicPaymentToken) {
    return <PublicPaymentPage publicToken={publicPaymentToken} />;
  }
  const registrationRoute = registrationRouteFromPath(window.location.pathname);
  if (registrationRoute) {
    return <RegistrationPage route={registrationRoute} />;
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  return <AppShell {...useAppController()} />;
}
