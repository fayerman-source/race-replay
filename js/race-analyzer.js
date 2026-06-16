// Race analyzer
// Pure-function module: takes { event, runners } as produced by heat-data.js
// and returns a deterministic AnalysisBundle with per-runner features,
// field-relative scores, race-level signals, and time-ordered commentary events.
// No DOM, no fetch, no LLM. Safe to run on load and on every replay swap.

import { TRACK_CONFIG } from "./utils.js";

// =====================================================================
// CONFIGURATION TABLES
// =====================================================================
// These constants encode product judgment, not implementation detail.
// The TODO blocks are the decisions you should lock yourself — defaults
// below are best-effort starting points derived from the research synth.
// =====================================================================

// Par times by competition level. Used to classify race shape (Quirin's
// 16-box matrix). Each entry: { opener_200m, total_seconds }.
// TODO(user): fill these in per the competition levels you actually serve.
// Anchors derived from research: W Olympic ~27.0/116; M Olympic ~24.0/103;
// HS state ~29/130; youth U12 ~35/170. Tune as you accumulate replays.
export const PAR_TIMES = {
  "world_indoor_w": { opener_200m: 27.5, total_seconds: 117.0 },
  "world_indoor_m": { opener_200m: 24.5, total_seconds: 104.0 },
  "hs_varsity_w":   { opener_200m: 29.0, total_seconds: 130.0 },
  "hs_varsity_m":   { opener_200m: 26.0, total_seconds: 115.0 },
  "youth_u12_w":    { opener_200m: 35.0, total_seconds: 170.0 },
  "youth_u12_m":    { opener_200m: 34.0, total_seconds: 165.0 },
  // TODO: add the levels you actually need
};

// Race shape band boundaries — percent deviation from par.
// "fast" = clearly faster than par; "par" = within tight band of par;
// "avg" = noticeably slower than par; "slow" = much slower.
// TODO(user): research baseline is ±1% par-band, ±3% fast/slow band edges.
// Tighten or loosen to match how dramatic you want race-shape labels to be.
export const RACE_SHAPE_BANDS = {
  fast_threshold_pct: -1.5,   // pace better than par by ≥1.5% → "fast"
  par_threshold_pct:  1.0,    // pace within ±1% of par → "par"
  avg_threshold_pct:  4.0,    // pace within +4% of par → "avg"; beyond → "slow"
};

// Running style thresholds (track analog of Brisnet E/E-P/P/S).
// Classification uses each runner's opener field-relative score (0-100):
// 100 = fastest opener in field, 0 = slowest. Adjusted for closer score
// to distinguish S (closer) from a slow burner.
// TODO(user): these are the highest-leverage constants in the file.
// Tighten openerScore_E if you want only the pure front-runner to qualify.
export const STYLE_THRESHOLDS = {
  openerScore_E:   85,   // ≥85 → Early (true front-runner)
  openerScore_EP:  65,   // 65–85 → Early/Presser
  openerScore_P:   30,   // 30–65 → Presser (mid-pack)
  closerScore_S:   65,   // <30 opener AND ≥65 closer → Sustain/Closer
  // <30 opener AND <65 closer → "NA" (or possibly "tailed off")
};

// Pace pressure: how many E or E-P runners contest the early pace.
// 1 → "lone speed" (front-runner has the race to themselves)
// 2 → competitive early pace
// 3+ → "pace duel" (front-runners likely to fade, closers favored)
// TODO(user): default 3+ threshold is from horse-racing convention; in a
// 6-lane indoor 800m field this may be too high.
export const PACE_PRESSURE_DUEL_THRESHOLD = 3;

// Split-class bands (percentage differential 2nd-half vs 1st-half).
// Validated against Rudisha (+4.77%), Kipketer (+5.07%), Kratochvilova (-0.63%).
export const SPLIT_CLASS_BANDS = {
  negative_max_pct:    -1.0,  // < -1% → negative_splitter
  even_max_pct:         1.0,  // -1 to +1% → even/pacer
  textbook_max_pct:     4.0,  // +1 to +4% → textbook_positive
  aggressive_max_pct:   8.0,  // +4 to +8% → aggressive_front
  // > +8% → blow_up
};

