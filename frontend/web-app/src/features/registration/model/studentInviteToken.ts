type StudentInviteLocation = Pick<Location, "hash" | "search">;

export function studentInviteTokenFromLocation(location: StudentInviteLocation): string {
  const fragment = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  const fragmentToken = decodeLocationValue(fragment);
  if (fragmentToken) {
    return fragmentToken;
  }
  return new URLSearchParams(location.search).get("token")?.trim() ?? "";
}

export function clearStudentInviteSecretFromAddressBar(): void {
  const params = new URLSearchParams(window.location.search);
  const hadQueryToken = params.has("token");
  params.delete("token");

  if (!window.location.hash && !hadQueryToken) {
    return;
  }

  const search = params.toString();
  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname || "/student-invite"}${search ? `?${search}` : ""}`,
  );
}

function decodeLocationValue(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}
