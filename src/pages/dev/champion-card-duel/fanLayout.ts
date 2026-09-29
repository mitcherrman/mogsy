export type FanLayoutMode = "mobile" | "desktop";

export type FanLayoutParameters = {
  mode: FanLayoutMode;
  cardCount: number;
  viewportWidth: number;
  fanWidth: number;
  maxRotation: number;
  outerDrop: number;
  centerLift: number;
  selectedLift: number;
};

export type FanCardLayout = {
  normalizedIndex: number;
  centeredPosition: number;
  x: number;
  y: number;
  rotation: number;
  zIndex: number;
};

/**
 * Horizontal budget the fan may NOT use, per mode: page gutters, the board's
 * vertical item dock beside the tray, and one card body so the outer cards
 * land inside the tray instead of running off the viewport edges. Only bites
 * on phones (below ~460px), where the spread is otherwise gap-bound.
 */
const CHROME_WIDTH = { mobile: 232, desktop: 520 } as const;

export const FAN_LAYOUT_TUNING = {
  mobileBreakpoint: 768,
  mobile: {
    minWidth: 118,
    maxWidth: 260,
    widthPerGap: 46,
    maxRotation: 8,
    outerDrop: 22,
    centerLift: 8,
    selectedLift: 34,
  },
  desktop: {
    minWidth: 180,
    maxWidth: 600,
    widthPerGap: 92,
    maxRotation: 13,
    outerDrop: 34,
    centerLift: 12,
    selectedLift: 42,
  },
} as const;

export function normalizedCardIndex(index: number, cardCount: number) {
  if (cardCount <= 1) return 0.5;
  return index / Math.max(cardCount - 1, 1);
}

export function centeredNormalizedPosition(index: number, cardCount: number) {
  return normalizedCardIndex(index, cardCount) * 2 - 1;
}

export function responsiveFanParameters(cardCount: number, viewportWidth: number): FanLayoutParameters {
  const mode: FanLayoutMode = viewportWidth < FAN_LAYOUT_TUNING.mobileBreakpoint ? "mobile" : "desktop";
  const tuning = FAN_LAYOUT_TUNING[mode];
  const usableWidth = Math.max(0, viewportWidth - CHROME_WIDTH[mode]);
  const countWidth = Math.max(0, cardCount - 1) * tuning.widthPerGap;
  const fanWidth = clamp(Math.min(countWidth, usableWidth), tuning.minWidth, tuning.maxWidth);

  return {
    mode,
    cardCount,
    viewportWidth,
    fanWidth: cardCount <= 1 ? 0 : fanWidth,
    maxRotation: Math.min(tuning.maxRotation, 5 + cardCount * 1.5),
    outerDrop: tuning.outerDrop,
    centerLift: tuning.centerLift,
    selectedLift: tuning.selectedLift,
  };
}

export function horizontalFanPosition(centeredPosition: number, parameters: FanLayoutParameters) {
  return centeredPosition * (parameters.fanWidth / 2);
}

export function verticalFanCurve(centeredPosition: number, parameters: FanLayoutParameters) {
  const distanceFromCenter = Math.abs(centeredPosition);
  return parameters.outerDrop * distanceFromCenter ** 1.7 - parameters.centerLift * (1 - distanceFromCenter);
}

export function rotationCurve(centeredPosition: number, parameters: FanLayoutParameters) {
  return centeredPosition * parameters.maxRotation;
}

export function stableFanZIndex(centeredPosition: number, selected = false) {
  const centerPriority = Math.round((1 - Math.abs(centeredPosition)) * 100);
  return centerPriority + (selected ? 200 : 20);
}

export function fanCardLayout(index: number, cardCount: number, parameters: FanLayoutParameters, selected = false): FanCardLayout {
  const centeredPosition = centeredNormalizedPosition(index, cardCount);
  return {
    normalizedIndex: normalizedCardIndex(index, cardCount),
    centeredPosition,
    x: horizontalFanPosition(centeredPosition, parameters),
    y: verticalFanCurve(centeredPosition, parameters) - (selected ? parameters.selectedLift : 0),
    rotation: selected ? 0 : rotationCurve(centeredPosition, parameters),
    zIndex: stableFanZIndex(centeredPosition, selected),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