// Monotonicity tolerance for burner/decline detection.
// Two adjacent segments are "consistent with monotonic slowing" if
// segments[i+1] >= segments[i] - tolerance_seconds.
export const MONOTONICITY_TOLERANCE_SECONDS = 0.3;

// =====================================================================
// UTILITIES
// =====================================================================

function safeSegments(runner) {
  if (Array.isArray(runner.segmentSplits) && runner.segmentSplits.length) {
    return runner.segmentSplits.slice();
  }
  const cumulative = runner.splits || [];
  return cumulative.slice(1).map((time, i) => time - cumulative[i]);
}

function safeSplitMarks(runner, raceDistance) {
  if (Array.isArray(runner.splitMarks) && runner.splitMarks.length) {
    return runner.splitMarks.slice();
  }
  const cumulative = runner.splits || [];
  const segmentCount = Math.max(1, cumulative.length - 1);
  const interval = raceDistance / segmentCount;
  return cumulative.map((_, i) => i * interval);
}

function pickInterpolated(mark, prevMark, prevTime, nextMark, nextTime) {
  if (nextMark === prevMark) return prevTime;
  const t = (mark - prevMark) / (nextMark - prevMark);
  return prevTime + t * (nextTime - prevTime);
}

function timeAtDistance(runner, distance, raceDistance) {
  const cumulative = runner.splits || [];
  const marks = safeSplitMarks(runner, raceDistance);
  if (distance <= 0) return 0;
  if (distance >= raceDistance) return cumulative[cumulative.length - 1];
  for (let i = 0; i < marks.length - 1; i += 1) {
    if (distance >= marks[i] && distance <= marks[i + 1]) {
      return pickInterpolated(distance, marks[i], cumulative[i], marks[i + 1], cumulative[i + 1]);
    }
  }
  return cumulative[cumulative.length - 1];
}

// =====================================================================
// PER-RUNNER FEATURES
// =====================================================================

function getEnergyDistribution(runner) {
  const segments = safeSegments(runner);
  const total = segments.reduce((sum, s) => sum + s, 0);
  if (total === 0) return segments.map(() => 0);
  return segments.map((s) => s / total);
}

function getPeakDeclinePct(runner) {
  const segments = safeSegments(runner);
  if (segments.length < 2) return null;
  const peak = Math.min(...segments);
  const final = segments[segments.length - 1];
  return ((final - peak) / peak) * 100;
}

function getMonotonicityScore(runner, tolerance = MONOTONICITY_TOLERANCE_SECONDS) {
  const segments = safeSegments(runner);
  if (segments.length < 2) return null;
  let consistent = 0;
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i] >= segments[i - 1] - tolerance) consistent += 1;
  }
  return consistent / (segments.length - 1);
}

function getSplitClass(runner) {
  const segments = safeSegments(runner);
  if (segments.length < 2) return null;
  const mid = Math.floor(segments.length / 2);
  const firstHalf = segments.slice(0, mid).reduce((s, x) => s + x, 0);
  const secondHalf = segments.slice(mid).reduce((s, x) => s + x, 0);
  if (firstHalf === 0) return null;
  const diffPct = ((secondHalf - firstHalf) / firstHalf) * 100;
  let label;
  if (runner.role === "pacer") {
    // A pacemaker is contracted to tow the field through the early laps and step
    // off — by design they never run a second half. The positive/negative-split
    // verdict (and especially "blow_up" / "faded badly") is a category error and
    // unfair to them, so label it honestly while keeping the raw differential.
    label = "pacer";
  } else if (diffPct < SPLIT_CLASS_BANDS.negative_max_pct) label = "negative_splitter";
  else if (diffPct < SPLIT_CLASS_BANDS.even_max_pct) label = "even";
  else if (diffPct < SPLIT_CLASS_BANDS.textbook_max_pct) label = "textbook_positive";
  else if (diffPct < SPLIT_CLASS_BANDS.aggressive_max_pct) label = "aggressive_front";
  else label = "blow_up";
  return { label, diffPct, firstHalfSeconds: firstHalf, secondHalfSeconds: secondHalf };
}

