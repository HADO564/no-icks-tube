/* popup.js — the lightweight toolbar surface.
 *
 *  - Volume mixer: a live slider + mute per YouTube tab that has a video.
 *  - Quick toggles: flip off the icks you currently have on, without leaving
 *    the popup.
 *  - "Manage all icks" opens the full catalog (options.html).
 *
 * Settings persist to storage.sync; content scripts react via onChanged. */
(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const REG = globalThis.NoIcksTube || { ICKS: [], DEFAULTS: {} };
  const DEFAULTS = REG.DEFAULTS;
  const $ = (id) => document.getElementById(id);

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

  // ---- Volume mixer (the "tab-volumes" ick) -------------------------------
  // One row per YouTube tab that has a video: live slider + mute + click the
  // title to jump to the tab. Tabs answer via their content script (which
  // relays to the page-context player API).
  const MIXER_POLL_MS = 1500;
  let mixerTimer = null;
  const mixerRows = new Map(); // tabId -> row entry

  function ytTabs() {
    return new Promise((resolve) => {
      try {
        api.tabs
          .query({ url: ["https://www.youtube.com/*", "https://m.youtube.com/*"] })
          .then(resolve, () => resolve([]));
      } catch (e) {
        resolve([]);
      }
    });
  }

  function askTab(tabId, msg) {
    return new Promise((resolve) => {
      try {
        // Rejects when the tab has no content script (asleep, error page…) —
        // those tabs simply don't appear in the mixer.
        api.tabs.sendMessage(tabId, msg).then(resolve, () => resolve(null));
      } catch (e) {
        resolve(null);
      }
    });
  }

  function tabLabel(tab) {
    return (tab.title || "YouTube").replace(/ - YouTube$/, "");
  }

  function buildMixerRow(tab) {
    const row = document.createElement("div");
    row.className = "mixer-row";

    const title = document.createElement("button");
    title.className = "mixer-tab";
    title.type = "button";
    title.title = "Go to this tab";
    title.addEventListener("click", () => {
      api.tabs.update(tab.id, { active: true });
      if (api.windows && tab.windowId != null) {
        api.windows.update(tab.windowId, { focused: true });
      }
    });

    const controls = document.createElement("div");
    controls.className = "mixer-controls";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";

    const pct = document.createElement("span");
    pct.className = "mixer-pct";

    const mute = document.createElement("button");
    mute.className = "mixer-mute";
    mute.type = "button";

    const entry = { row, title, slider, pct, mute, muted: false, dragging: false };

    slider.addEventListener("input", () => {
      entry.dragging = true; // don't let the poll fight the drag
      const v = parseInt(slider.value, 10);
      pct.textContent = v + "%";
      askTab(tab.id, { ytql: "volume-set", value: v });
    });
    slider.addEventListener("change", () => {
      entry.dragging = false;
    });

    mute.addEventListener("click", () => {
      askTab(tab.id, { ytql: "volume-mute", muted: !entry.muted }).then(refreshMixer);
    });

    controls.append(slider, pct, mute);
    row.append(title, controls);
    return entry;
  }

  function updateMixerRow(entry, tab, state) {
    entry.title.textContent = "";
    entry.title.append(tabLabel(tab));
    if (!state.playing) {
      const paused = document.createElement("span");
      paused.className = "state";
      paused.textContent = " — paused";
      entry.title.appendChild(paused);
    }
    entry.muted = !!state.muted;
    entry.mute.textContent = entry.muted ? "🔇" : "🔊";
    entry.mute.title = entry.muted ? "Unmute this tab" : "Mute this tab";
    if (!entry.dragging) {
      entry.slider.value = String(state.volume);
      entry.pct.textContent = entry.muted ? "muted" : state.volume + "%";
    }
  }

  async function refreshMixer() {
    if (document.hidden) return;
    const tabs = await ytTabs();
    const states = await Promise.all(
      tabs.map((t) => askTab(t.id, { ytql: "volume-get" }))
    );

    const container = $("mixerRows");
    const seen = new Set();
    tabs.forEach((tab, i) => {
      const state = states[i];
      if (!state) return; // no video in that tab
      seen.add(tab.id);
      let entry = mixerRows.get(tab.id);
      if (!entry) {
        entry = buildMixerRow(tab);
        mixerRows.set(tab.id, entry);
        container.appendChild(entry.row);
      }
      updateMixerRow(entry, tab, state);
    });

    // Drop rows for tabs that closed or no longer have a video.
    for (const [id, entry] of mixerRows) {
      if (!seen.has(id)) {
        entry.row.remove();
        mixerRows.delete(id);
      }
    }
    $("mixerEmpty").hidden = seen.size > 0;
  }

  function setMixerEnabled(on) {
    on = on && !!(api.tabs && api.tabs.query); // needs the tabs API to exist
    $("mixer").hidden = !on;
    clearInterval(mixerTimer);
    mixerTimer = null;
    if (on) {
      refreshMixer();
      mixerTimer = setInterval(refreshMixer, MIXER_POLL_MS);
    }
  }

  // ---- Quick toggles ------------------------------------------------------
  // A compact on/off list of the icks you currently have enabled, snapshotted
  // when the popup opens (so turning one off doesn't make its row vanish from
  // under your cursor). Discovering / enabling new icks happens in the catalog.
  function primaryOf(ick) {
    return ick.settings.find((s) => s.primary) || ick.settings[0];
  }

  function recountQuick(total) {
    const on = document.querySelectorAll(
      "#quickRows input[type=checkbox]:checked"
    ).length;
    $("quickSummary").textContent = `${on} of ${total} on`;
  }

  function buildQuick(stored) {
    const container = $("quickRows");
    const total = REG.ICKS.length;
    let shown = 0;

    for (const ick of REG.ICKS) {
      const primary = primaryOf(ick);
      if (!stored[primary.key]) continue; // only the icks you have on
      shown++;

      const label = document.createElement("label");
      label.className = "switch quick-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      const span = document.createElement("span");
      span.textContent = ick.ick;
      label.append(cb, span);

      cb.addEventListener("change", () => {
        api.storage.sync.set({ [primary.key]: cb.checked });
        if (primary.key === "volumeMixer") setMixerEnabled(cb.checked);
        recountQuick(total);
      });

      container.appendChild(label);
    }

    $("quickEmpty").hidden = shown > 0;
    recountQuick(total);
  }

  // ---- Boot ---------------------------------------------------------------
  $("manage").addEventListener("click", () => {
    if (api.runtime.openOptionsPage) api.runtime.openOptionsPage();
    window.close();
  });

  getStored().then((stored) => {
    buildQuick(stored);
    setMixerEnabled(!!stored.volumeMixer);
  });
})();
