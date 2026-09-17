// ===== WILDVALE — game state, title screen, main loop =====
const Game = {
  mode: 'boot',   // 'title' | 'overworld' | 'battle'
  busy: false,
  player: null,
  viewW: 240,     // logical viewport width; widens to match the screen aspect
  artScale: 1,    // whole-number art-pixel:device-pixel scale (see applyPixelScale)
};

function newPlayer() {
  return {
    map: 'bedroom', x: 2, y: 2, facing: 'down',
    party: [],
    vault: [],
    bag: {},
    money: 3000,
    badges: [],
    flags: {},
    respawn: { map: 'house', x: 4, y: 4 },
  };
}

let _ctx = null;
let _last = 0;

function mainLoop(ts) {
  requestAnimationFrame(mainLoop);
  const dt = Math.min(0.05, (ts - _last) / 1000);
  _last = ts;
  // All scenes draw in logical (viewW x 160) space. The canvas backing is
  // sized to an exact integer multiple of the native art resolution, so
  // 2*artScale maps one logical pixel onto a whole number of device
  // pixels and the 32px source tiles never land on fractional boundaries.
  const t = 2 * Game.artScale;
  _ctx.setTransform(t, 0, 0, t, 0, 0);
  if (Game.mode === 'overworld') {
    Overworld.update(dt);
    Overworld.draw(_ctx);
  } else if (Game.mode === 'battle' && Battle.active) {
    Battle.active.draw(_ctx);
  } else if (Game.mode === 'title') {
    drawTitle(_ctx, ts);
  }
}

// ---------------- title screen (FireRed-style: warm gradient + Charizard) ----------------
function drawTitle(ctx, ts) {
  const t = ts / 1000;
  const W = Game.viewW, CX = W / 2;
  const grad = ctx.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, '#2a0c08');
  grad.addColorStop(0.55, '#8a2410');
  grad.addColorStop(1, '#e87828');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 160);

  // ember motes drifting upward
  ctx.fillStyle = 'rgba(248,200,72,.8)';
  for (let i = 0; i < 18; i++) {
    const ex = (i * 53 + Math.sin(t * 0.7 + i) * 18 + W) % W;
    const ey = 160 - ((t * (14 + i * 3) + i * 37) % 175);
    ctx.fillRect(ex, ey, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
  }

  // dark ridge silhouette
  ctx.fillStyle = '#1c0a06';
  ctx.beginPath();
  ctx.ellipse(CX - 70, 185, 120, 48, 0, Math.PI, 0);
  ctx.ellipse(CX + 80, 192, 130, 55, 0, Math.PI, 0);
  ctx.fill();

  // Charizard hero (local sprite asset, drawn-art fallback)
  const hero = GameAssets.frontFor('charizard') || Sprites.creature('charizard');
  const bob = Math.sin(t * 1.6) * 3;
  ctx.drawImage(hero, CX - 52, 44 + bob, 104, 104);

  ctx.textAlign = 'center';
  ctx.font = '23px "Press Start 2P", monospace';
  ctx.fillStyle = '#5a1004';
  ctx.fillText('FIRERED', CX + 2, 38);
  ctx.fillStyle = '#f8a020';
  ctx.fillText('FIRERED', CX, 35);
  ctx.fillStyle = '#f8d048';
  ctx.fillText('FIRERED', CX - 1, 33);
  ctx.fillStyle = '#f8e8d0';
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.fillText('A FAN-MADE GBA-STYLE ADVENTURE', CX, 52);
  if (Math.floor(t * 1.6) % 2 === 0) {
    ctx.fillStyle = '#fff';
    ctx.fillText('FAN PROJECT — NOT AFFILIATED', CX, 154);
  }
  ctx.textAlign = 'left';
}

async function titleFlow() {
  Game.mode = 'title';
  while (true) {
    const opts = [];
    if (SaveSys.hasLocal()) opts.push('CONTINUE');
    opts.push('NEW GAME', 'IMPORT CODE');
    const pick = await UI.choose(opts, {
      canCancel: false,
      style: { left: '20px', bottom: '120px', minWidth: '178px' },
    });
    const label = opts[pick];

    if (label === 'NEW GAME') {
      Game.player = newPlayer();
      await enterWorld(true);
      return;
    }
    if (label === 'CONTINUE') {
      try {
        SaveSys.fromLocal();
        await enterWorld(false);
        return;
      } catch (e) {
        UI.toast('Save data is corrupted!');
      }
    }
    if (label === 'IMPORT CODE') {
      const code = await UI.importModal();
      if (!code) continue;
      try {
        SaveSys.fromCode(code);
        UI.toast('Save loaded!');
        await enterWorld(false);
        return;
      } catch (e) {
        UI.toast('Invalid save code!');
      }
    }
  }
}

