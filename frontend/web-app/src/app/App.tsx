import { AppShell } from "./AppShell";
import { useAppController } from "./useAppController";
import { paymentTokenFromPath } from "./routes";
import { PublicPaymentPage } from "../features/payments";

export function App() {
  const publicPaymentToken = paymentTokenFromPath(window.location.pathname);
  if (publicPaymentToken) {
    return <PublicPaymentPage publicToken={publicPaymentToken} />;
  }
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  return <AppShell {...useAppController()} />;
}