function getFastestSegmentIdx(runner) {
  const segments = safeSegments(runner);
  if (!segments.length) return null;
  let idx = 0;
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i] < segments[idx]) idx = i;
  }
  return idx;
}

// =====================================================================
// FIELD-RELATIVE SCORING (track-stats polar-chart metric)
// =====================================================================

function getSegmentScoresVsField(runners) {
  // For each segment index, score every runner 0..100 where 100 = fastest
  // segment in the field, 0 = slowest. Returns Map<runnerId, number[]>.
  const segmentsByRunner = new Map(
    runners.map((r) => [r.id, safeSegments(r)]),
  );
  const lengths = [...segmentsByRunner.values()].map((s) => s.length);
  const segCount = lengths.length ? Math.min(...lengths) : 0;
  const scores = new Map(runners.map((r) => [r.id, []]));

  for (let s = 0; s < segCount; s += 1) {
    const fieldSegs = runners.map((r) => segmentsByRunner.get(r.id)[s]);
    const best = Math.min(...fieldSegs);
    const worst = Math.max(...fieldSegs);
    const span = worst - best || 1;
    runners.forEach((r) => {
      const own = segmentsByRunner.get(r.id)[s];
      scores.get(r.id).push(100 * (worst - own) / span);
    });
  }
  return scores;
}

// =====================================================================
// RACE-LEVEL FEATURES
// =====================================================================

function getRankAtCheckpoint(runners, distance, raceDistance) {
  // Returns array of runner ids ordered by time-at-distance (fastest first).
  const timed = runners
    .map((r) => ({ id: r.id, time: timeAtDistance(r, distance, raceDistance) }))
    .sort((a, b) => a.time - b.time);
  return timed.map((t) => t.id);
}

function getRanksByCheckpoint(runners, checkpoints, raceDistance) {
  // Returns Map<checkpoint, runnerId[]> — order at each split mark.
  const result = new Map();
  checkpoints.forEach((cp) => {
    result.set(cp, getRankAtCheckpoint(runners, cp, raceDistance));
  });
  return result;
}

function getLeadChanges(ranksByCheckpoint) {
  // Returns events where the leader changes between consecutive checkpoints.
  const events = [];
  const cps = [...ranksByCheckpoint.keys()].sort((a, b) => a - b);
  let prevLeader = null;
  cps.forEach((cp) => {
    const leader = ranksByCheckpoint.get(cp)[0];
    if (prevLeader !== null && leader !== prevLeader) {
      events.push({ at_distance: cp, from_id: prevLeader, to_id: leader });
    }
    prevLeader = leader;
  });
  return events;
}

function getRankChange(runner, ranksByCheckpoint, fromCp, toCp) {
  const fromOrder = ranksByCheckpoint.get(fromCp);
  const toOrder = ranksByCheckpoint.get(toCp);
  if (!fromOrder || !toOrder) return null;
  const fromRank = fromOrder.indexOf(runner.id);
  const toRank = toOrder.indexOf(runner.id);
  if (fromRank < 0 || toRank < 0) return null;
  return { fromRank, toRank, delta: fromRank - toRank };
}

function getBiggestMove(runners, ranksByCheckpoint, fromCp, toCp) {
  let best = null;
  runners.forEach((r) => {
    const change = getRankChange(r, ranksByCheckpoint, fromCp, toCp);
    if (!change) return;
    if (!best || change.delta > best.delta) {
      best = { runnerId: r.id, ...change, fromCp, toCp };
    }
  });
  return best;
}

function getBiggestFade(runners, ranksByCheckpoint, fromCp, toCp) {
  let worst = null;
  runners.forEach((r) => {
    const change = getRankChange(r, ranksByCheckpoint, fromCp, toCp);
    if (!change) return;
    if (!worst || change.delta < worst.delta) {
      worst = { runnerId: r.id, ...change, fromCp, toCp };
    }
  });
  return worst;
}

function getFieldSpread(runners, distance, raceDistance) {
  // Returns gap (seconds) between fastest and slowest at this distance.
  const times = runners.map((r) => timeAtDistance(r, distance, raceDistance));
  return Math.max(...times) - Math.min(...times);
}

