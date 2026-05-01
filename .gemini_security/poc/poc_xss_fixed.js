import { JSDOM } from 'jsdom';
import { escapeHtml } from '../../js/utils.js';

// Mocking the fixed part of js/app.js
function simulateFixedBehavior(runner) {
  const dom = new JSDOM('<!DOCTYPE html><div id="startListContainer"></div>');
  const document = dom.window.document;
  const startListContainer = document.getElementById("startListContainer");

  const entry = document.createElement("div");
  // This is the fixed line from js/app.js
  entry.innerHTML = `
    <div class="w-8 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white bg-slate-700">
      L${runner.lane}
    </div>
    <div class="flex-grow min-w-0">
      <div class="font-bold truncate text-white ${runner.highlight ? "text-orange-400" : ""}">${escapeHtml(runner.fullName)}</div>
      <div class="text-gray-400 truncate text-[10px]">${escapeHtml(runner.team)}${runner.year ? ` | Year ${escapeHtml(runner.year)}` : ""}</div>
    </div>
    <div class="text-right text-gray-500 font-mono text-[10px]">
      ${runner.displayTime}
    </div>
  `;
  startListContainer.appendChild(entry);
  return dom.serialize();
}

const maliciousRunner = {
  lane: 1,
  highlight: false,
  fullName: "John <script>alert('XSS')</script>",
  team: "Evil Team",
  year: "2024",
  displayTime: "0:00.00"
};

console.log("Simulating fixed behavior with malicious runner data...");
const output = simulateFixedBehavior(maliciousRunner);

if (output.includes("<script>alert('XSS')</script>")) {
  console.log("FIX FAILED: Malicious script tag still found in rendered HTML!");
  process.exit(1);
} else {
  console.log("FIX VERIFIED: Malicious script tag was successfully escaped!");
  console.log("Rendered output sample:", output.substring(output.indexOf("John"), output.indexOf("John") + 50));
  process.exit(0);
}