async function enterWorld(isNew) {
  await UI.fadeOut(350);
  Game.mode = 'overworld';
  await UI.fadeIn(350);
  if (isNew) {
    Game.busy = true;
    await UI.sayLines([
      'Morning light spills through your bedroom window in WILLOWBROOK...',
      'Today is the day. Prof. MAPLE is expecting you at her lab!',
      'Head downstairs — MOM will want a word before you go.',
      '(ARROWS/WASD: move   Z: talk/confirm   X: back   ENTER: menu   M: sound)',
    ]);
    Game.busy = false;
    Input.clearPressed();
  }
}

// ---------------- boot ----------------
window.addEventListener('load', () => {
  const cv = document.getElementById('game');
  _ctx = cv.getContext('2d');
  _ctx.imageSmoothingEnabled = false;
  Sprites.init();
  GameAssets.init();
  UI.init();
  setupMobile();
  // Title-screen roar: audio needs a user gesture, so it plays on the
  // first key press / touch while the title is showing.
  let roared = false;
  const titleRoar = () => {
    if (roared || Game.mode !== 'title') return;
    roared = true;
    setTimeout(() => Sfx.roar(), 100);
  };
  window.addEventListener('keydown', titleRoar, true);
  window.addEventListener('touchstart', titleRoar, true);
  requestAnimationFrame(mainLoop);
  titleFlow();
  // Warm every asset in the background right after first paint — the page
  // load is unaffected, but everything is cached before it's needed.
  setTimeout(() => GameAssets.preloadAll(), 150);
});

