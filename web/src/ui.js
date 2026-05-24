// Touch UI: renders the table and drives the engine generator.

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

function cardEl(card, { anim = false, delay = 0, win = false } = {}) {
  const cls = ["card", "face", card.isRed ? "red" : "", anim ? "deal-anim" : "", win ? "win" : ""].join(" ");
  const e = h("div", { class: cls.trim() },
    h("div", { class: "corner tl" }, h("span", { class: "r" }, card.rankStr), h("span", { class: "s" }, card.glyph)),
    h("div", { class: "pip" }, card.glyph),
    h("div", { class: "corner br" }, h("span", { class: "r" }, card.rankStr), h("span", { class: "s" }, card.glyph)),
  );
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

export class Table {
  constructor(session, onQuit) {
    this.session = session;
    this.onQuit = onQuit;
    this.reveal = false;
    this.winnerIds = new Set();
    this.prevPot = 0;
    this.prevBoardLen = 0;
    this.animateHole = false;

    this.elOpp = document.getElementById("opponents");
    this.elBoard = document.getElementById("board");
    this.elHero = document.getElementById("hero");
    this.elPotVal = document.getElementById("pot-val");
    this.elPot = document.getElementById("pot");
    this.elHandNo = document.getElementById("hand-no");
    this.elBar = document.getElementById("actionbar");
    this.elBanner = document.getElementById("banner");
    this.elOverlay = document.getElementById("overlay");

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
      case "blinds": this.render(ev.state); this.after(420); break;
      case "action": this.render(ev.state); this.after(ev.player.isHuman ? 160 : 800); break;
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

  // ---------------- render ----------------
  render(state, opts = {}) {
    const n = state.players.length;
    const sbI = n === 2 ? state.button : (state.button + 1) % n;
    const bbI = n === 2 ? (state.button + 1) % n : (state.button + 2) % n;
    this.elHandNo.textContent = "Hand #" + state.handNo;

    // Opponents.
    this.elOpp.replaceChildren(...state.players
      .map((p, i) => [p, i])
      .filter(([p]) => !p.isHuman)
      .map(([p, i]) => this.seat(state, p, i, sbI, bbI)));

    // Board.
    const board = state.community.map((card, i) =>
      cardEl(card, { anim: i >= this.prevBoardLen, delay: (i - this.prevBoardLen) * 110 }));
    while (board.length < 5) board.push(emptyEl());
    this.elBoard.replaceChildren(...board);
    this.prevBoardLen = state.community.length;

    // Pot.
    this.elPotVal.textContent = fmt(state.pot);
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
    const kids = [
      mini,
      h("div", { class: "name" }, p.name),
      h("div", { class: "stack" }, fmt(p.chips)),
    ];
    if (p.lastAction)
      kids.push(h("div", { class: "bubble " + bubbleClass(p.lastAction) }, p.lastAction));
    if (idx === state.button) kids.push(h("div", { class: "dealer-btn" }, "D"));

    const cls = ["seat", p.folded ? "folded" : "", this.winnerIds.has(p) ? "winner" : ""].join(" ");
    return h("div", { class: cls.trim() }, ...kids);
  }

  heroBlock(state, active) {
    const human = this.session.human;
    const win = this.winnerIds.has(human);
    const cards = h("div", { class: "hero-cards" },
      ...(human.hole.length
        ? human.hole.map((card, k) => cardEl(card, { anim: this.animateHole, delay: k * 90, win }))
        : [emptyEl(), emptyEl()]));
    const info = h("div", { class: "hero-info" },
      h("div", { class: "hero-name" + (win ? " winner" : "") }, human.name + (human.folded ? " · folded" : "")),
      h("div", { class: "stack" }, fmt(human.chips) + " chips"),
      human.lastAction ? h("div", { class: "bubble " + bubbleClass(human.lastAction), style: "position:static;align-self:flex-start" }, human.lastAction) : null,
    );
    return [cards, info];
  }

  // ---------------- banners ----------------
  banner(big, sub) {
    this.elBanner.replaceChildren(h("div", { class: "banner-inner" },
      h("div", { class: "big" }, big), sub ? h("div", { class: "sub" }, sub) : null));
    this.elBanner.classList.add("show");
  }
  clearBanner() { this.elBanner.classList.remove("show"); this.elBanner.replaceChildren(); }

  showdownBanner(ev) {
    const top = ev.results[0];
    this.banner("SHOWDOWN", `${top.player.name}: ${top.hand.name}`);
  }

  endBanner(ev) {
    if (ev.type === "foldWin") {
      this.banner(`${ev.winner.name} wins`, `${fmt(ev.amount)} · everyone folded`);
    } else {
      const parts = ev.awards.map(a => {
        const names = a.winners.map(w => w.name).join(", ");
        return a.winners.length > 1 ? `${names} split ${fmt(a.amount)}` : `${names} wins ${fmt(a.amount)}`;
      });
      this.banner(parts.length === 1 && ev.awards[0].winners.length === 1
        ? `${ev.awards[0].winners[0].name} wins` : "Pot awarded", parts.join(" · "));
    }
    this.bar(h("button", { class: "btn btn-gold btn-jumbo", onclick: () => { this.clearBanner(); this.pump(); } },
      "NEXT HAND"));
  }

  // ---------------- action bar ----------------
  bar(...children) { this.elBar.replaceChildren(...children); }
  hideActions() { this.bar(h("div", { class: "waiting" }, "···")); }

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
        preset("Min", minRaiseTo), preset("½ Pot", half), preset("Pot", full), preset("All-in", maxRaiseTo)),
      confirm,
    );
    setVal(minRaiseTo);
    return panel;
  }

  // ---------------- end of hand / modals ----------------
  afterHand() {
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
        h("span", { class: "nm" }, p.name + (p.chips === 0 ? " · out" : "")),
        h("span", { class: "chips" }, fmt(p.chips))));
    return h("div", { class: "standings" }, ...rows);
  }

  rebuyModal() {
    this.bar(h("div", { class: "waiting" }, "···"));
    this.modal(
      h("h2", { class: "lose" }, "Busted!"),
      h("p", {}, "You're out of chips."),
      this.standings(),
      h("button", { class: "btn btn-gold btn-jumbo", onclick: () => { this.session.rebuyHuman(); this.closeModal(); this.nextHand(); } },
        "REBUY " + fmt(this.session.startingChips)),
      h("button", { class: "btn btn-ghost btn-jumbo", onclick: () => this.onQuit() }, "CASH OUT"),
    );
  }

  gameOver(winner) {
    this.bar(h("div", { class: "waiting" }, "···"));
    const won = winner.isHuman;
    this.modal(
      h("h2", { class: won ? "win" : "lose" }, won ? "🏆 YOU WIN" : "YOU'RE OUT"),
      h("p", {}, won ? "You took every chip on the table." : `${winner.name} cleaned up the table.`),
      this.standings(),
      h("button", { class: "btn btn-gold btn-jumbo", onclick: () => this.onQuit() }, "NEW GAME"),
    );
  }

  menu() {
    this.modal(
      h("h2", {}, "Paused"),
      this.standings(),
      h("button", { class: "btn btn-green btn-jumbo", onclick: () => this.closeModal() }, "RESUME"),
      h("button", { class: "btn btn-ghost btn-jumbo", onclick: () => this.onQuit() }, "QUIT TO MENU"),
    );
  }
}
