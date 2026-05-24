// Player state for a seat.

export class Player {
  constructor(name, chips, isHuman = false, difficulty = null) {
    this.name = name;
    this.chips = chips;
    this.isHuman = isHuman;
    this.difficulty = difficulty;
    this.hole = [];
    this.folded = false;
    this.allIn = false;
    this.streetBet = 0;        // committed this betting round
    this.totalCommitted = 0;   // committed across the whole hand (side pots)
    this.hasActed = false;
    this.eliminated = false;
    this.lastAction = "";
  }

  resetForHand() {
    this.hole = [];
    this.folded = false;
    this.allIn = false;
    this.streetBet = 0;
    this.totalCommitted = 0;
    this.hasActed = false;
  }

  resetForStreet() {
    this.streetBet = 0;
    this.hasActed = false;
  }

  bet(amount) {
    amount = Math.min(amount, this.chips);
    this.chips -= amount;
    this.streetBet += amount;
    this.totalCommitted += amount;
    if (this.chips === 0 && amount > 0) this.allIn = true;
    return amount;
  }

  get inHand() { return !this.folded; }
  get canAct() { return !this.folded && !this.allIn && this.chips > 0; }
}
