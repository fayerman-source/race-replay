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
  // DNS entries (did not start, no splits) stay filtered. DNF entries are now
  // supported: getDistanceAtTime pins a partial runner at their last mark
  // instead of teleporting them to the finish, so a pacer who steps off at
  // 400m can be shown pacing the field and then dropping out.
  if (entry.status === "DNS") return null;

  const nameParts = (entry.athlete || "Runner").trim().split(/\s+/);
  const fullName = entry.athlete || "Runner";
  // A DNF runner's last split is a PARTIAL time, not a finish. Treat it as
  // non-competing (Infinity) so finishing-time sorts — winner selection in
  // updateHeatMeta, field-relative metrics in compare-page.js — never rank a
  // dropped-out pacer ahead of the actual finishers. Display still uses
  // displayTime ("DNF"), so the sentinel is never formatted for the UI.
  const finalTime = entry.status === "DNF" ? Infinity : getDisplayTimeSeconds(entry);

  return {
    id: `${entry.athlete || "runner"}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: nameParts[0],
    fullName,
    team: entry.team || "Unattached",
    country: entry.country || "",
    bib: Number.isFinite(entry.bib) ? entry.bib : lane,
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
    honors: Array.isArray(entry?.result?.honors) ? entry.result.honors.slice() : [],
    medal: entry?.result?.medal || null,
    dnf: entry.status === "DNF",
    role: entry.role || null,
    preRacePbIndoor: entry?.career?.pre_race_pb_indoor || null,
    preRacePbIndoorSeconds: Number.isFinite(entry?.career?.pre_race_pb_indoor_seconds)
      ? entry.career.pre_race_pb_indoor_seconds
      : null,
    preRaceSbIndoor: entry?.career?.pre_race_sb_indoor || null,
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
      && entry.status !== "DNS",
  );
  let fallbackLane = 1;
  const runners = validEntries
    .map((entry, index) => {
      const lane = Number.isFinite(entry.lane) ? entry.lane : fallbackLane++;
      return normalizeEntry(entry, index, lane);
    })
    .filter(Boolean)
    .sort((a, b) => a.lane - b.lane);

  return assignSharedLaneOffsets(runners);
}

// Indoor 800m fields often have more athletes than lanes, so a lane can be
// shared (a "waterfall" double — Liévin runs two per lane in lanes 2 & 4).
// The renderer draws one radius per lane, so co-lane runners would overlap.
// We split each shared lane into inner/outer sub-positions: the faster-seeded
// runner takes the inner (rail) side. Single-occupant lanes get offset 0 and
// are unaffected. race-model.js adds laneOffset to the start lane only, so the
// pair separates at the gun and converges as they pack after the break.
const SHARED_LANE_SPREAD = 0.28;
function assignSharedLaneOffsets(runners) {
  const byLane = new Map();
  runners.forEach((runner) => {
    if (!byLane.has(runner.lane)) byLane.set(runner.lane, []);
    byLane.get(runner.lane).push(runner);
  });

  byLane.forEach((laneRunners) => {
    if (laneRunners.length < 2) {
      laneRunners.forEach((runner) => { runner.laneOffset = 0; });
      return;
    }
    // Faster final time first → innermost. DNF/null sort last.
    const ordered = laneRunners
      .slice()
      .sort((a, b) => (a.finalTime ?? Infinity) - (b.finalTime ?? Infinity));
    const step = (SHARED_LANE_SPREAD * 2) / (ordered.length - 1);
    ordered.forEach((runner, slot) => {
      runner.laneOffset = -SHARED_LANE_SPREAD + (slot * step);
    });
  });

  return runners;
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
