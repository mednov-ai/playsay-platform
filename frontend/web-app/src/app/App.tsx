import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { useAppController } from "./useAppController";
import { isStudentInvitePath, lessonAccessRouteFromPath, paymentTokenFromPath, registrationRouteFromPath, subscribeToPathnameHistory } from "./routes";
import { PublicPaymentPage } from "../features/payments";
import { RegistrationPage, StudentInvitePage } from "../features/registration";
import { LessonAccessPage, LessonAssertionPage } from "../features/lesson-access";

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
  const lessonAccessRoute = lessonAccessRouteFromPath(pathname);
  if (lessonAccessRoute) {
    return lessonAccessRoute.kind === "legacy" && lessonAccessRoute.auth
      ? <LessonAssertionPage lessonId={lessonAccessRoute.lessonId} />
      : <LessonAccessPage lessonId={lessonAccessRoute.kind === "legacy" ? lessonAccessRoute.lessonId : undefined} />;
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
