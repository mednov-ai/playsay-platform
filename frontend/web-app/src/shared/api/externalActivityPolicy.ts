const guaranteedExternalActivityHosts = [
  "liveworksheets.com",
  "wordwall.net",
  "islcollective.com",
  "topworksheets.com",
  "jeopardylabs.com",
] as const;

export function isGuaranteedExternalActivityUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:"
      && guaranteedExternalActivityHosts.some((providerHost) => host === providerHost || host.endsWith(`.${providerHost}`));
  } catch {
    return false;
  }
}