// ---------------- scaling + fullscreen + touch controls ----------------
function setupMobile() {
  const screenEl = document.getElementById('screen');       // the visible glass/bezel — can grow TALLER than the game content
  const viewportEl = document.getElementById('game-viewport'); // fixed-size game box (canvas + HUD); its width tracks the aspect ratio
  const consoleEl = document.getElementById('console');     // the whole shell — this is what scales to fit the window
  const shellTop = document.getElementById('shell-top');
  const controlsEl = document.getElementById('touch-controls');
  const cv = document.getElementById('game');

  const hudScaleEl = document.getElementById('hud-scale');

  // ---- Pixel-perfect scaling ----------------------------------------
  // The tile art is 32 source pixels per 16 logical pixels, so the game's
  // native resolution is (viewW*2 x 320) "art pixels". If those land on a
  // fractional number of device pixels, every pixel is resampled unevenly
  // — some source pixels become 2 screen pixels, others 3 — which is what
  // makes tile borders, edges and diagonals (stairs especially) look
  // mangled. It is not the tiles that are wrong, it is the scale.
  //
  // Rather than shrink the DISPLAY until it lands on a whole-number scale
  // (crisp but wasteful), adapt the GAME'S LOGICAL WIDTH to the device
  // pixels actually available. The engine already supports a flexible
  // 240..360 logical viewport, so we pick the whole-number art scale and
  // the logical width that together consume the screen box exactly. That
  // gives every device both a full-size screen AND 1:1 pixels.
  //
  // The screen box is a FIXED design size (720x480) so none of this feeds
  // back into the shell layout — no circular dependency.
  const SCREEN_DESIGN_W = 720;

  function applyPixelScale(shellScale) {
    const dpr = window.devicePixelRatio || 1;
    // Device pixels the screen box actually occupies.
    const deviceW = SCREEN_DESIGN_W * shellScale * dpr;

    // Largest whole-number art scale that still leaves the logical width
    // at or above its 240 minimum. Below 1:1 (a short, wide desktop
    // window) fall back to an exact 1/2 so the downsample stays uniform.
    let n = Math.floor(deviceW / (2 * 240));
    if (n < 1) n = deviceW >= 240 ? 0.5 : 0.25;

    // Logical width that makes the canvas consume those device pixels
    // exactly. Rounded DOWN to an even number so it never overflows.
    let viewW = Math.floor(deviceW / (2 * n) / 2) * 2;
    viewW = Math.max(240, Math.min(360, viewW));
    Game.viewW = viewW;

    const bw = Math.round(viewW * 2 * n), bh = Math.round(320 * n);
    if (cv.width !== bw || cv.height !== bh) {
      cv.width = bw;
      cv.height = bh;
      _ctx.imageSmoothingEnabled = false; // canvas resize resets ctx state
    }
    Game.artScale = n;

    // CSS size that makes those backing pixels map 1:1 onto device pixels.
    const cssW = bw / (shellScale * dpr);
    const cssH = bh / (shellScale * dpr);
    viewportEl.style.width = cssW + 'px';
    viewportEl.style.height = cssH + 'px';
    hudScaleEl.style.transform = `scale(${cssW / SCREEN_DESIGN_W})`;
  }

  // The game content itself is a fixed landscape shape (480x320) that
  // can't get taller. On a portrait phone, the honest way to give the
  // WHOLE device a real vertical-handheld silhouette is to let the
  // screen's own glass/bezel be taller than the active game area —
  // exactly like a real device's screen border — and center the game
  // inside it, rather than padding blank plastic below the buttons
  // (which read as a mistake) or leaving the shell landscape-shaped
  // (which read as "not vertical"). The D-pad/A/B/Start-Select also
  // grow, capped so they never exceed the screen's width.
  const DPAD_BASE = 148, MAX_K = 1.6;
  const DECK_CONTENT_BASE_W = 148 + 150 + (52 * 2 + 16);
  const DECK_SIDE_PAD = 24; // #touch-controls' own left+right padding

  function layoutDeck(screenW) {
    return Math.max(1, Math.min(MAX_K, (screenW - DECK_SIDE_PAD) / DECK_CONTENT_BASE_W));
  }

  // Size the console's silhouette to match the ACTUAL device's aspect
  // ratio (not a guessed constant) so fitScreen's scale-to-fit binds on
  // BOTH width and height at once — no leftover space outside the shell
  // on any phone. A fixed constant (what this used to be) only happens
  // to match whichever one device it was tuned against; every other
  // aspect ratio leaves the console short of the screen on one axis,
  // which is exactly the black-void-above/below-the-shell bug.
  function layoutPortrait(vw, vh) {
    const screenW = screenEl.offsetWidth;
    const k = layoutDeck(screenW);
    controlsEl.style.setProperty('--deck-k', k);

    const consoleWidth = screenW + 52;           // #console's own left+right padding
    const topChrome = shellTop.offsetHeight + 20; // #console's top padding
    const consoleBottomPad = 26;                  // #console's own bottom padding
    const deckHeight = controlsEl.offsetHeight;   // reflects --deck-k already applied above

    const deviceAspect = vw / vh;
    const targetBodyHeight = consoleWidth / deviceAspect;
    const screenH = Math.max(320, targetBodyHeight - topChrome - deckHeight - consoleBottomPad);
    screenEl.style.height = screenH + 'px';
  }

  function fitScreen() {
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    if (vh > vw) {
      layoutPortrait(vw, vh);
    } else {
      controlsEl.style.removeProperty('--deck-k');
      screenEl.style.height = '';
    }
    // offsetWidth/Height are the shell's untransformed layout size (chrome +
    // the fixed-design screen box) — scaling the whole console keeps every
    // button and bezel proportional to the display, like a real device.
    // In portrait, consoleWidth/consoleHeight now equals vw/vh by
    // construction, so this binds on BOTH axes simultaneously instead of
    // being width-bound with leftover height (or vice versa).
    const s = Math.max(0.3, Math.min(vw / consoleEl.offsetWidth, vh / consoleEl.offsetHeight));
    consoleEl.style.transform = `scale(${s})`;
    applyPixelScale(s);
  }
  window.addEventListener('resize', fitScreen);
  window.addEventListener('orientationchange', () => setTimeout(fitScreen, 200));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitScreen);
  }

  // iOS Safari ignores the viewport meta's user-scalable=no for pinch-zoom
  // (an intentional accessibility override) — block it explicitly so a
  // stray two-finger touch doesn't zoom the page instead of the game.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());

  // F toggles real browser fullscreen on desktop.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.target && e.target.tagName === 'TEXTAREA') return;
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  });

  // PWA: register the service worker (https/installed app only; file:// skips).
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Touch detection: controls appear only when touch is the PRIMARY input
  // (coarse pointer AND no hover) — a touchscreen laptop with a keyboard
  // stays in keyboard mode. A real tap shows them; a keypress hides them.
  const touchPrimary = window.matchMedia
    && matchMedia('(pointer: coarse)').matches
    && matchMedia('(hover: none)').matches;
  if (touchPrimary) document.body.classList.add('touch');

  window.addEventListener('touchstart', () => {
    if (!document.body.classList.contains('touch')) {
      document.body.classList.add('touch');
      fitScreen();
    }
  }, { passive: true });
  window.addEventListener('keydown', () => {
    if (document.body.classList.contains('touch')) {
      document.body.classList.remove('touch');
      fitScreen();
    }
  });

  // Kill page panning/bounce entirely while in touch mode — the game is the
  // whole page. (Textareas keep their internal scrolling for save codes.)
  document.addEventListener('touchmove', (e) => {
    if (!document.body.classList.contains('touch')) return;
    if (e.target && e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  }, { passive: false });

  // Wire every on-screen button into the shared Input press/release path
  // (always wired; they're only visible in touch mode). The D-pad's touch
  // handling is special-cased below (drag-across support), so it only gets
  // mouse bindings here.
  const dpadEl = document.getElementById('dpad');
  document.querySelectorAll('#touch-controls [data-k]').forEach(btn => {
    const k = btn.dataset.k;
    const isDpadBtn = dpadEl && dpadEl.contains(btn);
    const down = (e) => {
      e.preventDefault(); btn.classList.add('on'); Input.press(k);
      if (e.type === 'touchstart' && navigator.vibrate) navigator.vibrate(8); // tiny tactile click
    };
    const up = (e) => { e.preventDefault(); btn.classList.remove('on'); Input.release(k); };
    if (!isDpadBtn) {
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
    }
    btn.addEventListener('mousedown', down);
    btn.addEventListener('mouseup', up);
    btn.addEventListener('mouseleave', (e) => { if (btn.classList.contains('on')) up(e); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // D-pad drag-across: a real virtual d-pad lets you slide your thumb
  // between directions without lifting it, the way a physical cross does.
  // The browser keeps routing touch events to whichever button a touch
  // *started* on, so we track the one finger on the pad ourselves and
  // re-check which quadrant it's over on every move.
  if (dpadEl) {
    const dirBtns = Array.from(dpadEl.querySelectorAll('[data-k]'));
    let touchId = null;
    let curKey = null;

    const keyUnder = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const btn = el && el.closest && el.closest('#dpad [data-k]');
      return btn ? btn.dataset.k : null;
    };
    const setKey = (k) => {
      if (k === curKey) return;
      if (curKey) {
        Input.release(curKey);
        const old = dirBtns.find(b => b.dataset.k === curKey);
        if (old) old.classList.remove('on');
      }
      if (k) {
        Input.press(k);
        const next = dirBtns.find(b => b.dataset.k === k);
        if (next) next.classList.add('on');
        if (navigator.vibrate) navigator.vibrate(6);
      }
      curKey = k;
    };

    dpadEl.addEventListener('touchstart', (e) => {
      if (touchId !== null) return; // one finger drives the pad at a time
      const t = e.changedTouches[0];
      touchId = t.identifier;
      e.preventDefault();
      setKey(keyUnder(t.clientX, t.clientY));
    }, { passive: false });

    dpadEl.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        e.preventDefault();
        setKey(keyUnder(t.clientX, t.clientY));
      }
    }, { passive: false });

    const endDpadTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        setKey(null);
        touchId = null;
      }
    };
    dpadEl.addEventListener('touchend', endDpadTouch, { passive: false });
    dpadEl.addEventListener('touchcancel', endDpadTouch, { passive: false });
  }

  fitScreen();
}

// ---------------- debug hooks (console only) ----------------
window.DEBUG = {
  game: Game,
  give(speciesId, level = 5) {
    Game.player.party.push(makeCreature(speciesId, level));
  },
  heal() {
    for (const c of Game.player.party) { c.hp = c.maxHp; c.status = null; }
  },
  money(n = 99999) { Game.player.money = n; },
  warp(map, x, y) { Game.player.map = map; Game.player.x = x; Game.player.y = y; },
};
