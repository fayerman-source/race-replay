import { TRACK_CONFIG } from "./utils.js";

function getDisplayTimeSeconds(entry) {
  if (Number.isFinite(entry?.result?.final_time)) {
    return entry.result.final_time;
  }

  const cumulative = entry?.splits?.cumulative_seconds;
  if (Array.isArray(cumulative) && cumulative.length) {
    return cumulative[cumulative.length - 1];
  }

  return null;
}

export function getMarkerLabel(name) {
  const parts = (name || "Runner")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function normalizeEntry(entry, index, lane) {
  // Stronger validation: an empty splits array passes a truthy check but
  // crashes downstream interpolation (needs at least a start + finish mark).
  const cumulative = entry?.splits?.cumulative_seconds;
  if (!Array.isArray(cumulative) || cumulative.length < 2) return null;
  // DNF entries (e.g. pacers) are filtered here because the replay-render
  // pipeline (race-model.js, getDistanceAtTime in utils.js) doesn't yet
  // model partial-splits runners — feeding it a runner whose splits stop
  // at 400m would teleport them to the finish line. The analyzer also
  // needs complete data for field-relative metrics. When the replay player
  // grows partial-runner support, this filter can be made opt-out.
  if (entry.status === "DNS" || entry.status === "DNF") return null;

  const nameParts = (entry.athlete || "Runner").trim().split(/\s+/);
  const fullName = entry.athlete || "Runner";
  const finalTime = getDisplayTimeSeconds(entry);

  return {
    id: `${entry.athlete || "runner"}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: nameParts[0],
    fullName,
    team: entry.team || "Unattached",
    country: entry.country || "",
    bib: lane,
    bibLabel: `L${lane}`,
    markerLabel: getMarkerLabel(fullName),
    lane,
    place: entry.place,
    year: entry.year,
    splits: entry.splits.cumulative_seconds,
    splitMarks: entry.splits.split_marks_m || null,
    segmentSplits: entry.splits.segment_seconds || [],
    finalTime,
    displayTime: entry?.result?.display_time || null,
    highlight: Array.isArray(entry.tags) && entry.tags.includes("focus_runner"),
  };
}

// Resolve the active heat for a replay payload, respecting the
// active_heat_id metadata. Falls back to the first heat when no id is set
// or no matching heat is found.
export function getActiveHeat(replay) {
  if (!replay || !Array.isArray(replay.heats) || !replay.heats.length) return null;
  const activeHeatId = replay?.event?.active_heat_id || replay.heats[0].heat_id;
  return replay.heats.find((h) => h.heat_id === activeHeatId) || replay.heats[0];
}

// Normalize the active heat of a replay payload (the higher-level helper
// that callers should usually reach for). Combines getActiveHeat +
// normalizeHeatRunners so consumers don't reinvent active-heat selection.
export function normalizeReplayRunners(replay) {
  return normalizeHeatRunners(getActiveHeat(replay));
}

// Normalize a heat's entries into the runner shape used by race-model.js,
// race-analyzer.js, and the UI. Extracted from loadHeatData so other pages
// (e.g. compare-page.js) that work directly with a payload can reuse the
// same logic without duplicating filtering or lane assignment.
export function normalizeHeatRunners(heat) {
  if (!heat || !Array.isArray(heat.entries)) return [];
  const validEntries = heat.entries.filter((entry) =>
    Array.isArray(entry?.splits?.cumulative_seconds)
      && entry.splits.cumulative_seconds.length >= 2
      && entry.status !== "DNS"
      && entry.status !== "DNF",
  );
  let fallbackLane = 1;
  return validEntries
    .map((entry, index) => {
      const lane = Number.isFinite(entry.lane) ? entry.lane : fallbackLane++;
      return normalizeEntry(entry, index, lane);
    })
    .filter(Boolean)
    .sort((a, b) => a.lane - b.lane);
}

export async function loadHeatData() {
  const response = await fetch("./data/custom_800m_heats.json");
  if (!response.ok) {
    throw new Error(`Unable to load heat data: ${response.status}`);
  }

  const payload = await response.json();
  const queryReplayId = new URLSearchParams(window.location.search).get("replay");
  const replayPayload = Array.isArray(payload.replays)
    ? (
      payload.replays.find((replay) => replay.replay_id === queryReplayId)
      || payload.replays.find((replay) => replay.replay_id === payload.default_replay_id)
      || payload.replays[0]
    )
    : payload;
  const activeHeat = getActiveHeat(replayPayload);
  const runners = normalizeHeatRunners(activeHeat);

  return {
    replayId: replayPayload.replay_id || queryReplayId || "default-replay",
    replayTitle: replayPayload.title || null,
    event: {
      ...replayPayload.event,
      active_heat_id: activeHeat.heat_id,
      lane_count: replayPayload?.event?.lane_count || TRACK_CONFIG.laneCount,
      track_length_m: replayPayload?.event?.track_length_m || TRACK_CONFIG.trackLength,
      race_distance_m: replayPayload?.event?.race_distance_m || TRACK_CONFIG.raceDistance,
      venue: replayPayload?.event?.venue || "Ocean Breeze Athletic Complex, Staten Island",
    },
    activeHeat,
    runners,
  };
}
