'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#c0c0c8', // 8 - wild (comodín, generado por Tinte)
  '#90a4ae', // 9 - reto (cuadro hueco 3×3)
];

const POWERUP_EVERY = 10; // cada N líneas aparece un power-up
const WILD = 8;           // valor de celda para comodín (Tinte)
const CHALLENGE = 9;              // valor de celda para la pieza reto
const CHALLENGE_EVERY = 7;        // cada N líneas aparece la pieza reto
const CHALLENGE_SHAPE = [[9,9,9],[9,0,9],[9,9,9]]; // cuadro hueco 3×3
const POWERUPS = ['bomb', 'ray', 'tint', 'gravity', 'freeze'];
const POWER_ICONS = { bomb: '💣', ray: '⚡', tint: '🎨', gravity: '⬇️', freeze: '❄️' };
const POWER_COLORS = { bomb: '#e57373', ray: '#ffd54f', tint: '#ba68c8', gravity: '#81c784', freeze: '#4dd0e1' };
const FREEZE_MS = 5000;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const startHighscoreList = document.getElementById('start-highscore-list');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const overHighscoreList = document.getElementById('over-highscore-list');
const overBestCombo = document.getElementById('over-best-combo');
const overMaxLines = document.getElementById('over-max-lines');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveNameBtn = document.getElementById('save-name-btn');
const resetScoresBtnStart = document.getElementById('reset-scores-btn-start');
const resetScoresBtnOver = document.getElementById('reset-scores-btn-over');

const THEME_KEY = 'tetris-theme';
const THEME_COLORS = {
  dark: { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#dcdce6', highlight: 'rgba(255,255,255,0.5)' },
};

const HIGHSCORE_KEY = 'tetris-highscores';
const BEST_COMBO_KEY = 'tetris-best-combo';
const MAX_LINES_KEY = 'tetris-max-lines';
const MAX_HIGHSCORES = 5;

let board, current, next, hold, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme;
let powerupsAwarded, powerupQueued, freezeRemaining;
let challengeAwarded, challengeQueued;
let combo, maxCombo, started;

function applyTheme(name) {
  theme = name;
  document.body.classList.toggle('light', theme === 'light');
  themeSwitch.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
  if (current) draw();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeSwitch.addEventListener('change', () => {
  applyTheme(themeSwitch.checked ? 'light' : 'dark');
});

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGHSCORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveHighScores(list) {
  localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(list));
}

function loadBestCombo() {
  const v = parseInt(localStorage.getItem(BEST_COMBO_KEY), 10);
  return Number.isFinite(v) ? v : 0;
}

function saveBestCombo(v) {
  localStorage.setItem(BEST_COMBO_KEY, String(v));
}

function loadMaxLines() {
  const v = parseInt(localStorage.getItem(MAX_LINES_KEY), 10);
  return Number.isFinite(v) ? v : 0;
}

function saveMaxLines(v) {
  localStorage.setItem(MAX_LINES_KEY, String(v));
}

function qualifiesForHighScore(s) {
  const list = loadHighScores();
  if (list.length < MAX_HIGHSCORES) return true;
  return s > list[list.length - 1].score;
}

function addHighScore(name, s, l, combo_) {
  const list = loadHighScores();
  const entry = { name: name || 'Jugador', score: s, lines: l, maxCombo: combo_ };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, MAX_HIGHSCORES);
  saveHighScores(list);
  return entry;
}

function entriesEqual(a, b) {
  return !!a && !!b && a.name === b.name && a.score === b.score && a.lines === b.lines && a.maxCombo === b.maxCombo;
}

