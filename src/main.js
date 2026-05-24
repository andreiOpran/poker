// Bootstraps title -> setup -> table flow.

import { GameSession } from "./game.js";
import { Table } from "./ui.js";
import { mountTweaks } from "./tweaks.js";

const titleScreen = document.getElementById("title");
const setupScreen = document.getElementById("setup");
const tableScreen = document.getElementById("table");

/* ---------- screen helpers ---------- */
function show(el) {
  for (const s of document.querySelectorAll(".screen")) s.classList.remove("active");
  el.classList.add("active");
}

/* ---------- title screen ---------- */
function goSetup() {
  show(setupScreen);
}
titleScreen.addEventListener("click", goSetup);
titleScreen.addEventListener("touchstart", goSetup, {passive: true});
const pressStartBtn = document.getElementById("press-start-btn");
if (pressStartBtn) {
  pressStartBtn.addEventListener("click", goSetup);
  pressStartBtn.addEventListener("touchstart", goSetup, {passive: true});
}

document.addEventListener("keydown", (e) => {
  if (!titleScreen.classList.contains("active")) return;
  if (e.key === " " || e.key === "Enter") goSetup();
});

/* ---------- segmented controls ---------- */
for (const seg of document.querySelectorAll(".seg")) {
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    for (const b of seg.children) b.classList.toggle("on", b === btn);
    if (seg.id === "opt-chips" || seg.id === "opt-blinds") updateBlindsReadout();
  });
}
const segVal = (id) => document.querySelector(`#${id} button.on`).dataset.val;

function blindsFor(chips, level) {
  const div = { low: 100, med: 50, high: 25 }[level];
  let bb = Math.max(2, Math.round(chips / div));
  const sb = Math.max(1, Math.floor(bb / 2));
  return { sb, bb };
}
function updateBlindsReadout() {
  const chips = +segVal("opt-chips");
  const { sb, bb } = blindsFor(chips, segVal("opt-blinds"));
  document.getElementById("blinds-readout").textContent = `BLINDS  ${sb} / ${bb}`;
}
updateBlindsReadout();

/* ---------- back button on setup ---------- */
document.getElementById("setup-back").addEventListener("click", () => show(titleScreen));

/* ---------- top-stack on title ---------- */
const HI_KEY = "holdem.arcade.topStack";
function refreshHiScore() {
  const v = +(localStorage.getItem(HI_KEY) || 0);
  document.getElementById("hi-score").textContent = v ? v.toLocaleString("en-US") : "- -";
}
refreshHiScore();
function recordTopStack(value) {
  const prev = +(localStorage.getItem(HI_KEY) || 0);
  if (value > prev) {
    localStorage.setItem(HI_KEY, String(value));
    refreshHiScore();
  }
}
window.__recordTopStack = recordTopStack;

/* ---------- quit to title ---------- */
function showSetup() {
  show(titleScreen);
  document.getElementById("actionbar").replaceChildren();
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("overlay").replaceChildren();
  refreshHiScore();
}

/* ---------- deal me in ---------- */
document.getElementById("deal-btn").addEventListener("click", () => {
  const startingChips = +segVal("opt-chips");
  const numOpponents = +segVal("opt-opponents");
  const difficulty = segVal("opt-difficulty");
  const { sb, bb } = blindsFor(startingChips, segVal("opt-blinds"));

  const session = new GameSession({ startingChips, numOpponents, difficulty, sb, bb });
  show(tableScreen);

  const table = new Table(session, showSetup);
  window.__table = table; // for chip-toss helpers
  table.start();
});

/* ---------- mount Tweaks panel ---------- */
mountTweaks();
