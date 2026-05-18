import { loadHeatData } from "./heat-data.js";
import { analyzeRace } from "./race-analyzer.js";
import { formatTime } from "./utils.js";

// TODO: move this into the replay JSON itself; in the meantime, map here.
const COMPETITION_LEVEL_MAP = {
  "waic-torun-2026-womens-800m-final": "world_indoor_w",
  "skye-oceanbreeze-section-2": "hs_varsity_w",
  "chloe-oceanbreeze-section-1": "hs_varsity_w",
  "lievin-2026-womens-800m-wr": "world_indoor_w",
};

const RUNNER_COLORS = [
  "#F97316", "#3B82F6", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6",
];

// Single source of truth for code definitions — used both for hover tooltips
// and to populate the page-level glossary on init.
const STYLE_GLOSSARY = {
  "E":   "Early — front-runner. Leads from the gun and doesn't rate well behind a pacesetter.",
  "E/P": "Early/Presser — sits 1–3 lengths off the lead. Tactically flexible: can lead or stalk.",
  "P":   "Presser — runs mid-pack early, then makes a move to run down the leader in the back half.",
  "S":   "Sustain/Closer — sits at the back of the pack early, then kicks late to pass tiring runners.",
  "NA":  "Not Available — splits don't match any clean profile (sparse data or very erratic pacing).",
};

const SECONDARY_TAG_GLOSSARY = {
  "fast_starter_finisher": "Bimodal: among the field's fastest at both opener and closer. Rare and highly diagnostic.",
};

const SPLIT_CLASS_GLOSSARY = {
  "negative_splitter":  "Second half faster than first (>1%). Rare at elite level; common in tactical races.",
  "even":               "Both halves within ±1% of each other. Highly efficient; uncommon in 800m.",
  "textbook_positive":  "First half faster by 1–4%. Elite world-record pattern (Rudisha, Kipketer).",
  "aggressive_front":   "First half faster by 4–8%. Bold front-running with real fade risk.",
  "blow_up":            "First half faster by 8%+. Paid for the opening, faded badly.",
};

const RACE_SHAPE_GLOSSARY = {
  axes: "Race shape format: <early-pace> / <final-time>. Each axis is one of: fast, par, avg, slow — measured as deviation from typical for the competition level.",
  bands: {
    "fast": "More than 1.5% faster than par",
    "par":  "Within ±1% of par",
    "avg":  "1% to 4% slower than par",
    "slow": "More than 4% slower than par",
  },
};

const PACE_PRESSURE_GLOSSARY = {
  "lone speed":   "Only one E or E/P runner in the field. Front-runner has the pace uncontested.",
  "competitive": "Two E or E/P runners contesting the early pace. Pace usually honest.",
  "pace duel":    "Three or more E/E-P runners. Front-running tactics burn out; closers favored.",
};

const METRICS_GLOSSARY = {
  "Half differential": "Second-half total minus first-half total, as % of first half. Drives split class.",
  "Peak decline":      "% slowdown from the runner's fastest segment to their final segment. ~10% is elite WR range; >15% indicates significant fade.",
  "Monotonicity":      "0–1 score. 1.0 = every segment slower than the previous (clean fade). Lower values mean mid-race surges happened.",
  "Field-relative score": "0–100 score per segment: 100 = fastest in the field at that segment, 0 = slowest. Dimensionless; comparable across competition levels.",
  "Energy distribution": "% of total race time spent in each segment. Even pacing = uniform bars. Front-loaded vs back-loaded shapes are visible at a glance.",
};

// Three-stop palette using Option 3's exact colors, reordered so the
// dashboard convention reads correctly: red = worst, green = best.
// Blue takes the middle slot. RGB lerps between stops avoid the yellow path.
const SCORE_PALETTE_STOPS = [
  [0.0, [193,  64,  21]],   // red    — from HSL(15°, 80%, 42%)
  [0.5, [ 37,  74, 127]],   // blue   — from HSL(215°, 55%, 32%)
  [1.0, [ 42, 158,  31]],   // green  — from HSL(115°, 67%, 37%)
];

