// Touch UI: renders the table and drives the engine generator.
// Arcade overhaul — adds chip toss FX, blinking pixel avatars,
// dealer mascot, topbar pot tally, and top-stack recording.

import { buildTweaksBlock } from "./tweaks.js";

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return e;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n) => n.toLocaleString("en-US");

// 8BitDeck.png atlas: rows = ♥0 ♣1 ♦2 ♠3, cols = ranks 2..A (col = rank-2).
const SUIT_ROW = { h: 0, c: 1, d: 2, s: 3 };
function cardEl(card, { anim = false, delay = 0, win = false } = {}) {
  const e = h("div", {
    class: "card sprite" + (anim ? " deal-anim" : "") + (win ? " win" : ""),
    style: `--col:${card.rank - 2};--row:${SUIT_ROW[card.suit]}`,
  });
  if (anim) e.style.animationDelay = delay + "ms";
  return e;
}
const backEl = ({ anim = false, delay = 0 } = {}) => {
  const e = h("div", { class: "card back" + (anim ? " deal-anim" : "") });
  if (anim) e.style.animationDelay = delay + "ms";
  return e;
};
const emptyEl = () => h("div", { class: "card empty" });

function bubbleClass(action) {
  if (action.startsWith("FOLD")) return "fold";
  if (action.startsWith("RAISE")) return "raise";
  if (action.startsWith("ALL-IN")) return "allin";
  if (action.startsWith("CALL")) return "call";
  if (action.startsWith("CHECK")) return "check";
  return "";
}

/* ---------- Chip toss FX ---------- */
const CHIP_VARIANTS = ["c-gold", "c-red", "c-blue", "c-green", "c-orange", "c-purple"];
function tossChips(fromEl, toEl, count = 3) {
  if (!fromEl || !toEl) return;
  // Respect the user's tweak toggle.
  if (typeof window.__tweakOn === "function" && !window.__tweakOn("chipToss")) return;

  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const sx = a.left + a.width / 2;
  const sy = a.top + a.height / 2;
  const ex = b.left + b.width / 2;
  const ey = b.top + b.height / 2;

  for (let i = 0; i < count; i++) {
    const c = document.createElement("div");
    const variant = CHIP_VARIANTS[(i + Math.floor(Math.random() * 3)) % CHIP_VARIANTS.length];
    c.className = "chip-toss " + variant;
    const jitterX = (Math.random() - 0.5) * 18;
    const jitterY = (Math.random() - 0.5) * 18;
    c.style.left = (sx - 11 + jitterX) + "px";
    c.style.top = (sy - 11 + jitterY) + "px";
    c.style.setProperty("--tx", (ex - sx) + "px");
    c.style.setProperty("--ty", (ey - sy) + "px");
    const dur = 460 + Math.random() * 180;
    const delay = i * 70;
    c.style.animation = `chipTossFly ${dur}ms cubic-bezier(.4,.0,.6,1) ${delay}ms forwards`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), dur + delay + 80);
  }
}

export class Table {
  constructor(session, onQuit) {
    this.session = session;
    this.onQuit = onQuit;
    this.reveal = false;
    this.winnerIds = new Set();
    this.prevPot = 0;
    this.prevBoardLen = 0;
    this.animateHole = false;
    this.playerEls = new Map(); // Player -> seat element

    this.elOpp = document.getElementById("opponents");
    this.elBoard = document.getElementById("board");
    this.elHero = document.getElementById("hero");
    this.elPotVal = document.getElementById("pot-val");
    this.elPot = document.getElementById("pot");
    this.elHandNo = document.getElementById("hand-no");
    this.elBar = document.getElementById("actionbar");
    this.elBanner = document.getElementById("banner");
    this.elOverlay = document.getElementById("overlay");
    this.elTopbarPot = document.getElementById("topbar-pot");
    this.elChipPile = document.getElementById("chip-pile");

    document.getElementById("menu-btn").onclick = () => this.menu();
  }

  start() { this.nextHand(); }

  nextHand() {
    this.reveal = false;
    this.winnerIds.clear();
    this.prevBoardLen = 0;
    this.clearBanner();
    this.gen = this.session.beginHand();
    this.animateHole = true;
    this.pump();
  }

  pump(input) {
    let res;
    try { res = this.gen.next(input); }
    catch (e) { console.error(e); return; }
    if (res.done) { this.afterHand(); return; }
    this.handle(res.value);
  }

  after(ms) { clearTimeout(this._t); this._t = setTimeout(() => this.pump(), ms); }

