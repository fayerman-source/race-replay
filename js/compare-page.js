import { analyzeRace } from "./race-analyzer.js";
import { formatTime, TRACK_CONFIG } from "./utils.js";

// =====================================================================
// CONFIGURATION
// =====================================================================
// Hardcoded comparison pair for now. Could be extended via URL params
// later (?a=lievin-...&b=waic-...). Chronological order: A=earlier, B=later.

const COMPARISON = {
  a: {
    replayId: "lievin-2026-womens-800m-wr",
    label: "Liévin",
    dateLabel: "19 Feb 2026 · World Record",
    competitionLevel: "world_indoor_w",
    accent: "#F97316",  // amber for the WR race
    accentDim: "rgba(249, 115, 22, 0.5)",
  },
  b: {
    replayId: "waic-torun-2026-womens-800m-final",
    label: "Toruń",
    dateLabel: "22 Mar 2026 · Championship Record",
    competitionLevel: "world_indoor_w",
    accent: "#3B82F6",  // blue for the championship race
    accentDim: "rgba(59, 130, 246, 0.5)",
  },
};

// Distinct colors for the common athletes who appear in both races.
const COMMON_ATHLETE_COLORS = [
  "#F59E0B",  // amber-500 — Hodgkinson (focus)
  "#10B981",  // emerald
  "#EC4899",  // pink
  "#8B5CF6",  // violet
  "#14B8A6",  // teal
  "#EF4444",  // red
];

const MUTED_COLOR = "#6B7280";  // slate-500 — single-race runners

// =====================================================================
// UTILITIES
// =====================================================================

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "className") node.className = v;
    else node.setAttribute(k, v);
  });
  children.flat().forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  children.flat().forEach((c) => c != null && node.appendChild(c));
  return node;
}

function svgText(attrs, text) {
  const node = svg("text", attrs);
  node.appendChild(document.createTextNode(text));
  return node;
}

