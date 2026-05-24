// Logic parity + smoke tests for the JS port.  Run: node test.mjs

import { Card, makeRng, Deck } from "./src/cards.js";
import {
  evaluate, FLUSH, FOUR_KIND, FULL_HOUSE, HIGH_CARD, ONE_PAIR,
  STRAIGHT, STRAIGHT_FLUSH, THREE_KIND, TWO_PAIR,
} from "./src/evaluator.js";
import { Player } from "./src/player.js";
import { PokerEngine } from "./src/engine.js";

const RANK = { A: 14, K: 13, Q: 12, J: 11, T: 10, 9: 9, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 2 };
const hand = (s) => s.split(" ").map(t => new Card(RANK[t[0]], t[1]));

let passed = 0;
function assert(cond, msg) { if (!cond) { console.error("  FAIL:", msg); process.exit(1); } passed++; }

// --- categories ---
const catCases = [
  ["As Ks Qs Js Ts 2c 3d", STRAIGHT_FLUSH],
  ["9h 8h 7h 6h 5h Ad Kd", STRAIGHT_FLUSH],
  ["Ac Ad Ah As Kd 2c 3h", FOUR_KIND],
  ["Kc Kd Kh 9s 9d 2c 3h", FULL_HOUSE],
  ["Ah Qh 9h 5h 2h Kd Js", FLUSH],
  ["5c 4d 3h 2s Ah Kd Qc", STRAIGHT], // wheel
  ["Ac Ad Ah 9s 7d 2c 3h", THREE_KIND],
  ["Ac Ad Kh Ks 7d 2c 3h", TWO_PAIR],
  ["Ac Ad Kh Qs 7d 2c 3h", ONE_PAIR],
  ["Ac Jd 9h 7s 5d 3c 2h", HIGH_CARD],
];
for (const [s, exp] of catCases)
  assert(evaluate(hand(s)).category === exp, `category ${s}`);
console.log("  ok  hand categories");

// --- ordering ---
const order = [
  "As Ks Qs Js Ts", "Ac Ad Ah As Kd", "Kc Kd Kh 9s 9d", "Ah Qh 9h 5h 2h",
  "5c 4d 3h 2s Ah", "Ac Ad Ah 9s 7d", "Ac Ad Kh Ks 7d", "Ac Ad Kh Qs 7d",
  "Ac Jd 9h 7s 5d",
];
const scores = order.map(h => evaluate(hand(h)).score);
for (let i = 0; i < scores.length - 1; i++)
  assert(scores[i] > scores[i + 1], `ordering ${order[i]} > ${order[i + 1]}`);
console.log("  ok  category ordering");

// --- kickers and ties ---
assert(evaluate(hand("Ah Kh 9h 5h 3h 2c 4d")).score > evaluate(hand("Ah Kh 9h 5h 2h 3c 4d")).score,
  "flush kicker");
const board = "Ah Kd Qc Js Tc";
assert(evaluate(hand(board + " 2h 3d")).score === evaluate(hand(board + " 4s 5c")).score,
  "both play board broadway -> tie");
const fh = evaluate(hand("Kc Kd Kh 9s 9d 9c 2h"));
assert(fh.category === FULL_HOUSE && fh.name.includes("Kings over Nines"), "full house higher trips");
console.log("  ok  kickers, ties, full house");

// --- side pots ---
{
  const a = new Player("A", 0); a.totalCommitted = 100;
  const b = new Player("B", 0); b.totalCommitted = 300;
  const c = new Player("C", 0); c.totalCommitted = 300;
  let pots = PokerEngine.computePots([a, b, c]);
  assert(JSON.stringify(pots.map(p => p.amount)) === "[300,400]", "side pot amounts");
  assert(pots[0].eligible.length === 3 && pots[1].eligible.length === 2, "side pot eligibility");
  a.folded = true;
  pots = PokerEngine.computePots([a, b, c]);
  assert(!pots[0].eligible.includes(a), "folded A not eligible");
  assert(pots.reduce((s, p) => s + p.amount, 0) === 700, "side pot total");
  console.log("  ok  side pots");
}

// --- full-game smoke: chip conservation, no negatives, generator drains ---
{
  const rng = makeRng(98765);
  const engine = new PokerEngine(rng);
  for (let trial = 0; trial < 40; trial++) {
    const players = [0, 1, 2, 3].map(i => new Player("B" + i, 1000, false, "medium"));
    const totalStart = players.reduce((s, p) => s + p.chips, 0);
    let dealer = 0;
    for (let handNo = 1; handNo < 60; handNo++) {
      const seated = players.filter(p => p.chips > 0);
      if (seated.length < 2) break;
      const n = players.length;
      let btnPlayer;
      for (let o = 0; o < n; o++) {
        const cand = players[(dealer + o) % n];
        if (cand.chips > 0) { btnPlayer = cand; break; }
      }
      // Drive the generator (all bots: never yields awaitHuman).
      const gen = engine.playHand(seated, seated.indexOf(btnPlayer), 10, 20, handNo);
      let step = gen.next();
      let guard = 0;
      while (!step.done) {
        assert(step.value.type !== "awaitHuman", "no human in all-bot game");
        step = gen.next();
        if (++guard > 100000) { assert(false, "generator did not terminate"); }
      }
      dealer = (players.indexOf(btnPlayer) + 1) % n;
      assert(players.every(p => p.chips >= 0), "no negative stacks");
      assert(players.reduce((s, p) => s + p.chips, 0) === totalStart, "chips conserved");
    }
  }
  console.log("  ok  smoke: 40 tables, chip conservation, generator drains");
}

console.log(`\nAll ${passed} checks passed.`);
