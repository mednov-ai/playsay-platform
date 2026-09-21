export type DocumentMaterialBuildEnvironment = {
  DEV?: boolean;
  VITE_DOCUMENT_MATERIALS_ENABLED?: string;
};

export function documentMaterialsEnabled(
  environment: DocumentMaterialBuildEnvironment = import.meta.env,
): boolean {
  return environment.DEV === true || environment.VITE_DOCUMENT_MATERIALS_ENABLED === "true";
}
