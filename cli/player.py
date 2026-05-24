"""Player state for a seat at the table."""

from __future__ import annotations

from cli.cards import Card


class Player:
    def __init__(self, name: str, chips: int, is_human: bool = False,
                 difficulty: str | None = None) -> None:
        self.name = name
        self.chips = chips
        self.is_human = is_human
        self.difficulty = difficulty  # None for human; else "easy"/"medium"/"hard"

        # Per-hand state.
        self.hole: list[Card] = []
        self.folded = False
        self.all_in = False
        self.street_bet = 0       # chips put in during the current betting round
        self.total_committed = 0  # chips put in across the whole hand (for side pots)
        self.has_acted = False    # acted at least once in the current round
        self.eliminated = False   # busted out of the table between hands
        self.last_action = ""     # label for the UI (e.g. "CALL 50", "FOLD")

    # --- lifecycle ---------------------------------------------------------
    def reset_for_hand(self) -> None:
        self.hole = []
        self.folded = False
        self.all_in = False
        self.street_bet = 0
        self.total_committed = 0
        self.has_acted = False

    def reset_for_street(self) -> None:
        self.street_bet = 0
        self.has_acted = False

    # --- chips -------------------------------------------------------------
    def bet(self, amount: int) -> int:
        """Move up to `amount` chips into the pot, capped by the stack.

        Returns the amount actually wagered (may be less than requested if the
        player does not have enough, in which case they go all-in).
        """
        amount = min(amount, self.chips)
        self.chips -= amount
        self.street_bet += amount
        self.total_committed += amount
        if self.chips == 0 and amount > 0:
            self.all_in = True
        return amount

    @property
    def in_hand(self) -> bool:
        """Still eligible to win the pot (not folded)."""
        return not self.folded

    @property
    def can_act(self) -> bool:
        """Able to make a decision (in the hand and has chips behind)."""
        return not self.folded and not self.all_in and self.chips > 0

    def __repr__(self) -> str:
        return f"Player({self.name!r}, chips={self.chips})"
