import type { ChatContact } from "../api/chatApi";

export function matchesChatContact(contact: ChatContact, search: string, locale: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase(locale);
  const query = normalize(search);
  if (!query) return true;
  return normalize(contact.username ?? "").startsWith(query)
    || normalize(contact.displayName).startsWith(query)
    || normalize(contact.displayName).split(/\s+/u).some((word) => word.startsWith(query));
}
