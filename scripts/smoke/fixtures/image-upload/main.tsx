import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MaterialDraftPanel } from "../src/features/materials/ui/MaterialDraftPanel";
import { WorksheetImportWorkspace } from "../src/features/materials/ui/WorksheetImportWorkspace";
import { prepareMaterialDraftSourceImage } from "../src/features/materials/model/documentFactory";
import type { MaterialDraftSourceImage } from "../src/features/materials/model/types";
import { changeAppLanguage } from "../src/shared/i18n/config";
import "../src/styles.css";
import "../src/styles/materials.css";
import "../src/styles/responsive.css";

await changeAppLanguage(new URLSearchParams(location.search).get("locale") || "ru");

function App() {
  const [image, setImage] = useState<MaterialDraftSourceImage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const noop = () => undefined;
  return <main style={{ maxWidth: 900, margin: "0 auto", padding: 8 }}>
    <MaterialDraftPanel
      canGenerateDraft={false} canGenerateUrlDraft={false} disabled={false}
      draftImage={image} draftImageMessage={message} draftPrompt="" draftUrl="" draftUrlGuidance={null}
      onDraftFromUrl={noop} onCreateBlank={noop}
      onDraftImageChange={(file) => {
        setMessage(null);
        if (file) void prepareMaterialDraftSourceImage(file).then(setImage).catch((error: Error) => setMessage(error.message));
      }}
      onGenerateDraft={noop} onOpenWorksheetImport={noop} onRemoveDraftImage={() => setImage(null)}
      onUpdateDraftPrompt={noop} onUpdateDraftUrl={noop}
    />
    <WorksheetImportWorkspace disabled={false} onClose={noop} onMaterialized={noop} />
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
