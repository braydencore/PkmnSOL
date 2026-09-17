// ===== Tiny overworld engine =====
// Design goal: every tile on screen is drawn from its OWN dedicated PNG
// (assets/tiles/*.png), placed at a destination cell with no source-rect
// slicing math at all. There is no tileset atlas and no coordinate table to
// get wrong — the class of bug that comes from "the wrong rectangle of a
// shared sheet" simply cannot happen here.

const TILE = 32; // native pixel size of every tile/sprite asset
// How many tiles fit on screen is decided per-device by shell.js (so every
// tile lands on a whole number of device pixels — see js/shell.js). These
// are just the starting/fallback values before that first layout pass.
const DEFAULT_VIEW_W = 10;
const DEFAULT_VIEW_H = 9;

// Tile-name substrings that are walkable. Anything not matched here (and
// not a ledge) is solid — mirrors the source project's rule, computed once
// per map instead of re-scanned every frame.
const WALKABLE_HINTS = ['ground', 'water', 'grass', 'door', 'stairs', 'rug'];

function classifyTile(filename) {
  if (filename.includes('ledge')) return 'ledge';
  if (WALKABLE_HINTS.some((h) => filename.includes(h))) return 'walkable';
  return 'solid';
}

// ---------------- asset loading ----------------
const ImageCache = (() => {
  const cache = new Map();
  function get(path) {
    let img = cache.get(path);
    if (!img) {
      img = new Image();
      img.src = path;
      cache.set(path, img);
    }
    return img;
  }
  return { get };
})();

function tileImg(filename) { return ImageCache.get(`assets/tiles/${filename}`); }
function playerImg(filename) { return ImageCache.get(`assets/player/${filename}`); }

// ---------------- map parsing ----------------
// File format (unchanged from the source project, plain and auditable):
//   border:<tile>.png
//   size:WxH
//   up:<mapfile>,<xOffset>     (or none,0)
//   down:<mapfile>,<xOffset>
//   music:<file>.mp3
//   <tile>.png:x,y             (1-indexed; repeats for every placed tile)
//   warp:<id>,x,y
//   sign:<id>,x,y
const mapCache = new Map();

async function loadMapText(name) {
  const res = await fetch(`maps/${name}`);
  return res.text();
}

function parseConnector(value) {
  const [map, adj] = value.split(',');
  return map === 'none' ? null : { map, adj: parseInt(adj, 10) || 0 };
}

function parseMap(text) {
  const tiles = new Map(); // "x,y" -> {img, kind}
  const warps = []; // {id, x, y}
  const signs = []; // {id, x, y}
  let border = 'black.png', w = 0, h = 0, north = null, south = null, music = null;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);

    if (key === 'border') border = value;
    else if (key === 'size') {
      const [ws, hs] = value.split('x');
      w = parseInt(ws, 10); h = parseInt(hs, 10);
    } else if (key === 'up') north = parseConnector(value);
    else if (key === 'down') south = parseConnector(value);
    else if (key === 'music') music = value;
    else if (key === 'warp') {
      const [id, x, y] = value.split(',').map(Number);
      warps.push({ id, x, y });
      tiles.set(`${x},${y}`, { ...(tiles.get(`${x},${y}`) || {}), warpId: id });
    } else if (key === 'sign') {
      const [id, x, y] = value.split(',').map(Number);
      signs.push({ id, x, y });
    } else if (key.endsWith('.png')) {
      const [x, y] = value.split(',').map(Number);
      const existing = tiles.get(`${x},${y}`) || {};
      tiles.set(`${x},${y}`, { ...existing, img: key, kind: classifyTile(key) });
    }
  }
  return { border, w, h, north, south, music, tiles, warps, signs };
}

async function getMap(name) {
  if (!mapCache.has(name)) {
    mapCache.set(name, parseMap(await loadMapText(name)));
  }
  return mapCache.get(name);
}

let warpTable = null; // id -> {map, localId}
let signTable = null; // id -> text

async function getWarpTable() {
  if (warpTable) return warpTable;
  const text = await (await fetch('maps/warps.txt')).text();
  warpTable = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [id, map, localId] = line.split(',');
    warpTable[id] = { map, localId };
  }
  return warpTable;
}

