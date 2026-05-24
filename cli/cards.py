"""Cards, ranks, suits and the deck for Texas Hold'em."""

from __future__ import annotations

import random
from dataclasses import dataclass

# Rank values: 2..10 are themselves, J=11, Q=12, K=13, A=14.
RANKS = list(range(2, 15))

RANK_TO_STR = {
    2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
    10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
}

# Suits keyed by single-letter code -> unicode glyph.
SUIT_GLYPH = {"s": "♠", "h": "♥", "d": "♦", "c": "♣"}
SUIT_IS_RED = {"s": False, "h": True, "d": True, "c": False}
SUITS = list(SUIT_GLYPH.keys())


@dataclass(frozen=True, order=True)
class Card:
    rank: int  # 2..14
    suit: str  # one of "s", "h", "d", "c"

    @property
    def rank_str(self) -> str:
        return RANK_TO_STR[self.rank]

    @property
    def suit_glyph(self) -> str:
        return SUIT_GLYPH[self.suit]

    @property
    def is_red(self) -> bool:
        return SUIT_IS_RED[self.suit]

    def __str__(self) -> str:
        return f"{self.rank_str}{self.suit_glyph}"


class Deck:
    """A standard 52-card deck that deals from the top."""

    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng or random.Random()
        self.cards: list[Card] = [Card(r, s) for s in SUITS for r in RANKS]
        self.shuffle()

    def shuffle(self) -> None:
        self.cards = [Card(r, s) for s in SUITS for r in RANKS]
        self._rng.shuffle(self.cards)

    def deal(self, n: int = 1) -> list[Card]:
        if n > len(self.cards):
            raise ValueError("Not enough cards left to deal.")
        dealt = self.cards[:n]
        self.cards = self.cards[n:]
        return dealt

    def deal_one(self) -> Card:
        return self.deal(1)[0]

    def __len__(self) -> int:
        return len(self.cards)
