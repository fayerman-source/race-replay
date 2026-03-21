import { TRACK_CONFIG, formatTime, getCheckpointSegment, getTrackCoordinates } from "./utils.js";
import { SfxManager } from "./sfx-manager.js";
import { loadHeatData } from "./heat-data.js";
import { createRaceModel } from "./race-model.js";

const CONFIG = {
  sfxEnabled: true,
};

const state = {
  raceTime: 0,
  speed: 1,
  isRunning: false,
  lastFrameTs: null,
  startHornPlayed: false,
  lastLapBellDistance: 0,
  finishPlayed: false,
  replayId: null,
  replayTitle: null,
  event: null,
  activeHeat: null,
  runners: [],
  raceModel: null,
  currentSnapshot: null,
  renderLaneByRunnerId: {},
};

const sfxManager = new SfxManager();
if (CONFIG.sfxEnabled) sfxManager.init();

const runnersLayer = document.getElementById("runnersLayer");
const startListContainer = document.getElementById("startListContainer");
const focusIndicator = document.getElementById("focusIndicator");
const timerEl = document.getElementById("timer");
const lapCounterEl = document.getElementById("lapCounter");
const commentaryBoxEl = document.getElementById("commentaryBox");
const eventTitleEl = document.getElementById("eventTitle");
const trackBadgeEl = document.getElementById("trackBadge");
const raceDurationEl = document.getElementById("raceDuration");
const trackSvgEl = document.getElementById("trackSvg");
const checkpointMarkersEl = document.getElementById("checkpointMarkers");
const liveLeaderLabelEl = document.getElementById("liveLeaderLabel");
const liveLeaderTimeEl = document.getElementById("liveLeaderTime");
const focusRunnerLabelEl = document.getElementById("focusRunnerLabel");
const focusRunnerTimeEl = document.getElementById("focusRunnerTime");
const splitCells = [
  document.getElementById("split200"),
  document.getElementById("split400"),
  document.getElementById("split600"),
  document.getElementById("split800"),
];
const splitCellLabels = ["0-200", "200-400", "400-600", "600-800"];
const SVG_NS = "http://www.w3.org/2000/svg";

function getSnapshot() {
  return state.currentSnapshot;
}

function getFocusRunner() {
  return state.runners.find((runner) => runner.highlight) || state.runners[0] || null;
}

function getLeader() {
  const snapshot = getSnapshot();
  if (!snapshot || snapshot.leaderId == null) return null;
  return state.runners.find((runner) => runner.id === snapshot.leaderId) || null;
}

function getSortedByProgress() {
  const snapshot = getSnapshot();
  if (!snapshot) return [];
  return snapshot.orderedRunnerIds
    .map((id) => state.runners.find((runner) => runner.id === id))
    .filter(Boolean);
}

function updateHeatSummary() {
  const snapshot = getSnapshot();
  const focusRunner = getFocusRunner();
  const leader = getLeader();
  const leaderState = leader && snapshot ? snapshot.getRunnerState(leader.id) : null;
  const completedLegs = Math.min(4, Math.floor((leaderState?.officialDistance || 0) / 200));

  if (state.raceTime === 0) {
    commentaryBoxEl.innerText = `${state.activeHeat.heat_id} at ${state.event.venue}. ${state.runners.length} athletes are loaded and ready to replay from the lane stagger start.`;
    return;
  }

  if (completedLegs === 0 && leader) {
    commentaryBoxEl.innerText = `${leader.fullName} gets the field underway from lane ${leader.lane}.`;
    return;
  }

  if (leader && completedLegs > 0 && completedLegs <= 4) {
    const splitTime = snapshot.getSplitTimeForRunner(leader.id, completedLegs * 200);
    const splitMark = completedLegs * 200;
    commentaryBoxEl.innerText = `${leader.fullName} leads through ${splitMark}m in ${formatTime(splitTime)}. ${focusRunner ? `${focusRunner.fullName} is at ${formatTime(state.raceTime)} race time.` : ""}`.trim();
  }
}