function scoreToBackground(score) {
  const t = Math.max(0, Math.min(1, score / 100));
  for (let i = 0; i < SCORE_PALETTE_STOPS.length - 1; i += 1) {
    const [p0, c0] = SCORE_PALETTE_STOPS[i];
    const [p1, c1] = SCORE_PALETTE_STOPS[i + 1];
    if (t >= p0 && t <= p1) {
      const local = (t - p0) / (p1 - p0 || 1);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * local);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * local);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * local);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  const [, last] = SCORE_PALETTE_STOPS[SCORE_PALETTE_STOPS.length - 1];
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

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

// =====================================================================
// SECTION RENDERERS
// =====================================================================

function renderHeader(replayData) {
  const root = document.getElementById("header");
  clear(root);
  root.appendChild(el("h1", { className: "text-3xl font-bold tracking-tight" },
    replayData.replayTitle || `${replayData.event.name} ${replayData.activeHeat.heat_id}`));
  root.appendChild(el("p", { className: "text-slate-400 mt-1" },
    replayData.event.venue || ""));
}

function renderLeaderboard(bundle, runners) {
  const root = document.getElementById("leaderboard");
  clear(root);
  const table = el("table", { className: "w-full text-sm" });
  const thead = el("thead", { className: "text-slate-400 border-b border-slate-700" },
    el("tr", {},
      ["#", "Athlete", "Country / Team", "Lane", "Time", "Split class", "Style"].map((h) =>
        el("th", { className: "text-left py-2 px-2 font-medium" }, h))));
  const tbody = el("tbody");
  bundle.raceLevel.finishOrder.forEach((id, idx) => {
    const runner = runners.find((r) => r.id === id);
    const profile = bundle.perRunner.find((p) => p.id === id);
    const color = RUNNER_COLORS[idx % RUNNER_COLORS.length];
    tbody.appendChild(el("tr", { className: "border-b border-slate-800 hover:bg-slate-800/40" },
      el("td", { className: "py-2 px-2 font-mono" }, String(idx + 1)),
      el("td", { className: "py-2 px-2 font-semibold flex items-center gap-2" },
        el("span", { className: "inline-block w-2 h-2 rounded-full", style: `background:${color}` }),
        runner.fullName),
      el("td", { className: "py-2 px-2 text-slate-400" }, runner.country || runner.team || "—"),
      el("td", { className: "py-2 px-2 font-mono" }, String(runner.lane)),
      el("td", { className: "py-2 px-2 font-mono" }, runner.displayTime || formatTime(runner.finalTime)),
      el("td", {
        className: "py-2 px-2",
        title: SPLIT_CLASS_GLOSSARY[profile.splitClass?.label] || "",
      }, profile.splitClass?.label || "—"),
      el("td", {
        className: "py-2 px-2 font-bold",
        title: STYLE_GLOSSARY[profile.style.primary] || "",
      }, profile.style.primary || "—"),
    ));
  });
  table.appendChild(thead);
  table.appendChild(tbody);
  root.appendChild(table);
}

function renderGlossary() {
  const root = document.getElementById("glossary");
  clear(root);

  function definitionList(entries) {
    const dl = el("dl", { className: "grid grid-cols-1 md:grid-cols-[160px_1fr] gap-x-4 gap-y-2 text-xs" });
    entries.forEach(([term, def]) => {
      dl.appendChild(el("dt", { className: "font-mono font-bold text-emerald-300" }, term));
      dl.appendChild(el("dd", { className: "text-slate-300" }, def));
    });
    return dl;
  }

  function block(title, entries) {
    const section = el("div", { className: "mb-6 last:mb-0" });
    section.appendChild(el("h3", { className: "text-sm font-semibold text-white mb-2 uppercase tracking-wider" }, title));
    section.appendChild(definitionList(entries));
    return section;
  }

  root.appendChild(block("Running styles (Brisnet E/E-P/P/S taxonomy)",
    Object.entries(STYLE_GLOSSARY)));

  root.appendChild(block("Secondary style tags",
    Object.entries(SECONDARY_TAG_GLOSSARY)));

  root.appendChild(block("Split classes",
    Object.entries(SPLIT_CLASS_GLOSSARY)));

  const raceShapeEntries = [
    ["Format", RACE_SHAPE_GLOSSARY.axes],
    ...Object.entries(RACE_SHAPE_GLOSSARY.bands),
  ];
  root.appendChild(block("Race shape bands (vs par for the competition level)", raceShapeEntries));

  root.appendChild(block("Pace pressure", Object.entries(PACE_PRESSURE_GLOSSARY)));

  root.appendChild(block("Per-runner metrics", Object.entries(METRICS_GLOSSARY)));
}

