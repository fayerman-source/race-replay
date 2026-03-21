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

function getMarkerLabel(name) {
  const parts = (name || "Runner")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function normalizeEntry(entry, index, lane) {
  if (!entry?.splits?.cumulative_seconds || entry.status === "DNS") {
    return null;
  }

  const nameParts = (entry.athlete || "Runner").trim().split(/\s+/);
  const fullName = entry.athlete || "Runner";
  const finalTime = getDisplayTimeSeconds(entry);

  return {
    id: `${entry.athlete || "runner"}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: nameParts[0],
    fullName,
    team: entry.team || "Unattached",
    bib: lane,
    bibLabel: `L${lane}`,
    markerLabel: getMarkerLabel(fullName),
    lane,
    place: entry.place,
    year: entry.year,
    splits: entry.splits.cumulative_seconds,
    segmentSplits: entry.splits.segment_seconds || [],
    finalTime,
    displayTime: entry?.result?.display_time || null,
    highlight: Array.isArray(entry.tags) && entry.tags.includes("focus_runner"),
  };
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
  const activeHeatId = replayPayload?.event?.active_heat_id || replayPayload?.heats?.[0]?.heat_id;
  const activeHeat = replayPayload.heats.find((heat) => heat.heat_id === activeHeatId) || replayPayload.heats[0];
  const validEntries = activeHeat.entries.filter((entry) => entry?.splits?.cumulative_seconds && entry.status !== "DNS");
  let fallbackLane = 1;

  const runners = validEntries
    .map((entry, index) => {
      const lane = Number.isFinite(entry.lane)
        ? entry.lane
        : fallbackLane++;

      return normalizeEntry(entry, index, lane);
    })
    .filter(Boolean)
    .sort((a, b) => a.lane - b.lane);

  return {
    replayId: replayPayload.replay_id || queryReplayId || "default-replay",
    replayTitle: replayPayload.title || null,
    event: {
      ...replayPayload.event,
      active_heat_id: activeHeat.heat_id,
      track_length_m: replayPayload?.event?.track_length_m || TRACK_CONFIG.trackLength,
      race_distance_m: replayPayload?.event?.race_distance_m || TRACK_CONFIG.raceDistance,
      venue: replayPayload?.event?.venue || "Ocean Breeze Athletic Complex, Staten Island",
    },
    activeHeat,
    runners,
  };
}
