export type ExternalActivityBuildEnvironment = {
  DEV?: boolean;
  VITE_EXTERNAL_ACTIVITY_ENABLED?: string;
};

export function externalActivityFeatureEnabled(
  environment: ExternalActivityBuildEnvironment = import.meta.env,
): boolean {
  return environment.DEV === true || environment.VITE_EXTERNAL_ACTIVITY_ENABLED === "true";
}
