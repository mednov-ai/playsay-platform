import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { useThemeMode } from "../shared/theme";

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 15_000,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  const theme = useThemeMode();

  return (
    <QueryClientProvider client={appQueryClient}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </QueryClientProvider>
  );
}

const ThemeContext = createContext<ReturnType<typeof useThemeMode> | null>(null);

export function useAppTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error("useAppTheme must be used inside AppProviders");
  }
  return theme;
}
