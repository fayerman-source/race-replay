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
  // Lane tracking
  runnerLanes: {},      // runnerId -> lane index (0-5, inner to outer)
  prevPositions: {},    // runnerId -> previous distance
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

// Sort runners by bib number for lane assignment
function getSortedRunnersByBib() {
  return [...RUNNERS].sort((a, b) => a.bib - b.bib);
}

// Initialize runners with lanes based on bib number
function initRunners() {
  const sortedRunners = getSortedRunnersByBib();
  
  // Assign lanes: inner lanes (0-5) based on sorted bib order
  sortedRunners.forEach((runner, index) => {
    state.runnerLanes[runner.id] = index % 6;  // 6 lanes
  });

  RUNNERS.forEach((runner, index) => {
    const dot = document.createElement("div");
    dot.className = "runner-dot";
    dot.style.backgroundColor = runner.color;
    
    // Store lane in dataset
    dot.dataset.lane = state.runnerLanes[runner.id];
    dot.dataset.runnerId = runner.id;
    
    // Add position badge element
    const badge = document.createElement("div");
    badge.className = "position-badge";
    badge.id = `badge-${runner.id}`;
    badge.style.display = "none";
    dot.appendChild(badge);

    if (runner.highlight) {
      dot.style.zIndex = "50";
    }

    dot.id = `runner-${runner.id}`;
    dot.innerText = runner.bib;
    
    // Re-add the badge after innerText clears it
    dot.appendChild(badge);

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

// Calculate lane assignments based on overtaking
function updateLaneAssignments(positions) {
  // positions is array of {runnerId, distance, lane}
  // Sort by distance descending (leader first)
  const sorted = [...positions].sort((a, b) => b.distance - a.distance);
  
  // Assign lanes: leader gets inner lane, others get outer lanes
  // Use a simple algorithm: when A overtakes B, A gets the outer lane
  const usedLanes = new Set();
  
  sorted.forEach((p, rank) => {
    const runnerId = p.runnerId;
    const currentLane = state.runnerLanes[runnerId];
    const prevDist = state.prevPositions[runnerId] || 0;
    const currDist = p.distance;
    
    // Check if overtaken anyone in this frame
    let wasOvertaken = false;
    sorted.forEach((other) => {
      if (other.runnerId === runnerId) return;
      const otherPrev = state.prevPositions[other.runnerId] || 0;
      if (otherPrev > prevDist && currDist >= other.distance) {
        // We overtook this runner - move to outer lane
        wasOvertaken = true;
      }
      if (prevDist > otherPrev && other.distance >= currDist) {
        // We were overtaken - stay in inner lane
      }
    });
    
    // Determine target lane based on rank (rank 0 = 1st place)
    // Higher rank = more outer lane
    let targetLane = rank % 6;
    
    // Keep lane transition smooth
    if (currentLane !== undefined) {
      // Only change lanes if there's an overtake
      if (wasOvertaken && currentLane < 5) {
        targetLane = Math.min(5, currentLane + 1);
      } else if (!wasOvertaken && rank > 0 && currentLane > rank) {
        // Pull back when leading
        targetLane = rank;
      }
    }
    
    state.runnerLanes[runnerId] = targetLane;
    usedLanes.add(targetLane);
  });
  
  // Update previous positions for next frame
  positions.forEach(p => {
    state.prevPositions[p.runnerId] = p.distance;
  });
}

// Update leader highlighting
function updateLeaderHighlight(positions) {
  // Sort by distance descending
  const sorted = [...positions].sort((a, b) => b.distance - a.distance);
  
  // Remove all position classes first
  document.querySelectorAll('.runner-dot').forEach(dot => {
    dot.classList.remove('position-1', 'position-2', 'position-3');
  });
  
  // Apply positions to top 3
  sorted.slice(0, 3).forEach((p, idx) => {
    const dot = document.getElementById(`runner-${p.runnerId}`);
    const badge = document.getElementById(`badge-${p.runnerId}`);
    if (dot && idx < 3) {
      dot.classList.add(`position-${idx + 1}`);
      if (badge) {
        badge.innerText = idx + 1;
        badge.className = `position-badge ${['gold', 'silver', 'bronze'][idx]}`;
        badge.style.display = "block";
      }
    }
  });
  
  // Hide badges for runners not in top 3
  sorted.slice(3).forEach(p => {
    const badge = document.getElementById(`badge-${p.runnerId}`);
    if (badge) badge.style.display = "none";
  });
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

  RUNNERS.forEach((runner) => {
    const nameRegex = new RegExp(`\\b${runner.fullName}\\b`, "i");
    const bibRegex = new RegExp(`\\(${runner.bib}\\)`);

    if (nameRegex.test(text) || bibRegex.test(text)) {
      const dot = document.getElementById(`runner-${runner.id}`);
      if (dot) {
        dot.classList.add("mentioned");
        setTimeout(() => dot.classList.remove("mentioned"), 1600);
      }
    }
  });
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
  const positions = [];

  // First pass: calculate distances and positions
  RUNNERS.forEach((runner) => {
    const effectiveTime = state.raceTime < 0 ? 0 : state.raceTime;
    const dist = getDistanceAtTime(runner.splits, effectiveTime);
    const lane = state.runnerLanes[runner.id] !== undefined ? state.runnerLanes[runner.id] : 3;
    
    positions.push({
      runnerId: runner.id,
      distance: dist,
      lane: lane
    });
  });

  // Update lane assignments based on overtaking
  updateLaneAssignments(positions);

  // Update leader highlighting
  updateLeaderHighlight(positions);

  // Second pass: update visual positions
  RUNNERS.forEach((runner) => {
    const effectiveTime = state.raceTime < 0 ? 0 : state.raceTime;
    const dist = getDistanceAtTime(runner.splits, effectiveTime);
    const lane = state.runnerLanes[runner.id] || 3;
    
    const coords = getTrackCoordinates(dist, lane);
    const dot = document.getElementById(`runner-${runner.id}`);
    
    if (dot) {
      dot.dataset.lane = lane;
      dot.style.left = `${coords.x}px`;
      dot.style.top = `${coords.y}px`;
      
      // Raise highlighted runner (Skye) above others
      if (runner.highlight) {
        dot.style.zIndex = "50";
      } else {
        dot.style.zIndex = "10";
      }

      if (dist >= 800) {
        dot.style.opacity = "0.3";
        finishedCount += 1;
      } else {
        dot.style.opacity = "1";
      }
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
  
  // Reset lane assignments
  const sortedRunners = getSortedRunnersByBib();
  sortedRunners.forEach((runner, index) => {
    state.runnerLanes[runner.id] = index % 6;
    state.prevPositions[runner.id] = 0;
  });

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

  // Reset runner positions and clear leader badges
  RUNNERS.forEach((runner) => {
    const lane = state.runnerLanes[runner.id] || 3;
    const coords = getTrackCoordinates(0, lane);
    const dot = document.getElementById(`runner-${runner.id}`);
    if (dot) {
      dot.style.left = `${coords.x}px`;
      dot.style.top = `${coords.y}px`;
      dot.style.opacity = "1";
      dot.classList.remove('position-1', 'position-2', 'position-3');
    }
    const badge = document.getElementById(`badge-${runner.id}`);
    if (badge) badge.style.display = "none";
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
