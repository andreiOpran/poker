// Session controller: players, button rotation, elimination, rebuy, win.
// Pure logic; no DOM. The UI drives hands via the engine generator.

import { PokerEngine } from "./engine.js";
import { Player } from "./player.js";
import { makeRng } from "./cards.js";

const BOT_NAMES = ["Ace", "Boris", "Carmen", "Dakota"];

export class GameSession {
  constructor({ startingChips, numOpponents, difficulty, sb, bb, seed }) {
    this.startingChips = startingChips;
    this.sb = sb;
    this.bb = bb;
    this.rng = makeRng(seed);
    this.engine = new PokerEngine(this.rng);

    this.players = [new Player("You", startingChips, true)];
    for (let i = 0; i < numOpponents; i++)
      this.players.push(new Player(BOT_NAMES[i], startingChips, false, difficulty));

    this.human = this.players[0];
    this.dealerAbs = Math.floor(this.rng() * this.players.length);
    this.handNo = 0;
  }

  get seated() { return this.players.filter(p => p.chips > 0); }

  // Returns the engine generator for one hand.
  beginHand() {
    const n = this.players.length;
    let btnPlayer;
    for (let o = 0; o < n; o++) {
      const cand = this.players[(this.dealerAbs + o) % n];
      if (cand.chips > 0) { btnPlayer = cand; break; }
    }
    this._btnPlayer = btnPlayer;
    const seated = this.seated;
    this.handNo++;
    return this.engine.playHand(seated, seated.indexOf(btnPlayer), this.sb, this.bb, this.handNo);
  }

  // Called after a hand's awards. Returns status for the UI.
  endHand() {
    const n = this.players.length;
    this.dealerAbs = (this.players.indexOf(this._btnPlayer) + 1) % n;

    const bustedBots = this.players.filter(
      p => p.chips === 0 && !p.eliminated && !p.isHuman);
    for (const p of bustedBots) p.eliminated = true;

    const humanBroke = this.human.chips === 0;
    const alive = this.players.filter(p => p.chips > 0);
    const winner = alive.length === 1 ? alive[0] : null;
    return { bustedBots, humanBroke, winner };
  }

  rebuyHuman() {
    this.human.chips = this.startingChips;
    this.human.eliminated = false;
  }
}
