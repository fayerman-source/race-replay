// Track dimensions and utilities for a 200m indoor oval

export const TRACK_CONFIG = {
  laneCount: 8,
  trackLength: 200,
  raceDistance: 800,
  laneWidthMeters: 1.0,
  straightLengthMeters: 36.5,
  startType: "lanes-and-break",
  breakDistanceMeters: 100,
  svg: {
    centerX: 175,
    topY: 175,
    bottomY: 375,
    outerRadius: 150,
    innerRadius: 25,
  },
};

const STRAIGHT_VISUAL_LENGTH = TRACK_CONFIG.svg.bottomY - TRACK_CONFIG.svg.topY;
const BASE_VISUAL_LANE_WIDTH = (
  TRACK_CONFIG.svg.outerRadius - TRACK_CONFIG.svg.innerRadius
) / TRACK_CONFIG.laneCount;

// How far the angular parametrization leans toward each runner's own lane
// radius (see getTrackCoordinates). 0 = fully lane-fair (drawn order exactly
// matches race order, but outer lanes speed up ~1.8x on the curves); 1 = fully
// per-lane (uniform visual speed, but outer lanes drift angularly ahead so a
// rail leader can be drawn behind the pack). 0.4 is the chosen balance: curve
// speedup ~1.25x, with a rarely-noticeable forward-order slip only in a
// centimetre-tight pack.
const LANE_FAIR_BLEND = 0.4;

function getVisualLaneWidthPx(laneCount = TRACK_CONFIG.laneCount) {
  return BASE_VISUAL_LANE_WIDTH;
}

function getTrackInnerRadiusPx(laneCount = TRACK_CONFIG.laneCount) {
  return TRACK_CONFIG.svg.outerRadius - (laneCount * getVisualLaneWidthPx(laneCount));
}

function clampLane(lane, laneCount = TRACK_CONFIG.laneCount) {
  const numericLane = Number(lane);
  if (!Number.isFinite(numericLane)) return 1;
  return Math.min(laneCount, Math.max(1, numericLane));
}

function getLaneRadiusPx(lane, laneCount = TRACK_CONFIG.laneCount) {
  const trackInnerRadius = getTrackInnerRadiusPx(laneCount);
  return trackInnerRadius + (clampLane(lane, laneCount) - 0.5) * getVisualLaneWidthPx(laneCount);
}

export function getLanePathLengthPx(lane, laneCount = TRACK_CONFIG.laneCount) {
  const radius = getLaneRadiusPx(lane, laneCount);
  return (2 * STRAIGHT_VISUAL_LENGTH) + (2 * Math.PI * radius);
}

export function getLaneStartOffsetMeters(
  lane,
  laneCount = TRACK_CONFIG.laneCount,
  turnsCompensated = 1,
) {
  const laneDelta = clampLane(lane, laneCount) - 1;
  if (laneDelta <= 0) return 0;

  return turnsCompensated * Math.PI * TRACK_CONFIG.laneWidthMeters * laneDelta;
}

export function getVisualLane(lane, laneCount = TRACK_CONFIG.laneCount) {
  return clampLane(lane, laneCount);
}

/**
 * Get track coordinates for a runner on the Ocean Breeze 200m oval.
 * Distance is expressed in race meters; startOffsetMeters places outer lanes
 * farther around the lap so all athletes can be shown from a lane stagger.
 *
 * The angular position around the oval is parametrized on a reference radius
 * that leans mostly toward the inner lane (LANE_FAIR_BLEND), so two runners at
 * the same race distance sit at nearly the same angle regardless of lane —
 * close to radially aligned, as a merged field looks — while keeping the curve
 * speed close to uniform. The runner's own lane radius is used for the lateral
 * offset (x on the straights, arc radius on the curves). Parametrizing each
 * lane fully on its OWN path length (blend = 1) gives uniform speed but puts
 * outer lanes angularly ahead, drawing a rail leader behind packed runners;
 * fully on the inner lane (blend = 0) aligns them perfectly but speeds outer
 * lanes up on the curves. The blend trades a little of each.
 */
