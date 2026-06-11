import type { ReactNode } from "react";

export type AchievementCode = "FIRST_HUNDRED" | "SNIPER" | "METRONOME" | "STREAK_7" | "STREAK_30";

export interface AchievementCatalogLabels {
  lockedAchievement: string;
  achievement_FIRST_HUNDRED_title: string;
  achievement_FIRST_HUNDRED_description: string;
  achievement_SNIPER_title: string;
  achievement_SNIPER_description: string;
  achievement_METRONOME_title: string;
  achievement_METRONOME_description: string;
  achievement_STREAK_7_title: string;
  achievement_STREAK_7_description: string;
  achievement_STREAK_30_title: string;
  achievement_STREAK_30_description: string;
  achievement_UNKNOWN_title: string;
  achievement_UNKNOWN_description: string;
}

export const knownAchievementCodes: AchievementCode[] = ["FIRST_HUNDRED", "SNIPER", "METRONOME", "STREAK_7", "STREAK_30"];

export function achievementInfo(code: string, labels: AchievementCatalogLabels) {
  if (isKnownAchievement(code)) {
    return {
      code,
      known: true,
      title: labels[`achievement_${code}_title`],
      description: labels[`achievement_${code}_description`],
    };
  }
  return {
    code,
    known: false,
    title: labels.achievement_UNKNOWN_title,
    description: labels.achievement_UNKNOWN_description,
  };
}

export function AchievementBadgeCard({
  code,
  labels,
  unlocked,
}: {
  code: string;
  labels: AchievementCatalogLabels;
  unlocked: boolean;
}) {
  const info = achievementInfo(code, labels);
  return (
    <article className={`achievement-badge-card ${unlocked ? "is-unlocked" : "is-locked"}`}>
      <AchievementBadgeArt code={code} locked={!unlocked} />
      <div>
        <strong>{info.title}</strong>
        <p>{info.description}</p>
        {!unlocked ? <small>{labels.lockedAchievement}</small> : null}
      </div>
    </article>
  );
}

export function AchievementBadgeArt({ code, locked = false }: { code: string; locked?: boolean }) {
  const Icon = isKnownAchievement(code) ? achievementIcons[code] : achievementIcons.UNKNOWN;
  return (
    <span className={`achievement-badge__art ${locked ? "is-locked" : ""}`} aria-hidden="true">
      <Icon />
    </span>
  );
}

function isKnownAchievement(code: string): code is AchievementCode {
  return knownAchievementCodes.includes(code as AchievementCode);
}

function BadgeShell({ children, variant = "orange" }: { children: ReactNode; variant?: "orange" | "mint" | "yellow" | "ink" | "rose" | "gray" }) {
  return (
    <svg viewBox="0 0 96 96" role="img" focusable="false">
      <defs>
        <linearGradient id={`badge-gradient-${variant}`} x1="18" x2="78" y1="14" y2="84">
          <stop offset="0" stopColor={badgeColors[variant].top} />
          <stop offset="1" stopColor={badgeColors[variant].bottom} />
        </linearGradient>
      </defs>
      <path
        d="M48 6 60.5 16.5 76.8 18.8 79.2 35.1 89.5 48 79.2 60.9 76.8 77.2 60.5 79.5 48 90 35.5 79.5 19.2 77.2 16.8 60.9 6.5 48 16.8 35.1 19.2 18.8 35.5 16.5 48 6Z"
        fill={`url(#badge-gradient-${variant})`}
      />
      <circle cx="48" cy="48" r="31" fill="white" opacity="0.88" />
      {children}
    </svg>
  );
}

function FirstHundredIcon() {
  return (
    <BadgeShell variant="orange">
      <path d="M31 58h34" stroke="#ff5c00" strokeLinecap="round" strokeWidth="7" />
      <path d="M34 39h5v22M51 39c-6 0-10 4-10 11s4 11 10 11 10-4 10-11-4-11-10-11Z" fill="none" stroke="#111" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
      <path d="M64 39c-6 0-10 4-10 11s4 11 10 11" fill="none" stroke="#111" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
    </BadgeShell>
  );
}

function SniperIcon() {
  return (
    <BadgeShell variant="mint">
      <circle cx="48" cy="48" r="20" fill="none" stroke="#111" strokeWidth="5" />
      <circle cx="48" cy="48" r="8" fill="#ff5c00" />
      <path d="M48 22v12M48 62v12M22 48h12M62 48h12" stroke="#111" strokeLinecap="round" strokeWidth="5" />
    </BadgeShell>
  );
}

function MetronomeIcon() {
  return (
    <BadgeShell variant="yellow">
      <path d="M34 69 44 25h8l10 44H34Z" fill="none" stroke="#111" strokeLinejoin="round" strokeWidth="5" />
      <path d="M48 64 60 34" stroke="#ff5c00" strokeLinecap="round" strokeWidth="6" />
      <circle cx="60" cy="34" r="5" fill="#ff5c00" />
      <path d="M39 69h18" stroke="#111" strokeLinecap="round" strokeWidth="5" />
    </BadgeShell>
  );
}

function WeekStreakIcon() {
  return (
    <BadgeShell variant="rose">
      <path d="M48 70c12-7 18-15 18-25 0-8-5-15-13-18 1 9-7 14-12 18 1-8-4-14-10-18 1 12-7 17-7 28 0 9 8 16 24 15Z" fill="#ff5c00" />
      <path d="M41 58c1-6 6-9 11-14 0 9 6 12 3 19-2 5-7 8-14 7-7-4-6-8 0-12Z" fill="#fff3cf" />
    </BadgeShell>
  );
}

function MonthStreakIcon() {
  return (
    <BadgeShell variant="ink">
      <path d="M28 35h40v33H28V35Z" fill="none" stroke="#111" strokeLinejoin="round" strokeWidth="5" />
      <path d="M28 45h40M37 28v12M59 28v12" stroke="#111" strokeLinecap="round" strokeWidth="5" />
      <path d="m39 57 6 6 13-14" fill="none" stroke="#ff5c00" strokeLinecap="round" strokeLinejoin="round" strokeWidth="6" />
    </BadgeShell>
  );
}

function UnknownIcon() {
  return (
    <BadgeShell variant="gray">
      <path d="M48 28v23" stroke="#62666f" strokeLinecap="round" strokeWidth="7" />
      <circle cx="48" cy="65" r="4" fill="#62666f" />
      <path d="M37 37c2-6 6-9 12-9 7 0 12 4 12 10 0 5-3 8-8 11" fill="none" stroke="#62666f" strokeLinecap="round" strokeWidth="5" />
    </BadgeShell>
  );
}

const achievementIcons = {
  FIRST_HUNDRED: FirstHundredIcon,
  SNIPER: SniperIcon,
  METRONOME: MetronomeIcon,
  STREAK_7: WeekStreakIcon,
  STREAK_30: MonthStreakIcon,
  UNKNOWN: UnknownIcon,
};

const badgeColors = {
  orange: { top: "#ffb000", bottom: "#ff5c00" },
  mint: { top: "#b7f7d4", bottom: "#28c98b" },
  yellow: { top: "#fff3a3", bottom: "#ffc236" },
  ink: { top: "#ffe0c4", bottom: "#111111" },
  rose: { top: "#ffd6d6", bottom: "#ff5c00" },
  gray: { top: "#f4efe9", bottom: "#c9c1b8" },
};
