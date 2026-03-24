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

function getDisplayLane(baseLane, officialDistance, packedLane, eventConfig) {
  const startLane = getVisualLane(baseLane, eventConfig.lane_count);
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

export function createRaceModel(event, runners) {
  const eventConfig = buildEventConfig(event);
  const runnerMap = new Map(runners.map((runner) => [runner.id, runner]));

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
      };
    });

    const orderedStates = [...baseStates].sort((a, b) => {
      const distanceDiff = b.officialDistance - a.officialDistance;
      if (distanceDiff !== 0) return distanceDiff;
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
      const displayLane = getDisplayLane(baseState.runner.lane, baseState.officialDistance, packedLane, eventConfig);
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
        phase: getRunnerPhase(baseState.officialDistance, eventConfig),
        packedLane,
        displayLane,
        longitudinalOffset,
        trackPosition,
        checkpoints,
      };
    });

    const leader = runnerStates.find((state) => state.placeIndex === 0) || null;
    const isComplete = runnerStates.length > 0
      && runnerStates.every((state) => state.officialDistance >= eventConfig.race_distance_m);

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