function updateHeatMeta() {
  const leader = [...state.runners].sort((a, b) => a.finalTime - b.finalTime)[0];

  eventTitleEl.innerText = state.replayTitle || `${state.event.name} ${state.activeHeat.heat_id}`;
  trackBadgeEl.innerText = `${state.event.track_length_m}m Banked | ${state.event.race_distance_m / state.event.track_length_m} Laps`;
  raceDurationEl.innerText = leader ? formatTime(leader.finalTime) : "--:--";
  document.title = `${eventTitleEl.innerText} | Race Replay`;
}

function renderCheckpointMarkers() {
  if (!checkpointMarkersEl || !state.raceModel) return;

  checkpointMarkersEl.innerHTML = "";
  const svgWidth = trackSvgEl?.viewBox?.baseVal?.width || 350;
  const splitMarks = state.raceModel.event.split_marks_m.filter(
    (mark) => mark < state.raceModel.event.race_distance_m,
  );
  const groupedSegments = new Map();

  splitMarks.forEach((mark) => {
    const { inner, outer } = getCheckpointSegment(mark, {
      lapDistance: state.raceModel.event.track_length_m,
    });
    const key = [
      outer.x.toFixed(2),
      outer.y.toFixed(2),
      inner.x.toFixed(2),
      inner.y.toFixed(2),
    ].join(":");

    if (!groupedSegments.has(key)) {
      groupedSegments.set(key, { inner, outer, marks: [] });
    }

    groupedSegments.get(key).marks.push(mark);
  });

  groupedSegments.forEach(({ inner, outer, marks }) => {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", outer.x.toFixed(2));
    line.setAttribute("y1", outer.y.toFixed(2));
    line.setAttribute("x2", inner.x.toFixed(2));
    line.setAttribute("y2", inner.y.toFixed(2));
    line.setAttribute("class", "split-line");
    checkpointMarkersEl.appendChild(line);

    marks.forEach((mark, index) => {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("class", "checkpoint-label");
      const isNearRightEdge = outer.x > (svgWidth - 40);
      const labelX = isNearRightEdge ? (outer.x - 8) : (outer.x + 12);
      label.setAttribute("x", labelX.toFixed(2));
      label.setAttribute("y", (outer.y + 30 + (index * 11)).toFixed(2));
      label.setAttribute("text-anchor", isNearRightEdge ? "end" : "start");
      label.textContent = `${mark}m`;
      checkpointMarkersEl.appendChild(label);
    });
  });
}

function updateLiveSplitsPanel() {
  const snapshot = getSnapshot();
  const focusRunner = getFocusRunner();
  const leader = getLeader();
  const leaderState = leader && snapshot ? snapshot.getRunnerState(leader.id) : null;
  const focusState = focusRunner && snapshot ? snapshot.getRunnerState(focusRunner.id) : null;
  const raceComplete = snapshot?.isComplete || false;

  if (leader && leaderState) {
    liveLeaderLabelEl.innerText = raceComplete ? `Winner (${leader.fullName})` : `Leader (${leader.fullName})`;
    liveLeaderTimeEl.innerText = raceComplete
      ? (leader.displayTime || formatTime(leader.finalTime))
      : `${leaderState.officialDistance.toFixed(0)}m`;
  } else {
    liveLeaderLabelEl.innerText = "Leader";
    liveLeaderTimeEl.innerText = "--";
  }

  if (!focusRunner) {
    focusRunnerLabelEl.innerText = "Focus Runner";
    focusRunnerTimeEl.innerText = "--";
    splitCells.forEach((cell) => {
      cell.innerText = "--";
      cell.parentElement.dataset.state = "pending";
    });
    return;
  }

  focusRunnerLabelEl.innerText = raceComplete
    ? `${focusRunner.fullName} (Lane ${focusRunner.lane})`
    : `${focusRunner.fullName} Live`;
  focusRunnerTimeEl.innerText = raceComplete
    ? (focusRunner.displayTime || formatTime(focusRunner.finalTime))
    : `${focusState.officialDistance.toFixed(0)}m`;

  focusRunner.segmentSplits.forEach((split, index) => {
    const splitMark = snapshot.event.split_marks_m[index];
    if (!splitCells[index]) return;

    const isReached = raceComplete || focusState.checkpoints[splitMark];
    splitCells[index].innerText = isReached ? split.toFixed(2) : "--";
    splitCells[index].parentElement.dataset.state = isReached ? "reached" : "pending";
  });
}

