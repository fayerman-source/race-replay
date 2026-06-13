import {
  TRACK_CONFIG,
  getDistanceAtTime,
  getLaneStartOffsetMeters,
  getTimeAtDistance,
  getTrackCoordinates,
  getVisualLane,
} from "./utils.js";

function getMergeProgress(distance, eventConfig) {
  const breakStart = eventConfig.break_distance_m;
  const mergeEnd = eventConfig.merge_complete_distance_m;

  if (distance <= breakStart) return 0;
  if (distance >= mergeEnd) return 1;
  return (distance - breakStart) / (mergeEnd - breakStart);
}

function getPackedLane(baseLaneIndex, eventConfig) {
  if (baseLaneIndex <= 0) return 1;
  if (baseLaneIndex === 1) return 2;
  if (baseLaneIndex === 2) return 2.6;
  if (baseLaneIndex === 3) return 3;

  return Math.min(eventConfig.lane_count, 3 + ((baseLaneIndex - 3) * eventConfig.extra_packed_lane_spacing));
}

function buildPackedLaneTargets(orderedStates, eventConfig) {
  const packedLaneByRunnerId = new Map();
  let currentCluster = [];

  function flushCluster() {
    currentCluster.forEach((state, clusterIndex) => {
      packedLaneByRunnerId.set(state.id, getPackedLane(clusterIndex, eventConfig));
    });
    currentCluster = [];
  }

  orderedStates.forEach((state, index) => {
    if (index === 0) {
      currentCluster.push(state);
      return;
    }

    const previous = orderedStates[index - 1];
    const gapToPrevious = previous.officialDistance - state.officialDistance;

    if (gapToPrevious <= eventConfig.crowding_gap_m) {
      currentCluster.push(state);
      return;
    }

    flushCluster();
    currentCluster.push(state);
  });

  flushCluster();
  return packedLaneByRunnerId;
}

function getDisplayLane(baseLane, laneOffset, officialDistance, packedLane, eventConfig) {
  // laneOffset splits shared-lane (waterfall double) runners into inner/outer
  // sub-positions at the start; it fades out as the field packs onto the rail.
  const startLane = getVisualLane(baseLane, eventConfig.lane_count) + (laneOffset || 0);
  const mergeProgress = getMergeProgress(officialDistance, eventConfig);

  if (mergeProgress === 0) return startLane;
  return startLane + ((packedLane - startLane) * mergeProgress);
}

function getDisplayStartOffset(baseLane, officialDistance, eventConfig) {
  const initialOffset = getLaneStartOffsetMeters(
    baseLane,
    eventConfig.lane_count,
    eventConfig.start_offset_turns,
  );

  if (initialOffset === 0) return 0;
  if (officialDistance <= 0) return initialOffset;
  if (officialDistance >= eventConfig.break_distance_m) return 0;

  const fadeProgress = officialDistance / eventConfig.break_distance_m;
  return initialOffset * (1 - fadeProgress);
}

function getRunnerPhase(officialDistance, eventConfig) {
  if (officialDistance >= eventConfig.race_distance_m) return "finished";
  if (officialDistance < eventConfig.break_distance_m) return "stagger_start";
  if (officialDistance < eventConfig.merge_complete_distance_m) return "merge";
  return "packed";
}

function buildEventConfig(event) {
  const trackLength = event.track_length_m || TRACK_CONFIG.trackLength;
  const raceDistance = event.race_distance_m || TRACK_CONFIG.raceDistance;
  const timingInterval = event.timing_interval_m || 200;
  const laneCount = event.lane_count || TRACK_CONFIG.laneCount;
  const splitMarks = [];

  for (let mark = timingInterval; mark <= raceDistance; mark += timingInterval) {
    splitMarks.push(mark);
  }

  return {
    ...event,
    track_length_m: trackLength,
    race_distance_m: raceDistance,
    timing_interval_m: timingInterval,
    lane_count: laneCount,
    split_marks_m: splitMarks,
    start_offset_turns: event.start_offset_turns || 1,
    break_distance_m: event.break_distance_m || 55,
    merge_complete_distance_m: event.merge_complete_distance_m || 85,
    extra_packed_lane_spacing: 0.2,
    crowding_gap_m: 2.2,
  };
}