function getEarlyPaceAggressor(runners, segmentScores) {
  // Runner with the highest opener field-relative score.
  let leader = null;
  let bestScore = -1;
  runners.forEach((r) => {
    const score = segmentScores.get(r.id)?.[0] ?? -1;
    if (score > bestScore) {
      bestScore = score;
      leader = { runnerId: r.id, openerScore: score };
    }
  });
  return leader;
}

function getClosingSpeedWinner(runners) {
  // Per horse-racing research: closing winner = smallest peak-to-final
  // decline, not fastest absolute final segment. Slowed-down least.
  let leader = null;
  let bestDecline = Infinity;
  runners.forEach((r) => {
    const decline = getPeakDeclinePct(r);
    if (decline === null) return;
    if (decline < bestDecline) {
      bestDecline = decline;
      leader = { runnerId: r.id, peakDeclinePct: decline };
    }
  });
  return leader;
}

// =====================================================================
// CLASSIFICATION (running style + race shape)
// =====================================================================

function classifyRunningStyle(runner, segmentScores) {
  // Within-race style observed (not historical tendency, which needs
  // multiple prior races). Maps onto Brisnet E/E-P/P/S/NA.
  const scores = segmentScores.get(runner.id) || [];
  if (!scores.length) return { primary: "NA", tags: ["NA"], confidence: 0 };

  const opener = scores[0];
  const closer = scores[scores.length - 1];
  const tags = [];

  if (opener >= STYLE_THRESHOLDS.openerScore_E) tags.push("E");
  else if (opener >= STYLE_THRESHOLDS.openerScore_EP) tags.push("E/P");
  else if (opener >= STYLE_THRESHOLDS.openerScore_P) tags.push("P");
  else if (closer >= STYLE_THRESHOLDS.closerScore_S) tags.push("S");
  else tags.push("NA");

  // Multi-tag secondary observations
  if (opener >= STYLE_THRESHOLDS.openerScore_EP && closer >= STYLE_THRESHOLDS.closerScore_S) {
    tags.push("fast_starter_finisher");
  }

  return {
    primary: tags[0],
    tags,
    openerScore: opener,
    closerScore: closer,
  };
}

function classifyRaceShape(runners, event, parTable = PAR_TIMES) {
  // Quirin 16-box matrix: early_pace_band × final_time_band.
  // Each band: fast | par | avg | slow.
  const competitionKey = event.competition_level || null;
  const par = competitionKey ? parTable[competitionKey] : null;

  // Find leader (fastest total time)
  const fastestRunner = runners.reduce((best, r) => {
    if (!best || (r.finalTime || Infinity) < (best.finalTime || Infinity)) return r;
    return best;
  }, null);
  if (!fastestRunner || !par) {
    return {
      earlyPaceBand: null,
      finalTimeBand: null,
      label: null,
      reason: par ? "no_field" : "no_par_table_entry",
    };
  }

  // Always compare to par at the 200m mark, regardless of the underlying
  // split resolution (100m, 200m, etc.). timeAtDistance handles both.
  // Early-pace band is based on the field's fastest 200m, not the winner's:
  // a race won by a closer can still have a fast early pace set by an E
  // runner who later faded.
  const raceDistance = event.race_distance_m || TRACK_CONFIG.raceDistance;
  let fieldFastest200 = Infinity;
  runners.forEach((r) => {
    const t = timeAtDistance(r, 200, raceDistance);
    if (Number.isFinite(t) && t > 0 && t < fieldFastest200) fieldFastest200 = t;
  });
  const leaderOpener = Number.isFinite(fieldFastest200)
    ? fieldFastest200
    : timeAtDistance(fastestRunner, 200, raceDistance);
  const leaderTotal = fastestRunner.finalTime;
  const openerDeltaPct = ((leaderOpener - par.opener_200m) / par.opener_200m) * 100;
  const totalDeltaPct  = ((leaderTotal  - par.total_seconds) / par.total_seconds) * 100;

  function band(deltaPct) {
    if (deltaPct < RACE_SHAPE_BANDS.fast_threshold_pct) return "fast";
    if (deltaPct < RACE_SHAPE_BANDS.par_threshold_pct) return "par";
    if (deltaPct < RACE_SHAPE_BANDS.avg_threshold_pct) return "avg";
    return "slow";
  }

  const earlyPaceBand = band(openerDeltaPct);
  const finalTimeBand = band(totalDeltaPct);
  return {
    earlyPaceBand,
    finalTimeBand,
    label: `${earlyPaceBand}/${finalTimeBand}`,
    leaderOpener,
    leaderTotal,
    openerDeltaPct,
    totalDeltaPct,
  };
}

