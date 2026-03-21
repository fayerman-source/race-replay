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
const VISUAL_LANE_WIDTH =
  (TRACK_CONFIG.svg.outerRadius - TRACK_CONFIG.svg.innerRadius) / TRACK_CONFIG.laneCount;

function clampLane(lane) {
  const numericLane = Number(lane);
  if (!Number.isFinite(numericLane)) return 1;
  return Math.min(TRACK_CONFIG.laneCount, Math.max(1, numericLane));
}

function getLaneRadiusPx(lane) {
  return TRACK_CONFIG.svg.innerRadius + (clampLane(lane) - 0.5) * VISUAL_LANE_WIDTH;
}

function getLanePathLengthPx(lane) {
  const radius = getLaneRadiusPx(lane);
  return (2 * STRAIGHT_VISUAL_LENGTH) + (2 * Math.PI * radius);
}

export function getLaneStartOffsetMeters(lane) {
  const laneDelta = clampLane(lane) - 1;
  if (laneDelta <= 0) return 0;

  // Indoor 800s commonly use a one-turn stagger before athletes can break.
  return Math.PI * TRACK_CONFIG.laneWidthMeters * laneDelta;
}

export function getVisualLane(lane) {
  return clampLane(lane);
}

/**
 * Get track coordinates for a runner on the Ocean Breeze 200m oval.
 * Distance is expressed in race meters; startOffsetMeters places outer lanes
 * farther around the lap so all athletes can be shown from a lane stagger.
 */
export function getTrackCoordinates(meters, lane = 1, options = {}) {
  const lapDistance = options.lapDistance ?? TRACK_CONFIG.trackLength;
  const startOffsetMeters = options.startOffsetMeters ?? 0;
  const normalizedMeters = (((meters + startOffsetMeters) % lapDistance) + lapDistance) % lapDistance;
  const progress = normalizedMeters / lapDistance;
  const radius = getLaneRadiusPx(lane);
  const totalPath = getLanePathLengthPx(lane);
  const { centerX, topY, bottomY } = TRACK_CONFIG.svg;
  const halfCircumference = Math.PI * radius;
  const finishLinePathDistance = (2 * STRAIGHT_VISUAL_LENGTH) + halfCircumference;
  const pathDistance = ((progress * totalPath) + finishLinePathDistance) % totalPath;

  if (pathDistance <= STRAIGHT_VISUAL_LENGTH) {
    return {
      x: centerX - radius,
      y: topY + pathDistance,
    };
  }

  if (pathDistance <= STRAIGHT_VISUAL_LENGTH + halfCircumference) {
    const arcDistance = pathDistance - STRAIGHT_VISUAL_LENGTH;
    const angle = Math.PI - (arcDistance / halfCircumference) * Math.PI;
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

  const arcDistance = pathDistance - (2 * STRAIGHT_VISUAL_LENGTH) - halfCircumference;
  const angle = (arcDistance / halfCircumference) * Math.PI;
  return {
    x: centerX + radius * Math.cos(angle),
    y: topY - radius * Math.sin(angle),
  };
}

export function getCheckpointSegment(meters, options = {}) {
  const lapDistance = options.lapDistance ?? TRACK_CONFIG.trackLength;
  const inner = getTrackCoordinates(meters, 1, {
    lapDistance,
    startOffsetMeters: 0,
  });
  const outer = getTrackCoordinates(meters, TRACK_CONFIG.laneCount, {
    lapDistance,
    startOffsetMeters: 0,
  });

  return { inner, outer };
}

export function getDistanceAtTime(splits, currentTime) {
  if (currentTime <= 0) return 0;
  if (currentTime >= splits[splits.length - 1]) return TRACK_CONFIG.raceDistance;

  for (let i = 0; i < splits.length - 1; i += 1) {
    if (currentTime >= splits[i] && currentTime < splits[i + 1]) {
      const segmentTime = splits[i + 1] - splits[i];
      const timeInSegment = currentTime - splits[i];
      const progress = timeInSegment / segmentTime;
      return (i * 200) + (progress * 200);
    }
  }

  return TRACK_CONFIG.raceDistance;
}

export function getTimeAtDistance(splits, targetDistance) {
  if (targetDistance <= 0) return 0;
  if (targetDistance >= TRACK_CONFIG.raceDistance) {
    return splits[splits.length - 1];
  }

  const segment = Math.floor(targetDistance / 200);
  const segmentStartDistance = segment * 200;
  const distanceInSegment = targetDistance - segmentStartDistance;
  const segmentRatio = distanceInSegment / 200;
  const segmentStartTime = splits[segment];
  const segmentEndTime = splits[segment + 1];

  return segmentStartTime + ((segmentEndTime - segmentStartTime) * segmentRatio);
}

export function formatTime(seconds) {
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
