/* options.js — settings UI, persisted to storage.sync. */
(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULTS = {
    qualityEnabled: true,
    maxQuality: 4320,
    minQuality: 1080,
    sidebarEnabled: true,
    commentsCards: true,
    cardMinWidth: 330,
    cardMinHeight: 150,
  };

  // Selectable quality steps (px -> label). Order: best -> worst.
  const QUALITIES = [
    [4320, "4320p (8K)"],
    [2160, "2160p (4K)"],
    [1440, "1440p (2K)"],
    [1080, "1080p (Full HD)"],
    [720, "720p (HD)"],
    [480, "480p"],
    [360, "360p"],
    [240, "240p"],
    [144, "144p"],
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    qualityEnabled: $("qualityEnabled"),
    maxQuality: $("maxQuality"),
    minQuality: $("minQuality"),
    sidebarEnabled: $("sidebarEnabled"),
    commentsCards: $("commentsCards"),
    cardMinWidth: $("cardMinWidth"),
    cardMinHeight: $("cardMinHeight"),
    rangeError: $("rangeError"),
    savedNote: $("savedNote"),
  };

  function fillSelect(select) {
    for (const [px, label] of QUALITIES) {
      const opt = document.createElement("option");
      opt.value = String(px);
      opt.textContent = label;
      select.appendChild(opt);
    }
  }

  function getStored() {
    return new Promise((resolve) => {
      const res = api.storage.sync.get(DEFAULTS);
      if (res && typeof res.then === "function") {
        res.then((s) => resolve(Object.assign({}, DEFAULTS, s)));
      } else {
        api.storage.sync.get(DEFAULTS, (s) =>
          resolve(Object.assign({}, DEFAULTS, s))
        );
      }
    });
  }

  let savedTimer = null;
  function flashSaved() {
    els.savedNote.hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (els.savedNote.hidden = true), 1200);
  }

  function clampHeight(value) {
    let n = parseInt(value, 10);
    if (isNaN(n)) n = DEFAULTS.cardMinHeight;
    return Math.min(600, Math.max(100, n));
  }

  function save() {
    let max = parseInt(els.maxQuality.value, 10);
    let min = parseInt(els.minQuality.value, 10);

    const invalid = min > max;
    els.rangeError.hidden = !invalid;
    if (invalid) return; // wait until the user fixes the range

    api.storage.sync.set({
      qualityEnabled: els.qualityEnabled.checked,
      maxQuality: max,
      minQuality: min,
      sidebarEnabled: els.sidebarEnabled.checked,
      commentsCards: els.commentsCards.checked,
      cardMinWidth: parseInt(els.cardMinWidth.value, 10),
      cardMinHeight: clampHeight(els.cardMinHeight.value),
    });
    flashSaved();
  }

  function syncDisabledState() {
    const on = els.qualityEnabled.checked;
    els.maxQuality.disabled = !on;
    els.minQuality.disabled = !on;
    els.cardMinWidth.disabled = !els.commentsCards.checked;
    els.cardMinHeight.disabled = !els.commentsCards.checked;
  }

  async function init() {
    fillSelect(els.maxQuality);
    fillSelect(els.minQuality);

    const s = await getStored();
    els.qualityEnabled.checked = s.qualityEnabled;
    els.maxQuality.value = String(s.maxQuality);
    els.minQuality.value = String(s.minQuality);
    els.sidebarEnabled.checked = s.sidebarEnabled;
    els.commentsCards.checked = s.commentsCards;
    els.cardMinWidth.value = String(s.cardMinWidth);
    els.cardMinHeight.value = String(s.cardMinHeight);
    syncDisabledState();

    for (const el of [
      els.qualityEnabled,
      els.maxQuality,
      els.minQuality,
      els.sidebarEnabled,
      els.commentsCards,
      els.cardMinWidth,
      els.cardMinHeight,
    ]) {
      el.addEventListener("change", () => {
        syncDisabledState();
        save();
      });
    }
  }

  init();
})();