async function getSignTable() {
  if (signTable) return signTable;
  const text = await (await fetch('maps/scripts.txt')).text();
  signTable = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    signTable[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return signTable;
}

// ---------------- game state ----------------
const Game = {
  mapName: null,
  map: null,
  x: 1, y: 1,       // 1-indexed tile position
  facing: 'down',
  viewW: DEFAULT_VIEW_W, // tiles visible on screen; shell.js tunes this per device
  viewH: DEFAULT_VIEW_H,
  moving: false,     // true while a tile-step animation is playing
  moveFrom: { x: 1, y: 1 },
  moveT: 0,          // 0..1 progress of the current step animation
  moveDuration: 160, // ms per tile
  moveExtraTiles: 1, // 2 during a ledge hop
  busy: false,       // true while a dialog/fade blocks input
};

function tileAt(map, x, y) { return map.tiles.get(`${x},${y}`); }

async function loadMap(name, spawnX, spawnY) {
  const map = await getMap(name);
  Game.mapName = name;
  Game.map = map;
  Game.x = spawnX;
  Game.y = spawnY;
  Game.moveFrom = { x: spawnX, y: spawnY };
  const audio = document.getElementById('bgm');
  if (map.music) {
    if (!audio.src.endsWith(map.music)) {
      audio.src = `assets/sounds/${map.music}`;
      audio.play().catch(() => {}); // autoplay may be blocked until a user gesture
    }
  } else {
    audio.pause();
  }
}

// Resolve what's at (x,y): either a tile in the current map, or — if that
// row is the map's open edge and a connector exists — the matching cell of
// the neighboring map. Returns null if the position is simply solid.
function resolveCell(x, y) {
  const map = Game.map;
  const local = tileAt(map, x, y);
  if (local) return { map, x, y, tile: local };
  if (y < 1 && map.north) {
    return { connector: map.north, x: x - map.north.adj, y: null, edge: 'north' };
  }
  if (y > map.h && map.south) {
    return { connector: map.south, x: x - map.south.adj, y: null, edge: 'south' };
  }
  return null;
}

async function stepInto(dx, dy) {
  if (Game.moving || Game.busy) return;
  const dir = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
  Game.facing = dir;

  const nx = Game.x + dx, ny = Game.y + dy;
  const cell = resolveCell(nx, ny);

  if (!cell) return; // solid / off the edge with no connector

  if (cell.connector) {
    // Crossing into a neighboring map: land just inside its opposite edge.
    const nextMap = await getMap(cell.connector.map);
    const landY = cell.edge === 'north' ? nextMap.h : 1;
    const landing = tileAt(nextMap, cell.x, landY);
    if (landing && landing.kind === 'solid') return;
    await loadMap(cell.connector.map, cell.x, landY);
    beginStep(dx, dy, 1);
    return;
  }

  const kind = cell.tile.kind;
  if (kind === 'solid') return;
  if (kind === 'ledge') {
    if (dir !== 'down') return; // ledges only give way when hopping down
    const beyond = resolveCell(nx, ny + 1);
    if (!beyond || (beyond.tile && beyond.tile.kind === 'solid')) return;
    beginStep(0, 2, 2); // hop clears the ledge tile and lands one past it
    maybeWarp(nx, ny + 1);
    return;
  }

  beginStep(dx, dy, 1);
  maybeWarp(nx, ny);
}

function beginStep(dx, dy, tiles) {
  Game.moving = true;
  Game.moveFrom = { x: Game.x, y: Game.y };
  Game.x += dx;
  Game.y += dy;
  Game.moveExtraTiles = tiles;
  Game.moveT = 0;
}

async function maybeWarp(x, y) {
  const tile = tileAt(Game.map, x, y);
  if (!tile || tile.warpId === undefined) return;
  const table = await getWarpTable();
  const entry = table[tile.warpId];
  if (!entry) return;
  const destMap = await getMap(entry.map);
  const dest = destMap.warps.find((w) => String(w.id) === String(entry.localId));
  if (!dest) return;
  Game.pendingWarp = { map: entry.map, x: dest.x, y: dest.y };
}

async function resolveWarpIfPending() {
  if (!Game.pendingWarp || Game.moving) return;
  const { map, x, y } = Game.pendingWarp;
  Game.pendingWarp = null;
  Game.busy = true;
  await UI.fadeOut();
  await loadMap(map, x, y);
  await UI.fadeIn();
  Game.busy = false;
}

function facingCell() {
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[Game.facing];
  return { x: Game.x + d[0], y: Game.y + d[1] };
}

async function interact() {
  if (Game.moving || Game.busy) return;
  const { x, y } = facingCell();
  const sign = Game.map.signs.find((s) => s.x === x && s.y === y);
  if (!sign) return;
  const table = await getSignTable();
  const text = table[sign.id];
  if (text) await UI.showDialog(text);
}

// ---------------- rendering ----------------
let _ctx = null;

function drawFrame() {
  const cv = document.getElementById('game');
  if (!_ctx) _ctx = cv.getContext('2d');
  const ctx = _ctx;
  const viewW = Game.viewW, viewH = Game.viewH;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, viewW * TILE, viewH * TILE);

  if (!Game.map) return;

  // Camera follows the player's animated (possibly mid-step) position.
  // (px,py) is a fractional 1-indexed tile coordinate; world pixel (0,0) is
  // the top-left corner of tile (1,1).
  const t = Game.moving ? Game.moveT : 1;
  const px = Game.moveFrom.x + (Game.x - Game.moveFrom.x) * t;
  const py = Game.moveFrom.y + (Game.y - Game.moveFrom.y) * t;

  const canvasW = viewW * TILE, canvasH = viewH * TILE;
  const camPxX = (px - 0.5) * TILE; // world-pixel focus = player's tile center
  const camPxY = (py - 0.5) * TILE;

  const firstTx = Math.floor(px - viewW / 2 - 1);
  const lastTx = Math.ceil(px + viewW / 2 + 1);
  const firstTy = Math.floor(py - viewH / 2 - 1);
  const lastTy = Math.ceil(py + viewH / 2 + 1);

  for (let ty = firstTy; ty <= lastTy; ty++) {
    const screenY = Math.round((ty - 1) * TILE - camPxY + canvasH / 2);
    if (screenY <= -TILE || screenY >= canvasH) continue;
    for (let tx = firstTx; tx <= lastTx; tx++) {
      const screenX = Math.round((tx - 1) * TILE - camPxX + canvasW / 2);
      if (screenX <= -TILE || screenX >= canvasW) continue;
      const tile = tileAt(Game.map, tx, ty);
      const img = tile ? tileImg(tile.img) : tileImg(Game.map.border);
      if (img.complete) ctx.drawImage(img, screenX, screenY, TILE, TILE);
    }
  }

  // Player sprite: always screen-centered (the world scrolls beneath it).
  const spriteFile = {
    up: 'up.png', down: 'down.png', left: 'left.png', right: 'right.png',
  }[Game.facing];
  const img = playerImg(spriteFile);
  const cx = Math.round(canvasW / 2 - 14);
  const cy = Math.round(canvasH / 2 - 16);
  ctx.beginPath();
  ctx.ellipse(cx + 14, cy + 30, 13, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  if (img.complete) ctx.drawImage(img, cx, cy, 28, 32);
}

let _lastT = 0;
function tick(ts) {
  if (!_lastT) _lastT = ts;
  const dt = ts - _lastT;
  _lastT = ts;

  if (Game.moving) {
    const duration = Game.moveDuration * Game.moveExtraTiles;
    Game.moveT = Math.min(1, Game.moveT + dt / duration);
    if (Game.moveT >= 1) {
      Game.moving = false;
      resolveWarpIfPending();
    }
  }

  drawFrame();
  requestAnimationFrame(tick);
}

// ---------------- input ----------------
const heldDirs = new Set();
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function pumpInput() {
  if (Game.moving || Game.busy || UI.dialogOpen) return;
  for (const dir of ['down', 'up', 'left', 'right']) {
    if (heldDirs.has(dir)) {
      const [dx, dy] = DIR_VEC[dir];
      stepInto(dx, dy);
      return;
    }
  }
}

function setupInput() {
  const keyMap = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  window.addEventListener('keydown', (e) => {
    if (UI.dialogOpen) {
      if (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter') UI.advanceDialog();
      return;
    }
    const dir = keyMap[e.code];
    if (dir) { heldDirs.add(dir); pumpInput(); }
    if (e.code === 'KeyZ' || e.code === 'Space') interact();
  });
  window.addEventListener('keyup', (e) => {
    const dir = keyMap[e.code];
    if (dir) heldDirs.delete(dir);
  });

  // On-screen D-pad + A button (touch and click both fire pointer events).
  document.querySelectorAll('#dpad [data-dir]').forEach((btn) => {
    const dir = btn.dataset.dir;
    const start = (e) => { e.preventDefault(); heldDirs.add(dir); pumpInput(); };
    const end = (e) => { e.preventDefault(); heldDirs.delete(dir); };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('pointerleave', end);
  });
  document.getElementById('btn-a').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (UI.dialogOpen) UI.advanceDialog();
    else interact();
  });

  setInterval(pumpInput, 40); // keep stepping while a direction is held
}

// ---------------- boot ----------------
window.addEventListener('load', async () => {
  Shell.init();
  UI.init();
  setupInput();
  await loadMap('pallet_town.txt', 6, 8);
  requestAnimationFrame(tick);
});
