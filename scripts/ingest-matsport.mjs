#!/usr/bin/env node
// Ingest a matsport athle event into a race-replay entry.
//
// Turns "add a race" from hand-editing data/custom_800m_heats.json into one
// command. Fetches the official event JSON, maps it to our replay schema, and
// either prints it for review (default) or merges it into the data file.
//
// Usage:
//   node scripts/ingest-matsport.mjs <event-id | meet-url> [options]
//
// Options:
//   --id <slug>        replay_id (default: derived from athlete + event)
//   --title <text>     replay title (default: built from event + venue)
//   --focus <name>     substring of the athlete to follow (default: the winner)
//   --level <code>     competition_level, e.g. world_indoor_w  [REVIEW field]
//   --track <meters>   track length (default: 200, the indoor oval)
//   --break <meters>   break_distance_m geometry      [per-race tuned]
//   --merge <meters>   merge_complete_distance_m       [per-race tuned]
//   --turns <n>        start_offset_turns geometry     [per-race tuned]
//   --default          also set this replay as default_replay_id
//   --write            merge into data/custom_800m_heats.json (default: dry-run)
//
// Examples:
//   node scripts/ingest-matsport.mjs 02514df4-...-d3512c3715e7_ATSTAW008101
//   node scripts/ingest-matsport.mjs "https://athle-history.matsport.com/events/<ID>/results" --write

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const API_BASE = "https://api-history.athle.matsport.com/events";
const MEDIA_BASE = "https://athle-history.matsport.com";
const DATA_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "custom_800m_heats.json");

// Minimal IOC code → readable team name. Falls back to the raw code, so an
// unmapped country still produces valid (if terse) data rather than failing.
const IOC = {
  GBR: "Great Britain", POL: "Poland", ETH: "Ethiopia", SUI: "Switzerland",
  FRA: "France", USA: "United States", KEN: "Kenya", SLO: "Slovenia",
  MOZ: "Mozambique", ESP: "Spain", GER: "Germany", NED: "Netherlands",
  IRL: "Ireland", ITA: "Italy", BEL: "Belgium", CAN: "Canada", AUS: "Australia",
  JAM: "Jamaica", RSA: "South Africa", UGA: "Uganda", BUR: "Burundi",
};

// ---------- parsing helpers ----------

// "1:54.87" | "55.58" | "" → seconds (number) or null. Handles h:m:s too.
function parseClock(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parts = value.trim().split(":");
  let seconds = 0;
  for (const part of parts) {
    const n = parseFloat(part);
    if (!Number.isFinite(n)) return null;
    seconds = seconds * 60 + n;
  }
  return Math.round(seconds * 100) / 100;
}

// "100m" → 100, "1.5km" left alone (returns null) — indoor splits are metres.
function parseDistance(label) {
  const m = String(label || "").match(/^(\d+)\s*m$/i);
  return m ? Number(m[1]) : null;
}