export function getTrackCoordinates(meters, lane = 1, options = {}) {
  const lapDistance = options.lapDistance ?? TRACK_CONFIG.trackLength;
  const startOffsetMeters = options.startOffsetMeters ?? 0;
  const laneCount = options.laneCount ?? TRACK_CONFIG.laneCount;
  const normalizedMeters = (((meters + startOffsetMeters) % lapDistance) + lapDistance) % lapDistance;
  const progress = normalizedMeters / lapDistance;
  const radius = getLaneRadiusPx(lane, laneCount);
  const { centerX, topY, bottomY } = TRACK_CONFIG.svg;

  // Curve parametrization radius: blended between the inner lane and this
  // runner's own radius. Straights are a fixed pixel length for every lane, so
  // only the curve length needs this shared-ish reference.
  const innerRadius = getLaneRadiusPx(1, laneCount);
  const referenceRadius = innerRadius + (LANE_FAIR_BLEND * (radius - innerRadius));
  const halfCircumference = Math.PI * referenceRadius;
  const totalPath = (2 * STRAIGHT_VISUAL_LENGTH) + (2 * halfCircumference);
  const finishLinePathDistance = (2 * STRAIGHT_VISUAL_LENGTH) + halfCircumference;
  const pathDistance = ((progress * totalPath) + finishLinePathDistance) % totalPath;

  if (pathDistance <= STRAIGHT_VISUAL_LENGTH) {
    return {
      x: centerX - radius,
      y: topY + pathDistance,
    };
  }

  if (pathDistance <= STRAIGHT_VISUAL_LENGTH + halfCircumference) {
    const arcFraction = (pathDistance - STRAIGHT_VISUAL_LENGTH) / halfCircumference;
    const angle = Math.PI - (arcFraction * Math.PI);
    return {
      x: centerX + radius * Math.cos(angle),
      y: bottomY + radius * Math.sin(angle),
    };
  }

  if (pathDistance <= (2 * STRAIGHT_VISUAL_LENGTH) + halfCircumference) {
    const straightDistance = pathDistance - STRAIGHT_VISUAL_LENGTH - halfCircumference;
    return {
      x: centerX + radius,
      y: bottomY - straightDistance,
    };
  }

  const arcFraction = (pathDistance - (2 * STRAIGHT_VISUAL_LENGTH) - halfCircumference) / halfCircumference;
  const angle = arcFraction * Math.PI;
  return {
    x: centerX + radius * Math.cos(angle),
    y: topY - radius * Math.sin(angle),
  };
}

export function getCheckpointSegment(meters, options = {}) {
  const lapDistance = options.lapDistance ?? TRACK_CONFIG.trackLength;
  const laneCount = options.laneCount ?? TRACK_CONFIG.laneCount;
  const inner = getTrackCoordinates(meters, 1, {
    lapDistance,
    laneCount,
    startOffsetMeters: 0,
  });
  const outer = getTrackCoordinates(meters, laneCount, {
    lapDistance,
    laneCount,
    startOffsetMeters: 0,
  });

  return { inner, outer };
}

function getNormalizedSplitMarks(splits, splitMarks, raceDistance = TRACK_CONFIG.raceDistance) {
  if (Array.isArray(splitMarks) && splitMarks.length === splits.length) {
    return splitMarks;
  }

  const segmentCount = Math.max(1, splits.length - 1);
  const interval = raceDistance / segmentCount;
  return Array.from({ length: splits.length }, (_, index) => index * interval);
}

