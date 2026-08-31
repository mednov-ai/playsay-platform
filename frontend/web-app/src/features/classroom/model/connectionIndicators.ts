import { ConnectionQuality, ConnectionState } from "livekit-client";

export type ConnectionIndicatorLevel = 0 | 1 | 2 | 3 | 4;
export type ConnectionIndicatorTone = "green" | "yellow" | "red" | "neutral";
export type ConnectionStatusKey = "excellent" | "good" | "poor" | "lost" | "unknown" | "reconnecting";

export type ConnectionIndicator = {
  bars: ConnectionIndicatorLevel;
  statusKey: ConnectionStatusKey;
  tone: ConnectionIndicatorTone;
};

const UNKNOWN_INDICATOR: ConnectionIndicator = { bars: 0, statusKey: "unknown", tone: "neutral" };

export function participantConnectionIndicator(quality: ConnectionQuality): ConnectionIndicator {
  switch (quality) {
    case ConnectionQuality.Excellent:
      return { bars: 4, statusKey: "excellent", tone: "green" };
    case ConnectionQuality.Good:
      return { bars: 3, statusKey: "good", tone: "green" };
    case ConnectionQuality.Poor:
      return { bars: 2, statusKey: "poor", tone: "yellow" };
    case ConnectionQuality.Lost:
      return { bars: 1, statusKey: "lost", tone: "red" };
    case ConnectionQuality.Unknown:
    default:
      return UNKNOWN_INDICATOR;
  }
}

export function roomConnectionIndicator(state: ConnectionState): ConnectionIndicator {
  switch (state) {
    case ConnectionState.Connected:
      return { bars: 3, statusKey: "good", tone: "green" };
    case ConnectionState.Reconnecting:
    case ConnectionState.SignalReconnecting:
      return { bars: 2, statusKey: "reconnecting", tone: "yellow" };
    case ConnectionState.Disconnected:
      return { bars: 1, statusKey: "lost", tone: "red" };
    case ConnectionState.Connecting:
    default:
      return UNKNOWN_INDICATOR;
  }
}

export function averageConnectionIndicator(indicators: ConnectionIndicator[]): ConnectionIndicator {
  const known = indicators.filter((indicator) => indicator.bars > 0);
  if (known.length === 0) return UNKNOWN_INDICATOR;
  const bars = Math.floor(known.reduce((sum, indicator) => sum + indicator.bars, 0) / known.length) as ConnectionIndicatorLevel;
  return indicatorFromBars(bars);
}

export function worstConnectionIndicator(indicators: ConnectionIndicator[]): ConnectionIndicator {
  const known = indicators.filter((indicator) => indicator.bars > 0);
  if (known.length === 0) return UNKNOWN_INDICATOR;
  return known.reduce((worst, indicator) => indicator.bars < worst.bars ? indicator : worst);
}

export function learnerOverallConnectionIndicator(
  localIndicator: ConnectionIndicator,
  serverIndicator: ConnectionIndicator,
): ConnectionIndicator {
  if (localIndicator.bars === 0 || serverIndicator.bars === 0) return UNKNOWN_INDICATOR;
  return worstConnectionIndicator([localIndicator, serverIndicator]);
}

export function teacherOverallConnectionIndicator(
  teacherIndicator: ConnectionIndicator,
  serverIndicator: ConnectionIndicator,
  learnerAggregate: ConnectionIndicator,
): ConnectionIndicator {
  return worstConnectionIndicator([teacherIndicator, serverIndicator, learnerAggregate]);
}

function indicatorFromBars(bars: ConnectionIndicatorLevel): ConnectionIndicator {
  switch (bars) {
    case 4:
      return { bars, statusKey: "excellent", tone: "green" };
    case 3:
      return { bars, statusKey: "good", tone: "green" };
    case 2:
      return { bars, statusKey: "poor", tone: "yellow" };
    case 1:
      return { bars, statusKey: "lost", tone: "red" };
    case 0:
    default:
      return UNKNOWN_INDICATOR;
  }
}
