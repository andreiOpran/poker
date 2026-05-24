"""Texas Hold'em hand engine: blinds, betting rounds, side pots, showdown.

`PokerEngine.play_hand` runs one complete hand against a UI object that the
engine calls back into for rendering and for the human's decisions. The engine
owns all the rules; the UI only displays state and collects input.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from bot import Context, decide
from cards import Card, Deck
from evaluator import evaluate
from player import Player


@dataclass
class GameState:
    players: list[Player]          # seated for this hand (all start with chips > 0)
    button: int                    # index into players of the dealer button
    sb: int
    bb: int
    deck: Deck = field(default_factory=Deck)
    community: list[Card] = field(default_factory=list)
    current_bet: int = 0           # highest street_bet this round (amount to match)
    min_raise: int = 0             # minimum legal raise increment right now
    street: str = "preflop"
    log: list[str] = field(default_factory=list)
    hand_no: int = 0

    @property
    def pot(self) -> int:
        return sum(p.total_committed for p in self.players)


@dataclass
class Pot:
    amount: int
    eligible: list[Player]      # in-hand players who may win this layer
    participants: list[Player]  # everyone who contributed to this layer


class PokerEngine:
    def __init__(self, ui, rng: random.Random | None = None) -> None:
        self.ui = ui
        self.rng = rng or random.Random()

    # ---------------------------------------------------------------- helpers
    def _blind_indices(self, n: int, button: int) -> tuple[int, int]:
        if n == 2:
            return button, (button + 1) % n          # SB = button (heads-up)
        return (button + 1) % n, (button + 2) % n     # SB, BB

    def _first_to_act(self, n: int, button: int, preflop: bool) -> int:
        sb, bb = self._blind_indices(n, button)
        if preflop:
            return button if n == 2 else (bb + 1) % n
        return bb if n == 2 else (button + 1) % n      # heads-up: BB acts first postflop

    # ------------------------------------------------------------- one hand
    def play_hand(self, players: list[Player], button: int, sb: int, bb: int,
                  hand_no: int) -> GameState:
        deck = Deck(self.rng)
        state = GameState(players=players, button=button, sb=sb, bb=bb,
                          deck=deck, hand_no=hand_no)
        self.state = state

        for p in players:
            p.reset_for_hand()
            p.last_action = ""

        # Deal two hole cards to each player, starting left of the button.
        n = len(players)
        for _ in range(2):
            for off in range(1, n + 1):
                players[(button + off) % n].hole.extend(deck.deal(1))

        self.ui.hand_start(state)

        self._post_blinds(players, button, sb, bb)

        # Streets: name, community cards to add.
        streets = [("preflop", 0), ("flop", 3), ("turn", 1), ("river", 1)]
        all_in_runout = False

        for name, ncards in streets:
            state.street = name
            if name != "preflop":
                for p in players:
                    p.reset_for_street()
                state.current_bet = 0
                state.min_raise = bb
                state.community.extend(deck.deal(ncards))
                self.ui.on_street(state, name)

            if not all_in_runout:
                start = self._first_to_act(n, button, preflop=(name == "preflop"))
                self._betting_round(players, start)

                if sum(1 for p in players if p.in_hand) == 1:
                    self._award_uncontested(state)
                    return state

                # If at most one player can still act, no more betting: run it out.
                if sum(1 for p in players if p.can_act) <= 1:
                    all_in_runout = True

        # Reached showdown: deal any missing community cards (all-in run-out).
        while len(state.community) < 5:
            state.community.extend(deck.deal(1))

        self._showdown(state)
        return state

    # ------------------------------------------------------------- blinds
    def _post_blinds(self, players: list[Player], button: int, sb: int, bb: int) -> None:
        n = len(players)
        sb_i, bb_i = self._blind_indices(n, button)
        posted_sb = players[sb_i].bet(sb)
        players[sb_i].last_action = f"SB {posted_sb}"
        posted_bb = players[bb_i].bet(bb)
        players[bb_i].last_action = f"BB {posted_bb}"
        self.state.current_bet = bb
        self.state.min_raise = bb
        self.ui.render(self.state)

    # ------------------------------------------------------------- betting
    def _betting_round(self, players: list[Player], start_idx: int) -> None:
        n = len(players)
        idx = start_idx
        guard = 0
        while True:
            steps = 0
            while steps < n and not players[idx].can_act:
                idx = (idx + 1) % n
                steps += 1
            if steps == n:
                return  # nobody can act

            p = players[idx]
            to_call = self.state.current_bet - p.street_bet
            if p.has_acted and to_call == 0:
                return  # action has come back around with everyone matched

            self._act(players, p)
            if sum(1 for q in players if q.in_hand) == 1:
                return

            idx = (idx + 1) % n
            guard += 1
            if guard > 10000:
                return  # safety valve

    def _act(self, players: list[Player], p: Player) -> None:
        st = self.state
        to_call = st.current_bet - p.street_bet
        can_check = to_call == 0
        max_raise_to = p.street_bet + p.chips        # all-in shove total
        min_raise_to = st.current_bet + st.min_raise
        can_raise = max_raise_to > st.current_bet    # has chips beyond a call

        if p.is_human:
            info = {
                "to_call": min(to_call, p.chips),
                "can_check": can_check,
                "can_raise": can_raise,
                "min_raise_to": min(min_raise_to, max_raise_to),
                "max_raise_to": max_raise_to,
                "current_bet": st.current_bet,
            }
            action, amount = self.ui.human_action(st, p, info)
        else:
            opponents = max(1, sum(1 for q in players if q.in_hand and q is not p))
            ctx = Context(
                community=list(st.community),
                current_bet=st.current_bet,
                min_raise=st.min_raise,
                pot=st.pot,
                num_opponents=opponents,
                big_blind=st.bb,
                rng=self.rng,
                street=st.street,
            )
            action, amount = decide(p, ctx)

        self._apply_action(p, action, amount)
        p.has_acted = True
        self.ui.on_action(st, p)

    def _apply_action(self, p: Player, action: str, amount: int) -> None:
        st = self.state
        to_call = st.current_bet - p.street_bet

        if action == "fold":
            # Folding when nothing is owed is pointless; treat as a check.
            if to_call <= 0:
                p.last_action = "CHECK"
                return
            p.folded = True
            p.last_action = "FOLD"
            return

        if action == "check":
            if to_call > 0:                  # can't check facing a bet -> call
                self._do_call(p, to_call)
            else:
                p.last_action = "CHECK"
            return

        if action == "call":
            if to_call <= 0:
                p.last_action = "CHECK"
            else:
                self._do_call(p, to_call)
            return

        if action == "raise":
            target = min(amount, p.street_bet + p.chips)   # cap at all-in
            if target < min(st.current_bet + st.min_raise, p.street_bet + p.chips):
                # Below a full raise and not an all-in shove: bump to legal min.
                if target != p.street_bet + p.chips:
                    target = st.current_bet + st.min_raise
            pay = target - p.street_bet
            p.bet(pay)
            new_bet = p.street_bet
            if new_bet > st.current_bet:
                inc = new_bet - st.current_bet
                if inc >= st.min_raise:
                    st.min_raise = inc
                st.current_bet = new_bet
                p.last_action = ("ALL-IN " if p.all_in else "RAISE ") + str(new_bet)
            else:
                # Could not actually raise (short all-in call).
                p.last_action = ("ALL-IN " if p.all_in else "CALL ") + str(new_bet)
            return

        raise ValueError(f"Unknown action: {action}")

    def _do_call(self, p: Player, to_call: int) -> None:
        paid = p.bet(to_call)
        if p.all_in:
            p.last_action = f"ALL-IN {p.street_bet}"
        else:
            p.last_action = f"CALL {p.street_bet}"

    # ------------------------------------------------------------- pots
    @staticmethod
    def compute_pots(players: list[Player]) -> list[Pot]:
        """Split committed chips into a main pot and any side pots."""
        contribs = {p: p.total_committed for p in players if p.total_committed > 0}
        pots: list[Pot] = []
        while contribs:
            layer = min(contribs.values())
            participants = list(contribs.keys())
            amount = layer * len(participants)
            eligible = [p for p in participants if p.in_hand]
            pots.append(Pot(amount=amount, eligible=eligible, participants=participants))
            new: dict[Player, int] = {}
            for p in participants:
                rest = contribs[p] - layer
                if rest > 0:
                    new[p] = rest
            contribs = new
        return pots

    def _order_from_button(self, contenders: list[Player]) -> list[Player]:
        """Order players by seat starting left of the button (for odd chips)."""
        players = self.state.players
        n = len(players)
        button = self.state.button
        order = [players[(button + off) % n] for off in range(1, n + 1)]
        return [p for p in order if p in contenders]

    def _award_pots(self, state: GameState) -> list[tuple[list[Player], int, int]]:
        awards: list[tuple[list[Player], int, int]] = []
        for pot in self.compute_pots(state.players):
            if not pot.eligible:
                # Uncalled chips: refund to contributors (rare edge case).
                share = pot.amount // len(pot.participants)
                for p in pot.participants:
                    p.chips += share
                continue
            best = max(evaluate(p.hole + state.community).key for p in pot.eligible)
            winners = [p for p in pot.eligible
                       if evaluate(p.hole + state.community).key == best]
            winners = self._order_from_button(winners)
            split = pot.amount // len(winners)
            remainder = pot.amount - split * len(winners)
            for w in winners:
                w.chips += split
            if remainder:
                winners[0].chips += remainder  # odd chip to first seat left of button
            awards.append((winners, split, pot.amount))
        return awards

    # ------------------------------------------------------------- endings
    def _award_uncontested(self, state: GameState) -> None:
        winner = next(p for p in state.players if p.in_hand)
        total = state.pot
        winner.chips += total
        self.ui.on_fold_win(state, winner, total)

    def _showdown(self, state: GameState) -> None:
        in_players = [p for p in state.players if p.in_hand]
        results = [(p, evaluate(p.hole + state.community)) for p in in_players]
        results.sort(key=lambda pr: pr[1].key, reverse=True)
        self.ui.on_showdown(state, results)
        awards = self._award_pots(state)
        self.ui.on_awards(state, awards)
