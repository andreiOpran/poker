// Hold'em hand engine as a generator state machine.
//
// `playHand` yields events the UI renders (deal, blinds, action, street,
// showdown, awards, foldWin). When the human must act it yields
// { type:"awaitHuman", info } and pauses; the driver resumes with
// gen.next([action, amount]). All rules live here.

import { Deck } from "./cards.js";
import { evaluate } from "./evaluator.js";
import { decide } from "./bot.js";

export class GameState {
  constructor(players, button, sb, bb, deck, handNo = 0) {
    this.players = players;
    this.button = button;
    this.sb = sb;
    this.bb = bb;
    this.deck = deck;
    this.community = [];
    this.currentBet = 0;
    this.minRaise = 0;
    this.street = "preflop";
    this.handNo = handNo;
  }
  get pot() { return this.players.reduce((s, p) => s + p.totalCommitted, 0); }
}

export class PokerEngine {
  constructor(rng = Math.random) { this.rng = rng; }

  _blindIndices(n, button) {
    if (n === 2) return [button, (button + 1) % n];
    return [(button + 1) % n, (button + 2) % n];
  }

  _firstToAct(n, button, preflop) {
    const [, bb] = this._blindIndices(n, button);
    if (preflop) return n === 2 ? button : (bb + 1) % n;
    return n === 2 ? bb : (button + 1) % n;
  }

  *playHand(players, button, sb, bb, handNo) {
    const deck = new Deck(this.rng);
    const state = new GameState(players, button, sb, bb, deck, handNo);
    this.state = state;
    const n = players.length;

    for (const p of players) { p.resetForHand(); p.lastAction = ""; }

    // Deal two hole cards each, starting left of the button.
    for (let k = 0; k < 2; k++)
      for (let off = 1; off <= n; off++)
        players[(button + off) % n].hole.push(...deck.deal(1));
    yield { type: "deal", state };

    this._postBlinds(players, button, sb, bb);
    yield { type: "blinds", state };

    const streets = [["preflop", 0], ["flop", 3], ["turn", 1], ["river", 1]];
    let runout = false;

    for (const [name, ncards] of streets) {
      state.street = name;
      if (name !== "preflop") {
        for (const p of players) p.resetForStreet();
        state.currentBet = 0;
        state.minRaise = bb;
        state.community.push(...deck.deal(ncards));
        yield { type: "street", name, state };
      }

      if (!runout) {
        const start = this._firstToAct(n, button, name === "preflop");
        yield* this._bettingRound(players, start);

        if (players.filter(p => p.inHand).length === 1) {
          const winner = players.find(p => p.inHand);
          const amount = state.pot;
          winner.chips += amount;
          yield { type: "foldWin", winner, amount, state };
          return;
        }
        if (players.filter(p => p.canAct).length <= 1) runout = true;
      }
    }

    while (state.community.length < 5) state.community.push(...deck.deal(1));

    const inPlayers = players.filter(p => p.inHand);
    const results = inPlayers
      .map(p => ({ player: p, hand: evaluate(p.hole.concat(state.community)) }))
      .sort((a, b) => b.hand.score - a.hand.score);
    yield { type: "showdown", results, state };

    const awards = this._awardPots(state);
    yield { type: "awards", awards, state };
  }

  _postBlinds(players, button, sb, bb) {
    const n = players.length;
    const [sbI, bbI] = this._blindIndices(n, button);
    const postedSb = players[sbI].bet(sb);
    players[sbI].lastAction = `SB ${postedSb}`;
    const postedBb = players[bbI].bet(bb);
    players[bbI].lastAction = `BB ${postedBb}`;
    this.state.currentBet = bb;
    this.state.minRaise = bb;
  }

  *_bettingRound(players, startIdx) {
    const n = players.length;
    let idx = startIdx;
    let guard = 0;
    while (true) {
      let steps = 0;
      while (steps < n && !players[idx].canAct) { idx = (idx + 1) % n; steps++; }
      if (steps === n) return;

      const p = players[idx];
      const toCall = this.state.currentBet - p.streetBet;
      if (p.hasActed && toCall === 0) return;

      yield* this._act(players, p);
      if (players.filter(q => q.inHand).length === 1) return;

      idx = (idx + 1) % n;
      if (++guard > 10000) return;
    }
  }

