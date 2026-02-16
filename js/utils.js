export const LAP_PIXELS = 1285.4;
export const PIXELS_PER_METER = LAP_PIXELS / 200;

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

export function getTrackCoordinates(meters) {
  let d = (meters % 200) * PIXELS_PER_METER;
  if (d < 50) return { x: 300, y: 200 - d }; // Right Straight 1

  d -= 50;
  const curveLen = Math.PI * 125;
  if (d < curveLen) {
    // Top curve
    const angle = 0 - (d / curveLen) * Math.PI;
    return { x: 175 + 125 * Math.cos(angle), y: 150 + 125 * Math.sin(angle) };
  }

  d -= curveLen;
  if (d < 250) return { x: 50, y: 150 + d }; // Left straight

  d -= 250;
  if (d < curveLen) {
    // Bottom curve
    const angle = Math.PI - (d / curveLen) * Math.PI;
    return { x: 175 + 125 * Math.cos(angle), y: 400 + 125 * Math.sin(angle) };
  }

  d -= curveLen;
  return { x: 300, y: 400 - d }; // Right Straight 2
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