function renderHighScoreList(listEl, highlightEntry) {
  const list = loadHighScores();
  listEl.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'highscore-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  list.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'highscore-item';
    if (entriesEqual(entry, highlightEntry)) li.classList.add('highscore-new');

    const rank = document.createElement('span');
    rank.className = 'hs-rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'hs-name';
    name.textContent = entry.name;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'hs-score';
    scoreSpan.textContent = entry.score.toLocaleString();

    const meta = document.createElement('span');
    meta.className = 'hs-meta';
    meta.textContent = `L${entry.lines} · C${entry.maxCombo}`;

    li.append(rank, name, scoreSpan, meta);
    listEl.appendChild(li);
  });
}

function updateBestStatsDisplay() {
  const bc = loadBestCombo();
  const ml = loadMaxLines();
  startBestCombo.textContent = bc;
  startMaxLines.textContent = ml;
  overBestCombo.textContent = bc;
  overMaxLines.textContent = ml;
}

function refreshHighScoreUI(highlightEntry) {
  renderHighScoreList(startHighscoreList, highlightEntry || null);
  renderHighScoreList(overHighscoreList, highlightEntry || null);
  updateBestStatsDisplay();
}

function resetRecords() {
  localStorage.removeItem(HIGHSCORE_KEY);
  localStorage.removeItem(BEST_COMBO_KEY);
  localStorage.removeItem(MAX_LINES_KEY);
  refreshHighScoreUI(null);
}

function showNameEntry() {
  nameEntry.classList.remove('hidden');
  nameInput.value = '';
  renderHighScoreList(overHighscoreList, null);
  setTimeout(() => nameInput.focus(), 0);
}

function submitName() {
  const name = (nameInput.value || '').trim().slice(0, 12) || 'Jugador';
  const entry = addHighScore(name, score, lines, maxCombo);
  nameEntry.classList.add('hidden');
  refreshHighScoreUI(entry);
}

saveNameBtn.addEventListener('click', submitName);
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitName();
  }
});

resetScoresBtnStart.addEventListener('click', resetRecords);
resetScoresBtnOver.addEventListener('click', resetRecords);

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  init();
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerup() {
  const power = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
  const shape = [[1]];
  return { type: WILD, power, shape, x: Math.floor(COLS / 2), y: 0 };
}