function initRunners() {
  runnersLayer.querySelectorAll(".runner-dot").forEach((node) => node.remove());
  startListContainer.innerHTML = "";

  state.runners.forEach((runner) => {
    const dot = document.createElement("div");
    dot.className = "runner-dot";
    dot.style.backgroundColor = runner.highlight ? "#F97316" : "#3B82F6";
    dot.dataset.runnerId = runner.id;

    const badge = document.createElement("div");
    badge.className = "position-badge";
    badge.id = `badge-${runner.id}`;
    badge.style.display = "none";
    dot.appendChild(badge);

    dot.id = `runner-${runner.id}`;
    dot.innerText = runner.markerLabel || runner.bibLabel;
    dot.appendChild(badge);

    runnersLayer.appendChild(dot);

    const entry = document.createElement("div");
    entry.className = `flex items-center gap-2 p-1.5 rounded hover:bg-gray-700/50 transition ${
      runner.highlight ? "bg-orange-500/20" : ""
    }`;
    entry.innerHTML = `
      <div class="w-8 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white bg-slate-700">
        L${runner.lane}
      </div>
      <div class="flex-grow min-w-0">
        <div class="font-bold truncate text-white ${runner.highlight ? "text-orange-400" : ""}">${runner.fullName}</div>
        <div class="text-gray-400 truncate text-[10px]">${runner.team}${runner.year ? ` | Year ${runner.year}` : ""}</div>
      </div>
      <div class="text-right text-gray-500 font-mono text-[10px]">
        ${runner.displayTime || formatTime(runner.finalTime)}
      </div>
    `;

    startListContainer.appendChild(entry);
  });
}

function updateLapUI() {
  const snapshot = getSnapshot();
  const focusRunner = getFocusRunner();
  const lapDots = document.querySelectorAll(".lap-dot");

  if (!focusRunner) return;

  const focusState = snapshot?.getRunnerState(focusRunner.id);
  const currentLap = Math.min(4, (focusState?.lapIndex || 0) + 1);
  lapCounterEl.innerText = `Lap ${currentLap} of 4`;

  lapDots.forEach((dot, index) => {
    if (index < currentLap) dot.classList.add("active");
    else dot.classList.remove("active");
  });
}

function updateLeaderHighlight() {
  document.querySelectorAll(".runner-dot").forEach((dot) => {
    dot.classList.remove("position-1", "position-2", "position-3");
  });

  getSortedByProgress().slice(0, 3).forEach((runner, index) => {
    const dot = document.getElementById(`runner-${runner.id}`);
    const badge = document.getElementById(`badge-${runner.id}`);
    if (!dot || !badge) return;

    dot.classList.add(`position-${index + 1}`);
    badge.innerText = String(index + 1);
    badge.className = `position-badge ${["gold", "silver", "bronze"][index]}`;
    badge.style.display = "block";
  });

  getSortedByProgress().slice(3).forEach((runner) => {
    const badge = document.getElementById(`badge-${runner.id}`);
    if (badge) badge.style.display = "none";
  });
}

function updateFocusIndicator() {
  const focusRunner = getFocusRunner();
  const targetRunner = focusRunner ? document.getElementById(`runner-${focusRunner.id}`) : null;

  if (!targetRunner) {
    focusIndicator.classList.remove("active");
    return;
  }

  focusIndicator.style.top = targetRunner.style.top;
  focusIndicator.style.left = targetRunner.style.left;
  focusIndicator.classList.add("active");
}

