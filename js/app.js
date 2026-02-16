import {
  RUNNERS,
  AUDIO_CLIPS,
  RUNNER_CHECKPOINTS_TEMPLATE,
  GLOBAL_EVENTS_TEMPLATE,
  PRE_RACE_START_SECONDS,
} from "./data.js";
import { formatTime, getDistanceAtTime, getTrackCoordinates } from "./utils.js";
import { CommentaryEngine } from "./commentary-engine.js";
import { AudioManager } from "./audio-manager.js";
import { SfxManager } from "./sfx-manager.js";

const CONFIG = {
  audioEnabled: false,  // Toggle commentary audio on/off here
  sfxEnabled: true,     // Toggle sound effects on/off here
};

const state = {
  raceTime: 0,
  speed: 1,
  isRunning: false,
  currentFocusRunnerId: null,
  lastFrameTs: null,
  // SFX tracking
  startHornPlayed: false,
  lastLapBellDistance: 0,
  finishPlayed: false,
};

const commentaryEngine = new CommentaryEngine({
  runners: RUNNERS,
  audioClips: AUDIO_CLIPS,
  runnerCheckpointTemplate: RUNNER_CHECKPOINTS_TEMPLATE,
  globalEventsTemplate: GLOBAL_EVENTS_TEMPLATE,
});

const audioManager = new AudioManager(AUDIO_CLIPS, { enabled: CONFIG.audioEnabled });
const sfxManager = new SfxManager();
if (CONFIG.sfxEnabled) sfxManager.init();

const runnersLayer = document.getElementById("runnersLayer");
const startListContainer = document.getElementById("startListContainer");
const focusIndicator = document.getElementById("focusIndicator");
const timerEl = document.getElementById("timer");
const lapCounterEl = document.getElementById("lapCounter");
const commentaryBoxEl = document.getElementById("commentaryBox");

function initRunners() {
  RUNNERS.forEach((runner, index) => {
    const dot = document.createElement("div");
    dot.className = "runner-dot";
    dot.style.backgroundColor = runner.color;

    const laneOffset = (index % 3) * 8 - 4;
    dot.dataset.offset = laneOffset;

    if (runner.highlight) {
      dot.style.border = "3px solid white";
      dot.style.zIndex = "50";
      dot.style.transform = "translate(-50%, -50%) scale(1.3)";
    }

    dot.id = `runner-${runner.id}`;
    dot.innerText = runner.bib;

    if (runner.highlight) {
      const label = document.createElement("div");
      label.className = "runner-label";
      label.innerText = "Skye";
      dot.appendChild(label);
    }

    runnersLayer.appendChild(dot);

    const entry = document.createElement("div");
    entry.className = `flex items-center gap-2 p-1.5 rounded hover:bg-gray-700/50 transition ${
      runner.highlight ? "bg-orange-500/20" : ""
    }`;
    entry.innerHTML = `
      <div class="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white" style="background-color: ${runner.color}">
          ${runner.bib}
      </div>
      <div class="flex-grow min-w-0">
          <div class="font-bold truncate text-white ${runner.highlight ? "text-orange-400" : ""}">${runner.fullName}</div>
          <div class="text-gray-400 truncate text-[10px]">${runner.team} | Age ${runner.age}</div>
      </div>
      <div class="text-right text-gray-500 font-mono text-[10px]">
          ${runner.splits[4] ? formatTime(runner.splits[4]) : "--:--"}
      </div>
    `;

    startListContainer.appendChild(entry);
  });
}

function getRunnerById(id) {
  return RUNNERS.find((r) => r.id === id);
}

function getSkye() {
  return RUNNERS.find((r) => r.highlight) || RUNNERS[7];
}

function getLeaderDistance() {
  let maxDist = 0;
  RUNNERS.forEach((runner) => {
    const dist = getDistanceAtTime(runner.splits, state.raceTime);
    if (dist > maxDist) maxDist = dist;
  });
  return maxDist;
}