function renderSplitsTable(bundle) {
  const root = document.getElementById("splits-table");
  clear(root);

  const orderedProfiles = bundle.raceLevel.finishOrder
    .map((id) => bundle.perRunner.find((p) => p.id === id))
    .filter(Boolean);

  const segCount = orderedProfiles[0]?.segments.length || 0;
  if (!segCount) return;

  const endMarks = (orderedProfiles[0]?.segmentMarks || []).slice(1);

  // Field-fastest segment time at each checkpoint, for per-column highlight.
  const fieldFastestAt = [];
  for (let i = 0; i < segCount; i += 1) {
    let min = Infinity;
    orderedProfiles.forEach((p) => {
      const s = p.segments[i];
      if (Number.isFinite(s) && s < min) min = s;
    });
    fieldFastestAt.push(min);
  }

  const grid = el("div", {
    className: "grid gap-1",
    style: `grid-template-columns: 180px repeat(${segCount}, minmax(70px, 1fr))`,
  });

  grid.appendChild(el("div", { className: "px-2 py-1 text-xs text-slate-400 font-semibold" }, "Athlete"));
  endMarks.forEach((mark) => {
    grid.appendChild(el("div", {
      className: "text-center px-1 py-1 text-xs text-slate-400 font-semibold",
    }, `${mark}m`));
  });

  orderedProfiles.forEach((p, idx) => {
    const color = RUNNER_COLORS[idx % RUNNER_COLORS.length];
    const fastestIdx = p.fastestSegmentIdx;

    grid.appendChild(el("div", {
      className: "flex items-center gap-2 px-2 py-2 text-sm bg-slate-800/40 rounded",
    },
      el("span", { className: "inline-block w-2 h-2 rounded-full flex-shrink-0", style: `background:${color}` }),
      el("span", { className: "truncate" }, p.name),
    ));

    let cumulative = 0;
    p.segments.forEach((seg, i) => {
      cumulative += seg;
      const isRowFastest = i === fastestIdx;
      const isFieldFastest = Math.abs(seg - fieldFastestAt[i]) < 0.005;
      const cellClass = isRowFastest
        ? "text-center py-2 px-1 rounded bg-emerald-900/40 border border-emerald-600/60"
        : "text-center py-2 px-1 rounded bg-slate-800/20 border border-transparent";
      const segClass = isFieldFastest
        ? "text-[10px] font-mono text-slate-200 mt-0.5 underline decoration-yellow-400 decoration-2 underline-offset-2"
        : "text-[10px] font-mono text-slate-400 mt-0.5";
      grid.appendChild(el("div", { className: cellClass },
        el("div", { className: "text-xs font-mono text-white" }, cumulative.toFixed(2)),
        el("div", { className: segClass }, `+${seg.toFixed(2)}`),
      ));
    });
  });

  root.appendChild(grid);
}

