# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A classic Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build step, no `package.json`, no test suite.

## Running

Open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no build, lint, or test command — this is plain static JS/HTML/CSS.

## Architecture

Three files, all logic lives in `game.js` (~300 lines, no modules):

- `index.html` — DOM structure: `<canvas id="board">` (300×600, the 10×20 grid at `BLOCK`=30px/cell), `<canvas id="next-canvas">` for the next-piece preview, HUD spans (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade theme.
- `game.js` — entire game: state, rules, rendering, input.

### Key mechanics in `game.js`

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or an index 1–7 into `COLORS`/`PIECES` identifying which piece color occupies it.
- **Pieces**: `PIECES` are square matrices (index 0 unused/null so piece type indices are 1-based, matching `COLORS`). Rotation (`rotateCW`) transposes + reverses rows — no lookup tables per orientation.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding position is found.
- **Collision** (`collide`): checks board bounds and existing locked cells.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time in `dropAccum` and advances the piece when it exceeds `dropInterval`.
- **Locking** (`lockPiece` → `merge` + `clearLines` + `spawn`): merges the current piece into `board`, clears full rows (shifting from bottom, `r++` to recheck the same index after a splice), then spawns the next piece.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × `level`; hard drop adds 2 pts/row dropped, soft drop adds 1 pt/row.
- **Leveling/speed**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn at `globalAlpha = 0.2`.
- **Game over**: triggered in `spawn()` when the newly spawned piece immediately collides.

All module-level game state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, timing vars) is declared with a single top-level `let` and reset in `init()` — there is no encapsulation/class structure.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).

## Controls

`←`/`→` move, `↑`/`X` rotate, `↓` soft drop, `Space` hard drop, `P` pause.