export function getDistanceAtTime(splits, currentTime, splitMarks = null, raceDistance = TRACK_CONFIG.raceDistance) {
  if (currentTime <= 0) return 0;

  const normalizedSplitMarks = getNormalizedSplitMarks(splits, splitMarks, raceDistance);
  // Cap at the runner's LAST recorded mark, not the race distance. For a full
  // runner that mark IS the finish; for a partial runner (a pacer who steps off
  // at 400m, status DNF) it pins them at their drop point instead of teleporting
  // them to the finish line — which is why such runners used to be filtered out.
  const lastMark = normalizedSplitMarks[normalizedSplitMarks.length - 1];
  if (currentTime >= splits[splits.length - 1]) return lastMark;

  for (let i = 0; i < splits.length - 1; i += 1) {
    if (currentTime >= splits[i] && currentTime < splits[i + 1]) {
      const segmentTime = splits[i + 1] - splits[i];
      const timeInSegment = currentTime - splits[i];
      const progress = timeInSegment / segmentTime;
      const segmentStart = normalizedSplitMarks[i];
      const segmentEnd = normalizedSplitMarks[i + 1];
      return segmentStart + (progress * (segmentEnd - segmentStart));
    }
  }

  return lastMark;
}

export function getTimeAtDistance(splits, targetDistance, splitMarks = null, raceDistance = TRACK_CONFIG.raceDistance) {
  if (targetDistance <= 0) return 0;
  if (targetDistance >= raceDistance) {
    return splits[splits.length - 1];
  }

  const normalizedSplitMarks = getNormalizedSplitMarks(splits, splitMarks, raceDistance);

  for (let i = 0; i < normalizedSplitMarks.length - 1; i += 1) {
    const segmentStartDistance = normalizedSplitMarks[i];
    const segmentEndDistance = normalizedSplitMarks[i + 1];

    if (targetDistance <= segmentEndDistance) {
      const segmentStartTime = splits[i];
      const segmentEndTime = splits[i + 1];
      const distanceInSegment = targetDistance - segmentStartDistance;
      const segmentRatio = distanceInSegment / (segmentEndDistance - segmentStartDistance);
      return segmentStartTime + ((segmentEndTime - segmentStartTime) * segmentRatio);
    }
  }

  return splits[splits.length - 1];
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 0) {
    const absSeconds = Math.abs(seconds);
    const s = Math.floor(absSeconds);
    const ms = Math.floor((absSeconds % 1) * 100);
    return `-${s}.${ms < 10 ? "0" : ""}${ms}`;
  }

  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s < 10 ? "0" : ""}${s}.${ms < 10 ? "0" : ""}${ms}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function buildOvalPath(radius) {
  const { centerX, topY, bottomY } = TRACK_CONFIG.svg;
  const leftX = centerX - radius;
  const rightX = centerX + radius;
  return `M ${leftX} ${topY} L ${leftX} ${bottomY} A ${radius} ${radius} 0 1 0 ${rightX} ${bottomY} L ${rightX} ${topY} A ${radius} ${radius} 0 1 0 ${leftX} ${topY}`;
}

export function getTrackVisualGeometry(laneCount = TRACK_CONFIG.laneCount) {
  const outerRadius = TRACK_CONFIG.svg.outerRadius;
  const innerRadius = getTrackInnerRadiusPx(laneCount);
  const laneWidthPx = getVisualLaneWidthPx(laneCount);
  const laneRadii = Array.from({ length: Math.max(0, laneCount - 1) }, (_, index) => {
    return outerRadius - ((index + 1) * laneWidthPx);
  });

  // The start/finish line crosses the home (top-right) straight, spanning the
  // running band from the innermost lane edge to the outer edge. Both must
  // track laneCount: with fewer lanes the infield is larger, so a line fixed at
  // the 8-lane inner edge would overhang into the infield. Deriving it here
  // keeps it in sync with infieldPath (single source of truth for geometry).
  const { centerX, topY } = TRACK_CONFIG.svg;
  return {
    outerPath: buildOvalPath(outerRadius),
    lanePaths: laneRadii.map((radius) => buildOvalPath(radius)),
    infieldPath: buildOvalPath(innerRadius),
    innerRadius,
    outerRadius,
    startFinish: { x1: centerX + innerRadius, x2: centerX + outerRadius, y: topY },
  };
}
