type StudentInviteLocation = Pick<Location, "hash" | "search">;

type StudentInviteNavigationSource = {
  location: StudentInviteLocation;
  addEventListener(type: "hashchange", listener: () => void): void;
  removeEventListener(type: "hashchange", listener: () => void): void;
};

export function studentInviteTokenFromLocation(location: StudentInviteLocation): string {
  const fragment = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  return decodeLocationValue(fragment);
}

export function subscribeToStudentInviteToken(
  source: StudentInviteNavigationSource,
  onToken: (token: string) => void,
): () => void {
  const notify = () => {
    const token = studentInviteTokenFromLocation(source.location);
    if (token) {
      onToken(token);
    }
  };
  source.addEventListener("hashchange", notify);
  return () => source.removeEventListener("hashchange", notify);
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