function getMarkerLabel(name) {
  const parts = (name || "Runner").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

// Normalize a heat's entries the same way heat-data.js does (we already
// have the payload, so we don't refetch — just apply the same logic).
function normalizeRunners(heat) {
  const validEntries = heat.entries.filter((entry) =>
    entry?.splits?.cumulative_seconds
      && entry.status !== "DNS"
      && entry.status !== "DNF",
  );
  let fallbackLane = 1;
  return validEntries
    .map((entry, index) => {
      const lane = Number.isFinite(entry.lane) ? entry.lane : fallbackLane++;
      const finalTime = entry.result?.final_time
        ?? entry.splits.cumulative_seconds[entry.splits.cumulative_seconds.length - 1];
      const nameParts = (entry.athlete || "Runner").trim().split(/\s+/);
      return {
        id: `${entry.athlete || "runner"}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: nameParts[0],
        fullName: entry.athlete,
        team: entry.team || entry.country || "—",
        country: entry.country || "",
        lane,
        place: entry.place,
        finalTime,
        displayTime: entry.result?.display_time || null,
        markerLabel: getMarkerLabel(entry.athlete),
        splits: entry.splits.cumulative_seconds,
        segmentSplits: entry.splits.segment_seconds,
        splitMarks: entry.splits.split_marks_m,
        highlight: Array.isArray(entry.tags) && entry.tags.includes("focus_runner"),
      };
    })
    .sort((a, b) => (a.place || 99) - (b.place || 99));
}

// Build a {name → color} map for athletes who appear in BOTH races.
// Single-race athletes get the muted color.
function buildAthleteColorMap(runnersA, runnersB) {
  const namesA = new Set(runnersA.map((r) => r.fullName));
  const namesB = new Set(runnersB.map((r) => r.fullName));
  const common = [...namesA].filter((n) => namesB.has(n));
  const map = new Map();
  common.forEach((name, i) => {
    map.set(name, COMMON_ATHLETE_COLORS[i % COMMON_ATHLETE_COLORS.length]);
  });
  return { map, common };
}

function getProfile(bundle, fullName) {
  const runner = bundle.runnersByName.get(fullName);
  if (!runner) return null;
  return bundle.perRunner.find((p) => p.id === runner.id);
}

// =====================================================================
// RENDERERS
// =====================================================================

function renderHeader(bundleA, bundleB) {
  const root = document.getElementById("header");
  clear(root);
  root.appendChild(el("h1", { className: "text-3xl font-bold tracking-tight" },
    "Same year, same runner, different races"));
  root.appendChild(el("p", { className: "text-slate-400 mt-2 max-w-3xl" },
    `${COMPARISON.a.label} (${COMPARISON.a.dateLabel}) vs ${COMPARISON.b.label} (${COMPARISON.b.dateLabel}). ` +
    "Four athletes ran both finals. The framework reads the two races as fundamentally " +
    "different in shape, and shows you the patterns that travel with each athlete vs the " +
    "ones that don't."));
}

function renderLeaderboards(bundleA, bundleB, colorMap) {
  const root = document.getElementById("leaderboards");
  clear(root);

  function renderOne(bundle, raceCfg) {
    const card = el("div", { className: "bg-slate-900/40 rounded-lg border border-slate-800 p-4" });
    card.appendChild(el("div", { className: "flex items-center gap-2 mb-3" },
      el("span", { className: "text-xs px-2 py-0.5 rounded border", style:
        `background:${raceCfg.accent}26; color:${raceCfg.accent}; border-color:${raceCfg.accentDim}` },
        raceCfg.label),
      el("span", { className: "text-xs text-slate-400" }, raceCfg.dateLabel),
    ));
    const table = el("table", { className: "w-full text-xs" });
    const tbody = el("tbody");
    bundle.raceLevel.finishOrder.forEach((id, idx) => {
      const runner = bundle.runnersById.get(id);
      const color = colorMap.get(runner.fullName) || MUTED_COLOR;
      tbody.appendChild(el("tr", { className: "border-b border-slate-800" },
        el("td", { className: "py-1.5 px-2 font-mono text-slate-400" }, String(idx + 1)),
        el("td", { className: "py-1.5 px-2 font-semibold flex items-center gap-2" },
          el("span", { className: "inline-block w-2 h-2 rounded-full", style: `background:${color}` }),
          runner.fullName),
        el("td", { className: "py-1.5 px-2 text-slate-400 text-right" }, runner.country || runner.team),
        el("td", { className: "py-1.5 px-2 font-mono text-right" }, runner.displayTime || formatTime(runner.finalTime)),
      ));
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
  }

  root.appendChild(renderOne(bundleA, COMPARISON.a));
  root.appendChild(renderOne(bundleB, COMPARISON.b));
}

function renderContrasts(bundleA, bundleB) {
  const root = document.getElementById("contrasts");
  clear(root);

  function formatRunnerLookup(bundle, runnerId) {
    const r = bundle.runnersById.get(runnerId);
    return r ? r.fullName : "—";
  }

  const rows = [
    {
      label: "Race shape",
      a: bundleA.raceLevel.raceShape.label,
      aDetail: bundleA.raceLevel.raceShape.label
        ? `opener Δ ${bundleA.raceLevel.raceShape.openerDeltaPct?.toFixed(2)}%  ·  total Δ ${bundleA.raceLevel.raceShape.totalDeltaPct?.toFixed(2)}%`
        : "",
      b: bundleB.raceLevel.raceShape.label,
      bDetail: bundleB.raceLevel.raceShape.label
        ? `opener Δ ${bundleB.raceLevel.raceShape.openerDeltaPct?.toFixed(2)}%  ·  total Δ ${bundleB.raceLevel.raceShape.totalDeltaPct?.toFixed(2)}%`
        : "",
      changed: bundleA.raceLevel.raceShape.label !== bundleB.raceLevel.raceShape.label,
    },
    {
      label: "Pace pressure",
      a: bundleA.raceLevel.pacePressure.category.replace("_", " "),
      aDetail: `${bundleA.raceLevel.pacePressure.count} runner${bundleA.raceLevel.pacePressure.count !== 1 ? "s" : ""} E/E-P`,
      b: bundleB.raceLevel.pacePressure.category.replace("_", " "),
      bDetail: `${bundleB.raceLevel.pacePressure.count} runner${bundleB.raceLevel.pacePressure.count !== 1 ? "s" : ""} E/E-P`,
      changed: bundleA.raceLevel.pacePressure.category !== bundleB.raceLevel.pacePressure.category,
    },
    {
      label: "Lead changes",
      a: String(bundleA.raceLevel.leadChanges.length),
      aDetail: bundleA.raceLevel.leadChanges.length
        ? `at ${bundleA.raceLevel.leadChanges.map((c) => c.at_distance + "m").join(", ")}`
        : "leader from gun to tape",
      b: String(bundleB.raceLevel.leadChanges.length),
      bDetail: bundleB.raceLevel.leadChanges.length
        ? `at ${bundleB.raceLevel.leadChanges.map((c) => c.at_distance + "m").join(", ")}`
        : "leader from gun to tape",
      changed: bundleA.raceLevel.leadChanges.length !== bundleB.raceLevel.leadChanges.length,
    },
    {
      label: "Closing-speed winner",
      a: bundleA.raceLevel.closingSpeedWinner
        ? formatRunnerLookup(bundleA, bundleA.raceLevel.closingSpeedWinner.runnerId)
        : "—",
      aDetail: bundleA.raceLevel.closingSpeedWinner
        ? `peak decline ${bundleA.raceLevel.closingSpeedWinner.peakDeclinePct.toFixed(2)}%`
        : "",
      b: bundleB.raceLevel.closingSpeedWinner
        ? formatRunnerLookup(bundleB, bundleB.raceLevel.closingSpeedWinner.runnerId)
        : "—",
      bDetail: bundleB.raceLevel.closingSpeedWinner
        ? `peak decline ${bundleB.raceLevel.closingSpeedWinner.peakDeclinePct.toFixed(2)}%`
        : "",
      changed: false,
    },
    {
      label: "Early-pace aggressor",
      a: bundleA.raceLevel.earlyPaceAggressor
        ? formatRunnerLookup(bundleA, bundleA.raceLevel.earlyPaceAggressor.runnerId)
        : "—",
      aDetail: bundleA.raceLevel.earlyPaceAggressor
        ? `opener field-rel score ${bundleA.raceLevel.earlyPaceAggressor.openerScore.toFixed(1)}/100`
        : "",
      b: bundleB.raceLevel.earlyPaceAggressor
        ? formatRunnerLookup(bundleB, bundleB.raceLevel.earlyPaceAggressor.runnerId)
        : "—",
      bDetail: bundleB.raceLevel.earlyPaceAggressor
        ? `opener field-rel score ${bundleB.raceLevel.earlyPaceAggressor.openerScore.toFixed(1)}/100`
        : "",
      changed: false,
    },
  ];

  rows.forEach((row) => {
    const card = el("div", {
      className: "bg-slate-900/40 rounded-lg border border-slate-800 grid gap-3 p-3",
      style: "grid-template-columns: 160px 1fr 1fr",
    });
    card.appendChild(el("div", { className: "text-xs uppercase tracking-wider text-slate-400 flex items-center" }, row.label));
    card.appendChild(el("div", {
      className: row.changed
        ? "border-l-2 pl-3"
        : "border-l-2 border-transparent pl-3",
      style: row.changed ? `border-color:${COMPARISON.a.accentDim}` : "",
    },
      el("div", { className: "text-xs text-slate-500 mb-0.5" }, COMPARISON.a.label),
      el("div", { className: "text-base font-semibold capitalize" }, row.a),
      el("div", { className: "text-[11px] text-slate-500 font-mono mt-0.5" }, row.aDetail),
    ));
    card.appendChild(el("div", {
      className: row.changed
        ? "border-l-2 pl-3"
        : "border-l-2 border-transparent pl-3",
      style: row.changed ? `border-color:${COMPARISON.b.accentDim}` : "",
    },
      el("div", { className: "text-xs text-slate-500 mb-0.5" }, COMPARISON.b.label),
      el("div", { className: "text-base font-semibold capitalize" }, row.b),
      el("div", { className: "text-[11px] text-slate-500 font-mono mt-0.5" }, row.bDetail),
    ));
    root.appendChild(card);
  });
}

function renderCommonAthletes(bundleA, bundleB, commonNames, colorMap) {
  const root = document.getElementById("common-athletes");
  clear(root);

  commonNames.forEach((name) => {
    const color = colorMap.get(name);
    const pA = getProfile(bundleA, name);
    const pB = getProfile(bundleB, name);
    if (!pA || !pB) return;

    const rA = bundleA.runnersByName.get(name);
    const rB = bundleB.runnersByName.get(name);

    const styleChanged = pA.style.primary !== pB.style.primary;
    const splitChanged = pA.splitClass?.label !== pB.splitClass?.label;
    const declineChanged = Math.abs((pA.peakDeclinePct ?? 0) - (pB.peakDeclinePct ?? 0)) > 3;

    function statRow(label, valA, valB, highlight) {
      const cls = highlight ? "text-amber-300 font-bold" : "font-mono";
      return el("div", { className: "grid gap-3", style: "grid-template-columns: 140px 1fr 1fr" },
        el("dt", { className: "text-xs text-slate-400" }, label),
        el("dd", { className: `text-xs text-right ${cls}` }, valA ?? "—"),
        el("dd", { className: `text-xs text-right ${cls}` }, valB ?? "—"),
      );
    }

    const card = el("div", { className: "bg-slate-900/40 rounded-lg border border-slate-800 p-4" });

    // Header: athlete name + dot
    card.appendChild(el("div", { className: "flex items-center gap-2 mb-3" },
      el("span", { className: "inline-block w-3 h-3 rounded-full", style: `background:${color}` }),
      el("span", { className: "font-bold text-base" }, name),
      el("span", { className: "ml-2 text-xs text-slate-500" },
        `${rA.country || rA.team}`),
    ));

    // Column headers (race A | race B)
    card.appendChild(el("div", { className: "grid gap-3 mb-2", style: "grid-template-columns: 140px 1fr 1fr" },
      el("div", {}),
      el("div", { className: "text-xs uppercase tracking-wider text-right",
        style: `color:${COMPARISON.a.accent}` }, COMPARISON.a.label),
      el("div", { className: "text-xs uppercase tracking-wider text-right",
        style: `color:${COMPARISON.b.accent}` }, COMPARISON.b.label),
    ));

    card.appendChild(statRow("Place", rA.place != null ? `${rA.place}` : "—",
                                    rB.place != null ? `${rB.place}` : "—", false));
    card.appendChild(statRow("Time",
      rA.displayTime || formatTime(rA.finalTime),
      rB.displayTime || formatTime(rB.finalTime), false));
    card.appendChild(statRow("Style", pA.style.primary, pB.style.primary, styleChanged));
    card.appendChild(statRow("Split class",
      pA.splitClass?.label || "—",
      pB.splitClass?.label || "—", splitChanged));
    card.appendChild(statRow("Half differential",
      pA.splitClass ? `${pA.splitClass.diffPct.toFixed(2)}%` : "—",
      pB.splitClass ? `${pB.splitClass.diffPct.toFixed(2)}%` : "—", false));
    card.appendChild(statRow("Peak decline",
      pA.peakDeclinePct != null ? `${pA.peakDeclinePct.toFixed(2)}%` : "—",
      pB.peakDeclinePct != null ? `${pB.peakDeclinePct.toFixed(2)}%` : "—", declineChanged));
    card.appendChild(statRow("Monotonicity",
      pA.monotonicityScore != null ? pA.monotonicityScore.toFixed(2) : "—",
      pB.monotonicityScore != null ? pB.monotonicityScore.toFixed(2) : "—", false));
    card.appendChild(statRow("Fastest segment",
      pA.fastestSegmentIdx != null ? `seg ${pA.fastestSegmentIdx} (${pA.segments[pA.fastestSegmentIdx].toFixed(2)}s)` : "—",
      pB.fastestSegmentIdx != null ? `seg ${pB.fastestSegmentIdx} (${pB.segments[pB.fastestSegmentIdx].toFixed(2)}s)` : "—",
      false));

    root.appendChild(card);
  });
}

function renderWerroViz(bundleA, bundleB) {
  const root = document.getElementById("werro-viz");
  clear(root);

  const pA = getProfile(bundleA, "Audrey Werro");
  const pB = getProfile(bundleB, "Audrey Werro");
  if (!pA || !pB) {
    root.appendChild(el("p", { className: "text-slate-400 text-sm" }, "Werro data unavailable."));
    return;
  }

  const segCount = Math.min(pA.energyDistribution.length, pB.energyDistribution.length);
  const W = 900;
  const H = 280;
  const padL = 60;
  const padR = 20;
  const padT = 30;
  const padB = 60;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allValues = [...pA.energyDistribution.slice(0, segCount), ...pB.energyDistribution.slice(0, segCount)];
  const maxVal = Math.max(...allValues);
  const evenPct = 1 / segCount;

  const groupWidth = plotW / segCount;
  const barWidth = (groupWidth - 8) / 2;
  const barGap = 2;

  const root_svg = svg("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "w-full",
    style: "max-height: 320px",
  });

  // Y-axis gridlines: %.
  const yMax = Math.ceil(maxVal * 100) / 100;
  for (let pct = 0.10; pct <= yMax; pct += 0.02) {
    const y = padT + plotH - (pct / yMax) * plotH;
    root_svg.appendChild(svg("line", {
      x1: padL, x2: padL + plotW, y1: y, y2: y,
      stroke: "#1E293B", "stroke-width": 1,
    }));
    root_svg.appendChild(svgText({
      x: padL - 8, y: y + 3,
      fill: "#94A3B8", "font-size": 10, "text-anchor": "end",
      "font-family": "monospace",
    }, `${(pct * 100).toFixed(0)}%`));
  }

  // Even-pace reference line
  const yEven = padT + plotH - (evenPct / yMax) * plotH;
  root_svg.appendChild(svg("line", {
    x1: padL, x2: padL + plotW, y1: yEven, y2: yEven,
    stroke: "#64748B", "stroke-width": 1, "stroke-dasharray": "4,4",
  }));
  root_svg.appendChild(svgText({
    x: padL + plotW - 6, y: yEven - 4,
    fill: "#94A3B8", "font-size": 10, "text-anchor": "end",
    "font-family": "monospace",
  }, `even pace (${(evenPct * 100).toFixed(2)}%)`));

  // Bars
  for (let i = 0; i < segCount; i += 1) {
    const xGroup = padL + (i + 0.5) * groupWidth;

    const valA = pA.energyDistribution[i];
    const hA = (valA / yMax) * plotH;
    const xA = xGroup - barWidth - barGap / 2;
    root_svg.appendChild(svg("rect", {
      x: xA, y: padT + plotH - hA, width: barWidth, height: hA,
      fill: COMPARISON.a.accent, opacity: 0.85, rx: 2,
    }));

    const valB = pB.energyDistribution[i];
    const hB = (valB / yMax) * plotH;
    const xB = xGroup + barGap / 2;
    root_svg.appendChild(svg("rect", {
      x: xB, y: padT + plotH - hB, width: barWidth, height: hB,
      fill: COMPARISON.b.accent, opacity: 0.85, rx: 2,
    }));

    // Segment label
    const labelX = (i * 100) + "-" + ((i + 1) * 100) + "m";
    root_svg.appendChild(svgText({
      x: xGroup, y: padT + plotH + 16,
      fill: "#94A3B8", "font-size": 10, "text-anchor": "middle",
      "font-family": "monospace",
    }, labelX));
  }

  // Legend
  const legendY = H - 16;
  root_svg.appendChild(svg("rect", { x: padL, y: legendY - 8, width: 12, height: 12, fill: COMPARISON.a.accent, rx: 2 }));
  root_svg.appendChild(svgText({
    x: padL + 18, y: legendY + 2, fill: "#CBD5E1", "font-size": 11,
  }, `${COMPARISON.a.label} (${COMPARISON.a.dateLabel})`));
  root_svg.appendChild(svg("rect", { x: padL + 280, y: legendY - 8, width: 12, height: 12, fill: COMPARISON.b.accent, rx: 2 }));
  root_svg.appendChild(svgText({
    x: padL + 298, y: legendY + 2, fill: "#CBD5E1", "font-size": 11,
  }, `${COMPARISON.b.label} (${COMPARISON.b.dateLabel})`));

  root.appendChild(root_svg);

  // Brief interpretive note below the chart
  const peakDeclineA = pA.peakDeclinePct.toFixed(1);
  const peakDeclineB = pB.peakDeclinePct.toFixed(1);
  const splitA = pA.splitClass?.label;
  const splitB = pB.splitClass?.label;
  root.appendChild(el("p", { className: "text-xs text-slate-400 mt-3 max-w-3xl" },
    `In ${COMPARISON.a.label}, Werro classified as ${pA.style.primary} with a ${splitA} (${peakDeclineA}% peak decline). ` +
    `In ${COMPARISON.b.label}, she classified as ${pB.style.primary} with a ${splitB} (${peakDeclineB}% peak decline). ` +
    "The bar heights are her % of total race time in each segment — back-loaded shape means she slowed late, " +
    "front-loaded or even means she held pace."));
}

function renderCommonSplits(bundleA, bundleB, commonNames, colorMap) {
  const root = document.getElementById("common-splits");
  clear(root);

  commonNames.forEach((name) => {
    const color = colorMap.get(name);
    const pA = getProfile(bundleA, name);
    const pB = getProfile(bundleB, name);
    if (!pA || !pB) return;

    const segCount = Math.min(pA.segments.length, pB.segments.length);

    const card = el("div", { className: "bg-slate-900/40 rounded-lg border border-slate-800 p-3" });
    card.appendChild(el("div", { className: "flex items-center gap-2 mb-2" },
      el("span", { className: "inline-block w-2 h-2 rounded-full", style: `background:${color}` }),
      el("span", { className: "font-semibold text-sm" }, name),
    ));

    // Header row with segment marks
    const header = el("div", {
      className: "grid gap-1 mb-1",
      style: `grid-template-columns: 120px repeat(${segCount}, minmax(60px, 1fr))`,
    });
    header.appendChild(el("div", { className: "px-1 py-1 text-[10px] text-slate-500" }, "segment"));
    for (let i = 0; i < segCount; i += 1) {
      header.appendChild(el("div", {
        className: "text-center px-1 py-1 text-[10px] text-slate-500 font-mono",
      }, `${i * 100}-${(i + 1) * 100}m`));
    }
    card.appendChild(header);

    function renderRow(profile, raceCfg) {
      const row = el("div", {
        className: "grid gap-1 mb-1",
        style: `grid-template-columns: 120px repeat(${segCount}, minmax(60px, 1fr))`,
      });
      row.appendChild(el("div", { className: "flex items-center gap-1 px-1 py-1.5 text-xs" },
        el("span", { className: "text-xs px-1.5 py-0.5 rounded",
          style: `background:${raceCfg.accent}26; color:${raceCfg.accent}` }, raceCfg.label),
      ));
      for (let i = 0; i < segCount; i += 1) {
        const ownTime = profile.segments[i];
        const otherTime = (profile === pA ? pB : pA).segments[i];
        const isFaster = ownTime < otherTime;
        const isSlower = ownTime > otherTime;
        const bgClass = isFaster
          ? "bg-emerald-900/30 border border-emerald-700/40"
          : isSlower
            ? "bg-rose-900/30 border border-rose-700/40"
            : "bg-slate-800/20 border border-transparent";
        row.appendChild(el("div", {
          className: `text-center py-1.5 px-1 rounded ${bgClass} text-xs font-mono`,
        }, ownTime.toFixed(2)));
      }
      return row;
    }

    card.appendChild(renderRow(pA, COMPARISON.a));
    card.appendChild(renderRow(pB, COMPARISON.b));

    root.appendChild(card);
  });
}

// =====================================================================
// PAGE INIT
// =====================================================================

function buildBundle(replay, cfg) {
  const runners = normalizeRunners(replay.heats[0]);
  const event = { ...replay.event, competition_level: cfg.competitionLevel };
  const bundle = analyzeRace(event, runners);
  bundle.runnersById = new Map(runners.map((r) => [r.id, r]));
  bundle.runnersByName = new Map(runners.map((r) => [r.fullName, r]));
  bundle.runners = runners;
  return bundle;
}

async function init() {
  try {
    const response = await fetch("./data/custom_800m_heats.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();

    const replayA = payload.replays.find((r) => r.replay_id === COMPARISON.a.replayId);
    const replayB = payload.replays.find((r) => r.replay_id === COMPARISON.b.replayId);
    if (!replayA) throw new Error(`replay ${COMPARISON.a.replayId} not found`);
    if (!replayB) throw new Error(`replay ${COMPARISON.b.replayId} not found`);

    const bundleA = buildBundle(replayA, COMPARISON.a);
    const bundleB = buildBundle(replayB, COMPARISON.b);

    const { map: colorMap, common } = buildAthleteColorMap(bundleA.runners, bundleB.runners);

    // Order common athletes by finishing place in race A (Liévin), so the
    // most successful runner shows first.
    const commonNamesOrdered = common.slice().sort((a, b) => {
      const placeA = bundleA.runnersByName.get(a)?.place || 99;
      const placeB = bundleA.runnersByName.get(b)?.place || 99;
      return placeA - placeB;
    });

    renderHeader(bundleA, bundleB);
    renderLeaderboards(bundleA, bundleB, colorMap);
    renderContrasts(bundleA, bundleB);
    renderCommonAthletes(bundleA, bundleB, commonNamesOrdered, colorMap);
    renderWerroViz(bundleA, bundleB);
    renderCommonSplits(bundleA, bundleB, commonNamesOrdered, colorMap);

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
  } catch (err) {
    document.getElementById("loading").innerText = `Failed to load comparison: ${err.message}`;
    console.error(err);
  }
}

init();
