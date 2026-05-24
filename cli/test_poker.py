"""Correctness checks: evaluator ranking, side pots, and a full all-bot smoke run.

Run:  python3 test_poker.py
"""

from __future__ import annotations

import random

from cards import Card
from engine import PokerEngine
from evaluator import (FLUSH, FOUR_KIND, FULL_HOUSE, HIGH_CARD, ONE_PAIR,
                       STRAIGHT, STRAIGHT_FLUSH, THREE_KIND, TWO_PAIR, evaluate)
from player import Player

_RANK = {"A": 14, "K": 13, "Q": 12, "J": 11, "T": 10,
         "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2}


def hand(s: str) -> list[Card]:
    return [Card(_RANK[t[0]], t[1]) for t in s.split()]


def test_categories() -> None:
    cases = {
        "As Ks Qs Js Ts 2c 3d": STRAIGHT_FLUSH,   # royal
        "9h 8h 7h 6h 5h Ad Kd": STRAIGHT_FLUSH,
        "Ac Ad Ah As Kd 2c 3h": FOUR_KIND,
        "Kc Kd Kh 9s 9d 2c 3h": FULL_HOUSE,
        "Ah Qh 9h 5h 2h Kd Js": FLUSH,
        "5c 4d 3h 2s Ah Kd Qc": STRAIGHT,          # wheel
        "Ac Ad Ah 9s 7d 2c 3h": THREE_KIND,
        "Ac Ad Kh Ks 7d 2c 3h": TWO_PAIR,
        "Ac Ad Kh Qs 7d 2c 3h": ONE_PAIR,
        "Ac Jd 9h 7s 5d 3c 2h": HIGH_CARD,
    }
    for cards_str, expected in cases.items():
        got = evaluate(hand(cards_str)).category
        assert got == expected, f"{cards_str}: expected {expected}, got {got}"
    print("  ok  hand categories")


def test_ordering() -> None:
    order = [
        "As Ks Qs Js Ts",   # straight flush
        "Ac Ad Ah As Kd",   # quads
        "Kc Kd Kh 9s 9d",   # full house
        "Ah Qh 9h 5h 2h",   # flush
        "5c 4d 3h 2s Ah",   # wheel straight
        "Ac Ad Ah 9s 7d",   # trips
        "Ac Ad Kh Ks 7d",   # two pair
        "Ac Ad Kh Qs 7d",   # pair
        "Ac Jd 9h 7s 5d",   # high card
    ]
    keys = [evaluate(hand(h)).key for h in order]
    for i in range(len(keys) - 1):
        assert keys[i] > keys[i + 1], f"ordering broke at {order[i]} vs {order[i+1]}"
    print("  ok  category ordering (strong > weak)")


def test_kickers_and_ties() -> None:
    # Flush kicker decides.
    a = evaluate(hand("Ah Kh 9h 5h 2h 3c 4d")).key
    b = evaluate(hand("Ah Kh 9h 5h 3h 2c 4d")).key
    assert a < b, "higher flush kicker should win"
    # Identical best-five from different hole cards must tie.
    board = "Ah Kd Qc Js Tc"
    x = evaluate(hand(board) + hand("2h 3d")).key   # plays the board straight
    y = evaluate(hand(board) + hand("4s 5c")).key
    assert x == y, "both should play the board's broadway straight and tie"
    # Full house uses the higher trips.
    fh = evaluate(hand("Kc Kd Kh 9s 9d 9c 2h"))
    assert fh.category == FULL_HOUSE and fh.key[1] == 13 and fh.key[2] == 9
    print("  ok  kickers, ties, full-house selection")


def test_side_pots() -> None:
    a = Player("A", 0); a.total_committed = 100
    b = Player("B", 0); b.total_committed = 300
    cc = Player("C", 0); cc.total_committed = 300
    pots = PokerEngine.compute_pots([a, b, cc])
    amounts = [p.amount for p in pots]
    assert amounts == [300, 400], amounts
    assert set(pots[0].eligible) == {a, b, cc}
    assert set(pots[1].eligible) == {b, cc}
    # A folded: still contributes to main pot but cannot win it.
    a.folded = True
    pots = PokerEngine.compute_pots([a, b, cc])
    assert set(pots[0].eligible) == {b, cc} and a not in pots[0].eligible
    total = sum(p.amount for p in pots)
    assert total == 700, total
    print("  ok  side pots (layers, eligibility, totals)")


def test_smoke_full_games() -> None:
    """Run many all-bot hands; assert no crash and chips are conserved."""
    from ui import TerminalUI

    class NullUI(TerminalUI):
        def __init__(self):
            super().__init__(interactive=False, bot_delay=0)
        def render(self, state, footer=None): pass
        def _pause(self, prompt=""): pass
        def hand_start(self, state): self.reveal_all = False

    rng = random.Random(12345)
    engine = PokerEngine(NullUI(), rng=rng)

    for trial in range(40):
        players = [Player(f"B{i}", 1000, difficulty="medium") for i in range(4)]
        total_start = sum(p.chips for p in players)
        dealer = 0
        for hand_no in range(1, 60):
            seated = [p for p in players if p.chips > 0]
            if len(seated) < 2:
                break
            n = len(players)
            btn_player = next(players[(dealer + o) % n] for o in range(n)
                              if players[(dealer + o) % n].chips > 0)
            engine.play_hand(seated, seated.index(btn_player), 10, 20, hand_no)
            dealer = (players.index(btn_player) + 1) % n
            assert all(p.chips >= 0 for p in players), "negative stack!"
            assert sum(p.chips for p in players) == total_start, "chips not conserved!"
    print("  ok  smoke: 40 tables, chip conservation + no negatives")


def main() -> None:
    print("Running poker tests...")
    test_categories()
    test_ordering()
    test_kickers_and_ties()
    test_side_pots()
    test_smoke_full_games()
    print("\nAll tests passed.")


if __name__ == "__main__":
    main()
