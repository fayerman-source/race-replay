// Track dimensions - 6 lane Armory track
export const TRACK_CONFIG = {
  laneWidth: 32,           // pixels per lane
  innerRadius: 36,         // radius of innermost curve
  straightLength: 250,     // length of straight sections
  centerX: 210,            // center X of track
  straightY1: 150,         // Y position of first straight
  straightY2: 400,         // Y position of second straight
};

export const LAP_PIXELS = 1285.4;
export const PIXELS_PER_METER = LAP_PIXELS / 200;

/**
 * Get lane offset in pixels from inner edge
 * laneIndex: 0 = innermost, 5 = outermost
 */
export function getLaneOffset(laneIndex) {
  if (laneIndex === undefined || laneIndex === null) laneIndex = 3;
  return laneIndex * TRACK_CONFIG.laneWidth + TRACK_CONFIG.laneWidth / 2;
}

export function getDistanceAtTime(splits, currentTime) {
  if (currentTime <= 0) return 0;
  if (currentTime >= splits[splits.length - 1]) return 800;

  for (let i = 0; i < splits.length - 1; i++) {
    if (currentTime >= splits[i] && currentTime < splits[i + 1]) {
      const segmentTime = splits[i + 1] - splits[i];
      const timeInSegment = currentTime - splits[i];
      return (i * 200) + (timeInSegment / segmentTime) * 200;
    }
  }

  return 800;
}

export function getTimeAtDistance(splits, targetDistance) {
  if (targetDistance <= 0) return 0;
  if (targetDistance >= 800) return splits[splits.length - 1];

  const segment = Math.floor(targetDistance / 200);
  const segmentStartDistance = segment * 200;
  const distanceInSegment = targetDistance - segmentStartDistance;
  const segmentRatio = distanceInSegment / 200;

  const segmentStartTime = splits[segment];
  const segmentEndTime = splits[segment + 1];
  const segmentDuration = segmentEndTime - segmentStartTime;

  return segmentStartTime + segmentRatio * segmentDuration;
}

/**
 * Get track coordinates for a given distance in meters
 * laneIndex: 0-5 (inner to outer), defaults to middle lane
 */
export function getTrackCoordinates(meters, laneIndex = 3) {
  // Convert meters to position along 200m lap
  const lapPos = meters % 200;
  const laneOffset = getLaneOffset(laneIndex);
  
  // Calculate position on track
  // Track goes: finish line -> curve -> backstretch -> curve -> finish
  
  // Right straight (finish to first curve) - 50m
  if (lapPos < 50) {
    const t = lapPos / 50;
    const x = 264 + t * (390 - 264) + laneOffset;
    const y = 200 - t * 50;
    return { x, y };
  }
  
  // First curve (top) - ~85m
  const curve1Start = 50;
  const curve1Length = Math.PI * (TRACK_CONFIG.innerRadius + 60 + laneOffset);
  const curve1End = curve1Start + curve1Length / PIXELS_PER_METER;
  
  if (lapPos < curve1End) {
    const t = (lapPos - curve1Start) / (curve1End - curve1Start);
    const angle = Math.PI * (1 - t);
    const radius = TRACK_CONFIG.innerRadius + 60 + laneOffset;
    const centerX = 210;
    const centerY = 150;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  }
  
  // Backstretch (left straight) - 100m
  const backstretchStart = curve1End;
  const backstretchLength = 100;
  const backstretchEnd = backstretchStart + backstretchLength;
  
  if (lapPos < backstretchEnd) {
    const t = (lapPos - backstretchStart) / backstretchLength;
    const x = 30 + laneOffset;
    const y = 150 + t * 250;
    return { x, y };
  }
  
  // Second curve (bottom) - ~85m
  const curve2Start = backstretchEnd;
  const curve2Length = Math.PI * (TRACK_CONFIG.innerRadius + 60 + laneOffset);
  const curve2End = curve2Start + curve2Length / PIXELS_PER_METER;
  
  if (lapPos < curve2End) {
    const t = (lapPos - curve2Start) / (curve2End - curve2Start);
    const angle = Math.PI * t;
    const radius = TRACK_CONFIG.innerRadius + 60 + laneOffset;
    const centerX = 210;
    const centerY = 400;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  }
  
  // Final straight - 50m
  const finalStraightStart = curve2End;
  const t = (lapPos - finalStraightStart) / (200 - finalStraightStart);
  const x = 30 + t * (390 - 30) + laneOffset;
  const y = 400 - t * 200;
  
  return { x, y };
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
