import { useEffect, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  User,
  Video,
} from "lucide-react";
import {
  buildLogoutUrl,
  clearTokens,
  completeLogin,
  fetchMe,
  isAuthCallback,
  readTokens,
  startLogin,
  type MeProfile,
} from "./auth";
import { Button } from "./components/ui/button";

export function App() {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [status, setStatus] = useState<"checking" | "anonymous" | "authenticated" | "error">(
    "checking",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const currentUrl = new URL(window.location.href);
        if (isAuthCallback(currentUrl)) {
          await completeLogin(currentUrl);
          window.history.replaceState({}, document.title, "/");
        }

        if (!readTokens()) {
          if (!cancelled) {
            setStatus("anonymous");
          }
          return;
        }

        const me = await fetchMe();
        if (!cancelled) {
          setProfile(me);
          setStatus("authenticated");
        }
      } catch (caught) {
        clearTokens();
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Auth failed.");
          setStatus("error");
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthenticated = status === "authenticated" && profile !== null;

  function logout() {
    const logoutUrl = buildLogoutUrl();
    clearTokens();
    window.location.assign(logoutUrl);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-2xl font-semibold">Play&Say</h1>
            <p className="text-sm text-muted-foreground">Dev classroom</p>
          </div>
          {isAuthenticated ? (
            <Button variant="outline" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          ) : (
            <Button onClick={() => void startLogin()} disabled={status === "checking"}>
              {status === "checking" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Sign in
            </Button>
          )}
        </header>

        <div className="grid flex-1 gap-4 md:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-lg border border-border bg-muted p-4">
            <div className="flex h-full min-h-80 items-center justify-center rounded-md bg-background">
              <div className="text-center">
                <Video className="mx-auto mb-3 h-10 w-10" />
                <h2 className="text-lg font-medium">Waiting room</h2>
                <p className="text-sm text-muted-foreground">
                  {isAuthenticated ? "Ready for the first lesson." : "Sign in to enter."}
                </p>
                <Button className="mt-5" disabled={!isAuthenticated}>
                  <Video className="h-4 w-4" />
                  Start lesson
                </Button>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <h2 className="text-lg font-medium">Identity</h2>
            </div>

            <IdentityPanel error={error} profile={profile} status={status} />

            <div className="flex items-center gap-2 border-t border-border pt-4">
              <BookOpen className="h-5 w-5" />
              <h2 className="text-lg font-medium">Assignment editor</h2>
            </div>
            <textarea
              className="min-h-44 w-full resize-none rounded-md border border-border bg-muted p-3 text-sm outline-none ring-primary/30 focus:ring-2"
              defaultValue="Hello! My name is..."
              disabled={!isAuthenticated}
            />
          </section>
        </div>
      </section>
    </main>
  );
}

function IdentityPanel({
  error,
  profile,
  status,
}: {
  error: string | null;
  profile: MeProfile | null;
  status: "checking" | "anonymous" | "authenticated" | "error";
}) {
  if (status === "checking") {
    return (
      <div className="flex min-h-28 items-center gap-3 rounded-md border border-border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking session
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-28 items-center gap-3 rounded-md border border-border p-3 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-primary" />
        {error ?? "Session error"}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-28 items-center gap-3 rounded-md border border-border p-3 text-sm text-muted-foreground">
        <User className="h-4 w-4" />
        Anonymous session
      </div>
    );
  }

  return (
    <div className="min-h-28 rounded-md border border-border p-3">
      <div className="text-sm font-medium">{profile.name ?? profile.username ?? profile.subject}</div>
      <div className="mt-1 break-all text-xs text-muted-foreground">{profile.email ?? profile.subject}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {profile.roles.map((role) => (
          <span
            className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium"
            key={role}
          >
            {role}
          </span>
        ))}
      </div>
    </div>
  );
}
