import { AppShell } from "./AppShell";
import { useAppController } from "./useAppController";

export function App() {
  return <AppShell {...useAppController()} />;
}