function updateRunnerPositions(deltaSeconds = 0) {
  let finishedCount = 0;
  const snapshot = getSnapshot();
  if (!snapshot) return finishedCount;
  const maxLaneChangePerSecond = 6;

  state.runners.forEach((runner) => {
    const runnerState = snapshot.getRunnerState(runner.id);
    const dot = document.getElementById(`runner-${runner.id}`);

    if (!dot || !runnerState) return;

    const previousLane = state.renderLaneByRunnerId[runner.id] ?? runnerState.displayLane;
    const targetLane = runnerState.displayLane;
    const maxStep = Math.max(0.02, deltaSeconds * maxLaneChangePerSecond);
    const laneDelta = targetLane - previousLane;
    const smoothedLane = Math.abs(laneDelta) <= maxStep
      ? targetLane
      : previousLane + (Math.sign(laneDelta) * maxStep);
    const smoothedPosition = getTrackCoordinates(runnerState.officialDistance, smoothedLane, {
      lapDistance: snapshot.event.track_length_m,
      startOffsetMeters: runnerState.longitudinalOffset,
    });

    state.renderLaneByRunnerId[runner.id] = smoothedLane;
    dot.style.left = `${smoothedPosition.x}px`;
    dot.style.top = `${smoothedPosition.y}px`;
    dot.style.opacity = runnerState.phase === "finished" ? "0.35" : "1";
    dot.style.zIndex = runner.highlight ? "50" : "10";

    if (runnerState.phase === "finished") {
      finishedCount += 1;
    }
  });

  updateLeaderHighlight();
  updateFocusIndicator();
  return finishedCount;
}

function getLeaderDistance() {
  return getSnapshot()?.leaderDistance || 0;
}

function setButtonToPauseState() {
  document.getElementById("playIcon").classList.add("hidden");
  document.getElementById("pauseIcon").classList.remove("hidden");
  document.getElementById("btnText").innerText = "PAUSE";
  document.getElementById("btnStart").classList.remove("bg-green-600", "hover:bg-green-700");
  document.getElementById("btnStart").classList.add("bg-yellow-600", "hover:bg-yellow-700");
}

function setButtonToStartResumeState() {
  document.getElementById("playIcon").classList.remove("hidden");
  document.getElementById("pauseIcon").classList.add("hidden");
  document.getElementById("btnText").innerText = state.raceTime > 0 ? "RESUME" : "START";
  document.getElementById("btnStart").classList.remove("bg-yellow-600", "hover:bg-yellow-700");
  document.getElementById("btnStart").classList.add("bg-green-600", "hover:bg-green-700");
}

function setButtonToFinishedState() {
  document.getElementById("btnText").innerText = "FINISHED";
  document.getElementById("playIcon").classList.remove("hidden");
  document.getElementById("pauseIcon").classList.add("hidden");
  document.getElementById("btnStart").classList.remove("bg-yellow-600", "hover:bg-yellow-700");
  document.getElementById("btnStart").classList.add("bg-gray-600");
}

function updatePositions(timestampMs) {
  if (!state.isRunning) return;

  if (state.lastFrameTs == null) {
    state.lastFrameTs = timestampMs;
  }

  const deltaSeconds = Math.max(0, (timestampMs - state.lastFrameTs) / 1000);
  state.lastFrameTs = timestampMs;
  state.raceTime += deltaSeconds * state.speed;
  state.currentSnapshot = state.raceModel.getSnapshot(state.raceTime);
  timerEl.innerText = formatTime(state.raceTime);

  if (state.raceTime >= 0 && state.raceTime < 0.5 && !state.startHornPlayed) {
    sfxManager.playStartHorn();
    state.startHornPlayed = true;
  }

  const leaderDistance = getLeaderDistance();
  if (leaderDistance >= 400 && state.lastLapBellDistance < 400) {
    sfxManager.playLapBell();
  }
  if (leaderDistance >= 600 && state.lastLapBellDistance < 600) {
    sfxManager.playLapBell();
  }
  state.lastLapBellDistance = leaderDistance;

  updateLapUI();
  updateHeatSummary();
  updateLiveSplitsPanel();

  const finishedCount = updateRunnerPositions(deltaSeconds);
  if (finishedCount > 0 && !state.finishPlayed) {
    sfxManager.playFinishWhistle();
    sfxManager.playCrowdCheer();
    state.finishPlayed = true;
  }

  if (finishedCount === state.runners.length) {
    stopRace();
    return;
  }

  requestAnimationFrame(updatePositions);
}

