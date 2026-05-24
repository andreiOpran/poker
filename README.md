# HOLD'EM — Arcade Edition (Retro Hold'em)

A pixel-art, retro-arcade style Texas Hold'em Progressive Web App (PWA). Play Texas Hold'em against bot opponents directly in the browser or via the terminal interface! Inspired by Balatro's UI, tailored for an authentic arcade poker experience.

## Features

- **Arcade Aesthetic:** Fully realized pixel-art UI with custom assets, CRT scanline effects, retro typography, and chip drop animations.
- **PWA Ready:** Installable on iOS/Android devices as a standalone application for a native offline experience.
- **Dual Engines:** 
  - **Web Engine:** Vanilla JavaScript (`src/*.js`) handling bot intelligence, hand evaluation, game state loop, and DOM rendering.
  - **Python CLI Engine:** A 1:1 mapping in Python for playing in the terminal (`main.py`, `engine.py`, etc.).
- **Bot Opponents:** Dynamic bot names and configurable difficulties.

## Project Structure

- `index.html`, `styles.css` - Main entry point and arcade pixel design system.
- `src/` - Core JS logic (game engine, evaluator, bot AI, deck manipulation, UI bindings).
- `manifest.webmanifest`, `sw.js` - Service worker and PWA configurations.
- `textures/`, `icons/` - Vector graphics, sprite atlases, and app icons.
- `*.py` - Python equivalent models and CLI-based gameplay interface.
- `test.mjs` / `test_poker.py` - Evaluation test scripts.

## How to Play

### Web Interface
To play the web client with the arcade UI, serve the directory via any local web server:

```bash
# Using Python
python3 -m http.server 8000
```
Then navigate to [http://localhost:8000](http://localhost:8000) in your browser.

### Terminal/CLI Interface
To play Texas Hold'em in your terminal via the Python engine:

```bash
python3 main.py
```

## Testing

Run the JS evaluation tests using Node:
```bash
node test.mjs
```
