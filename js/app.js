import {
  TRACK_CONFIG,
  configureTrackGeometry,
  formatTime,
  getCheckpointSegment,
  getLanePathLengthPx,
  getTrackCoordinates,
  getTrackVisualGeometry,
  escapeHtml,
} from "./utils.js";
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
  renderProgressByRunnerId: {},
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
const trackOuterPathEl = document.getElementById("trackOuterPath");
const trackInfieldPathEl = document.getElementById("trackInfieldPath");
const startFinishLineEl = document.getElementById("startFinishLine");
const laneLinesGroupEl = document.getElementById("laneLinesGroup");
const checkpointMarkersEl = document.getElementById("checkpointMarkers");
const liveLeaderLabelEl = document.getElementById("liveLeaderLabel");
const liveLeaderTimeEl = document.getElementById("liveLeaderTime");
const focusRunnerLabelEl = document.getElementById("focusRunnerLabel");
const focusRunnerTimeEl = document.getElementById("focusRunnerTime");
const splitGridEl = document.getElementById("splitGrid");
const recordsCardEl = document.getElementById("recordsCard");
const recordsListEl = document.getElementById("recordsList");
const photoFinishCardEl = document.getElementById("photoFinishCard");
const photoFinishImgEl = document.getElementById("photoFinishImg");
const photoFinishCaptionEl = document.getElementById("photoFinishCaption");
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

// The 1/2/3 badges rank by TRUE race order — distance covered (officialDistance,
// with finishing time as the tiebreak), which is exactly the official split
// data. This is the canonical definition of race position, so the badges always
// reflect the real race (in this WR run, Hodgkinson is 3rd→2nd→1st and never
// below 3rd). We deliberately do NOT rank by on-screen position: the staggered
// start and the lane merge decouple the visual order from the real order, so
// ranking on pixels would drop a runner below her true placing during the merge.
// Dropped-out runners (a DNF pacer) are excluded — they're out of the standings.
function getRaceOrderForBadges() {
  const snapshot = getSnapshot();
  if (!snapshot) return [];
  const droppedIds = new Set(
    snapshot.runnerStates.filter((s) => s.phase === "dnf").map((s) => s.id),
  );
  return snapshot.orderedRunnerIds
    .filter((id) => !droppedIds.has(id))
    .map((id) => state.runners.find((runner) => runner.id === id))
    .filter(Boolean);
}

function getSplitSegments(snapshot = getSnapshot()) {
  const splitMarks = snapshot?.event?.split_marks_m || [];
  let previousMark = 0;

  return splitMarks.map((mark, index) => {
    const label = `${previousMark}-${mark}`;
    previousMark = mark;
    return { mark, index, label };
  });
}

function renderSplitGrid() {
  if (!splitGridEl) return;

  splitGridEl.innerHTML = "";
  getSplitSegments().forEach(({ mark, label }) => {
    const cell = document.createElement("div");
    cell.dataset.state = "pending";
    cell.dataset.mark = String(mark);
    cell.innerHTML = `${escapeHtml(label)}<br><span class="text-white" data-role="split-value">--</span>`;
    splitGridEl.appendChild(cell);
  });
}

function renderRecords() {
  if (!recordsCardEl || !recordsListEl) return;
  const records = Array.isArray(state.event?.records) ? state.event.records : [];
  if (records.length === 0) {
    recordsCardEl.style.display = "none";
    return;
  }

  recordsListEl.innerHTML = records.filter(Boolean).map((record) => `
    <div class="flex items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1.5 min-w-0">
        <span class="text-[9px] font-bold text-blue-300 bg-blue-900/50 border border-blue-800 rounded px-1 py-0.5">${escapeHtml(record.label || "")}</span>
        <span class="text-gray-300 truncate">${escapeHtml(record.athlete || "")}${record.country ? ` (${escapeHtml(record.country)})` : ""}</span>
      </span>
      <span class="font-mono text-white flex-shrink-0">${escapeHtml(record.result || "")}</span>
    </div>`).join("");
  recordsCardEl.style.display = "block";
}

