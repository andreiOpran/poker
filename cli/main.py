"""Texas Hold'em vs bots — terminal game.

Run:  python3 main.py
"""

from __future__ import annotations

import random
import sys

from cli.engine import PokerEngine
from cli.player import Player
from cli.ui import BOLD, CYAN, DIM, GREEN, RED, YELLOW, TerminalUI, c

BOT_NAMES = ["Ace", "Boris", "Carmen", "Dakota", "Esra"]
DIFFICULTIES = {"1": "easy", "2": "medium", "3": "hard"}


def _ask_int(prompt: str, lo: int, hi: int, default: int) -> int:
    while True:
        raw = input(c(f"  {prompt} [{default}]: ", GREEN)).strip()
        if not raw:
            return default
        try:
            val = int(raw)
        except ValueError:
            print(c("  Please enter a number.", RED))
            continue
        if lo <= val <= hi:
            return val
        print(c(f"  Enter a value between {lo} and {hi}.", RED))


def setup() -> tuple[list[Player], int, int]:
    print("\033[2J\033[H", end="")
    print(c("  ♠ ♥ ♦ ♣  TEXAS HOLD'EM  ♣ ♦ ♥ ♠", BOLD))
    print(c("  Play No-Limit Hold'em against the bots.\n", DIM))

    chips = _ask_int("Starting chips per player", 50, 1_000_000, 1000)
    num_opponents = _ask_int("Number of opponents (1-4)", 1, 4, 3)

    print(c("\n  Bot difficulty:  1) Easy   2) Medium   3) Hard", CYAN))
    while True:
        d = input(c("  Choose [2]: ", GREEN)).strip() or "2"
        if d in DIFFICULTIES:
            difficulty = DIFFICULTIES[d]
            break
        print(c("  Enter 1, 2 or 3.", RED))

    default_bb = max(2, chips // 50)
    bb = _ask_int("Big blind", 2, max(2, chips // 2), default_bb)
    sb = max(1, bb // 2)

    players = [Player("You", chips, is_human=True)]
    for i in range(num_opponents):
        players.append(Player(BOT_NAMES[i], chips, difficulty=difficulty))

    print(c(f"\n  {num_opponents} {difficulty} bot(s). Blinds {sb}/{bb}. "
            f"Everyone starts with {chips} chips.", DIM))
    input(c("  Press Enter to deal...", GREEN))
    return players, sb, bb


def standings(players: list[Player]) -> str:
    rows = sorted(players, key=lambda p: p.chips, reverse=True)
    lines = [c("  Standings:", BOLD)]
    for p in rows:
        tag = "" if p.chips > 0 else c(" (out)", RED)
        lines.append(f"   {p.name:<8} {c(str(p.chips), YELLOW)}{tag}")
    return "\n".join(lines)


def play_session(players: list[Player], sb: int, bb: int, starting: int) -> None:
    rng = random.Random()
    ui = TerminalUI(interactive=True, bot_delay=0.7)
    engine = PokerEngine(ui, rng=rng)

    dealer_abs = rng.randrange(len(players))
    hand_no = 0
    human = next(p for p in players if p.is_human)

    while True:
        seated = [p for p in players if p.chips > 0]
        if len(seated) < 2:
            break

        # Button = first seated player at/after dealer_abs (clockwise).
        n_all = len(players)
        button_player = next(players[(dealer_abs + off) % n_all]
                             for off in range(n_all)
                             if players[(dealer_abs + off) % n_all].chips > 0)
        button_idx = seated.index(button_player)

        hand_no += 1
        engine.play_hand(seated, button_idx, sb, bb, hand_no)

        # Advance the button to the seat after this hand's dealer.
        dealer_abs = (players.index(button_player) + 1) % n_all

        # Report bot bust-outs.
        busted = [p for p in players if p.chips == 0 and not p.eliminated and not p.is_human]
        for p in busted:
            p.eliminated = True
            print(c(f"\n  {p.name} is out of chips and leaves the table.", RED))

        # Human went broke: offer a rebuy or end the session.
        if human.chips == 0:
            print(c("\n  You're out of chips!", RED))
            ans = input(c(f"  Rebuy {starting} chips and keep playing? [y/N]: ", GREEN)).strip().lower()
            if ans == "y":
                human.chips = starting
                human.eliminated = False
                print(c(f"  Rebought. You're back in with {starting}.", GREEN))
            else:
                print(c("\n  You cashed out. Thanks for playing!", CYAN))
                print(standings(players))
                return

        # Only one player left with chips -> tournament over.
        alive = [p for p in players if p.chips > 0]
        if len(alive) == 1:
            print("\033[2J\033[H", end="")
            if alive[0].is_human:
                print(c("\n  🏆  YOU WIN! Everyone else is busted.\n", GREEN))
            else:
                print(c(f"\n  {alive[0].name} wins the table. Better luck next time.\n", RED))
            print(standings(players))
            return

        print("\n" + standings(players))
        ans = input(c("\n  Press Enter for next hand, or 'q' to quit: ", GREEN)).strip().lower()
        if ans == "q":
            print(c("\n  Session ended.", CYAN))
            print(standings(players))
            return


def main() -> None:
    try:
        players, sb, bb = setup()
        starting = players[0].chips
        play_session(players, sb, bb, starting)
    except (KeyboardInterrupt, EOFError):
        print(c("\n\n  Interrupted. Goodbye!", CYAN))
        sys.exit(0)


if __name__ == "__main__":
    main()
