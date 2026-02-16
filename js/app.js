import {
  RUNNERS,
  AUDIO_CLIPS,
  RUNNER_CHECKPOINTS_TEMPLATE,
  GLOBAL_EVENTS_TEMPLATE,
  PRE_RACE_START_SECONDS,
} from "./data.js";
import { formatTime, getDistanceAtTime, getTrackCoordinates } from "./utils.js";
import { CommentaryEngine } from "./commentary-engine.js";

const state = {
  raceTime: 0,
  speed: 1,
  isRunning: false,
  isAudioPlaying: false,
  currentFocusRunnerId: null,
  lastAudioIdx: -1,
};

const commentaryEngine = new CommentaryEngine({
  runners: RUNNERS,
  audioClips: AUDIO_CLIPS,
  runnerCheckpointTemplate: RUNNER_CHECKPOINTS_TEMPLATE,
  globalEventsTemplate: GLOBAL_EVENTS_TEMPLATE,
});

const audioElements = {};
AUDIO_CLIPS.forEach((clip, idx) => {
  const audio = new Audio(clip.file);
  audio.preload = "auto";
  audio.onended = () => {
    state.isAudioPlaying = false;
  };
  audioElements[idx] = audio;
});

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

function playCommentaryEvent(event) {
  if (!event) return;

  const { audioIdx, subjectId, text } = event;

  if (commentaryBoxEl.innerText !== text) {
    commentaryBoxEl.innerText = text;
    commentaryBoxEl.parentElement.classList.add("ring-2", "ring-blue-500");
    setTimeout(() => commentaryBoxEl.parentElement.classList.remove("ring-2", "ring-blue-500"), 300);
  }

  const audio = audioElements[audioIdx];
  if (!audio) return;

  state.isAudioPlaying = true;
  audio.currentTime = 0;
  audio.play().catch((e) => {
    console.log("Audio play failed:", e);
    state.isAudioPlaying = false;
  });

  state.lastAudioIdx = audioIdx;
  state.currentFocusRunnerId = subjectId || null;

  if (!subjectId) {
    focusIndicator.classList.remove("active");
  }
}

function updateFocusIndicator() {
  if (state.currentFocusRunnerId && state.isAudioPlaying) {
    const targetRunner = document.getElementById(`runner-${state.currentFocusRunnerId}`);
    if (targetRunner) {
      focusIndicator.style.top = targetRunner.style.top;
      focusIndicator.style.left = targetRunner.style.left;
      focusIndicator.classList.add("active");
      return;
    }
  }

  if (!state.isAudioPlaying) {
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

function stopAllAudio() {
  Object.values(audioElements).forEach((audio) => {
    if (!audio.paused) audio.pause();
    audio.currentTime = 0;
  });
  state.isAudioPlaying = false;
}

function updatePositions() {
  if (!state.isRunning) return;

  state.raceTime += (1 / 60) * state.speed;
  timerEl.innerText = formatTime(state.raceTime);

  updateLapUI();

  const event = commentaryEngine.nextEvent({
    raceTime: state.raceTime,
    isAudioPlaying: state.isAudioPlaying,
  });
  playCommentaryEvent(event);

  updateFocusIndicator();

  const finishedCount = updateRunnerPositions();
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
    state.raceTime = PRE_RACE_START_SECONDS;
  }

  setButtonToPauseState();
  requestAnimationFrame(updatePositions);
}

export function pauseRace() {
  state.isRunning = false;
  setButtonToStartResumeState();
  stopAllAudio();
  state.currentFocusRunnerId = null;
  focusIndicator.classList.remove("active");
}

export function stopRace() {
  state.isRunning = false;
  setButtonToFinishedState();
  focusIndicator.classList.remove("active");
}

export function resetRace() {
  state.isRunning = false;
  state.raceTime = 0;
  state.lastAudioIdx = -1;
  state.isAudioPlaying = false;
  state.currentFocusRunnerId = null;

  commentaryEngine.reset();
  stopAllAudio();

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

window.toggleRace = toggleRace;
window.resetRace = resetRace;

initRunners();
resetRace();
