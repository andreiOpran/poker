// Bootstraps the setup screen and starts a session.

import { GameSession } from "./game.js";
import { Table } from "./ui.js";

const setupScreen = document.getElementById("setup");
const tableScreen = document.getElementById("table");

// Segmented controls: one active button per group.
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
  document.getElementById("blinds-readout").textContent = `Blinds ${sb} / ${bb}`;
}
updateBlindsReadout();

function showSetup() {
  tableScreen.classList.remove("active");
  setupScreen.classList.add("active");
  document.getElementById("actionbar").replaceChildren();
  document.getElementById("overlay").classList.remove("show");
  document.getElementById("overlay").replaceChildren();
}

document.getElementById("deal-btn").addEventListener("click", () => {
  const startingChips = +segVal("opt-chips");
  const numOpponents = +segVal("opt-opponents");
  const difficulty = segVal("opt-difficulty");
  const { sb, bb } = blindsFor(startingChips, segVal("opt-blinds"));

  const session = new GameSession({ startingChips, numOpponents, difficulty, sb, bb });

  setupScreen.classList.remove("active");
  tableScreen.classList.add("active");

  const table = new Table(session, showSetup);
  table.start();
});
