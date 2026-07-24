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

// Paleta suave para el skin Pastel (mismo orden/índices que COLORS).
const PASTEL_COLORS = [
  null,
  '#a8dadc', // I
  '#ffe8a3', // O
  '#d8bfd8', // T
  '#b5e0b5', // S
  '#f2b8b5', // Z
  '#b8c2e8', // J
  '#f7cba4', // L
  '#dcdce2', // 8 - wild
  '#c7d3d8', // 9 - reto
];

// Skins visuales: cada uno define su paleta de color base; el efecto de
// dibujado (glow, esquinas redondeadas, textura pixel) se aplica en
// drawBlock/drawPowerBlock según el skin activo.
const SKINS = {
  retro: { label: 'Retro', colors: COLORS },
  neon: { label: 'Neon', colors: COLORS },
  pastel: { label: 'Pastel', colors: PASTEL_COLORS },
  pixel: { label: 'Pixel art', colors: COLORS },
};

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
const skinSelect = document.getElementById('skin-select');

const THEME_KEY = 'tetris-theme';
const THEME_COLORS = {
  dark: { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#dcdce6', highlight: 'rgba(255,255,255,0.5)' },
};

const SKIN_KEY = 'tetris-skin';

let board, current, next, hold, canHold, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme, skin;
let powerupsAwarded, powerupQueued, freezeRemaining;
let challengeAwarded, challengeQueued;

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

function applySkin(name) {
  skin = SKINS[name] ? name : 'retro';
  document.body.setAttribute('data-skin', skin);
  if (skinSelect) skinSelect.value = skin;
  localStorage.setItem(SKIN_KEY, skin);
  // Re-renderizar todas las superficies en vivo, sin recargar la página.
  if (current) {
    draw();
    drawNext();
    drawHold();
  }
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKINS[saved] ? saved : 'retro');
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
  });
}

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
    updateHUD();
  }
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

// ---- Helpers de dibujado por skin ----

function shadeColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function roundedRectPath(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  if (context.roundRect) {
    context.beginPath();
    context.roundRect(x, y, w, h, radius);
    return;
  }
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + w - radius, y);
  context.quadraticCurveTo(x + w, y, x + w, y + radius);
  context.lineTo(x + w, y + h - radius);
  context.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  context.lineTo(x + radius, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawRetroBlock(context, px, py, color, size) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = THEME_COLORS[theme].highlight;
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, color, size) {
  const x = px + 2, y = py + 2, w = size - 4, h = size - 4;
  context.save();
  context.shadowBlur = size * 0.6;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(x, y, w, Math.max(2, h * 0.18));
  context.restore();
}

function drawPastelBlock(context, px, py, color, size) {
  const x = px + 1, y = py + 1, w = size - 2, h = size - 2;
  const r = size * 0.22;
  context.save();
  roundedRectPath(context, x, y, w, h, r);
  context.fillStyle = color;
  context.fill();
  roundedRectPath(context, x, y, w, h, r);
  context.clip();
  context.fillStyle = 'rgba(255,255,255,0.4)';
  context.fillRect(x, y, w, h * 0.35);
  context.restore();
}

function drawPixelBlock(context, px, py, color, size) {
  const x = px + 1, y = py + 1, w = size - 2, h = size - 2;
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
  const dark = shadeColor(color, -35);
  const cell = Math.max(3, Math.round(size / 6));
  context.fillStyle = dark;
  for (let ry = 0; ry < h; ry += cell) {
    for (let rx = 0; rx < w; rx += cell) {
      const checker = (Math.floor(rx / cell) + Math.floor(ry / cell)) % 2 === 0;
      if (checker) {
        context.fillRect(x + rx, y + ry, Math.min(cell, w - rx), Math.min(cell, h - ry));
      }
    }
  }
  context.fillStyle = THEME_COLORS[theme].highlight;
  context.fillRect(x, y, w, 3);
}

// Dibuja un bloque de tamaño `size` en la celda (x, y) del `context`, usando
// el color dado y el efecto visual del skin activo. `powerIcon`, si se
// provee, dibuja el emoji del power-up encima del bloque.
function drawSkinnedBlock(context, x, y, color, size, alpha, powerIcon) {
  context.globalAlpha = alpha ?? 1;
  const px = x * size, py = y * size;
  switch (skin) {
    case 'neon':
      drawNeonBlock(context, px, py, color, size);
      break;
    case 'pastel':
      drawPastelBlock(context, px, py, color, size);
      break;
    case 'pixel':
      drawPixelBlock(context, px, py, color, size);
      break;
    default:
      drawRetroBlock(context, px, py, color, size);
  }
  if (powerIcon) {
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(POWER_ICONS[powerIcon], px + size / 2, py + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const palette = (SKINS[skin] && SKINS[skin].colors) || COLORS;
  const color = palette[colorIndex] || COLORS[colorIndex];
  drawSkinnedBlock(context, x, y, color, size, alpha);
}

function drawPowerBlock(context, x, y, power, size, alpha) {
  drawSkinnedBlock(context, x, y, POWER_COLORS[power], size, alpha, power);
}

function drawGrid() {
  if (skin === 'neon') {
    ctx.save();
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(0, 229, 255, 0.35)';
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
  } else {
    ctx.strokeStyle = THEME_COLORS[theme].grid;
  }
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
  if (skin === 'neon') ctx.restore();
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
initSkin();
init();