  handle(ev) {
    switch (ev.type) {
      case "deal": this.render(ev.state); this.animateHole = false; this.after(620); break;
      case "blinds":
        this.render(ev.state);
        // Throw chips for SB / BB.
        this.tossBlinds(ev.state);
        this.after(420);
        break;
      case "action":
        this.render(ev.state);
        this.tossForAction(ev.player);
        this.after(ev.player.isHuman ? 160 : 800);
        break;
      case "street": this.render(ev.state); this.after(680); break;
      case "awaitHuman": this.render(ev.state, { activeHero: true }); this.showActions(ev.info); break;
      case "foldWin": this.render(ev.state); this.endBanner(ev); break;
      case "showdown": this.reveal = true; this.render(ev.state); this.showdownBanner(ev); this.after(1500); break;
      case "awards": this.reveal = true; this.markWinners(ev.awards); this.render(ev.state); this.endBanner(ev); break;
    }
  }

  markWinners(awards) {
    for (const a of awards) for (const w of a.winners) this.winnerIds.add(w);
  }

  /* ---------- chip toss helpers ---------- */
  potEl() { return this.elPot; }
  seatElFor(p) { return this.playerEls.get(p); }
  tossForAction(p) {
    if (!p.lastAction) return;
    const a = p.lastAction;
    if (a.startsWith("FOLD") || a.startsWith("CHECK")) return;
    const from = p.isHuman ? this.elHero : this.seatElFor(p);
    const count = a.startsWith("ALL-IN") || a.startsWith("RAISE") ? 4 : 2;
    tossChips(from, this.potEl(), count);
  }
  tossBlinds(state) {
    const n = state.players.length;
    const sbI = n === 2 ? state.button : (state.button + 1) % n;
    const bbI = n === 2 ? (state.button + 1) % n : (state.button + 2) % n;
    for (const i of [sbI, bbI]) {
      const p = state.players[i];
      const from = p.isHuman ? this.elHero : this.seatElFor(p);
      tossChips(from, this.potEl(), i === sbI ? 1 : 2);
    }
  }

  /* ---------- render ---------- */
  render(state, opts = {}) {
    const n = state.players.length;
    const sbI = n === 2 ? state.button : (state.button + 1) % n;
    const bbI = n === 2 ? (state.button + 1) % n : (state.button + 2) % n;
    this.elHandNo.textContent = "HAND #" + state.handNo;

    // Opponents.
    this.playerEls.clear();
    const oppEls = state.players
      .map((p, i) => [p, i])
      .filter(([p]) => !p.isHuman)
      .map(([p, i]) => {
        const el = this.seat(state, p, i, sbI, bbI);
        this.playerEls.set(p, el);
        return el;
      });
    this.elOpp.replaceChildren(...oppEls);

    // Board.
    const board = state.community.map((card, i) =>
      cardEl(card, { anim: i >= this.prevBoardLen, delay: (i - this.prevBoardLen) * 110 }));
    while (board.length < 5) board.push(emptyEl());
    this.elBoard.replaceChildren(...board);
    this.prevBoardLen = state.community.length;

    // Pot.
    this.elPotVal.textContent = fmt(state.pot);
    if (this.elTopbarPot) this.elTopbarPot.textContent = fmt(state.pot);
    // Decorative chip pile hides when pot empty.
    if (this.elChipPile) this.elChipPile.classList.toggle("empty", state.pot === 0);
    if (state.pot !== this.prevPot) {
      this.elPot.classList.remove("bump"); void this.elPot.offsetWidth; this.elPot.classList.add("bump");
      this.prevPot = state.pot;
    }

    // Hero.
    this.elHero.replaceChildren(...this.heroBlock(state, opts.activeHero));
    this.elHero.classList.toggle("active-turn", !!opts.activeHero);
  }

