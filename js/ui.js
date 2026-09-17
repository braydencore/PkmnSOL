// ===== Small UI layer: dialog box + fade transitions =====
const UI = {
  dialogOpen: false,
  _resolveDialog: null,

  init() {
    this.dialogEl = document.getElementById('dialog');
    this.dialogTextEl = document.getElementById('dialog-text');
    this.fadeEl = document.getElementById('fade');
  },

  showDialog(text) {
    return new Promise((resolve) => {
      this.dialogOpen = true;
      this.dialogTextEl.textContent = text;
      this.dialogEl.classList.remove('hidden');
      this._resolveDialog = resolve;
    });
  },

  advanceDialog() {
    if (!this.dialogOpen) return;
    this.dialogOpen = false;
    this.dialogEl.classList.add('hidden');
    const resolve = this._resolveDialog;
    this._resolveDialog = null;
    if (resolve) resolve();
  },

  fadeOut(ms = 260) {
    return new Promise((resolve) => {
      this.fadeEl.style.transition = `opacity ${ms}ms ease`;
      requestAnimationFrame(() => { this.fadeEl.style.opacity = '1'; });
      setTimeout(resolve, ms);
    });
  },

  fadeIn(ms = 260) {
    return new Promise((resolve) => {
      this.fadeEl.style.transition = `opacity ${ms}ms ease`;
      requestAnimationFrame(() => { this.fadeEl.style.opacity = '0'; });
      setTimeout(resolve, ms);
    });
  },
};