  *_act(players, p) {
    const st = this.state;
    const toCall = st.currentBet - p.streetBet;
    const canCheck = toCall === 0;
    const maxRaiseTo = p.streetBet + p.chips;
    const minRaiseTo = st.currentBet + st.minRaise;
    const canRaise = maxRaiseTo > st.currentBet;

    let action, amount;
    if (p.isHuman) {
      const info = {
        toCall: Math.min(toCall, p.chips),
        canCheck, canRaise,
        minRaiseTo: Math.min(minRaiseTo, maxRaiseTo),
        maxRaiseTo,
        currentBet: st.currentBet,
        pot: st.pot,
      };
      const resp = yield { type: "awaitHuman", player: p, info, state: st };
      [action, amount] = resp;
    } else {
      const opponents = Math.max(1, players.filter(q => q.inHand && q !== p).length);
      const ctx = {
        community: st.community.slice(),
        currentBet: st.currentBet,
        minRaise: st.minRaise,
        pot: st.pot,
        numOpponents: opponents,
        bigBlind: st.bb,
        rng: this.rng,
        street: st.street,
      };
      [action, amount] = decide(p, ctx);
    }

    this._applyAction(p, action, amount);
    p.hasActed = true;
    yield { type: "action", player: p, state: st };
  }

  _applyAction(p, action, amount) {
    const st = this.state;
    const toCall = st.currentBet - p.streetBet;

    if (action === "fold") {
      if (toCall <= 0) { p.lastAction = "CHECK"; return; }
      p.folded = true;
      p.lastAction = "FOLD";
      return;
    }
    if (action === "check") {
      if (toCall > 0) this._doCall(p, toCall);
      else p.lastAction = "CHECK";
      return;
    }
    if (action === "call") {
      if (toCall <= 0) p.lastAction = "CHECK";
      else this._doCall(p, toCall);
      return;
    }
    if (action === "raise") {
      let target = Math.min(amount, p.streetBet + p.chips);
      const fullMin = Math.min(st.currentBet + st.minRaise, p.streetBet + p.chips);
      if (target < fullMin && target !== p.streetBet + p.chips) {
        target = st.currentBet + st.minRaise;
      }
      p.bet(target - p.streetBet);
      const newBet = p.streetBet;
      if (newBet > st.currentBet) {
        const inc = newBet - st.currentBet;
        if (inc >= st.minRaise) st.minRaise = inc;
        st.currentBet = newBet;
        p.lastAction = (p.allIn ? "ALL-IN " : "RAISE ") + newBet;
      } else {
        p.lastAction = (p.allIn ? "ALL-IN " : "CALL ") + newBet;
      }
      return;
    }
    throw new Error("Unknown action: " + action);
  }

  _doCall(p, toCall) {
    p.bet(toCall);
    p.lastAction = (p.allIn ? "ALL-IN " : "CALL ") + p.streetBet;
  }

  // --- pots ---
  static computePots(players) {
    let contribs = new Map();
    for (const p of players) if (p.totalCommitted > 0) contribs.set(p, p.totalCommitted);
    const pots = [];
    while (contribs.size) {
      const layer = Math.min(...contribs.values());
      const participants = [...contribs.keys()];
      const amount = layer * participants.length;
      const eligible = participants.filter(p => p.inHand);
      pots.push({ amount, eligible, participants });
      const next = new Map();
      for (const p of participants) {
        const rest = contribs.get(p) - layer;
        if (rest > 0) next.set(p, rest);
      }
      contribs = next;
    }
    return pots;
  }

  _orderFromButton(contenders) {
    const players = this.state.players;
    const n = players.length;
    const order = [];
    for (let off = 1; off <= n; off++) order.push(players[(this.state.button + off) % n]);
    return order.filter(p => contenders.includes(p));
  }

  _awardPots(state) {
    const awards = [];
    for (const pot of PokerEngine.computePots(state.players)) {
      if (pot.eligible.length === 0) {
        const share = Math.floor(pot.amount / pot.participants.length);
        for (const p of pot.participants) p.chips += share;
        continue;
      }
      let best = -1;
      for (const p of pot.eligible) {
        const s = evaluate(p.hole.concat(state.community)).score;
        if (s > best) best = s;
      }
      let winners = pot.eligible.filter(
        p => evaluate(p.hole.concat(state.community)).score === best);
      winners = this._orderFromButton(winners);
      const split = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - split * winners.length;
      for (const w of winners) w.chips += split;
      if (remainder) winners[0].chips += remainder;
      awards.push({ winners, split, amount: pot.amount });
    }
    return awards;
  }
}
