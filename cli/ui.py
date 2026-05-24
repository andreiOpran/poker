"""Terminal UI: renders the table with Unicode card art and collects input.

The engine calls the hooks here (hand_start, render, on_action, human_action,
on_street, on_showdown, on_awards, on_fold_win). Rendering clears the screen
and redraws the whole table each time for a stable display.
"""

from __future__ import annotations

import os
import re
import time

from cards import Card
from player import Player

_ANSI = re.compile(r"\x1b\[[0-9;]*m")
_USE_COLOR = os.environ.get("NO_COLOR") is None

RESET = "\033[0m"
RED = "\033[91m"
WHITE = "\033[1;97m"
DIM = "\033[2;37m"
BLUE = "\033[94m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
GREEN = "\033[92m"
GREY = "\033[90m"
BOLD = "\033[1m"


def c(text: str, color: str) -> str:
    if not _USE_COLOR:
        return text
    return f"{color}{text}{RESET}"


def _vis_len(s: str) -> int:
    return len(_ANSI.sub("", s))


def _ljust(s: str, width: int) -> str:
    return s + " " * max(0, width - _vis_len(s))


def _center(s: str, width: int) -> str:
    pad = max(0, width - _vis_len(s))
    left = pad // 2
    return " " * left + s + " " * (pad - left)


CARD_W = 9  # total width of a rendered card


def render_card(card: Card) -> list[str]:
    color = RED if card.is_red else WHITE
    r = card.rank_str
    top = f"│{r:<7}│"
    mid = f"│{card.suit_glyph:^7}│"
    bot = f"│{r:>7}│"
    lines = ["┌───────┐", top, mid, bot, "└───────┘"]
    return [c(line, color) for line in lines]


def render_back() -> list[str]:
    pat = "▞▚▞▚▞▚▞"
    lines = ["┌───────┐", f"│{pat}│", f"│{pat}│", f"│{pat}│", "└───────┘"]
    return [c(line, BLUE) for line in lines]


def render_empty_slot() -> list[str]:
    lines = ["┌───────┐", "│       │", "│   ·   │", "│       │", "└───────┘"]
    return [c(line, GREY) for line in lines]


def cards_row(cards: list[Card], hidden: bool = False,
              empties: int = 0) -> list[str]:
    """Render a horizontal row of cards (5 lines tall)."""
    blocks: list[list[str]] = []
    for card in cards:
        blocks.append(render_back() if hidden else render_card(card))
    for _ in range(empties):
        blocks.append(render_empty_slot())
    if not blocks:
        return [""] * 5
    rows = []
    for i in range(5):
        rows.append(" ".join(block[i] for block in blocks))
    return rows


def hstack(blocks: list[list[str]], sep: str = "   ") -> list[str]:
    """Concatenate multi-line blocks side by side, padding to equal height."""
    if not blocks:
        return []
    height = max(len(b) for b in blocks)
    widths = [max((_vis_len(line) for line in b), default=0) for b in blocks]
    out = []
    for i in range(height):
        parts = []
        for b, w in zip(blocks, widths):
            line = b[i] if i < len(b) else ""
            parts.append(_ljust(line, w))
        out.append(sep.join(parts))
    return out