export function startRace() {
  if (state.isRunning || state.runners.length === 0) return;

  state.isRunning = true;
  setButtonToPauseState();
  state.lastFrameTs = null;
  requestAnimationFrame(updatePositions);
}

export function pauseRace() {
  state.isRunning = false;
  state.lastFrameTs = null;
  setButtonToStartResumeState();
}

export function stopRace() {
  state.isRunning = false;
  state.lastFrameTs = null;
  setButtonToFinishedState();
}

export function resetRace() {
  state.isRunning = false;
  state.raceTime = 0;
  state.lastFrameTs = null;
  state.startHornPlayed = false;
  state.lastLapBellDistance = 0;
  state.finishPlayed = false;
  state.currentSnapshot = state.raceModel.getSnapshot(state.raceTime);
  state.renderLaneByRunnerId = {};

  timerEl.innerText = "0:00.00";
  lapCounterEl.innerText = "Lap 1 of 4";
  setButtonToStartResumeState();

  document.querySelectorAll(".lap-dot").forEach((dot, index) => {
    if (index === 0) dot.classList.add("active");
    else dot.classList.remove("active");
  });

  splitCells.forEach((cell, index) => {
    cell.innerText = "--";
    cell.parentElement.dataset.state = "pending";
    cell.parentElement.firstChild.textContent = splitCellLabels[index];
  });

  state.runners.forEach((runner) => {
    const runnerState = state.currentSnapshot.getRunnerState(runner.id);
    const dot = document.getElementById(`runner-${runner.id}`);
    const badge = document.getElementById(`badge-${runner.id}`);

    if (dot && runnerState) {
      state.renderLaneByRunnerId[runner.id] = runnerState.displayLane;
      dot.style.left = `${runnerState.trackPosition.x}px`;
      dot.style.top = `${runnerState.trackPosition.y}px`;
      dot.style.opacity = "1";
      dot.classList.remove("position-1", "position-2", "position-3");
    }

    if (badge) badge.style.display = "none";
  });

  updateHeatSummary();
  updateLiveSplitsPanel();
  updateFocusIndicator();
}

export function toggleRace() {
  if (state.isRunning) pauseRace();
  else startRace();
}

window.toggleRace = toggleRace;
window.resetRace = resetRace;

const speedSlider = document.getElementById("speedSlider");
const speedDisplay = document.getElementById("speedDisplay");

if (speedSlider) {
  speedSlider.addEventListener("input", (event) => {
    state.speed = parseFloat(event.target.value);
    speedDisplay.innerText = `${state.speed}x`;
  });
}

async function init() {
  const replayData = await loadHeatData();
  state.replayId = replayData.replayId;
  state.replayTitle = replayData.replayTitle;
  state.event = replayData.event;
  state.activeHeat = replayData.activeHeat;
  state.runners = replayData.runners;
  state.raceModel = createRaceModel(state.event, state.runners);
  state.currentSnapshot = state.raceModel.getSnapshot(0);

  updateHeatMeta();
  renderCheckpointMarkers();
  initRunners();
  resetRace();
}

init().catch((error) => {
  commentaryBoxEl.innerText = `Unable to load heat data: ${error.message}`;
  console.error(error);
});