function makeChallenge() {
  const shape = CHALLENGE_SHAPE.map(row => [...row]);
  return { type: CHALLENGE, challenge: true, shape, x: Math.floor(COLS / 2) - 1, y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearWildChain(fullRows) {
  // Los comodines conectados a una línea que se limpia también desaparecen (efecto en cadena).
  const queue = [];
  for (const r of fullRows)
    for (let c = 0; c < COLS; c++)
      queue.push([r, c]);
  while (queue.length) {
    const [r, c] = queue.pop();
    const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of neighbors) {
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (board[nr][nc] === WILD) {
        board[nr][nc] = 0;
        queue.push([nr, nc]);
      }
    }
  }
}

function clearLines() {
  const fullRows = [];
  for (let r = ROWS - 1; r >= 0; r--)
    if (board[r].every(v => v !== 0)) fullRows.push(r);

  if (fullRows.length) clearWildChain(fullRows);

  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    const newAwarded = Math.floor(lines / POWERUP_EVERY);
    if (newAwarded > powerupsAwarded) {
      powerupsAwarded = newAwarded;
      powerupQueued = true;
    }
    const newChallenge = Math.floor(lines / CHALLENGE_EVERY);
    if (newChallenge > challengeAwarded) {
      challengeAwarded = newChallenge;
      challengeQueued = true;
    }
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function applyPowerup(p) {
  const bx = p.x, by = p.y;
  switch (p.power) {
    case 'bomb':
      for (let r = by - 1; r <= by + 1; r++)
        for (let c = bx - 1; c <= bx + 1; c++)
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
      break;
    case 'ray':
      if (by >= 0 && by < ROWS) board[by].fill(0);
      for (let r = 0; r < ROWS; r++)
        if (bx >= 0 && bx < COLS) board[r][bx] = 0;
      break;
    case 'tint': {
      const counts = new Array(8).fill(0);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const v = board[r][c];
          if (v >= 1 && v <= 7) counts[v]++;
        }
      let best = 0;
      for (let i = 1; i <= 7; i++) if (counts[i] > counts[best]) best = i;
      if (best) {
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (board[r][c] === best) board[r][c] = WILD;
      }
      break;
    }
    case 'gravity':
      for (let c = 0; c < COLS; c++) {
        const stack = [];
        for (let r = 0; r < ROWS; r++)
          if (board[r][c] !== 0) stack.push(board[r][c]);
        for (let r = ROWS - 1; r >= 0; r--)
          board[r][c] = stack.length ? stack.pop() : 0;
      }
      break;
    case 'freeze':
      freezeRemaining = FREEZE_MS;
      break;
  }
  score += 50;
}

function lockPiece() {
  if (current.power) {
    applyPowerup(current);
  } else {
    merge();
  }
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  if (powerupQueued) {
    next = randomPowerup();
    powerupQueued = false;
  } else if (challengeQueued) {
    next = makeChallenge();
    challengeQueued = false;
  } else {
    next = randomPiece();
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  canHold = true;
  holdCanvas.classList.remove('locked');
  drawNext();
}

function cloneForHold(piece) {
  const shape = piece.challenge ? CHALLENGE_SHAPE.map(row => [...row])
    : piece.power ? [[1]]
    : PIECES[piece.type].map(row => [...row]);
  return { type: piece.type, shape, power: piece.power, challenge: piece.challenge };
}

function holdSwap() {
  if (!canHold) return;
  if (hold === null) {
    hold = cloneForHold(current);
    spawn();
  } else {
    const swapped = hold;
    hold = cloneForHold(current);
    const shape = swapped.shape.map(row => [...row]);
    current = {
      type: swapped.type,
      shape,
      power: swapped.power,
      challenge: swapped.challenge,
      x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
      y: 0,
    };
    if (collide(current.shape, current.x, current.y)) {
      endGame();
    }
  }
  canHold = false;
  holdCanvas.classList.add('locked');
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = THEME_COLORS[theme].highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawPowerBlock(context, x, y, power, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = POWER_COLORS[power];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = THEME_COLORS[theme].highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.font = `${Math.floor(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(POWER_ICONS[power], x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = THEME_COLORS[theme].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) {
        if (current.power) drawPowerBlock(ctx, current.x + c, gy + r, current.power, BLOCK, 0.2);
        else drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
      }

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) {
        if (current.power) drawPowerBlock(ctx, current.x + c, current.y + r, current.power, BLOCK);
        else drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
      }

  // indicador de congelación
  if (freezeRemaining > 0) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(77, 208, 225, 0.85)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`❄️ ${Math.ceil(freezeRemaining / 1000)}s`, canvas.width / 2, 8);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        if (next.power) drawPowerBlock(nextCtx, offX + c, offY + r, next.power, NB);
        else drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
      }
}

function drawHold() {
  const HB = 30;
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (!hold) return;
  const shape = hold.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        if (hold.power) drawPowerBlock(holdCtx, offX + c, offY + r, hold.power, HB);
        else drawBlock(holdCtx, offX + c, offY + r, shape[r][c], HB);
      }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  saveBestCombo(Math.max(loadBestCombo(), maxCombo));
  saveMaxLines(Math.max(loadMaxLines(), lines));

  if (qualifiesForHighScore(score)) {
    showNameEntry();
  } else {
    nameEntry.classList.add('hidden');
  }
  refreshHighScoreUI(null);
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeRemaining > 0) {
    freezeRemaining = Math.max(0, freezeRemaining - dt);
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  hold = null;
  canHold = true;
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  powerupsAwarded = 0;
  powerupQueued = false;
  challengeAwarded = 0;
  challengeQueued = false;
  freezeRemaining = 0;
  combo = 0;
  maxCombo = 0;
  started = true;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  holdCanvas.classList.remove('locked');
  drawHold();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdSwap();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
started = false;
refreshHighScoreUI(null);