// Number or null — distinct from `Number(v) || null`, which would discard a
// legitimate 0 (lane/bib). Empty/blank/non-numeric → null; "0" → 0.
function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function slug(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function properCase(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

// matsport gives "HODGKINSON" + "Keely" → "Keely Hodgkinson".
function fullName(athlete) {
  const fore = (athlete.forename || "").trim();
  const last = properCase(athlete.name || "");
  return [fore, last].filter(Boolean).join(" ") || athlete.longName || "Runner";
}

// ---------- the one judgment-based field ----------
//
// matsport never labels pacers. A pacer is a DNF who led the field out and
// stepped off at a round mark (classically halfway). This default tags a DNF
// as a pacer when they dropped at or before the midpoint AND were top-2 at
// their last split. Tune this if your races define pacing differently; set to
// `return null` to never auto-tag and label pacers by hand.
function inferRole(result, lastMark, raceDistance, rankAtLastSplit) {
  if (result.status !== "DNF") return null;
  const droppedEarly = lastMark <= raceDistance / 2;
  const wasUpFront = rankAtLastSplit != null && rankAtLastSplit <= 2;
  return droppedEarly && wasUpFront ? "pacer" : null;
}

// ---------- mapping ----------

function buildEntry(result, raceDistance, rankAtLastSplit) {
  const athlete = result.athlete || {};
  const isDNF = result.status === "DNF";
  const isDNS = result.status === "DNS";

  // Cumulative splits: prepend the 0 mark, then each recorded split. For a
  // finisher the feed stops at 700m and the 800m mark is the final `time`, so
  // append it. A DNF keeps only the marks they actually reached.
  const marks = [0];
  const cumulative = [0];
  for (const s of result.splits || []) {
    const d = parseDistance(s.distance);
    const t = parseClock(s.time);
    if (d == null || t == null) continue;
    marks.push(d);
    cumulative.push(t);
  }
  const finalTime = parseClock(result.time);
  if (!isDNF && !isDNS && finalTime != null && marks[marks.length - 1] !== raceDistance) {
    marks.push(raceDistance);
    cumulative.push(finalTime);
  }

  // Segments are diffs of cumulative — the single source of truth (the feed's
  // timeSection omits the final 700→800m piece implied by the finish time).
  const segments = [];
  for (let i = 1; i < cumulative.length; i += 1) {
    segments.push(Math.round((cumulative[i] - cumulative[i - 1]) * 100) / 100);
  }

  const lastMark = marks[marks.length - 1];
  const role = inferRole(result, lastMark, raceDistance, rankAtLastSplit);
  const country = athlete.country || "";

  // rank 999 is matsport's sentinel for "no place" (DNF/DNS). Normalize to a
  // number so downstream `place === 1` winner checks never see a string.
  const rank = Number(result.rank);
  const entry = {
    place: Number.isFinite(rank) && rank !== 999 ? rank : null,
    athlete: fullName(athlete),
    lane: numOrNull(result.lane),
    bib: numOrNull(result.bib),
    team: IOC[country] || country || "Unattached",
    country,
  };
  if (isDNF) entry.status = "DNF";
  if (isDNS) entry.status = "DNS";
  if (role) entry.role = role;

  entry.result = {
    final_time: finalTime != null && !isDNF && !isDNS ? finalTime : null,
    display_time: isDNF ? "DNF" : isDNS ? "DNS" : (result.time || null),
  };
  if (result.medal) entry.result.medal = result.medal;
  if (result.bestChange) entry.result.honors = [result.bestChange];

  const pb = result.personalBest, sb = result.seasonBest;
  if (pb || sb) {
    entry.career = {};
    if (pb) {
      entry.career.pre_race_pb_indoor = pb;
      const pbSec = parseClock(pb);
      if (pbSec != null) entry.career.pre_race_pb_indoor_seconds = pbSec;
    }
    if (sb) entry.career.pre_race_sb_indoor = sb;
  }

  entry.splits = {
    cumulative_seconds: cumulative,
    segment_seconds: segments,
    split_marks_m: marks,
  };
  return entry;
}

// Rank athletes by their time at their final shared split, so inferRole can
// know who was "up front" when a DNF stepped off.
function rankAtLastSplitFor(result, allResults) {
  const lastSplit = (result.splits || [])[ (result.splits || []).length - 1 ];
  if (!lastSplit) return null;
  const mark = lastSplit.distance;
  const timed = allResults
    .map((r) => {
      const s = (r.splits || []).find((x) => x.distance === mark);
      return s ? { r, t: parseClock(s.time) } : null;
    })
    .filter((x) => x && x.t != null)
    .sort((a, b) => a.t - b.t);
  // Identify the runner by object reference, not bib (bibs can be missing/dup).
  const idx = timed.findIndex((x) => x.r === result);
  return idx === -1 ? null : idx + 1;
}

function buildReplay(data, opts) {
  const results = (data.trackResult?.results || []).slice();
  if (!results.length) throw new Error("No trackResult.results in event payload");

  const genderWord = data.gender === "W" ? "Women's" : data.gender === "M" ? "Men's" : "";
  const distance = parseDistance((data.event || "").replace(/\D*$/, "m")) // "800m Women" → "800m"
    || parseDistance((data.event || "").match(/\d+\s*m/i)?.[0])
    || 800;
  const phase = data.phase || "";
  const eventName = [genderWord, `${distance}m`, phase].filter(Boolean).join(" ").trim();

  // Lane count = the highest lane actually used.
  const laneCount = results.reduce((m, r) => Math.max(m, Number(r.lane) || 0), 0) || 6;

  const entries = results.map((r) =>
    buildEntry(r, distance, rankAtLastSplitFor(r, results)));

  // Focus runner: the named athlete if --focus matches, else the winner.
  let focusIdx = entries.findIndex((e) => e.place === 1);
  if (opts.focus) {
    const i = entries.findIndex((e) =>
      e.athlete.toLowerCase().includes(opts.focus.toLowerCase()));
    if (i !== -1) focusIdx = i;
  }
  if (focusIdx !== -1) entries[focusIdx].tags = ["focus_runner"];

  const records = (data.records || []).map((r) => ({
    label: r.libelle,
    athlete: properCase(r.athlete),
    result: r.result,
    year: r.year,
  }));

  const winner = entries.find((e) => e.place === 1);
  const replayId = opts.id
    || slug(`${winner ? winner.athlete : eventName}-${data.idCompetition || data.id || "matsport"}`).slice(0, 60);

  // Venue: the event endpoint's `competition` object only carries name+id, so
  // the city comes from the separately-fetched competition record (opts.comp).
  // "<Meet name>, <City>" matches how the hand-authored replays read.
  const meetName = data.competition?.name || opts.comp?.name || "";
  const city = opts.comp?.city ? properCase(opts.comp.city) : "";
  const venue = [meetName, city].filter(Boolean).join(", ");

  const event = {
    name: eventName,
    venue,
    date: (data.date || "").slice(0, 10),
    records,
    photo_finish: data.photoFinishPath ? `${MEDIA_BASE}${data.photoFinishPath}` : undefined,
    lane_count: laneCount,
    track_length_m: opts.track || 200,
    race_distance_m: distance,
    timing_interval_m: (entries[0]?.splits.split_marks_m[1]) || 100,
    start_offset_turns: opts.turns ?? 1,            // per-race tuned (Liévin used 2)
    break_distance_m: opts.break ?? 100,            // per-race tuned (Liévin used 160)
    merge_complete_distance_m: opts.merge ?? 120,   // per-race tuned (Liévin used 180)
    competition_level: opts.level || null,          // REVIEW: not in feed
    active_heat_id: phase || "Final",
    source: {
      provider: "matsport.com",
      meet_url: opts.meetUrl || `${API_BASE}/${opts.eventId}`,
      event_id: opts.eventId,
    },
  };
  if (event.photo_finish === undefined) delete event.photo_finish;

  return {
    replay_id: replayId,
    title: opts.title || `${event.venue ? event.venue.split(",")[0] + " — " : ""}${eventName}`,
    event,
    heats: [{ heat_id: event.active_heat_id, entries }],
  };
}

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = {};
  let positional = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    // Pull the value for a value-taking flag, failing if it's missing or is
    // actually the next flag (e.g. `--id --write` or a trailing `--level`).
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} requires a value`);
      return v;
    };
    if (a === "--write") opts.write = true;
    else if (a === "--default") opts.makeDefault = true;
    else if (a === "--id") opts.id = val();
    else if (a === "--title") opts.title = val();
    else if (a === "--focus") opts.focus = val();
    else if (a === "--level") opts.level = val();
    else if (a === "--track") opts.track = Number(val());
    else if (a === "--break") opts.break = Number(val());
    else if (a === "--merge") opts.merge = Number(val());
    else if (a === "--turns") opts.turns = Number(val());
    else if (!a.startsWith("--")) positional = a;
    else throw new Error(`unknown flag: ${a}`); // fail fast on typos like --foucs
  }
  opts.positional = positional;
  return opts;
}

function resolveEventId(input) {
  if (!input) return null;
  const m = input.match(/events\/([^/?#]+)/);
  return m ? m[1] : input;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.positional) {
    console.error("Usage: node scripts/ingest-matsport.mjs <event-id | meet-url> [--write] [--focus NAME] [--level CODE] ...");
    process.exit(2);
  }
  opts.eventId = resolveEventId(opts.positional);
  opts.meetUrl = opts.positional.startsWith("http") ? opts.positional : undefined;

  const url = `${API_BASE}/${opts.eventId}`;
  console.error(`→ fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`matsport returned HTTP ${res.status} for ${opts.eventId}`);
  const data = await res.json();

  // Best-effort second fetch for the meet record (city/venue live here, not on
  // the event). Non-fatal: ingestion still works if it's unavailable.
  if (data.idCompetition) {
    try {
      const cRes = await fetch(`${API_BASE.replace("/events", "/competitions")}/${data.idCompetition}`);
      if (cRes.ok) opts.comp = await cRes.json();
    } catch { /* venue just falls back to the meet name */ }
  }

  const replay = buildReplay(data, opts);

  // Review checklist → stderr so stdout stays clean JSON for piping.
  const review = [];
  if (!replay.event.competition_level) review.push("competition_level is null — set with --level <code> (e.g. world_indoor_w)");
  review.push(`geometry defaults: break=${replay.event.break_distance_m} merge=${replay.event.merge_complete_distance_m} turns=${replay.event.start_offset_turns} — tune visually (per-race) and override with --break/--merge/--turns`);
  if (replay.event.venue) review.push(`venue = "${replay.event.venue}" — feed has no city; append it if needed`);
  if (replay.event.photo_finish) review.push(`photo_finish points at matsport CDN (${replay.event.photo_finish}); download into assets/ if you want it self-hosted`);
  const pacers = replay.heats[0].entries.filter((e) => e.role === "pacer").map((e) => e.athlete);
  review.push(pacers.length ? `auto-tagged pacer(s): ${pacers.join(", ")} — verify` : "no pacer auto-detected");
  const focus = replay.heats[0].entries.find((e) => e.tags?.includes("focus_runner"));
  review.push(`focus runner: ${focus ? focus.athlete : "(none)"} — change with --focus`);

  console.error(`\n✓ Built replay "${replay.replay_id}" — ${replay.heats[0].entries.length} athletes, ${replay.event.records.length} records`);
  console.error("REVIEW BEFORE SHIPPING:");
  review.forEach((r) => console.error(`  • ${r}`));

  if (!opts.write) {
    console.error("\n(dry run — re-run with --write to merge into data/custom_800m_heats.json)\n");
    process.stdout.write(JSON.stringify(replay, null, 2) + "\n");
    return;
  }

  const doc = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  doc.replays = Array.isArray(doc.replays) ? doc.replays : [];
  const existing = doc.replays.findIndex((r) => r.replay_id === replay.replay_id);
  if (existing !== -1) {
    doc.replays[existing] = replay;
    console.error(`↻ replaced existing replay "${replay.replay_id}"`);
  } else {
    doc.replays.push(replay);
    console.error(`+ appended replay "${replay.replay_id}"`);
  }
  if (opts.makeDefault) doc.default_replay_id = replay.replay_id;
  // Atomic write: a temp file + rename can't leave the shipped data file
  // truncated/corrupt if the process is interrupted mid-write.
  const tmpPath = `${DATA_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(doc, null, 2) + "\n");
  renameSync(tmpPath, DATA_PATH);
  console.error(`✓ wrote ${DATA_PATH}`);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
