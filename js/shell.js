// ===== Game Boy shell: fits the console to any viewport/orientation =====
// Two independent scale factors are in play, and both matter for crisp
// pixel art:
//   1. `artScale` (n): how many DEVICE pixels each art pixel occupies.
//      Chosen per-device so it's a whole number — never a fraction.
//   2. `shellScale` (s): the outer CSS transform that fits the whole
//      console into the viewport (this can and will be fractional; that's
//      fine, because it applies to the WHOLE shell, not to individual art
//      pixels, once (1) has already made the canvas's own pixels land
//      exactly on device pixels).
// Skipping step 1 (or computing it from dpr alone, ignoring shellScale) is
// exactly how the old engine's tiles ended up "mangled" on real phones —
// the outer transform resamples a canvas that wasn't sized to match it.

const Shell = {
  init() {
    this.consoleEl = document.getElementById('console');
    this.screenEl = document.getElementById('screen');
    this.viewportEl = document.getElementById('game-viewport');
    this.shellTop = document.getElementById('shell-top');
    this.controlsEl = document.getElementById('touch-controls');
    this.canvas = document.getElementById('game');

    window.addEventListener('resize', () => this.fit());
    window.addEventListener('orientationchange', () => setTimeout(() => this.fit(), 60));
    this.fit();
  },

  // Deck scale: shrink the D-pad/A-button a little on very narrow screens,
  // grow them a little on wide tablets, capped both ways.
  layoutDeck(vw) {
    const k = Math.max(0.85, Math.min(1.4, vw / 380));
    this.controlsEl.style.setProperty('--deck-k', k);
    return k;
  },

  // Sizes #screen (the bezel) to match the device's aspect ratio, growing
  // whichever axis is needed so the letterbox/pillarbox bars fall INSIDE
  // the bezel (like a real handheld's screen surround) instead of leaving
  // blank plastic outside the console.
  layoutShell(vw, vh) {
    this.layoutDeck(vw);
    const designW = Game.viewW * TILE, designH = Game.viewH * TILE;
    const topChrome = this.shellTop.offsetHeight + 20;
    const bottomPad = 26;
    const sidePad = 52;
    const deckHeight = this.controlsEl.offsetHeight;
    const naturalW = designW + sidePad;
    const naturalH = topChrome + designH + deckHeight + bottomPad;
    const deviceAspect = vw / vh;

    if (deviceAspect < naturalW / naturalH) {
      // Narrower than natural (portrait phones): grow the bezel's height.
      const targetH = naturalW / deviceAspect;
      this.screenEl.style.width = designW + 'px';
      this.screenEl.style.height = Math.max(designH, targetH - topChrome - deckHeight - bottomPad) + 'px';
    } else {
      // Wider than natural (landscape/tablets): grow the bezel's width.
      const targetW = naturalH * deviceAspect;
      this.screenEl.style.width = Math.max(designW, targetW - sidePad) + 'px';
      this.screenEl.style.height = designH + 'px';
    }
  },

  // Picks an integer device-pixel scale for the canvas and sizes it (both
  // backing-store and CSS size) so that, once the outer `shellScale`
  // transform is applied on top, every art pixel still lands on a whole
  // number of real device pixels.
  applyPixelScale(shellScale) {
    const dpr = window.devicePixelRatio || 1;
    const n = Math.max(1, Math.min(4, Math.round(shellScale * dpr)));
    const backingW = Game.viewW * TILE * n;
    const backingH = Game.viewH * TILE * n;
    const cssW = backingW / (shellScale * dpr);
    const cssH = backingH / (shellScale * dpr);

    this.canvas.width = backingW;
    this.canvas.height = backingH;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';

    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(n, 0, 0, n, 0, 0);
    ctx.imageSmoothingEnabled = false;
  },

  fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    this.layoutShell(vw, vh);
    // Measure, then transform-scale the whole console to fill the viewport.
    this.consoleEl.style.transform = 'none';
    const consoleW = this.consoleEl.offsetWidth, consoleH = this.consoleEl.offsetHeight;
    const s = Math.max(0.3, Math.min(vw / consoleW, vh / consoleH));
    this.consoleEl.style.transform = `scale(${s})`;
    this.applyPixelScale(s);
  },
};
