export function registrationUrlForKeyboard(returnTo: string): string {
  const url = new URL("/register", "https://online.play-and-say.ru");
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