function updateLapUI() {
  let currentLap = 1;

  if (state.raceTime < 0) {
    const secondsToStart = Math.ceil(Math.abs(state.raceTime));
    lapCounterEl.innerText = `Race starts in ${secondsToStart}...`;
  } else {
    const skyeDist = getDistanceAtTime(getSkye().splits, state.raceTime);
    currentLap = Math.min(4, Math.floor(skyeDist / 200) + 1);
    lapCounterEl.innerText = `Lap ${currentLap} of 4`;
  }

  const lapDots = document.querySelectorAll(".lap-dot");
  lapDots.forEach((dot, idx) => {
    if (idx < currentLap) dot.classList.add("active");
    else dot.classList.remove("active");
  });
}

function highlightMentionedRunners(text) {
  document.querySelectorAll(".runner-dot.mentioned").forEach((dot) => {
    dot.classList.remove("mentioned");
  });

  const mentionedIds = [];

  RUNNERS.forEach((runner) => {
    const nameRegex = new RegExp(`\\b${runner.fullName}\\b`, "i");
    const bibRegex = new RegExp(`\\(${runner.bib}\\)`);

    if (nameRegex.test(text) || bibRegex.test(text)) {
      mentionedIds.push(runner.id);
      const dot = document.getElementById(`runner-${runner.id}`);
      if (dot) {
        dot.classList.add("mentioned");
        setTimeout(() => dot.classList.remove("mentioned"), 1600);
      }
    }
  });

  return mentionedIds;
}

function updateCommentary(event) {
  if (!event) return;

  const { audioIdx, subjectId, text } = event;

  if (commentaryBoxEl.innerText !== text) {
    commentaryBoxEl.innerText = text;
    commentaryBoxEl.parentElement.classList.add("ring-2", "ring-blue-500");
    setTimeout(() => commentaryBoxEl.parentElement.classList.remove("ring-2", "ring-blue-500"), 300);
  }

  highlightMentionedRunners(text);

  if (CONFIG.audioEnabled && audioManager) {
    audioManager.play(audioIdx);
  }

  if (!subjectId) {
    focusIndicator.classList.remove("active");
    state.currentFocusRunnerId = null;
  } else {
    state.currentFocusRunnerId = subjectId;
  }
}

function updateFocusIndicator() {
  if (state.currentFocusRunnerId) {
    const targetRunner = document.getElementById(`runner-${state.currentFocusRunnerId}`);
    if (targetRunner) {
      focusIndicator.style.top = targetRunner.style.top;
      focusIndicator.style.left = targetRunner.style.left;
      focusIndicator.classList.add("active");
      return;
    }
  }

  if (!audioManager.isCurrentlyPlaying()) {
    state.currentFocusRunnerId = null;
  }
  focusIndicator.classList.remove("active");
}

function updateRunnerPositions() {
  let finishedCount = 0;

  RUNNERS.forEach((runner) => {
    const effectiveTime = state.raceTime < 0 ? 0 : state.raceTime;
    const dist = getDistanceAtTime(runner.splits, effectiveTime);
    const coords = getTrackCoordinates(dist);
    const dot = document.getElementById(`runner-${runner.id}`);
    const offset = parseFloat(dot.dataset.offset || "0");

    dot.style.left = `${coords.x + offset}px`;
    dot.style.top = `${coords.y}px`;

    if (dist >= 800) {
      dot.style.opacity = "0.3";
      finishedCount += 1;
    }
  });

  return finishedCount;
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
  document.getElementById("btnText").innerText = state.raceTime >= 0 ? "RESUME" : "START";
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
  timerEl.innerText = formatTime(state.raceTime);

  // SFX: Start horn at race start
  if (state.raceTime >= 0 && state.raceTime < 0.5 && !state.startHornPlayed) {
    sfxManager.playStartHorn();
    state.startHornPlayed = true;
  }

  // SFX: Lap bells at 400m and 600m
  const leaderDist = getLeaderDistance();
  if (leaderDist >= 400 && state.lastLapBellDistance < 400) {
    sfxManager.playLapBell();
  }
  if (leaderDist >= 600 && state.lastLapBellDistance < 600) {
    sfxManager.playLapBell();
  }
  state.lastLapBellDistance = leaderDist;

  updateLapUI();

  const event = commentaryEngine.nextEvent({
    raceTime: state.raceTime,
    isAudioPlaying: audioManager.isCurrentlyPlaying(),
  });
  updateCommentary(event);

  updateFocusIndicator();

  const finishedCount = updateRunnerPositions();
  
  // SFX: Finish whistle when first runner crosses
  if (finishedCount > 0 && !state.finishPlayed) {
    sfxManager.playFinishWhistle();
    sfxManager.playCrowdCheer();
    state.finishPlayed = true;
  }

  if (finishedCount === RUNNERS.length) {
    stopRace();
  } else {
    requestAnimationFrame(updatePositions);
  }
}