function getPacePressure(stylesByRunnerId) {
  // Count of E + E/P runners contesting the early pace.
  let count = 0;
  stylesByRunnerId.forEach((style) => {
    if (style.primary === "E" || style.primary === "E/P") count += 1;
  });
  let category;
  if (count <= 1) category = "lone_speed";
  else if (count < PACE_PRESSURE_DUEL_THRESHOLD) category = "competitive";
  else category = "pace_duel";
  return { count, category };
}

// =====================================================================
// MAIN ENTRY POINT
// =====================================================================

export function analyzeRace(event, runners) {
  const raceDistance = event.race_distance_m || TRACK_CONFIG.raceDistance;
  const timingInterval = event.timing_interval_m || 200;

  // Build checkpoints from event metadata; reuse same logic race-model.js uses.
  const checkpoints = [];
  for (let m = timingInterval; m <= raceDistance; m += timingInterval) {
    checkpoints.push(m);
  }
  // Always include the finish line as a checkpoint, even when
  // timing_interval_m doesn't evenly divide race_distance_m. Without this,
  // finishOrder collapses to empty and every late-race signal breaks.
  if (checkpoints.length === 0 || checkpoints[checkpoints.length - 1] !== raceDistance) {
    checkpoints.push(raceDistance);
  }

  const segmentScores = getSegmentScoresVsField(runners);
  const ranksByCheckpoint = getRanksByCheckpoint(runners, checkpoints, raceDistance);

  const perRunner = runners.map((r) => {
    const segments = safeSegments(r);
    const energy = getEnergyDistribution(r);
    const style = classifyRunningStyle(r, segmentScores);
    return {
      id: r.id,
      name: r.fullName || r.name,
      lane: r.lane,
      finalTime: r.finalTime,
      segments,
      segmentMarks: safeSplitMarks(r, raceDistance),
      // Preserve the original cumulative splits straight from the JSON so
      // UI layers can display the canonical numbers, not segment re-sums
      // (which drift due to independent rounding of cumulative vs segment).
      cumulativeSeconds: Array.isArray(r.splits) ? r.splits.slice() : null,
      energyDistribution: energy,
      peakDeclinePct: getPeakDeclinePct(r),
      monotonicityScore: getMonotonicityScore(r),
      splitClass: getSplitClass(r),
      fastestSegmentIdx: getFastestSegmentIdx(r),
      segmentScoresVsField: segmentScores.get(r.id) || [],
      style,
    };
  });

  const stylesByRunnerId = new Map(perRunner.map((p) => [p.id, p.style]));

  const raceLevel = {
    checkpoints,
    ranksByCheckpoint,
    finishOrder: ranksByCheckpoint.get(raceDistance) || [],
    leadChanges: getLeadChanges(ranksByCheckpoint),
    biggestMoveBetweenCheckpoints: checkpoints.length >= 2
      ? getBiggestMove(runners, ranksByCheckpoint, checkpoints[0], checkpoints[checkpoints.length - 1])
      : null,
    biggestFadeBetweenCheckpoints: checkpoints.length >= 2
      ? getBiggestFade(runners, ranksByCheckpoint, checkpoints[0], checkpoints[checkpoints.length - 1])
      : null,
    biggestMoveLate: checkpoints.length >= 3
      ? getBiggestMove(
          runners,
          ranksByCheckpoint,
          checkpoints[checkpoints.length - 3],
          checkpoints[checkpoints.length - 1],
        )
      : null,
    fieldSpreadByCheckpoint: new Map(
      checkpoints.map((cp) => [cp, getFieldSpread(runners, cp, raceDistance)]),
    ),
    earlyPaceAggressor: getEarlyPaceAggressor(runners, segmentScores),
    closingSpeedWinner: getClosingSpeedWinner(runners),
    pacePressure: getPacePressure(stylesByRunnerId),
    raceShape: classifyRaceShape(runners, event),
  };

  const events = extractCommentaryEvents({ event, perRunner, raceLevel, runners });

  return {
    event: {
      name: event.name,
      venue: event.venue,
      raceDistance,
      timingInterval,
      competitionLevel: event.competition_level || null,
    },
    perRunner,
    raceLevel,
    events,
  };
}