function renderRaceSignals(bundle, runners) {
  const root = document.getElementById("race-signals");
  clear(root);
  const findRunner = (id) => runners.find((r) => r.id === id);
  const shape = bundle.raceLevel.raceShape;
  const pressure = bundle.raceLevel.pacePressure;
  const csw = bundle.raceLevel.closingSpeedWinner;
  const bml = bundle.raceLevel.biggestMoveLate;

  const eRunners = bundle.perRunner.filter((p) => p.style.primary === "E" || p.style.primary === "E/P");
  const eNames = eRunners.map((p) => p.name.split(" ").slice(-1)[0]).join(", ");
  const winnerId = bundle.raceLevel.finishOrder[0];
  const winner = winnerId ? findRunner(winnerId) : null;
  const winnerLastName = winner ? winner.fullName.split(" ").slice(-1)[0] : null;

  const cards = [
    {
      label: "Race shape",
      value: shape.label || "—",
      detail: shape.label
        ? `opener Δ ${shape.openerDeltaPct?.toFixed(2)}%  ·  total Δ ${shape.totalDeltaPct?.toFixed(2)}%`
        : "no par table for this competition level",
      tip: RACE_SHAPE_GLOSSARY.axes,
    },
    {
      label: "Pace pressure",
      value: pressure.category.replace("_", " "),
      detail: eNames
        ? `${eNames} (${pressure.count} E or E/P)`
        : "no aggressive front-runners in field",
      tip: PACE_PRESSURE_GLOSSARY[pressure.category.replace("_", " ")] || "",
    },
    {
      label: "Lead changes",
      value: String(bundle.raceLevel.leadChanges.length),
      detail: bundle.raceLevel.leadChanges.length === 0
        ? (winnerLastName ? `${winnerLastName} led from gun to tape` : "leader from gun to tape")
        : `at ${bundle.raceLevel.leadChanges.map((c) => c.at_distance + "m").join(", ")}`,
    },
    {
      label: "Closing-speed winner",
      value: csw ? findRunner(csw.runnerId).fullName.split(" ").slice(-1)[0] : "—",
      detail: csw ? `smallest peak-to-final decline · ${csw.peakDeclinePct.toFixed(2)}%` : "",
    },
    {
      label: "Biggest late move",
      value: bml ? `${findRunner(bml.runnerId).fullName.split(" ").slice(-1)[0]} +${bml.delta}` : "—",
      detail: bml ? `from ${ordinal(bml.fromRank + 1)} at ${bml.fromCp}m → ${ordinal(bml.toRank + 1)} at ${bml.toCp}m` : "",
    },
    {
      label: "Early-pace aggressor",
      value: bundle.raceLevel.earlyPaceAggressor
        ? findRunner(bundle.raceLevel.earlyPaceAggressor.runnerId).fullName.split(" ").slice(-1)[0]
        : "—",
      detail: bundle.raceLevel.earlyPaceAggressor
        ? `opener field-rel score ${bundle.raceLevel.earlyPaceAggressor.openerScore.toFixed(1)}/100`
        : "",
    },
  ];

  cards.forEach((c) => {
    root.appendChild(el("div", {
      className: c.tip
        ? "bg-slate-800/60 rounded-lg p-4 border border-slate-700 cursor-help"
        : "bg-slate-800/60 rounded-lg p-4 border border-slate-700",
      title: c.tip || "",
    },
      el("div", { className: "text-xs uppercase tracking-wider text-slate-400" }, c.label),
      el("div", { className: "text-2xl font-bold mt-1 capitalize" }, c.value),
      el("div", { className: "text-xs text-slate-500 mt-1" }, c.detail),
    ));
  });
}

