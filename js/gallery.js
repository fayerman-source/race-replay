// Gallery landing page — the "front door" for the replay library.
//
// index.html serves two views from one URL:
//   ?replay=<id>  → the player (app.js boots)
//   (no param)    → this gallery (app.js stays dormant)
//
// The gallery is a SECOND READER of data/custom_800m_heats.json. It never adds
// or duplicates data: athlete counts and the focus runner come from the same
// normalizeReplayRunners() path the player uses, so a card can never disagree
// with the race it links to.

import { escapeHtml } from "./utils.js";
import { normalizeReplayRunners } from "./heat-data.js";

// Friendly labels for the competition_level codes that travel with each replay.
const LEVEL_LABELS = {
  world_indoor_w: "World Indoor · Women",
  world_indoor_m: "World Indoor · Men",
  diamond_league_w: "Diamond League · Women",
  diamond_league_m: "Diamond League · Men",
  hs_varsity_w: "HS Varsity · Women",
  hs_varsity_m: "HS Varsity · Men",
};

// Gate non-pro races out of the gallery for now. This is a reversible DENYLIST
// (hide amateur tiers) rather than a pro allowlist, so a freshly ingested pro
// race still shows even before its competition_level is filled in. The data is
// not deleted and direct ?replay= URLs still resolve — these are only hidden
// from the browse grid. To bring a tier back, drop it from this set.
const HIDDEN_LEVELS = new Set(["hs_varsity_w", "hs_varsity_m"]);
function isGalleryVisible(replay) {
  const level = replay?.event?.competition_level || "";
  if (HIDDEN_LEVELS.has(level)) return false;
  if (level.startsWith("hs_") || level.startsWith("club_") || level.startsWith("youth_")) return false;
  return true;
}

// "1:55.82" / "115.82" → seconds. Returns null when unparseable so callers can
// fall back rather than render NaN.
function parseTimeToSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  let seconds = 0;
  for (const part of parts) {
    const n = parseFloat(part);
    if (!Number.isFinite(n)) return null;
    seconds = (seconds * 60) + n;
  }
  return seconds;
}

// A "WORLD RECORD" pill is a factual claim, so we only earn it when the winner
// actually beat the standing WR listed in event.records — not merely because a
// records array is present. Returns the record label to headline, or null.
function getRecordHeadline(event, runners) {
  const records = Array.isArray(event?.records) ? event.records : [];
  const wr = records.find((r) => r.label === "WR");
  if (!wr) return null;

  const wrSeconds = parseTimeToSeconds(wr.result);
  if (!Number.isFinite(wrSeconds)) return null;

  // Winner = fastest real finishing time (DNF carries Infinity, so it's excluded).
  const winnerTime = runners.reduce(
    (best, r) => (Number.isFinite(r.finalTime) && r.finalTime < best ? r.finalTime : best),
    Infinity,
  );
  if (!Number.isFinite(winnerTime)) return null;

  // <= so a race that SET the record (feeds that list the post-race mark, where
  // winnerTime === wrSeconds) or exactly equalled it still earns the pill.
  return winnerTime <= wrSeconds ? "World Record" : null;
}

function buildCard(replay) {
  const event = replay.event || {};
  const runners = normalizeReplayRunners(replay);
  const focus = runners.find((r) => r.highlight);
  const distance = event.race_distance_m || 800;
  const trackLength = event.track_length_m || 200;
  const laps = Math.round(distance / trackLength);
  const levelLabel = LEVEL_LABELS[event.competition_level] || null;
  const recordHeadline = getRecordHeadline(event, runners);

  const id = encodeURIComponent(replay.replay_id);
  const venueLine = [event.venue, event.date].filter(Boolean).join(" · ");

  const card = document.createElement("article");
  card.className = "replay-card";

  card.innerHTML = `
    <a class="replay-card-main" href="./index.html?replay=${id}">
      <div class="replay-card-top">
        <span class="chip chip-distance">${distance}m · ${laps} laps</span>
        ${recordHeadline ? `<span class="chip chip-record">★ ${escapeHtml(recordHeadline)}</span>` : ""}
      </div>
      <h2 class="replay-card-title">${escapeHtml(replay.title || event.name || "Race replay")}</h2>
      ${venueLine ? `<p class="replay-card-venue">${escapeHtml(venueLine)}</p>` : ""}
      <div class="replay-card-meta">
        ${levelLabel ? `<span>${escapeHtml(levelLabel)}</span>` : ""}
        <span>${runners.length} athletes</span>
        ${focus ? `<span>Focus: ${escapeHtml(focus.fullName)}</span>` : ""}
      </div>
    </a>
    <div class="replay-card-actions">
      <a class="action action-primary" href="./index.html?replay=${id}">▶ Watch replay</a>
      <a class="action" href="./analysis.html?replay=${id}">Analyze</a>
    </div>
  `;
  // No per-card "Compare": compare.html takes a PAIR (?a=&b=), which a single
  // race card can't express; linking it with ?replay= would silently fall back
  // to the default pair.

  return card;
}

async function renderGallery() {
  const grid = document.getElementById("galleryGrid");
  const status = document.getElementById("galleryStatus");
  if (!grid) return;

  try {
    const response = await fetch("./data/custom_800m_heats.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const allReplays = payload && Array.isArray(payload.replays) ? payload.replays : [];
    const replays = allReplays.filter(isGalleryVisible);

    if (!replays.length) {
      if (status) status.textContent = "No replays available yet.";
      return;
    }

    // Default replay first, then the rest — the headline race leads the grid.
    // Comparator returns 0 for equal elements (strict weak ordering).
    const defaultId = payload.default_replay_id;
    const ordered = replays.slice().sort((a, b) => {
      const aDef = a.replay_id === defaultId ? 1 : 0;
      const bDef = b.replay_id === defaultId ? 1 : 0;
      return bDef - aDef;
    });

    // Clear first so a re-render can't duplicate cards.
    grid.replaceChildren();
    const fragment = document.createDocumentFragment();
    ordered.forEach((replay) => fragment.appendChild(buildCard(replay)));
    grid.appendChild(fragment);
    if (status) status.textContent = `${replays.length} race${replays.length === 1 ? "" : "s"}`;
  } catch (error) {
    if (status) status.textContent = `Unable to load replays: ${error.message}`;
    console.error(error);
  }
}

// Only render when we're actually in gallery view (no ?replay= param). The
// head-script in index.html has already set documentElement.dataset.view.
if (document.documentElement.dataset.view === "gallery") {
  renderGallery();
}
