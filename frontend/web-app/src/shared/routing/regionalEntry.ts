const regionalHosts: Record<string, string> = {
  "online.honey.school": "online.honeyschool.ru",
  "dev.online.honey.school": "dev.online.honeyschool.ru",
};

export function regionalEntryUrl(location: Pick<Location, "hash" | "hostname" | "pathname" | "protocol" | "search">): string | null {
  if (location.pathname.startsWith("/auth/")) return null;
  const regionalHost = regionalHosts[location.hostname.toLowerCase()];
  if (!regionalHost || location.protocol !== "https:") return null;
  return `https://${regionalHost}${location.pathname}${location.search}${location.hash}`;
}
