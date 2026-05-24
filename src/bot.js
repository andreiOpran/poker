// Bot AI: Monte Carlo equity vs random hands, then pot-odds policy.
// Mirrors the Python bot, including difficulty knobs.

import { ALL_CARDS } from "./cards.js";
import { evaluate } from "./evaluator.js";

export const DIFFICULTY_PARAMS = {
  easy:   { sims: 80,  jitter: 0.12, valueThresh: 0.74, callMargin: -0.10, bluffFreq: 0.05, aggr: 0.5 },
  medium: { sims: 220, jitter: 0.05, valueThresh: 0.64, callMargin: 0.00,  bluffFreq: 0.10, aggr: 0.7 },
  hard:   { sims: 420, jitter: 0.02, valueThresh: 0.57, callMargin: 0.04,  bluffFreq: 0.15, aggr: 0.9 },
};

function partialShuffle(deck, need, rng) {
  for (let i = 0; i < need; i++) {
    const j = i + Math.floor(rng() * (deck.length - i));
    const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
  }
}

export function estimateEquity(hole, community, numOpponents, sims, rng) {
  const known = new Set([...hole, ...community].map(c => c.id));
  const deck = ALL_CARDS.filter(c => !known.has(c.id));
  const needBoard = 5 - community.length;
  const need = numOpponents * 2 + needBoard;

  let score = 0;
  for (let s = 0; s < sims; s++) {
    partialShuffle(deck, need, rng);
    let idx = 0;
    const oppHands = [];
    for (let o = 0; o < numOpponents; o++) { oppHands.push([deck[idx], deck[idx + 1]]); idx += 2; }
    const board = community.concat(deck.slice(idx, idx + needBoard));

    const my = evaluate(hole.concat(board)).score;
    let bestOpp = -1;
    for (const oh of oppHands) {
      const v = evaluate(oh.concat(board)).score;
      if (v > bestOpp) bestOpp = v;
    }
    if (my > bestOpp) score += 1;
    else if (my === bestOpp) {
      let ties = 0;
      for (const oh of oppHands) if (evaluate(oh.concat(board)).score === my) ties++;
      score += 1 / (ties + 1);
    }
  }
  return score / sims;
}

// ctx: { community, currentBet, minRaise, pot, numOpponents, bigBlind, rng, street }
// Returns [action, amount]; for "raise", amount is the total street bet to raise to.
export function decide(player, ctx) {
  const p = DIFFICULTY_PARAMS[player.difficulty];
  const rng = ctx.rng;

  let equity = estimateEquity(player.hole, ctx.community, ctx.numOpponents, p.sims, rng);
  equity += (rng() * 2 - 1) * p.jitter;
  equity = Math.max(0, Math.min(1, equity));

  const toCall = ctx.currentBet - player.streetBet;

  const raiseTo = () => {
    const add = Math.max(ctx.minRaise, Math.floor(ctx.pot * p.aggr));
    const target = ctx.currentBet + add;
    const maxTarget = player.streetBet + player.chips; // all-in shove
    return Math.min(target, maxTarget);
  };

  // No bet to call: check or bet.
  if (toCall <= 0) {
    if (equity >= p.valueThresh && player.chips > 0) return ["raise", raiseTo()];
    if (rng() < p.bluffFreq && player.chips > ctx.bigBlind) return ["raise", raiseTo()];
    return ["check", 0];
  }

  // Facing a bet.
  const potOdds = toCall / (ctx.pot + toCall);

  if (equity >= p.valueThresh && player.chips > 0) {
    if ((ctx.street === "turn" || ctx.street === "river") && rng() < 0.25) return ["call", 0];
    return ["raise", raiseTo()];
  }
  if (equity >= potOdds + p.callMargin) return ["call", 0];
  if (rng() < p.bluffFreq && toCall <= ctx.pot * 0.5 && player.chips > toCall * 2) {
    return ["raise", raiseTo()];
  }
  return ["fold", 0];
}
