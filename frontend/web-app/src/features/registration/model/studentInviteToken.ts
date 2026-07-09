type StudentInviteLocation = Pick<Location, "hash" | "search">;

export function studentInviteTokenFromLocation(location: StudentInviteLocation): string {
  const fragment = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  return decodeLocationValue(fragment);
}

export function clearStudentInviteSecretFromAddressBar(): void {
  if (!window.location.hash) {
    return;
  }

  window.history.replaceState(
    {},
    document.title,
    `${window.location.pathname || "/join"}${window.location.search}`,
  );
}

function decodeLocationValue(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}