  seat(state, p, idx, sbI, bbI) {
    const mini = h("div", { class: "mini-cards" });
    if (p.hole.length) {
      const showFace = this.reveal && p.inHand;
      const win = this.winnerIds.has(p);
      mini.append(...p.hole.map((card, k) => showFace
        ? cardEl(card, { anim: this.animateHole, delay: k * 90, win })
        : backEl({ anim: this.animateHole, delay: k * 90 })));
    } else {
      mini.append(emptyEl(), emptyEl());
    }

    // Per-bot eye color + blink delay + blink duration derived from name (stable, distinct).
    const eyeColors = ["#ffe089", "#ff8a9b", "#8be8a8", "#8fc7ff", "#d6b8ff"];
    const nameSum = [...p.name].reduce((a, c) => a + c.charCodeAt(0), 0);
    const nameHash = [...p.name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const eyeColor = eyeColors[nameSum % eyeColors.length];
    const blinkDelay = ((nameHash % 3700) / 1000).toFixed(2);            // 0.0 – 3.7 s
    const blinkDur = (3 + ((nameHash >> 8) % 2500) / 1000).toFixed(2);   // 3.0 – 5.5 s
    const avatarStyle = `--blink-delay:${blinkDelay}s;--eye-color:${eyeColor};--blink-dur:${blinkDur}s`;

    const frame = h("div", { class: "seat-frame" },
      mini,
      h("div", { class: "avatar", style: avatarStyle }),
      h("div", { class: "name" }, p.name),
      h("div", { class: "stack" }, fmt(p.chips)),
    );

    const kids = [frame];
    if (p.lastAction)
      kids.push(h("div", { class: "bubble " + bubbleClass(p.lastAction) }, p.lastAction));
    if (idx === state.button) kids.push(h("div", { class: "dealer-btn" }, "D"));

    const cls = ["seat", p.folded ? "folded" : "", this.winnerIds.has(p) ? "winner" : ""].join(" ");
    return h("div", { class: cls.trim() }, ...kids);
  }

  heroBlock(state, active) {
    const human = this.session.human;
    const win = this.winnerIds.has(human);
    const isButton = state.players[state.button] === human;
    const cards = h("div", { class: "hero-cards" },
      ...(human.hole.length
        ? human.hole.map((card, k) => cardEl(card, { anim: this.animateHole, delay: k * 90, win }))
        : [emptyEl(), emptyEl()]));
    const nameEl = h("div", { class: "hero-name" + (win ? " winner" : "") },
      human.name + (human.folded ? " · FOLDED" : ""));
    if (isButton) nameEl.append(h("span", { class: "dealer-btn-hero" }, "D"));
    const info = h("div", { class: "hero-info" },
      nameEl,
      h("div", { class: "stack" }, fmt(human.chips)),
      human.lastAction ? h("div", { class: "bubble " + bubbleClass(human.lastAction), style: "position:static;align-self:flex-start;top:auto;right:auto" }, human.lastAction) : null,
    );
    return [cards, info];
  }

  /* ---------- banners ---------- */
  banner(big, sub) {
    this.elBanner.replaceChildren(h("div", { class: "banner-inner" },
      h("div", { class: "big" }, big), sub ? h("div", { class: "sub" }, sub) : null));
    this.elBanner.classList.add("show");
  }
  clearBanner() { this.elBanner.classList.remove("show"); this.elBanner.replaceChildren(); }

  showdownBanner(ev) {
    const top = ev.results[0];
    this.banner("★ SHOWDOWN ★", `${top.player.name.toUpperCase()} · ${top.hand.name.toUpperCase()}`);
  }

  endBanner(ev) {
    if (ev.type === "foldWin") {
      this.banner(`${ev.winner.name.toUpperCase()} WINS`, `${fmt(ev.amount)} · EVERYONE FOLDED`);
    } else {
      const parts = ev.awards.map(a => {
        const names = a.winners.map(w => w.name.toUpperCase()).join(", ");
        return a.winners.length > 1 ? `${names} SPLIT ${fmt(a.amount)}` : `${names} WINS ${fmt(a.amount)}`;
      });
      this.banner(parts.length === 1 && ev.awards[0].winners.length === 1
        ? `${ev.awards[0].winners[0].name.toUpperCase()} WINS` : "POT AWARDED", parts.join(" · "));
    }
    this.bar(h("button", { class: "btn btn-gold btn-jumbo", onclick: () => { this.clearBanner(); this.pump(); } },
      h("span", { class: "btn-glyph" }, "▶"), "NEXT HAND"));
  }

  /* ---------- action bar ---------- */
  bar(...children) { this.elBar.replaceChildren(...children); }
  hideActions() { this.bar(h("div", { class: "waiting" }, "· · ·  WAITING  · · ·")); }

  showActions(info) {
    const resolve = (resp) => { this.hideActions(); this.pump(resp); };
    const { toCall, canCheck, canRaise, minRaiseTo, maxRaiseTo, currentBet, pot } = info;
    const onlyAllInRaise = minRaiseTo >= maxRaiseTo;

    const row = h("div", { class: "action-row" });
    if (canCheck) {
      row.append(h("button", { class: "btn btn-green", onclick: () => resolve(["check", 0]) }, "CHECK"));
    } else {
      row.append(
        h("button", { class: "btn btn-red", onclick: () => resolve(["fold", 0]) }, "FOLD"),
        h("button", { class: "btn btn-green", onclick: () => resolve(["call", 0]) }, "CALL " + fmt(toCall)));
    }

    let panel = null;
    if (canRaise) {
      const raiseLabel = canCheck ? "BET" : "RAISE";
      if (onlyAllInRaise) {
        row.append(h("button", { class: "btn btn-gold", onclick: () => resolve(["raise", maxRaiseTo]) },
          "ALL-IN " + fmt(maxRaiseTo)));
      } else {
        const toggle = h("button", { class: "btn btn-gold", onclick: () => panel.classList.toggle("open") }, raiseLabel);
        row.append(toggle);
        panel = this.raisePanel(info, resolve);
      }
    }
    this.bar(row, panel || "");
  }

  raisePanel(info, resolve) {
    const { minRaiseTo, maxRaiseTo, currentBet, pot, canCheck } = info;
    const amtEl = h("div", { class: "amt" }, fmt(minRaiseTo));
    const slider = h("input", { type: "range", class: "slider", min: minRaiseTo, max: maxRaiseTo, value: minRaiseTo, step: 1 });

    const setVal = (v) => {
      v = clamp(Math.round(v), minRaiseTo, maxRaiseTo);
      slider.value = v; amtEl.textContent = fmt(v);
      const pct = ((v - minRaiseTo) / Math.max(1, maxRaiseTo - minRaiseTo)) * 100;
      slider.style.setProperty("--fill", pct + "%");
      confirm.textContent = (v >= maxRaiseTo ? "ALL-IN " : "RAISE TO ") + fmt(v);
    };
    slider.addEventListener("input", () => setVal(+slider.value));

    const preset = (label, value) =>
      h("button", { class: "btn btn-ghost", onclick: () => setVal(value) }, label);
    const half = clamp(currentBet + Math.round(pot * 0.5), minRaiseTo, maxRaiseTo);
    const full = clamp(currentBet + pot, minRaiseTo, maxRaiseTo);

    const confirm = h("button", { class: "btn btn-gold btn-jumbo", onclick: () => resolve(["raise", +slider.value]) }, "RAISE");

    const panel = h("div", { class: "raise-panel" },
      h("div", { class: "raise-head" },
        h("span", { class: "lbl" }, canCheck ? "Bet to" : "Raise to"), amtEl),
      slider,
      h("div", { class: "raise-presets" },
        preset("MIN", minRaiseTo), preset("½ POT", half), preset("POT", full), preset("ALL-IN", maxRaiseTo)),
      confirm,
    );
    setVal(minRaiseTo);
    return panel;
  }

  /* ---------- end-of-hand / modals ---------- */
  afterHand() {
    // Record top stack across the human's play
    if (typeof window.__recordTopStack === "function") {
      window.__recordTopStack(this.session.human.chips);
    }
    const status = this.session.endHand();
    if (status.winner) return this.gameOver(status.winner);
    if (status.humanBroke) return this.rebuyModal();
    this.nextHand();
  }

  modal(...children) {
    this.elOverlay.replaceChildren(h("div", { class: "modal" }, ...children));
    this.elOverlay.classList.add("show");
  }
  closeModal() { this.elOverlay.classList.remove("show"); this.elOverlay.replaceChildren(); }

  standings() {
    const rows = [...this.session.players].sort((a, b) => b.chips - a.chips).map(p =>
      h("div", { class: "row" + (p.chips === 0 ? " out" : "") + (p.isHuman ? " you" : "") },
        h("span", { class: "nm" }, p.name.toUpperCase() + (p.chips === 0 ? " · OUT" : "")),
        h("span", { class: "chips" }, fmt(p.chips))));
    return h("div", { class: "standings" }, ...rows);
  }

  rebuyModal() {
    this.bar(h("div", { class: "waiting" }, "· · · BUSTED · · ·"));
    this.modal(
      h("h2", { class: "lose" }, "GAME OVER"),
      h("p", {}, "You're out of chips. Insert coin to rebuy?"),
      this.standings(),
      h("button", { class: "btn btn-gold btn-jumbo", onclick: () => { this.session.rebuyHuman(); this.closeModal(); this.nextHand(); } },
        h("span", { class: "btn-glyph" }, "◎"), "REBUY " + fmt(this.session.startingChips)),
      h("button", { class: "btn btn-ghost btn-jumbo", onclick: () => this.onQuit() }, "CASH OUT"),
    );
  }

  gameOver(winner) {
    this.bar(h("div", { class: "waiting" }, "· · · GAME OVER · · ·"));
    const won = winner.isHuman;
    this.modal(
      h("h2", { class: won ? "win" : "lose" }, won ? "★ YOU WIN ★" : "YOU'RE OUT"),
      h("p", {}, won ? "You took every chip on the table." : `${winner.name} cleaned up the table.`),
      this.standings(),
      h("button", { class: "btn btn-gold btn-jumbo", onclick: () => this.onQuit() },
        h("span", { class: "btn-glyph" }, "▶"), "NEW GAME"),
    );
  }

  menu() {
    this.modal(
      h("h2", { class: "paused" }, "PAUSED"),
      this.standings(),
      buildTweaksBlock(),
      h("button", { class: "btn btn-green btn-jumbo", onclick: () => this.closeModal() },
        h("span", { class: "btn-glyph" }, "▶"), "RESUME"),
      h("button", { class: "btn btn-ghost btn-jumbo", onclick: () => this.onQuit() }, "QUIT TO TITLE"),
    );
  }
}