function revealPhotoFinish() {
  const src = state.event?.photo_finish;
  if (!photoFinishCardEl || !photoFinishImgEl || !src) return;
  if (!photoFinishImgEl.getAttribute("src")) photoFinishImgEl.setAttribute("src", src);
  if (photoFinishCaptionEl) photoFinishCaptionEl.innerText = state.event?.source?.provider || "";
  photoFinishCardEl.style.display = "block";
}

function hidePhotoFinish() {
  if (photoFinishCardEl) photoFinishCardEl.style.display = "none";
}

function updateHeatSummary() {
  const snapshot = getSnapshot();
  const focusRunner = getFocusRunner();
  const leader = getLeader();
  const leaderState = leader && snapshot ? snapshot.getRunnerState(leader.id) : null;
  const raceComplete = snapshot?.isComplete || false;
  const completedLegs = Math.min(4, Math.floor((leaderState?.officialDistance || 0) / 200));
  const commentary = state.event?.commentary || null;
  const leaderDistance = leaderState?.officialDistance || 0;

  if (state.raceTime === 0) {
    if (commentary?.pre_start) {
      commentaryBoxEl.innerText = commentary.pre_start;
      return;
    }
    commentaryBoxEl.innerText = `${state.activeHeat.heat_id} at ${state.event.venue}. ${state.runners.length} athletes are loaded and ready to replay from the lane stagger start.`;
    return;
  }

  if (raceComplete && leader) {
    if (commentary?.finish) {
      commentaryBoxEl.innerText = commentary.finish;
      return;
    }
    const focusSummary = focusRunner
      ? ` ${focusRunner.fullName} finishes in ${focusRunner.displayTime || formatTime(focusRunner.finalTime)}.`
      : "";
    commentaryBoxEl.innerText = `${leader.fullName} wins in ${leader.displayTime || formatTime(leader.finalTime)}.${focusSummary}`.trim();
    return;
  }

  if (commentary) {
    if (leaderDistance >= 700 && commentary.closing) {
      commentaryBoxEl.innerText = commentary.closing;
      return;
    }
    if (leaderDistance >= 600 && commentary.through_600) {
      commentaryBoxEl.innerText = commentary.through_600;
      return;
    }
    if (leaderDistance >= 400 && commentary.through_400) {
      commentaryBoxEl.innerText = commentary.through_400;
      return;
    }
    if (leaderDistance >= 200 && commentary.through_200) {
      commentaryBoxEl.innerText = commentary.through_200;
      return;
    }
    if (commentary.opening) {
      commentaryBoxEl.innerText = commentary.opening;
      return;
    }
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
  // 200m indoor ovals are banked; 400m outdoor tracks are flat. Drive the label
  // off the lap length so an outdoor race isn't mislabelled "Banked".
  const trackSurface = state.event.track_length_m <= 200 ? "Banked" : "Outdoor";
  trackBadgeEl.innerText = `${state.event.track_length_m}m ${trackSurface} | ${state.event.lane_count} Lanes | ${getTotalLaps()} Laps`;
  raceDurationEl.innerText = leader ? formatTime(leader.finalTime) : "--:--";
  document.title = `${eventTitleEl.innerText} | Race Replay`;
}

function renderTrackGeometry() {
  if (!trackOuterPathEl || !trackInfieldPathEl || !laneLinesGroupEl || !state.event) return;

  const laneCount = state.event.lane_count || TRACK_CONFIG.laneCount;
  const geometry = getTrackVisualGeometry(laneCount);

  trackOuterPathEl.setAttribute("d", geometry.outerPath);
  trackOuterPathEl.setAttribute("class", "track-surface");
  trackInfieldPathEl.setAttribute("d", geometry.infieldPath);
  trackInfieldPathEl.setAttribute("class", "track-infield");

  // Keep the start/finish line spanning only the running band (inner lane edge
  // → outer edge). Without this it stays at the static 8-lane inner edge and
  // overhangs into the infield on 6-lane tracks.
  if (startFinishLineEl) {
    startFinishLineEl.setAttribute("x1", geometry.startFinish.x1);
    startFinishLineEl.setAttribute("x2", geometry.startFinish.x2);
    startFinishLineEl.setAttribute("y1", geometry.startFinish.y);
    startFinishLineEl.setAttribute("y2", geometry.startFinish.y);
  }

  // Pin the STA/FIN labels just outside the line's outer end so they follow the
  // oval whatever shape configureTrackGeometry installed (the line moves with it).
  const staLabelEl = document.getElementById("staLabel");
  const finLabelEl = document.getElementById("finLabel");
  if (staLabelEl && finLabelEl) {
    const labelX = (geometry.startFinish.x2 + 6).toFixed(2);
    staLabelEl.setAttribute("x", labelX);
    staLabelEl.setAttribute("y", (geometry.startFinish.y - 3).toFixed(2));
    finLabelEl.setAttribute("x", labelX);
    finLabelEl.setAttribute("y", (geometry.startFinish.y + 9).toFixed(2));
  }

  laneLinesGroupEl.innerHTML = "";
  geometry.lanePaths.forEach((pathData) => {
    const lanePath = document.createElementNS(SVG_NS, "path");
    lanePath.setAttribute("d", pathData);
    lanePath.setAttribute("class", "lane-line");
    lanePath.setAttribute("fill", "none");
    laneLinesGroupEl.appendChild(lanePath);
  });
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
      laneCount: state.raceModel.event.lane_count,
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
    splitGridEl?.querySelectorAll("[data-mark]").forEach((cell) => {
      const valueEl = cell.querySelector("[data-role='split-value']");
      if (valueEl) valueEl.textContent = "--";
      cell.dataset.state = "pending";
    });
    return;
  }

  focusRunnerLabelEl.innerText = raceComplete
    ? `${focusRunner.fullName} (Lane ${focusRunner.lane})`
    : `${focusRunner.fullName} Live`;
  focusRunnerTimeEl.innerText = raceComplete
    ? (focusRunner.displayTime || formatTime(focusRunner.finalTime))
    : `${focusState.officialDistance.toFixed(0)}m`;

  getSplitSegments(snapshot).forEach(({ mark }, index) => {
    const split = focusRunner.segmentSplits[index];
    const cell = splitGridEl?.querySelector(`[data-mark="${mark}"]`);
    if (!cell) return;
    const isReached = raceComplete || focusState.checkpoints[mark];
    const valueEl = cell.querySelector("[data-role='split-value']");
    if (valueEl) valueEl.textContent = Number.isFinite(split) && isReached ? split.toFixed(2) : "--";
    cell.dataset.state = isReached ? "reached" : "pending";
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

    const medalIcon = { Gold: "🥇", Silver: "🥈", Bronze: "🥉" }[runner.medal] || "";
    const subtitleParts = [escapeHtml(runner.team)];
    if (runner.year) subtitleParts.push(`Year ${escapeHtml(runner.year)}`);
    subtitleParts.push(`Lane ${runner.lane}`);
    if (runner.dnf) subtitleParts.push("DNF");

    const entry = document.createElement("div");
    entry.className = `flex items-center gap-2 p-1.5 rounded hover:bg-gray-700/50 transition ${
      runner.highlight ? "bg-orange-500/20" : ""
    }${runner.dnf ? " opacity-60" : ""}`;
    entry.innerHTML = `
      <div class="w-8 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white bg-slate-700" title="Bib / hip number">
        #${escapeHtml(String(runner.bib))}
      </div>
      <div class="flex-grow min-w-0">
        <div class="font-bold truncate text-white ${runner.highlight ? "text-orange-400" : ""}">${medalIcon ? `${medalIcon} ` : ""}${escapeHtml(runner.fullName)}</div>
        <div class="text-gray-400 truncate text-[10px]">${subtitleParts.join(" · ")}</div>
      </div>
      <div class="text-right text-gray-500 font-mono text-[10px]">
        ${escapeHtml(runner.displayTime || formatTime(runner.finalTime))}
      </div>
    `;

    startListContainer.appendChild(entry);
  });
}