function renderHeatmap(bundle) {
  const root = document.getElementById("heatmap");
  clear(root);

  const segCount = bundle.perRunner[0]?.segments.length || 0;
  const orderedProfiles = bundle.raceLevel.finishOrder
    .map((id) => bundle.perRunner.find((p) => p.id === id))
    .filter(Boolean);

  const header = el("div", { className: "grid gap-1 text-xs text-slate-400 mb-1",
    style: `grid-template-columns: 180px repeat(${segCount}, 1fr)` });
  header.appendChild(el("div", { className: "px-2 py-1 font-semibold" }, "Athlete"));
  for (let i = 0; i < segCount; i += 1) {
    const start = i * (800 / segCount);
    const end = (i + 1) * (800 / segCount);
    header.appendChild(el("div", { className: "text-center py-1" }, `${start}-${end}m`));
  }
  root.appendChild(header);

  orderedProfiles.forEach((p, idx) => {
    const color = RUNNER_COLORS[idx % RUNNER_COLORS.length];
    const row = el("div", { className: "grid gap-1 mb-1",
      style: `grid-template-columns: 180px repeat(${segCount}, 1fr)` });

    row.appendChild(el("div", { className: "flex items-center gap-2 px-2 py-2 text-sm bg-slate-800/40 rounded" },
      el("span", { className: "inline-block w-2 h-2 rounded-full flex-shrink-0", style: `background:${color}` }),
      el("span", { className: "truncate" }, p.name)));

    p.segmentScoresVsField.forEach((score) => {
      const bg = scoreToBackground(score);
      row.appendChild(el("div", {
        className: "text-center py-2 text-xs font-mono font-bold rounded",
        style: `background:${bg}; color:white; text-shadow: 0 1px 2px rgba(0,0,0,0.5)`,
      }, score.toFixed(0)));
    });
    root.appendChild(row);
  });

  const legend = el("div", { className: "flex items-center gap-3 mt-4 text-xs text-slate-400" },
    el("span", {}, "Field-relative score:"),
    el("span", { className: "px-2 py-1 rounded font-mono", style: `background:${scoreToBackground(0)}; color:white` }, "0 slowest"),
    el("span", { className: "px-2 py-1 rounded font-mono", style: `background:${scoreToBackground(50)}; color:white` }, "50"),
    el("span", { className: "px-2 py-1 rounded font-mono", style: `background:${scoreToBackground(100)}; color:white` }, "100 fastest"),
  );
  root.appendChild(legend);
}

function renderBumpsChart(bundle, runners) {
  const root = document.getElementById("bumps");
  clear(root);

  const N = runners.length;
  const W = 900;
  const H = 420;
  const padL = 60;
  const padR = 200;
  const padT = 40;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xAt = (cp) => padL + (cp / 800) * plotW;
  const yAt = (rank) => padT + ((rank - 1) / Math.max(1, N - 1)) * plotH;

  const root_svg = svg("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "w-full",
    style: "max-height: 480px",
  });

  for (let r = 1; r <= N; r += 1) {
    root_svg.appendChild(svgText({
      x: padL - 12, y: yAt(r) + 4,
      fill: "#94A3B8", "font-size": 11, "text-anchor": "end",
      "font-family": "monospace",
    }, ordinal(r)));
    root_svg.appendChild(svg("line", {
      x1: padL, x2: padL + plotW, y1: yAt(r), y2: yAt(r),
      stroke: "#1E293B", "stroke-width": 1,
    }));
  }

  [0, ...bundle.raceLevel.checkpoints].forEach((cp) => {
    root_svg.appendChild(svgText({
      x: xAt(cp), y: H - padB + 16,
      fill: "#94A3B8", "font-size": 11, "text-anchor": "middle",
      "font-family": "monospace",
    }, cp === 0 ? "start" : `${cp}m`));
    root_svg.appendChild(svg("line", {
      x1: xAt(cp), x2: xAt(cp), y1: padT, y2: padT + plotH,
      stroke: "#1E293B", "stroke-width": 1,
    }));
  });

  bundle.raceLevel.finishOrder.forEach((id, idx) => {
    const color = RUNNER_COLORS[idx % RUNNER_COLORS.length];
    const runner = runners.find((r) => r.id === id);
    const points = bundle.raceLevel.checkpoints
      .map((cp) => {
        const order = bundle.raceLevel.ranksByCheckpoint.get(cp);
        const rank = order ? order.indexOf(id) + 1 : null;
        return rank ? `${xAt(cp)},${yAt(rank)}` : null;
      })
      .filter(Boolean)
      .join(" ");
    root_svg.appendChild(svg("polyline", {
      points,
      fill: "none",
      stroke: color,
      "stroke-width": 3,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      opacity: 0.9,
    }));

    const lastCp = bundle.raceLevel.checkpoints[bundle.raceLevel.checkpoints.length - 1];
    const lastOrder = bundle.raceLevel.ranksByCheckpoint.get(lastCp);
    const finalRank = lastOrder ? lastOrder.indexOf(id) + 1 : null;
    if (finalRank) {
      root_svg.appendChild(svg("circle", {
        cx: xAt(lastCp), cy: yAt(finalRank), r: 5, fill: color,
      }));
      root_svg.appendChild(svgText({
        x: xAt(lastCp) + 12, y: yAt(finalRank) + 4,
        fill: color, "font-size": 12, "font-weight": "bold",
      }, runner.fullName.split(" ").slice(-1)[0]));
    }
  });

  root.appendChild(root_svg);
}