class TerminalUI:
    def __init__(self, interactive: bool = True, bot_delay: float = 0.7) -> None:
        self.interactive = interactive
        self.bot_delay = bot_delay
        self.reveal_all = False
        self.human: Player | None = None

    # --------------------------------------------------------------- screen
    def _clear(self) -> None:
        if self.interactive:
            print("\033[2J\033[H", end="")

    def _pause(self, prompt: str = "") -> None:
        if self.interactive:
            try:
                input(c(prompt or "  (press Enter)", DIM))
            except EOFError:
                pass

    def _sleep(self, factor: float = 1.0) -> None:
        if self.interactive and self.bot_delay > 0:
            time.sleep(self.bot_delay * factor)

    # --------------------------------------------------------------- hooks
    def hand_start(self, state) -> None:
        self.reveal_all = False
        self.human = next((p for p in state.players if p.is_human), None)
        self.render(state)

    def on_street(self, state, name: str) -> None:
        self.render(state)
        self._sleep(1.3)

    def on_action(self, state, player: Player) -> None:
        self.render(state)
        if not player.is_human:
            self._sleep()

    def on_fold_win(self, state, winner: Player, amount: int) -> None:
        self.render(state, footer=c(f"  {winner.name} wins {amount} (everyone folded).", GREEN))
        self._pause("  (press Enter for next hand)")

    def on_showdown(self, state, results) -> None:
        self.reveal_all = True
        lines = [c("  — SHOWDOWN —", BOLD)]
        for p, hr in results:
            lines.append(f"  {c(p.name, CYAN)}: {' '.join(str(card) for card in p.hole)}  →  {c(hr.name, YELLOW)}")
        self.render(state, footer="\n".join(lines))
        self._pause("  (press Enter to award pot)")

    def on_awards(self, state, awards) -> None:
        lines = [c("  — RESULT —", BOLD)]
        for winners, split, total in awards:
            names = ", ".join(w.name for w in winners)
            if len(winners) > 1:
                lines.append(c(f"  {names} split {total} ({split} each).", GREEN))
            else:
                lines.append(c(f"  {names} wins {total}.", GREEN))
        self.render(state, footer="\n".join(lines))
        self._pause("  (press Enter for next hand)")

    # --------------------------------------------------------------- render
    def render(self, state, footer: str | None = None) -> None:
        self._clear()
        n = len(state.players)
        button = state.button
        sb_i = (button if n == 2 else (button + 1) % n)
        bb_i = ((button + 1) % n if n == 2 else (button + 2) % n)

        out: list[str] = []
        out.append(c(f"  ♠ ♥ TEXAS HOLD'EM ♦ ♣   ", BOLD)
                   + c(f"Hand #{state.hand_no}", DIM))
        out.append("")

        # Opponents in a row.
        opp_blocks = []
        for i, p in enumerate(state.players):
            if p.is_human:
                continue
            opp_blocks.append(self._seat_block(state, p, i, sb_i, bb_i))
        if opp_blocks:
            out.extend(hstack(opp_blocks, sep="    "))
            out.append("")

        # Community + pot.
        out.append(c("  Board", DIM) + "   " + c(f"Pot: {state.pot}", YELLOW))
        empties = 5 - len(state.community)
        board = cards_row(state.community, empties=empties)
        out.extend("  " + line for line in board)
        out.append("")

        # Human seat.
        if self.human is not None:
            hi = state.players.index(self.human)
            out.extend(self._seat_block(state, self.human, hi, sb_i, bb_i, is_self=True))

        print("\n".join(out))
        if footer:
            print(footer)

    def _seat_block(self, state, p: Player, idx: int, sb_i: int, bb_i: int,
                    is_self: bool = False) -> list[str]:
        tags = []
        if idx == state.button:
            tags.append(c("[D]", YELLOW))
        if idx == sb_i:
            tags.append(c("SB", DIM))
        if idx == bb_i:
            tags.append(c("BB", DIM))
        tag = " " + " ".join(tags) if tags else ""

        name_color = GREEN if is_self else CYAN
        if p.folded:
            name_color = GREY
        header = f"{c(p.name, name_color)}{tag}"

        # Cards.
        if p.folded:
            cards = [c("  (folded)", GREY)] + [""] * 4
        elif is_self or self.reveal_all:
            cards = cards_row(p.hole)
        else:
            cards = cards_row(p.hole, hidden=True)

        chips = c(f"chips: {p.chips}", YELLOW)
        if p.street_bet > 0:
            chips += c(f"  bet: {p.street_bet}", DIM)
        action = c(p.last_action, _action_color(p.last_action)) if p.last_action else ""

        block = cards + [header, chips]
        if action:
            block.append(action)
        return block

    # --------------------------------------------------------------- input
    def human_action(self, state, p: Player, info: dict) -> tuple[str, int]:
        to_call = info["to_call"]
        can_check = info["can_check"]
        can_raise = info["can_raise"]
        min_to = info["min_raise_to"]
        max_to = info["max_raise_to"]

        while True:
            opts = []
            if can_check:
                opts.append(c("[K]", BOLD) + "check")
                if can_raise:
                    opts.append(c("[B]", BOLD) + "bet")
            else:
                opts.append(c("[F]", BOLD) + "fold")
                opts.append(c("[C]", BOLD) + f"call {to_call}")
                if can_raise:
                    opts.append(c("[R]", BOLD) + "raise")
            if can_raise:
                opts.append(c("[A]", BOLD) + "all-in")
            print(c("\n  Your move:  ", GREEN) + "   ".join(opts))

            try:
                raw = input(c("  > ", GREEN)).strip().lower()
            except EOFError:
                return ("fold", 0) if not can_check else ("check", 0)
            if not raw:
                continue
            ch = raw[0]
            rest = raw[1:].strip()

            if ch == "f" and not can_check:
                return ("fold", 0)
            if ch == "k" and can_check:
                return ("check", 0)
            if ch == "c" and not can_check:
                return ("call", 0)
            if ch == "a" and can_raise:
                return ("raise", max_to)
            if ch in ("b", "r") and can_raise:
                amount = self._read_amount(rest, min_to, max_to)
                if amount is None:
                    continue
                return ("raise", amount)
            print(c("  Invalid choice.", RED))

    def _read_amount(self, rest: str, min_to: int, max_to: int) -> int | None:
        if min_to >= max_to:  # only an all-in raise is possible
            print(c(f"  Only all-in ({max_to}) is available — raising all-in.", DIM))
            return max_to
        token = rest
        if not token:
            try:
                token = input(c(f"  Raise to (min {min_to}, max {max_to}, 'a'=all-in): ", GREEN)).strip().lower()
            except EOFError:
                return None
        if token in ("a", "all", "max"):
            return max_to
        try:
            val = int(token)
        except ValueError:
            print(c("  Enter a number.", RED))
            return None
        if val < min_to:
            print(c(f"  Minimum raise-to is {min_to}.", RED))
            return None
        if val > max_to:
            val = max_to
        return val


def _action_color(action: str) -> str:
    if action.startswith("FOLD"):
        return GREY
    if action.startswith(("RAISE", "ALL-IN", "BB", "SB")):
        return RED
    if action.startswith("CALL"):
        return YELLOW
    if action.startswith("CHECK"):
        return DIM
    return RESET
