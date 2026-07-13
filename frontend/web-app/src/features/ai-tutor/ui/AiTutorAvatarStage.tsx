import { useState } from "react";
import type { TutorPersona } from "../../../shared/api/aiTutor";

type TutorPortraitProps = {
  className?: string;
  imageClassName?: string;
  loading?: "eager" | "lazy";
  persona?: TutorPersona;
  testId?: string;
};

export function TutorPortrait({ className, imageClassName, loading = "lazy", persona, testId }: TutorPortraitProps) {
  const [failedAsset, setFailedAsset] = useState<string | null>(null);
  const avatarAsset = persona?.avatarAsset;
  const canShowImage = Boolean(avatarAsset) && failedAsset !== avatarAsset;
  const initial = persona?.name.trim().charAt(0).toUpperCase() ?? "";

  return (
    <span className={className} data-avatar-fallback={!canShowImage}>
      {canShowImage ? (
        <img
          alt=""
          className={imageClassName}
          data-testid={testId}
          decoding="async"
          loading={loading}
          onError={() => setFailedAsset(avatarAsset ?? null)}
          src={avatarAsset}
        />
      ) : (
        <span aria-hidden="true" className="grid h-full w-full place-items-center bg-gradient-to-br from-orange-100 via-amber-50 to-emerald-100 text-lg font-black text-primary dark:from-orange-950 dark:via-zinc-900 dark:to-emerald-950">
          {initial}
        </span>
      )}
    </span>
  );
}

export function AiTutorAvatarStage({ persona, speaking }: { persona?: TutorPersona; speaking: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-[#fff5e9] dark:bg-[#21160f]"
      data-persona-id={persona?.id ?? ""}
      data-speaking={speaking}
      data-testid="ai-tutor-avatar-stage"
    >
      <TutorPortrait
        className="block h-full w-full"
        imageClassName={`h-full w-full object-cover object-center transition duration-500 motion-reduce:transition-none ${speaking ? "scale-[1.015]" : "scale-100"}`}
        key={persona?.avatarAsset ?? "fallback"}
        loading="eager"
        persona={persona}
        testId="ai-tutor-avatar-image"
      />
      <span
        className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,transparent_42%,rgba(255,92,0,.22)_100%)] transition-opacity duration-300 motion-reduce:transition-none ${speaking ? "animate-pulse opacity-100 motion-reduce:animate-none" : "opacity-0"}`}
      />
    </div>
  );
}
