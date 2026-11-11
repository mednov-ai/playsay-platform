// The profile PUT endpoint replaces all writable fields. Preserve fields the smoke
// does not need and undo only this run's temporary changes, including on failure.
const writableFields = [
  "displayName", "learningGoal", "locale", "countryCode", "timezone", "birthDate", "connectionRoutePreference",
];

function writableProfile(profile) {
  return Object.fromEntries(writableFields.map((field) => [field, profile[field] ?? null]));
}

export async function setTemporaryProfile({ apiRequest, token, overrides, registerRestore, shouldApply = () => true }) {
  const initial = await apiRequest(token, "GET", "/users/me/profile", 200);
  if (!shouldApply(initial)) return initial;
  const changed = Object.keys(overrides).filter((field) => initial[field] !== overrides[field]);
  if (changed.some((field) => !writableFields.includes(field))) {
    throw new Error("Temporary profile override contains an unsupported field");
  }
  if (changed.length === 0) return initial;

  // Register before issuing the request: a failed response can still follow a
  // successful write, so the finally block must inspect and repair that case.
  registerRestore(async () => {
    const current = await apiRequest(token, "GET", "/users/me/profile", 200);
    const restore = {};
    for (const field of changed) {
      if (current[field] === initial[field]) continue;
      if (current[field] !== overrides[field]) {
        throw new Error(`Temporary profile field ${field} changed independently; leaving it intact`);
      }
      restore[field] = initial[field] ?? null;
    }
    if (Object.keys(restore).length === 0) return;
    const result = await apiRequest(token, "PUT", "/users/me/profile", 200, {
      ...writableProfile(current), ...restore,
    });
    if (Object.keys(restore).some((field) => (result[field] ?? null) !== restore[field])) {
      throw new Error("Temporary profile restoration was not verified");
    }
  });

  return apiRequest(token, "PUT", "/users/me/profile", 200, {
    ...writableProfile(initial), ...overrides,
  });
}