export function startRace() {
  if (state.isRunning) return;

  state.isRunning = true;

  if (state.raceTime === 0) {
    state.raceTime = 0;
  }

  setButtonToPauseState();
  state.lastFrameTs = null;
  requestAnimationFrame(updatePositions);
}

export function pauseRace() {
  state.isRunning = false;
  state.lastFrameTs = null;
  setButtonToStartResumeState();
  audioManager.stopAll();
  state.currentFocusRunnerId = null;
  focusIndicator.classList.remove("active");
}

export function stopRace() {
  state.isRunning = false;
  state.lastFrameTs = null;
  setButtonToFinishedState();
  focusIndicator.classList.remove("active");
}

export function resetRace() {
  state.isRunning = false;
  state.raceTime = 0;
  state.currentFocusRunnerId = null;
  state.lastFrameTs = null;
  state.startHornPlayed = false;
  state.lastLapBellDistance = 0;
  state.finishPlayed = false;

  commentaryEngine.reset();
  audioManager.stopAll();

  timerEl.innerText = "0:00.00";
  lapCounterEl.innerText = "Lap 1 of 4";
  commentaryBoxEl.innerText = "Runners at the line...";
  focusIndicator.classList.remove("active");

  document.getElementById("playIcon").classList.remove("hidden");
  document.getElementById("pauseIcon").classList.add("hidden");
  document.getElementById("btnText").innerText = "START";
  document.getElementById("btnStart").classList.remove("bg-yellow-600", "hover:bg-yellow-700", "bg-gray-600");
  document.getElementById("btnStart").classList.add("bg-green-600", "hover:bg-green-700");

  const lapDots = document.querySelectorAll(".lap-dot");
  lapDots.forEach((dot, idx) => {
    if (idx === 0) dot.classList.add("active");
    else dot.classList.remove("active");
  });

  RUNNERS.forEach((runner) => {
    const coords = getTrackCoordinates(0);
    const dot = document.getElementById(`runner-${runner.id}`);
    const offset = parseFloat(dot.dataset.offset || "0");
    dot.style.left = `${coords.x + offset}px`;
    dot.style.top = `${coords.y}px`;
    dot.style.opacity = "1";
  });
}

export function toggleRace() {
  if (state.isRunning) pauseRace();
  else startRace();
}

export function toggleAudio() {
  CONFIG.audioEnabled = !CONFIG.audioEnabled;
  if (audioManager) {
    audioManager.setEnabled(CONFIG.audioEnabled);
  }
  console.log("Audio enabled:", CONFIG.audioEnabled);
  return CONFIG.audioEnabled;
}

window.toggleRace = toggleRace;
window.resetRace = resetRace;
window.toggleAudio = toggleAudio;

const speedSlider = document.getElementById("speedSlider");
const speedDisplay = document.getElementById("speedDisplay");

if (speedSlider) {
  speedSlider.addEventListener("input", (e) => {
    state.speed = parseFloat(e.target.value);
    speedDisplay.innerText = state.speed + "x";
  });
}

initRunners();
resetRace();