function renderEnergyDistribution(bundle) {
  const root = document.getElementById("energy");
  clear(root);

  const orderedProfiles = bundle.raceLevel.finishOrder
    .map((id) => bundle.perRunner.find((p) => p.id === id))
    .filter(Boolean);

  const segCount = orderedProfiles[0]?.energyDistribution.length || 0;
  if (!segCount) return;
  const evenPct = 1 / segCount;

  orderedProfiles.forEach((p, idx) => {
    const color = RUNNER_COLORS[idx % RUNNER_COLORS.length];
    const row = el("div", { className: "mb-2" });
    row.appendChild(el("div", { className: "flex items-center gap-2 text-xs text-slate-400 mb-1" },
      el("span", { className: "inline-block w-2 h-2 rounded-full", style: `background:${color}` }),
      el("span", { className: "font-semibold text-white" }, p.name),
      el("span", { className: "ml-auto font-mono" },
        `even=${(evenPct * 100).toFixed(2)}%  ·  peak-decline=${p.peakDeclinePct?.toFixed(2)}%`),
    ));
    const bars = el("div", { className: "flex gap-1 h-8" });
    p.energyDistribution.forEach((e, i) => {
      const dev = e - evenPct;
      const intensity = Math.min(1, Math.abs(dev) / 0.03);
      const hue = dev < 0 ? 145 : 0;
      const bg = `hsl(${hue}, ${50 + intensity * 30}%, ${28 + intensity * 12}%)`;
      bars.appendChild(el("div", {
        className: "flex-1 flex items-center justify-center text-[10px] font-mono rounded",
        style: `background:${bg}; color:white`,
        title: `Segment ${i + 1}: ${(e * 100).toFixed(2)}% of total`,
      }, `${(e * 100).toFixed(1)}`));
    });
    row.appendChild(bars);
    root.appendChild(row);
  });

  root.appendChild(el("div", { className: "text-xs text-slate-500 mt-2" },
    "Green = ran this segment faster than even pace. Red = ran it slower. Cells show % of total race time."));
}