// Fraction of headroom above the fastest pace anyone actually ran, to allow
// for brief, legitimate accelerations (repacking, a finishing kick) without
// permitting a marker to teleport. 1.25 = "25% faster than the field's best
// sustained 100m is the ceiling." Tune this knob to taste — see the user
// contribution note below.
const FIELD_SURGE_MARGIN = 1.25;

// Reconstruct the distance marks (in meters) that correspond to a runner's
// cumulative-seconds array. Mirrors getNormalizedSplitMarks in utils.js so the
// ceiling math agrees with the interpolation math: explicit split_marks_m when
// present, otherwise an even split of the race distance.
function getRunnerSegmentMarks(runner, raceDistance) {
  const marks = runner.splitMarks;
  if (Array.isArray(marks) && marks.length === runner.splits.length) {
    return marks;
  }
  const segmentCount = Math.max(1, runner.splits.length - 1);
  const interval = raceDistance / segmentCount;
  return runner.splits.map((_, index) => index * interval);
}

// Field-relative speed ceiling: the fastest average pace (m/s) any runner
// sustained across any single split segment in THIS race, scaled by a surge
// margin. Because it is derived from the field's own data, a women's WR race
// caps lower than a men's race automatically — no hardcoded gender or
// world-record tables. Used by the render layer to bound on-screen speed so no
// marker moves faster than is humanly possible in this race's context.
//
// ── User contribution point ──────────────────────────────────────────────
// This function encodes the modeling judgment behind the whole feature. The
// version below takes the field MAX segment pace × FIELD_SURGE_MARGIN. Valid
// alternatives you may prefer:
//   • robustness: ignore the single fastest outlier (e.g. take the 2nd-fastest
//     or a high percentile) so one mis-keyed split can't inflate the ceiling;
//   • per-phase caps: a higher ceiling over the first segment (start accel)
//     than over the final segment (fatigue);
//   • a hard biomechanical floor so a slow heat still can't look frozen.
// If you want to own this decision, rewrite the loop below and keep the return
// contract (a single positive number in m/s).
function computeFieldSpeedCeiling(runners, eventConfig) {
  let fastestPace = 0;

  for (const runner of runners) {
    const times = runner.splits;
    if (!Array.isArray(times) || times.length < 2) continue;
    const marks = getRunnerSegmentMarks(runner, eventConfig.race_distance_m);

    for (let i = 0; i < times.length - 1; i += 1) {
      const segmentSeconds = times[i + 1] - times[i];
      const segmentMeters = marks[i + 1] - marks[i];
      if (segmentSeconds > 0 && segmentMeters > 0) {
        fastestPace = Math.max(fastestPace, segmentMeters / segmentSeconds);
      }
    }
  }

  // Fallback for degenerate data (no usable segments): a generic 800m-ish pace
  // so the governor stays finite rather than freezing every marker.
  if (fastestPace <= 0) {
    fastestPace = eventConfig.race_distance_m / 120;
  }

  return fastestPace * FIELD_SURGE_MARGIN;
}

