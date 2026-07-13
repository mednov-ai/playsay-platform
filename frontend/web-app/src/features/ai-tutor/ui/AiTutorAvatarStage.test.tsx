import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TutorPersona } from "../../../shared/api/aiTutor";
import { TutorPersonaPicker } from "./AiTutorPanel";
import { AiTutorAvatarStage, TutorPortrait } from "./AiTutorAvatarStage";

const personas: TutorPersona[] = [
  { id: "maya", name: "Maya", voice: "coral", accent: "GENERAL_AMERICAN", avatarAsset: "/avatars/maya.webp" },
  { id: "leo", name: "Leo", voice: "verse", accent: "STANDARD_BRITISH", avatarAsset: "/avatars/leo.webp" },
  { id: "nova", name: "Nova", voice: "sage", accent: "GENERAL_AMERICAN", avatarAsset: "/avatars/nova.webp" },
];

describe("AI tutor portraits", () => {
  it("renders the selected persona asset in the large stage", () => {
    const markup = renderToStaticMarkup(<AiTutorAvatarStage persona={personas[1]} speaking />);

    expect(markup).toContain('data-persona-id="leo"');
    expect(markup).toContain('data-speaking="true"');
    expect(markup).toContain('data-testid="ai-tutor-avatar-image"');
    expect(markup).toContain('src="/avatars/leo.webp"');
  });

  it("renders a stable initial fallback when an asset is unavailable", () => {
    const markup = renderToStaticMarkup(
      <TutorPortrait
        className="portrait"
        persona={{ ...personas[2], avatarAsset: "" }}
      />,
    );

    expect(markup).toContain('data-avatar-fallback="true"');
    expect(markup).toContain(">N</span>");
    expect(markup).not.toContain("<img");
  });

  it("renders native radio cards and localized accent labels", () => {
    const markup = renderToStaticMarkup(
      <TutorPersonaPicker
        disabled={false}
        onPersonaChange={() => undefined}
        personaId="leo"
        personas={personas}
      />,
    );

    expect(markup).toContain('name="ai-tutor-persona"');
    expect(markup).toMatch(/name="ai-tutor-persona"[^>]*checked=""[^>]*value="leo"/);
    expect(markup).toContain("Американский английский");
    expect(markup).toContain("Британский английский");
    expect(markup).not.toContain("GENERAL_AMERICAN");
    expect(markup).not.toContain("STANDARD_BRITISH");
  });
});
