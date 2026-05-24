// Cards, suits, ranks, deck, and a seedable RNG.

export const SUITS = ["s", "h", "d", "c"];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const RANK_STR = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
};
export const SUIT_GLYPH = { s: "♠", h: "♥", d: "♦", c: "♣" };
const SUIT_RED = { s: false, h: true, d: true, c: false };

export class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
    this.id = SUITS.indexOf(suit) * 13 + (rank - 2); // 0..51, unique
  }
  get rankStr() { return RANK_STR[this.rank]; }
  get glyph() { return SUIT_GLYPH[this.suit]; }
  get isRed() { return SUIT_RED[this.suit]; }
  get code() { return this.rankStr + this.suit; }
  toString() { return this.rankStr + this.glyph; }
}

// All 52 cards, indexable by id.
export const ALL_CARDS = [];
for (const s of SUITS) for (const r of RANKS) ALL_CARDS[SUITS.indexOf(s) * 13 + (r - 2)] = new Card(r, s);

// Mulberry32: small, fast, seedable PRNG -> function returning [0,1).
export function makeRng(seed) {
  if (seed === undefined) return Math.random;
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Deck {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.cards = ALL_CARDS.slice();
    shuffle(this.cards, this.rng);
  }
  deal(n = 1) {
    if (n > this.cards.length) throw new Error("Not enough cards.");
    return this.cards.splice(0, n);
  }
  dealOne() { return this.deal(1)[0]; }
  get length() { return this.cards.length; }
}
