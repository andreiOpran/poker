// Texas Hold'em hand evaluation. Mirrors the Python evaluator.
// Produces an integer score (higher = better); equal scores tie.

import { RANK_STR } from "./cards.js";

export const HIGH_CARD = 0, ONE_PAIR = 1, TWO_PAIR = 2, THREE_KIND = 3,
  STRAIGHT = 4, FLUSH = 5, FULL_HOUSE = 6, FOUR_KIND = 7, STRAIGHT_FLUSH = 8;

export const CATEGORY_NAME = {
  0: "High Card", 1: "Pair", 2: "Two Pair", 3: "Three of a Kind",
  4: "Straight", 5: "Flush", 6: "Full House", 7: "Four of a Kind",
  8: "Straight Flush",
};

const PLURAL = {
  2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
  8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens",
  13: "Kings", 14: "Aces",
};

function bestStraightHigh(rankSet) {
  const s = new Set(rankSet);
  if (s.has(14)) s.add(1); // wheel: A plays low
  for (let high = 14; high >= 5; high--) {
    let ok = true;
    for (let i = 0; i < 5; i++) if (!s.has(high - i)) { ok = false; break; }
    if (ok) return high;
  }
  return null;
}

// Encode category + up to 5 tiebreakers (each < 16) into one comparable int.
function encode(category, tb) {
  const t = tb.concat([0, 0, 0, 0, 0]).slice(0, 5);
  return ((((category * 16 + t[0]) * 16 + t[1]) * 16 + t[2]) * 16 + t[3]) * 16 + t[4];
}

function nameFor(category, tb) {
  switch (category) {
    case STRAIGHT_FLUSH: return tb[0] === 14 ? "Royal Flush" : `Straight Flush, ${RANK_STR[tb[0]]} high`;
    case FOUR_KIND: return `Four of a Kind, ${PLURAL[tb[0]]}`;
    case FULL_HOUSE: return `Full House, ${PLURAL[tb[0]]} over ${PLURAL[tb[1]]}`;
    case FLUSH: return `Flush, ${RANK_STR[tb[0]]} high`;
    case STRAIGHT: return `Straight, ${RANK_STR[tb[0]]} high`;
    case THREE_KIND: return `Three of a Kind, ${PLURAL[tb[0]]}`;
    case TWO_PAIR: return `Two Pair, ${PLURAL[tb[0]]} and ${PLURAL[tb[1]]}`;
    case ONE_PAIR: return `Pair of ${PLURAL[tb[0]]}`;
    default: return `High Card ${RANK_STR[tb[0]]}`;
  }
}

function result(category, tb) {
  return { score: encode(category, tb), category, name: nameFor(category, tb) };
}

// cards: array of Card (5..7). Returns { score, category, name }.
export function evaluate(cards) {
  const rankCounts = new Map();
  for (const c of cards) rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);

  // (rank, count) sorted by count desc, then rank desc.
  const byCount = [...rankCounts.entries()].sort((a, b) =>
    b[1] - a[1] || b[0] - a[0]);
  const distinctDesc = [...rankCounts.keys()].sort((a, b) => b - a);

  // Flush.
  const suitCounts = new Map();
  for (const c of cards) suitCounts.set(c.suit, (suitCounts.get(c.suit) || 0) + 1);
  let flushSuit = null;
  for (const [s, n] of suitCounts) if (n >= 5) { flushSuit = s; break; }
  let flushRanks = [];
  if (flushSuit !== null) {
    flushRanks = cards.filter(c => c.suit === flushSuit).map(c => c.rank).sort((a, b) => b - a);
  }

  // Straight flush.
  if (flushSuit !== null) {
    const sfHigh = bestStraightHigh(flushRanks);
    if (sfHigh !== null) return result(STRAIGHT_FLUSH, [sfHigh]);
  }

  // Four of a kind.
  if (byCount[0][1] === 4) {
    const quad = byCount[0][0];
    const kicker = Math.max(...distinctDesc.filter(r => r !== quad));
    return result(FOUR_KIND, [quad, kicker]);
  }

  // Full house.
  const trips = byCount.filter(([, c]) => c >= 3).map(([r]) => r);
  const pairs = byCount.filter(([, c]) => c >= 2).map(([r]) => r);
  if (trips.length) {
    const tripRank = trips[0];
    const pairRank = pairs.find(r => r !== tripRank);
    if (pairRank !== undefined) return result(FULL_HOUSE, [tripRank, pairRank]);
  }

  // Flush.
  if (flushSuit !== null) return result(FLUSH, flushRanks.slice(0, 5));

  // Straight.
  const straightHigh = bestStraightHigh(distinctDesc);
  if (straightHigh !== null) return result(STRAIGHT, [straightHigh]);

  // Three of a kind.
  if (trips.length) {
    const tripRank = trips[0];
    const kickers = distinctDesc.filter(r => r !== tripRank).slice(0, 2);
    return result(THREE_KIND, [tripRank, ...kickers]);
  }

  // Two pair.
  if (pairs.length >= 2) {
    const [hi, lo] = pairs;
    const kicker = Math.max(...distinctDesc.filter(r => r !== hi && r !== lo));
    return result(TWO_PAIR, [hi, lo, kicker]);
  }

  // One pair.
  if (pairs.length === 1) {
    const pr = pairs[0];
    const kickers = distinctDesc.filter(r => r !== pr).slice(0, 3);
    return result(ONE_PAIR, [pr, ...kickers]);
  }

  // High card.
  return result(HIGH_CARD, distinctDesc.slice(0, 5));
}
