export function registrationUrlForKeyboard(returnTo: string): string {
  const returnToHostname = new URL(returnTo).hostname;
  const publicWebOrigin =
    returnToHostname === "key.honey.school"
      ? "https://online.honey.school"
      : returnToHostname === "dev.key.honey.school" || returnToHostname === "dev.key.honeyschool.ru"
        ? returnToHostname.endsWith("honeyschool.ru")
          ? "https://dev.online.honeyschool.ru"
          : "https://dev.online.honey.school"
        : "https://online.play-and-say.ru";
  const url = new URL("/register", publicWebOrigin);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