function renderRunnerCards(bundle) {
  const root = document.getElementById("runner-cards");
  clear(root);

  const orderedProfiles = bundle.raceLevel.finishOrder
    .map((id) => bundle.perRunner.find((p) => p.id === id))
    .filter(Boolean);

  orderedProfiles.forEach((p, idx) => {
    const color = RUNNER_COLORS[idx % RUNNER_COLORS.length];
    const card = el("div", { className: "bg-slate-800/60 rounded-lg p-4 border border-slate-700" });
    card.appendChild(el("div", { className: "flex items-center gap-2 mb-2" },
      el("span", { className: "inline-block w-3 h-3 rounded-full", style: `background:${color}` }),
      el("span", { className: "font-semibold" }, p.name),
      el("span", {
        className: "ml-auto text-xs px-2 py-0.5 bg-slate-700 rounded font-bold cursor-help",
        title: STYLE_GLOSSARY[p.style.primary] || "",
      }, p.style.primary || "—"),
    ));
    card.appendChild(el("div", { className: "text-[11px] font-mono text-slate-300 mb-3 leading-relaxed" },
      el("span", { className: "text-slate-500 mr-2" }, "splits"),
      p.segments.map((s) => s.toFixed(2)).join("  "),
    ));
    const stats = [
      ["Split class", p.splitClass?.label || "—", SPLIT_CLASS_GLOSSARY[p.splitClass?.label]],
      ["Half differential", p.splitClass ? `${p.splitClass.diffPct.toFixed(2)}%` : "—", METRICS_GLOSSARY["Half differential"]],
      ["Peak decline", p.peakDeclinePct != null ? `${p.peakDeclinePct.toFixed(2)}%` : "—", METRICS_GLOSSARY["Peak decline"]],
      ["Monotonicity", p.monotonicityScore != null ? p.monotonicityScore.toFixed(2) : "—", METRICS_GLOSSARY["Monotonicity"]],
      ["Fastest segment", p.fastestSegmentIdx != null ? `seg ${p.fastestSegmentIdx} (${p.segments[p.fastestSegmentIdx].toFixed(2)}s)` : "—", "Index of the runner's fastest 100m or 200m segment."],
      ["Tags", `[${p.style.tags.join(", ")}]`, p.style.tags.map((t) => SECONDARY_TAG_GLOSSARY[t] || STYLE_GLOSSARY[t]).filter(Boolean).join(" · ")],
    ];
    const grid = el("dl", { className: "grid grid-cols-2 gap-x-3 gap-y-1 text-xs" });
    stats.forEach(([k, v, tip]) => {
      grid.appendChild(el("dt", {
        className: tip ? "text-slate-400 cursor-help" : "text-slate-400",
        title: tip || "",
      }, k));
      grid.appendChild(el("dd", { className: "text-right font-mono" }, v));
    });
    card.appendChild(grid);
    root.appendChild(card);
  });
}

function renderEventsTable(bundle, runners) {
  const root = document.getElementById("events");
  clear(root);

  const findRunner = (id) => runners.find((r) => r.id === id);
  const table = el("table", { className: "w-full text-sm" });
  const thead = el("thead", { className: "text-slate-400 border-b border-slate-700" },
    el("tr", {}, ["t (s)", "Distance", "Kind", "Subject", "Payload"].map((h) =>
      el("th", { className: "text-left py-2 px-2 font-medium" }, h))));
  const tbody = el("tbody", { className: "font-mono text-xs" });

  bundle.events.forEach((e) => {
    const subj = e.subjectId ? findRunner(e.subjectId)?.fullName : "(field)";
    tbody.appendChild(el("tr", { className: "border-b border-slate-800 hover:bg-slate-800/40" },
      el("td", { className: "py-2 px-2" }, e.dueTime.toFixed(2)),
      el("td", { className: "py-2 px-2" }, `${e.distance}m`),
      el("td", { className: "py-2 px-2 text-amber-300" }, e.kind),
      el("td", { className: "py-2 px-2" }, subj || "—"),
      el("td", { className: "py-2 px-2 text-slate-400 truncate", style: "max-width: 360px" },
        JSON.stringify(e.payload).slice(0, 120)),
    ));
  });
  table.appendChild(thead);
  table.appendChild(tbody);
  root.appendChild(table);
}

async function init() {
  try {
    const replayData = await loadHeatData();
    const level = COMPETITION_LEVEL_MAP[replayData.replayId] || null;
    const event = { ...replayData.event, competition_level: level };
    const bundle = analyzeRace(event, replayData.runners);

    renderHeader(replayData);
    renderLeaderboard(bundle, replayData.runners);
    renderGlossary();
    renderSplitsTable(bundle);
    renderRaceSignals(bundle, replayData.runners);
    renderHeatmap(bundle);
    renderBumpsChart(bundle, replayData.runners);
    renderEnergyDistribution(bundle);
    renderRunnerCards(bundle);
    renderEventsTable(bundle, replayData.runners);

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("content").classList.remove("hidden");
  } catch (err) {
    document.getElementById("loading").innerText = `Failed to load analysis: ${err.message}`;
    console.error(err);
  }
}

init();