// =====================================================================
// COMMENTARY EVENT EXTRACTION
// =====================================================================
// Time-ordered, narrator-friendly observation stream. Each event carries
// enough information for the narrator to choose a template and fill it in.
// Schema:  { dueTime, distance, subjectId, kind, payload }
//
// TODO(user): decide which observations are dense enough to comment on.
// The set below is the starter kit; trim or expand based on the cadence
// you actually want in the commentary box.
// =====================================================================

export function extractCommentaryEvents({ event, perRunner, raceLevel, runners = [] }) {
  const events = [];
  const raceDistance = event.race_distance_m || TRACK_CONFIG.raceDistance;
  const runnerById = new Map(perRunner.map((p) => [p.id, p]));
  const rawRunnerById = new Map(runners.map((r) => [r.id, r]));

  function pushEvent({ dueTime, distance, subjectId, kind, payload }) {
    events.push({ dueTime, distance, subjectId, kind, payload });
  }

  // Race-shape opener (pre-race / opening segment)
  if (raceLevel.raceShape?.label) {
    pushEvent({
      dueTime: 0,
      distance: 0,
      subjectId: null,
      kind: "race_shape_intro",
      payload: { shape: raceLevel.raceShape, pacePressure: raceLevel.pacePressure },
    });
  }

  // Per-runner opening style call
  perRunner.forEach((p) => {
    if (p.style.primary === "E" || p.style.primary === "E/P") {
      pushEvent({
        dueTime: p.segments[0] || 0,
        distance: raceLevel.checkpoints[0] || 200,
        subjectId: p.id,
        kind: "opener_aggressive",
        payload: { openerScore: p.style.openerScore, style: p.style.primary },
      });
    }
  });

  // Lead changes (time = time leader changes at given checkpoint).
  // Use the runner's official cumulative_seconds via timeAtDistance so the
  // event time is correct even when checkpoint spacing differs from the
  // runner's segment spacing.
  raceLevel.leadChanges.forEach((change) => {
    const rawNewLeader = rawRunnerById.get(change.to_id);
    if (!rawNewLeader) return;
    const cumulativeAtMark = timeAtDistance(rawNewLeader, change.at_distance, raceDistance);
    pushEvent({
      dueTime: cumulativeAtMark,
      distance: change.at_distance,
      subjectId: change.to_id,
      kind: "lead_change",
      payload: { from_id: change.from_id, to_id: change.to_id },
    });
  });

  // Biggest late move
  if (raceLevel.biggestMoveLate && raceLevel.biggestMoveLate.delta > 0) {
    const mover = runnerById.get(raceLevel.biggestMoveLate.runnerId);
    if (mover) {
      pushEvent({
        dueTime: mover.finalTime || 0,
        distance: raceLevel.biggestMoveLate.toCp,
        subjectId: mover.id,
        kind: "late_move",
        payload: raceLevel.biggestMoveLate,
      });
    }
  }

  // Closing-speed winner (relative slowdown = research-grounded metric)
  if (raceLevel.closingSpeedWinner) {
    const r = runnerById.get(raceLevel.closingSpeedWinner.runnerId);
    if (r) {
      pushEvent({
        dueTime: r.finalTime || 0,
        distance: raceDistance,
        subjectId: r.id,
        kind: "closing_speed_winner",
        payload: raceLevel.closingSpeedWinner,
      });
    }
  }

  // Finish summary
  const winnerId = raceLevel.finishOrder[0];
  if (winnerId != null) {
    const winner = runnerById.get(winnerId);
    if (winner) {
      pushEvent({
        dueTime: winner.finalTime || 0,
        distance: raceDistance,
        subjectId: winner.id,
        kind: "finish",
        payload: { finishOrder: raceLevel.finishOrder },
      });
    }
  }

  events.sort((a, b) => a.dueTime - b.dueTime);
  return events;
}
