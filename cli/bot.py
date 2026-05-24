"""Bot decision making.

Strategy: estimate win probability (equity) by Monte Carlo simulation against
random opponent holdings, then act on pot odds with a difficulty-tuned policy.
All three difficulties share this core; they differ in simulation accuracy,
discipline, aggression and bluff frequency.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from cards import Card, RANKS, SUITS
from evaluator import evaluate
from player import Player

# Per-difficulty knobs.
#   sims        : Monte Carlo samples (more = more accurate equity)
#   jitter      : random noise added to equity (more = sloppier reads)
#   value_thresh: equity at/above which the bot raises for value
#   call_margin : required equity above pot odds to call (negative = loose)
#   bluff_freq  : chance to bluff/semi-bluff in a given spot
#   aggr        : raise size as a fraction of the pot
DIFFICULTY_PARAMS = {
    "easy":   dict(sims=80,  jitter=0.12, value_thresh=0.74, call_margin=-0.10, bluff_freq=0.05, aggr=0.5),
    "medium": dict(sims=220, jitter=0.05, value_thresh=0.64, call_margin=0.00,  bluff_freq=0.10, aggr=0.7),
    "hard":   dict(sims=420, jitter=0.02, value_thresh=0.57, call_margin=0.04,  bluff_freq=0.15, aggr=0.9),
}


@dataclass
class Context:
    community: list[Card]
    current_bet: int     # highest street_bet at the table this round
    min_raise: int       # minimum legal raise increment
    pot: int             # chips in the pot (already committed by everyone)
    num_opponents: int   # opponents still in the hand (not folded), >= 1
    big_blind: int
    rng: random.Random
    street: str          # "preflop" | "flop" | "turn" | "river"


def estimate_equity(hole: list[Card], community: list[Card],
                    num_opponents: int, sims: int, rng: random.Random) -> float:
    """Monte Carlo win probability vs `num_opponents` random hands."""
    known = set(hole) | set(community)
    deck = [Card(r, s) for s in SUITS for r in RANKS if Card(r, s) not in known]

    need_board = 5 - len(community)
    need = num_opponents * 2 + need_board

    score = 0.0
    for _ in range(sims):
        sample = rng.sample(deck, need)
        idx = 0
        opp_hands = []
        for _ in range(num_opponents):
            opp_hands.append(sample[idx:idx + 2])
            idx += 2
        board = community + sample[idx:idx + need_board]

        my = evaluate(hole + board).key
        best_opp = max(evaluate(oh + board).key for oh in opp_hands)
        if my > best_opp:
            score += 1.0
        elif my == best_opp:
            # Count how many opponents tie us for an even split.
            ties = sum(1 for oh in opp_hands if evaluate(oh + board).key == my)
            score += 1.0 / (ties + 1)
    return score / sims


def decide(player: Player, ctx: Context) -> tuple[str, int]:
    """Return (action, amount). For "raise", amount is the total street bet to
    raise to; otherwise amount is 0."""
    p = DIFFICULTY_PARAMS[player.difficulty]
    rng = ctx.rng

    equity = estimate_equity(player.hole, ctx.community, ctx.num_opponents,
                             p["sims"], rng)
    # Sloppier bots misread their equity.
    equity += rng.uniform(-p["jitter"], p["jitter"])
    equity = max(0.0, min(1.0, equity))

    to_call = ctx.current_bet - player.street_bet

    def raise_to() -> int:
        add = max(ctx.min_raise, int(ctx.pot * p["aggr"]))
        target = ctx.current_bet + add
        # Cap at an all-in shove.
        max_target = player.street_bet + player.chips
        return min(target, max_target)

    # --- No bet to call: we may check or bet. ---
    if to_call <= 0:
        if equity >= p["value_thresh"] and player.chips > 0:
            return ("raise", raise_to())
        if rng.random() < p["bluff_freq"] and player.chips > ctx.big_blind:
            return ("raise", raise_to())
        return ("check", 0)

    # --- Facing a bet. ---
    pot_odds = to_call / (ctx.pot + to_call)

    # Strong: raise for value (occasionally just call to trap on later streets).
    if equity >= p["value_thresh"] and player.chips > 0:
        if ctx.street in ("turn", "river") and rng.random() < 0.25:
            return ("call", 0)
        return ("raise", raise_to())

    # Priced in: call.
    if equity >= pot_odds + p["call_margin"]:
        return ("call", 0)

    # Semi-bluff: occasionally raise a missed-but-cheap spot.
    if (rng.random() < p["bluff_freq"]
            and to_call <= ctx.pot * 0.5
            and player.chips > to_call * 2):
        return ("raise", raise_to())

    return ("fold", 0)
