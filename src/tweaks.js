// Tweaks: lives inside the QUIT / pause menu modal.
// CRT (scanlines + grain + flicker combined) / Vignette / Chip Toss FX.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "crt": true,
  "vignette": true,
  "chipToss": true
}/*EDITMODE-END*/;

const STORE = "holdem.arcade.tweaks";

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return { ...TWEAK_DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...TWEAK_DEFAULTS };
}
function save(s) { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }

let state = load();

function applyState(s) {
  // CRT controls scanlines + grain + flicker together
  document.body.dataset.crt = s.crt ? "on" : "off";
  document.body.dataset.scanlines = s.crt ? "on" : "off";
  document.body.dataset.vignette = s.vignette ? "on" : "off";
  document.body.dataset.chipToss = s.chipToss ? "on" : "off";
}

const ROWS = [
  { key: "crt",      label: "CRT EFFECT" },
  { key: "vignette", label: "VIGNETTE" },
  { key: "chipToss", label: "CHIP TOSS FX" },
];

/**
 * Build a tweaks UI block and return its root element.
 * Caller appends this anywhere it wants (e.g. inside the pause modal).
 */
export function buildTweaksBlock() {
  const root = document.createElement("div");
  root.className = "tweaks-block";

  const title = document.createElement("h3");
  title.className = "tweaks-block-title";
  title.textContent = "★ TWEAKS ★";
  root.appendChild(title);

  for (const { key, label } of ROWS) {
    const row = document.createElement("div");
    row.className = "tweak-row";
    row.dataset.key = key;

    const span = document.createElement("span");
    span.textContent = label;

    const tog = document.createElement("button");
    tog.type = "button";
    tog.className = "toggle" + (state[key] ? " on" : "");
    tog.setAttribute("aria-pressed", state[key] ? "true" : "false");

    tog.addEventListener("click", (e) => {
      e.stopPropagation();
      state[key] = !state[key];
      applyState(state);
      save(state);
      tog.classList.toggle("on", !!state[key]);
      tog.setAttribute("aria-pressed", state[key] ? "true" : "false");
      // Persist via edit-mode protocol if hosted.
      try {
        window.parent.postMessage({
          type: "__edit_mode_set_keys",
          edits: { [key]: state[key] }
        }, "*");
      } catch (e2) {}
    });

    row.append(span, tog);
    root.appendChild(row);
  }

  return root;
}

export function mountTweaks() {
  applyState(state);

  // Listen for edit-mode protocol from the host shell.
  window.addEventListener("message", (e) => {
    const data = e?.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "__edit_mode_set_keys" && data.edits) {
      // Host pushed a value; merge & apply.
      Object.assign(state, data.edits);
      applyState(state);
      save(state);
    }
  });

  // Announce that this artifact supports tweaks.
  try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch (e) {}
}

// Expose state for ui.js (e.g. chip-toss FX gate).
export function tweakOn(key) { return !!state[key]; }
window.__tweakOn = tweakOn;