// Laps = race distance / lap length (4 for indoor 800m on a 200m oval, 2 for
// an outdoor 800m on a 400m track). Rounded so float division never yields 1.9999.
function getTotalLaps() {
  const lapLength = state.event?.track_length_m || TRACK_CONFIG.trackLength;
  const raceDistance = state.event?.race_distance_m || TRACK_CONFIG.raceDistance;
  return Math.max(1, Math.round(raceDistance / lapLength));
}

// The lap-progress dots are markup, but the count is race-dependent, so rebuild
// them to match getTotalLaps() whenever a replay loads.
function renderLapDots() {
  const container = document.getElementById("lapDots");
  if (!container) return;
  const total = getTotalLaps();
  container.replaceChildren();
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement("div");
    dot.className = i === 0 ? "lap-dot active" : "lap-dot";
    container.appendChild(dot);
  }
}

function updateLapUI() {
  const snapshot = getSnapshot();
  const focusRunner = getFocusRunner();
  const lapDots = document.querySelectorAll(".lap-dot");

  if (!focusRunner) return;

  const totalLaps = getTotalLaps();
  const focusState = snapshot?.getRunnerState(focusRunner.id);
  const currentLap = Math.min(totalLaps, (focusState?.lapIndex || 0) + 1);
  lapCounterEl.innerText = `Lap ${currentLap} of ${totalLaps}`;

  lapDots.forEach((dot, index) => {
    if (index < currentLap) dot.classList.add("active");
    else dot.classList.remove("active");
  });
}

