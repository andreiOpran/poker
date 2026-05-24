"""Texas Hold'em hand evaluation.

Given 5 to 7 cards, produce a comparable score so any two made hands can be
ranked. Higher score wins; equal scores tie (split pot).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from cards import Card, RANK_TO_STR

# Hand category ranks, high is better.
HIGH_CARD = 0
ONE_PAIR = 1
TWO_PAIR = 2
THREE_KIND = 3
STRAIGHT = 4
FLUSH = 5
FULL_HOUSE = 6
FOUR_KIND = 7
STRAIGHT_FLUSH = 8

CATEGORY_NAME = {
    HIGH_CARD: "High Card",
    ONE_PAIR: "Pair",
    TWO_PAIR: "Two Pair",
    THREE_KIND: "Three of a Kind",
    STRAIGHT: "Straight",
    FLUSH: "Flush",
    FULL_HOUSE: "Full House",
    FOUR_KIND: "Four of a Kind",
    STRAIGHT_FLUSH: "Straight Flush",
}

_PLURAL = {
    2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens",
    8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens",
    13: "Kings", 14: "Aces",
}


@dataclass(frozen=True, order=True)
class HandResult:
    key: tuple  # comparable; (category, tiebreak1..tiebreak5)
    category: int
    name: str


def _best_straight_high(rank_set: set[int]) -> int | None:
    """Highest card of the best straight in rank_set, or None.

    Treats Ace (14) as also low (1) so the wheel A-2-3-4-5 is detected.
    """
    s = set(rank_set)
    if 14 in s:
        s.add(1)
    for high in range(14, 4, -1):
        if all((high - i) in s for i in range(5)):
            return high
    return None


def _name_for(category: int, tb: list[int]) -> str:
    if category == STRAIGHT_FLUSH:
        if tb[0] == 14:
            return "Royal Flush"
        return f"Straight Flush, {RANK_TO_STR[tb[0]]} high"
    if category == FOUR_KIND:
        return f"Four of a Kind, {_PLURAL[tb[0]]}"
    if category == FULL_HOUSE:
        return f"Full House, {_PLURAL[tb[0]]} over {_PLURAL[tb[1]]}"
    if category == FLUSH:
        return f"Flush, {RANK_TO_STR[tb[0]]} high"
    if category == STRAIGHT:
        return f"Straight, {RANK_TO_STR[tb[0]]} high"
    if category == THREE_KIND:
        return f"Three of a Kind, {_PLURAL[tb[0]]}"
    if category == TWO_PAIR:
        return f"Two Pair, {_PLURAL[tb[0]]} and {_PLURAL[tb[1]]}"
    if category == ONE_PAIR:
        return f"Pair of {_PLURAL[tb[0]]}"
    return f"High Card {RANK_TO_STR[tb[0]]}"


def evaluate(cards: list[Card]) -> HandResult:
    """Evaluate the best 5-card hand from 5..7 cards."""
    if len(cards) < 5:
        raise ValueError("Need at least 5 cards to evaluate.")

    ranks = [c.rank for c in cards]
    rank_counts = Counter(ranks)
    # Sort (rank, count) by count desc, then rank desc.
    by_count = sorted(rank_counts.items(), key=lambda kv: (kv[1], kv[0]), reverse=True)
    distinct_ranks_desc = sorted(rank_counts.keys(), reverse=True)

    # Flush detection: a suit with >= 5 cards.
    suit_counts = Counter(c.suit for c in cards)
    flush_suit = next((s for s, n in suit_counts.items() if n >= 5), None)
    flush_ranks: list[int] = []
    if flush_suit is not None:
        flush_ranks = sorted((c.rank for c in cards if c.suit == flush_suit), reverse=True)

    # Straight flush: a straight inside the flush suit.
    if flush_suit is not None:
        sf_high = _best_straight_high(set(flush_ranks))
        if sf_high is not None:
            tb = [sf_high]
            return HandResult((STRAIGHT_FLUSH, *_pad(tb)), STRAIGHT_FLUSH, _name_for(STRAIGHT_FLUSH, tb))

    # Four of a kind.
    if by_count[0][1] == 4:
        quad = by_count[0][0]
        kicker = max(r for r in distinct_ranks_desc if r != quad)
        tb = [quad, kicker]
        return HandResult((FOUR_KIND, *_pad(tb)), FOUR_KIND, _name_for(FOUR_KIND, tb))

    # Full house (trips + a separate pair-or-better).
    trips = [r for r, c in by_count if c >= 3]
    pairs = [r for r, c in by_count if c >= 2]
    if trips:
        trip_rank = trips[0]
        pair_rank = next((r for r in pairs if r != trip_rank), None)
        if pair_rank is not None:
            tb = [trip_rank, pair_rank]
            return HandResult((FULL_HOUSE, *_pad(tb)), FULL_HOUSE, _name_for(FULL_HOUSE, tb))

    # Flush.
    if flush_suit is not None:
        tb = flush_ranks[:5]
        return HandResult((FLUSH, *_pad(tb)), FLUSH, _name_for(FLUSH, tb))

    # Straight.
    straight_high = _best_straight_high(set(distinct_ranks_desc))
    if straight_high is not None:
        tb = [straight_high]
        return HandResult((STRAIGHT, *_pad(tb)), STRAIGHT, _name_for(STRAIGHT, tb))

    # Three of a kind.
    if trips:
        trip_rank = trips[0]
        kickers = [r for r in distinct_ranks_desc if r != trip_rank][:2]
        tb = [trip_rank, *kickers]
        return HandResult((THREE_KIND, *_pad(tb)), THREE_KIND, _name_for(THREE_KIND, tb))

    # Two pair.
    if len(pairs) >= 2:
        high_pair, low_pair = pairs[0], pairs[1]
        kicker = max(r for r in distinct_ranks_desc if r not in (high_pair, low_pair))
        tb = [high_pair, low_pair, kicker]
        return HandResult((TWO_PAIR, *_pad(tb)), TWO_PAIR, _name_for(TWO_PAIR, tb))

    # One pair.
    if len(pairs) == 1:
        pair_rank = pairs[0]
        kickers = [r for r in distinct_ranks_desc if r != pair_rank][:3]
        tb = [pair_rank, *kickers]
        return HandResult((ONE_PAIR, *_pad(tb)), ONE_PAIR, _name_for(ONE_PAIR, tb))

    # High card.
    tb = distinct_ranks_desc[:5]
    return HandResult((HIGH_CARD, *_pad(tb)), HIGH_CARD, _name_for(HIGH_CARD, tb))


def _pad(tiebreak: list[int]) -> list[int]:
    """Pad a tiebreak list to exactly 5 entries so all keys compare cleanly."""
    return (tiebreak + [0, 0, 0, 0, 0])[:5]