export function createRaceModel(event, runners) {
  const eventConfig = buildEventConfig(event);
  eventConfig.max_plausible_speed_mps = computeFieldSpeedCeiling(runners, eventConfig);
  const runnerMap = new Map(runners.map((runner) => [runner.id, runner]));
  // The last distance each runner has data for. For a full runner this is the
  // race distance; for a partial runner (a DNF pacer) it's their drop point.
  const runnerMaxDistance = new Map(runners.map((runner) => {
    const marks = getRunnerSegmentMarks(runner, eventConfig.race_distance_m);
    return [runner.id, marks[marks.length - 1]];
  }));

  function isDropped(runner, officialDistance) {
    const maxDistance = runnerMaxDistance.get(runner.id) ?? eventConfig.race_distance_m;
    return maxDistance < eventConfig.race_distance_m
      && officialDistance >= maxDistance - 1e-6;
  }

  function getSnapshot(raceTime) {
    const effectiveTime = Math.max(0, raceTime);
    const baseStates = runners.map((runner) => {
      const officialDistance = getDistanceAtTime(
        runner.splits,
        effectiveTime,
        runner.splitMarks,
        eventConfig.race_distance_m,
      );

      return {
        id: runner.id,
        runner,
        officialDistance,
        finalTime: runner.finalTime,
        dropped: isDropped(runner, officialDistance),
      };
    });

    const orderedStates = [...baseStates].sort((a, b) => {
      // Dropped-out runners (a pacer who has stepped off) sort to the back
      // regardless of distance — they're no longer in the standings. While
      // still running, a pacer is ordered normally and can legitimately lead.
      if (a.dropped !== b.dropped) return a.dropped ? 1 : -1;
      const distanceDiff = b.officialDistance - a.officialDistance;
      if (distanceDiff !== 0) return distanceDiff;
      // Equality check before subtracting guards against Infinity - Infinity
      // (= NaN) when multiple DNF runners, both with finalTime Infinity, tie.
      if (a.finalTime === b.finalTime) return 0;
      return a.finalTime - b.finalTime;
    });

    const orderByRunnerId = new Map(orderedStates.map((state, index) => [state.id, index]));
    const packedLaneTargets = buildPackedLaneTargets(orderedStates, eventConfig);

    const runnerStates = baseStates.map((baseState) => {
      const placeIndex = orderByRunnerId.get(baseState.id) ?? runners.length - 1;
      const lapIndex = Math.min(
        Math.floor(baseState.officialDistance / eventConfig.track_length_m),
        Math.floor(eventConfig.race_distance_m / eventConfig.track_length_m),
      );
      const distanceIntoLap = baseState.officialDistance % eventConfig.track_length_m;
      const packedLane = packedLaneTargets.get(baseState.id) || 1;
      const displayLane = getDisplayLane(baseState.runner.lane, baseState.runner.laneOffset, baseState.officialDistance, packedLane, eventConfig);
      const longitudinalOffset = getDisplayStartOffset(baseState.runner.lane, baseState.officialDistance, eventConfig);
      const trackPosition = getTrackCoordinates(baseState.officialDistance, displayLane, {
        lapDistance: eventConfig.track_length_m,
        laneCount: eventConfig.lane_count,
        startOffsetMeters: longitudinalOffset,
      });
      const checkpoints = Object.fromEntries(
        eventConfig.split_marks_m.map((mark) => [mark, baseState.officialDistance >= mark]),
      );

      return {
        ...baseState,
        placeIndex,
        lapIndex,
        distanceIntoLap,
        phase: baseState.dropped ? "dnf" : getRunnerPhase(baseState.officialDistance, eventConfig),
        packedLane,
        displayLane,
        longitudinalOffset,
        trackPosition,
        checkpoints,
      };
    });

    const leader = runnerStates.find((state) => state.placeIndex === 0) || null;
    const racingStates = runnerStates.filter((state) => state.phase !== "dnf");
    const isComplete = racingStates.length > 0
      && racingStates.every((state) => state.officialDistance >= eventConfig.race_distance_m);

    return {
      raceTime,
      effectiveTime,
      event: eventConfig,
      runnerStates,
      isComplete,
      leaderId: leader?.id || null,
      leaderDistance: leader?.officialDistance || 0,
      orderedRunnerIds: runnerStates
        .slice()
        .sort((a, b) => a.placeIndex - b.placeIndex)
        .map((state) => state.id),
      getRunnerState(id) {
        return runnerStates.find((state) => state.id === id) || null;
      },
      getRunnerConfig(id) {
        return runnerMap.get(id) || null;
      },
      getSplitTimeForRunner(id, distanceMark) {
        const runner = runnerMap.get(id);
        if (!runner) return null;
        return getTimeAtDistance(
          runner.splits,
          distanceMark,
          runner.splitMarks,
          eventConfig.race_distance_m,
        );
      },
    };
  }

  return {
    event: eventConfig,
    runners,
    getSnapshot,
  };
}