function updateLeaderHighlight() {
  document.querySelectorAll(".runner-dot").forEach((dot) => {
    dot.classList.remove("position-1", "position-2", "position-3");
  });

  // Hold the 1/2/3 badges until the field has an officially-timed order to
  // show: the leader reaching the first split mark. Before that, the gaps are
  // sub-meter interpolation noise and the lane stagger still places outer-lane
  // runners visually ahead, so any ranking would contradict what's on screen.
  // The threshold is the first timing checkpoint, so it self-adjusts to each
  // replay's interval (100m here, 200m for coarser-timed replays).
  const snapshot = getSnapshot();
  const firstSplitMark = snapshot?.event?.split_marks_m?.[0] ?? Infinity;
  const positionsAvailable = (snapshot?.leaderDistance ?? 0) >= firstSplitMark;

  if (!positionsAvailable) {
    document.querySelectorAll(".position-badge").forEach((badge) => {
      badge.style.display = "none";
    });
    return;
  }

  // Hide every badge first, then reveal only the top 3. (Hiding the complement
  // of the top-3 isn't enough: dropped-out runners are excluded from the render
  // order entirely, so they'd keep a stale badge from when they were leading.)
  state.runners.forEach((runner) => {
    const badge = document.getElementById(`badge-${runner.id}`);
    if (badge) badge.style.display = "none";
  });

  getRaceOrderForBadges().slice(0, 3).forEach((runner, index) => {
    const dot = document.getElementById(`runner-${runner.id}`);
    const badge = document.getElementById(`badge-${runner.id}`);
    if (!dot || !badge) return;

    dot.classList.add(`position-${index + 1}`);
    badge.innerText = String(index + 1);
    badge.className = `position-badge ${["gold", "silver", "bronze"][index]}`;
    badge.style.display = "block";
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
  const laneResponse = 3.2;
  const lapDistance = snapshot.event.track_length_m;
  const laneCount = snapshot.event.lane_count;
  const geomOptions = { lapDistance, laneCount };
  // Field-relative speed ceiling (m/s) → converted per-runner into a pixel
  // budget below. race-model.js derives this from the field's own splits.
  const maxSpeedMps = snapshot.event.max_plausible_speed_mps || Infinity;
  // Race-seconds elapsed this frame: wall-clock delta scaled by playback speed,
  // so the cap throttles real running speed, not the user's fast-forward.
  const raceSecondsThisFrame = Math.max(0, deltaSeconds) * state.speed;

  state.runners.forEach((runner) => {
    const runnerState = snapshot.getRunnerState(runner.id);
    const dot = document.getElementById(`runner-${runner.id}`);

    if (!dot || !runnerState) return;

    if (runnerState.phase === "dnf") {
      // Pacer has stepped off — park a dim marker in the infield near where
      // they dropped out, removed from the standings. Anchor from the runner's
      // CURRENT render lane (not lane 1) so they veer inward from where they
      // are rather than jumping laterally first; the CSS transition glides it.
      const anchorLane = state.renderLaneByRunnerId[runner.id] ?? runnerState.displayLane;
      const dropPosition = getTrackCoordinates(runnerState.officialDistance, anchorLane, geomOptions);
      const centerX = TRACK_CONFIG.svg.centerX;
      const centerY = (TRACK_CONFIG.svg.topY + TRACK_CONFIG.svg.bottomY) / 2;
      const infieldInset = 0.42;
      dot.style.left = `${dropPosition.x + ((centerX - dropPosition.x) * infieldInset)}px`;
      dot.style.top = `${dropPosition.y + ((centerY - dropPosition.y) * infieldInset)}px`;
      // Clear the inline opacity set during normal running so the .dnf class's
      // dimmed opacity actually takes effect (inline would otherwise win).
      dot.style.opacity = "";
      dot.classList.add("dnf");
      dot.classList.remove("position-1", "position-2", "position-3");
      dot.style.zIndex = "5";
      return;
    }
    dot.classList.remove("dnf");

    // 1. Unclamped targets — same intent as before: exponential ease toward the
    //    model's lane, monotonic (never-backward) forward progress.
    const previousLane = state.renderLaneByRunnerId[runner.id] ?? runnerState.displayLane;
    const targetLane = runnerState.displayLane;
    const laneBlend = 1 - Math.exp(-Math.max(0, deltaSeconds) * laneResponse);
    const unclampedLane = previousLane + ((targetLane - previousLane) * laneBlend);

    const targetVisualProgress = runnerState.officialDistance + runnerState.longitudinalOffset;
    const previousVisualProgress = state.renderProgressByRunnerId[runner.id] ?? targetVisualProgress;
    const unclampedVisualProgress = Math.max(previousVisualProgress, targetVisualProgress);

    // 2. Speed governor. Measure how far the marker WOULD jump on screen this
    //    frame (forward + lateral combined), and compare against the pixel
    //    budget implied by the field ceiling. The budget uses this lane's
    //    average px-per-meter so the cap means the same physical speed
    //    regardless of which lane the runner is cutting across.
    const previousPosition = getTrackCoordinates(previousVisualProgress, previousLane, geomOptions);
    let nextLane = unclampedLane;
    let nextVisualProgress = unclampedVisualProgress;
    let nextPosition = getTrackCoordinates(nextVisualProgress, nextLane, geomOptions);

    const pxPerMeter = getLanePathLengthPx(nextLane, laneCount) / lapDistance;
    const budgetPx = maxSpeedMps * raceSecondsThisFrame * pxPerMeter;
    const stepPx = Math.hypot(nextPosition.x - previousPosition.x, nextPosition.y - previousPosition.y);

    if (stepPx > budgetPx && stepPx > 0) {
      // Too fast: advance only the allowed fraction of the way toward the
      // target, scaling BOTH progress and lane so the marker stays on its lane
      // path (no chord-cutting across the infield) and bleeds off the deficit
      // over the next frames instead of teleporting.
      const scale = budgetPx / stepPx;
      nextVisualProgress = previousVisualProgress + ((unclampedVisualProgress - previousVisualProgress) * scale);
      nextLane = previousLane + ((unclampedLane - previousLane) * scale);
      nextPosition = getTrackCoordinates(nextVisualProgress, nextLane, geomOptions);
    }

    state.renderLaneByRunnerId[runner.id] = nextLane;
    state.renderProgressByRunnerId[runner.id] = nextVisualProgress;
    dot.style.left = `${nextPosition.x}px`;
    dot.style.top = `${nextPosition.y}px`;
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
  // Sound the bell once, as the leader enters the final lap — the way a race
  // official rings it. For an 800m on a 200m track that's at 600m (one lap to
  // go); derived from the event so it's correct for any distance/track length.
  const lapLength = state.event?.track_length_m || TRACK_CONFIG.trackLength;
  const raceDistance = state.event?.race_distance_m || TRACK_CONFIG.raceDistance;
  const bellDistance = raceDistance - lapLength;
  if (leaderDistance >= bellDistance && state.lastLapBellDistance < bellDistance) {
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

  if (state.currentSnapshot?.isComplete) {
    revealPhotoFinish();
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
  state.renderProgressByRunnerId = {};

  timerEl.innerText = "0:00.00";
  lapCounterEl.innerText = `Lap 1 of ${getTotalLaps()}`;
  hidePhotoFinish();
  setButtonToStartResumeState();

  document.querySelectorAll(".lap-dot").forEach((dot, index) => {
    if (index === 0) dot.classList.add("active");
    else dot.classList.remove("active");
  });

  splitGridEl?.querySelectorAll("[data-mark]").forEach((cell) => {
    const valueEl = cell.querySelector("[data-role='split-value']");
    if (valueEl) valueEl.textContent = "--";
    cell.dataset.state = "pending";
  });

  state.runners.forEach((runner) => {
    const runnerState = state.currentSnapshot.getRunnerState(runner.id);
    const dot = document.getElementById(`runner-${runner.id}`);
    const badge = document.getElementById(`badge-${runner.id}`);

    if (dot && runnerState) {
      state.renderLaneByRunnerId[runner.id] = runnerState.displayLane;
      state.renderProgressByRunnerId[runner.id] = runnerState.officialDistance + runnerState.longitudinalOffset;
      dot.style.left = `${runnerState.trackPosition.x}px`;
      dot.style.top = `${runnerState.trackPosition.y}px`;
      dot.style.opacity = "1";
      dot.style.zIndex = runner.highlight ? "50" : "10";
      dot.classList.remove("position-1", "position-2", "position-3", "dnf");
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
  // Reshape the oval before anything reads its geometry (the snapshot positions
  // runners, the outline/markers are drawn from svg{}). Outdoor 400m → realistic
  // long-straight oval; indoor 200m → unchanged stylised oval.
  configureTrackGeometry(state.event);
  state.raceModel = createRaceModel(state.event, state.runners);
  state.currentSnapshot = state.raceModel.getSnapshot(0);

  updateHeatMeta();
  renderTrackGeometry();
  renderLapDots();
  renderSplitGrid();
  renderCheckpointMarkers();
  renderRecords();
  initRunners();
  resetRace();
}

// Only boot the player when a specific race is requested (?replay=<id>).
// With no param the page is the gallery (gallery.js handles it) and the player
// stays dormant — otherwise loadHeatData would fall back to the default replay
// and render a race behind the gallery.
if (new URLSearchParams(window.location.search).get("replay")) {
  init().catch((error) => {
    commentaryBoxEl.innerText = `Unable to load heat data: ${error.message}`;
    console.error(error);
  });
}
