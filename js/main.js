// ===== WILDVALE — game state, title screen, main loop =====
const Game = {
  mode: 'boot',   // 'title' | 'overworld' | 'battle'
  busy: false,
  player: null,
  viewW: 240,     // logical viewport width; widens to match the screen aspect
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
  // All scenes draw in 240x160 logical space; the canvas is 480x320 so
  // 32px source art lands at native 1:1 device pixels (crisp).
  _ctx.setTransform(2, 0, 0, 2, 0, 0);
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
  const screenEl = document.getElementById('screen');   // the display glass — its width tracks the game's aspect ratio
  const consoleEl = document.getElementById('console'); // the whole GBA shell — this is what scales to fit the window
  const shellTop = document.getElementById('shell-top');
  const controlsEl = document.getElementById('touch-controls');
  const cv = document.getElementById('game');

  // The logical viewport WIDENS to match the screen's aspect ratio
  // (240..360 logical px), then the stage scales to fill it.
  function updateViewport() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const w = Math.max(240, Math.min(360, Math.round(160 * aspect / 2) * 2));
    if (Game.viewW !== w) {
      Game.viewW = w;
      cv.width = w * 2;          // 2x internal resolution
      cv.height = 320;
      _ctx.imageSmoothingEnabled = false; // canvas resize resets ctx state
      screenEl.style.width = (w * 3) + 'px';
    }
  }

  // The game screen is a fixed landscape shape (480x320) that can't get
  // taller, so on a tall phone in portrait there's no way to fill the
  // screen with more GAME — the only lever left is growing the control
  // deck to use the rest of the height, the way a real vertical handheld
  // dedicates most of its body to buttons. Rather than guessing one
  // breakpoint size, compute the deck scale (--deck-k) that makes the
  // WHOLE console's aspect ratio match this specific device's, so the fit
  // is close to perfect on any phone instead of just the one under test.
  const DPAD_BASE = 148, DECK_TOP_PAD = 30, MAX_K = 2.1;
  function layoutDeck(vw, vh) {
    const isPortrait = vh > vw;
    if (!isPortrait) {
      controlsEl.style.removeProperty('--deck-k');
      consoleEl.style.paddingBottom = '';
      return;
    }
    const consoleWidth = screenEl.offsetWidth + 52;   // #console's left+right padding
    const topChrome = shellTop.offsetHeight + 20;      // #console's top padding
    const screenH = screenEl.offsetHeight;

    const targetHeight = consoleWidth * (vh / vw);
    let deckBudget = targetHeight - topChrome - screenH - DECK_TOP_PAD;
    deckBudget = Math.max(DPAD_BASE, deckBudget); // never shrink below the original design size

    const k = Math.min(MAX_K, deckBudget / DPAD_BASE);
    controlsEl.style.setProperty('--deck-k', k);
    // Whatever the cap leaves on the table becomes bottom shell bezel, so
    // very tall/narrow screens still land close to the target aspect
    // instead of the buttons growing past a comfortable size.
    const leftover = Math.max(20, deckBudget - DPAD_BASE * k);
    consoleEl.style.paddingBottom = leftover + 'px';
  }

  function fitScreen() {
    updateViewport();
    // Prefer visualViewport: on mobile Safari/Chrome, window.innerHeight lags
    // behind the true visible area while the address bar is animating away,
    // which briefly overscales the console. visualViewport tracks it live.
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth;
    const vh = vv ? vv.height : window.innerHeight;
    layoutDeck(vw, vh);
    // offsetWidth/Height are the shell's untransformed layout size (chrome +
    // the current screen width) — scaling the whole console keeps every
    // button and bezel proportional to the display, like a real device.
    const s = Math.min(vw / consoleEl.offsetWidth, vh / consoleEl.offsetHeight);
    consoleEl.style.transform = `scale(${Math.max(0.3, s)})`;
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
