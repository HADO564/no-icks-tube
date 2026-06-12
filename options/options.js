/* options.js — builds the "Fix your icks" page from the registry (icks.js)
 * and persists settings to storage.sync. */
(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const REG = globalThis.NoIcksTube || { ICKS: [], DEFAULTS: {}, LINKS: {} };
  const DEFAULTS = REG.DEFAULTS;

  const $ = (id) => document.getElementById(id);
  // input element for each setting key, filled while building the UI.
  const inputs = {};

  // ---- Build one control for a setting -----------------------------------
  function buildControl(setting) {
    if (setting.type === "select") {
      const sel = document.createElement("select");
      for (const [value, label] of setting.options) {
        const opt = document.createElement("option");
        opt.value = String(value);
        opt.textContent = label;
        sel.appendChild(opt);
      }
      return sel;
    }
    if (setting.type === "number") {
      const inp = document.createElement("input");
      inp.type = "number";
      if (setting.min != null) inp.min = String(setting.min);
      if (setting.max != null) inp.max = String(setting.max);
      if (setting.step != null) inp.step = String(setting.step);
      return inp;
    }
    // toggle
    const inp = document.createElement("input");
    inp.type = "checkbox";
    return inp;
  }

  // ---- Build one ick card -------------------------------------------------
  function buildIck(ick) {
    const card = document.createElement("section");
    card.className = "card";
    card.dataset.ick = ick.id;

    const primary = ick.settings.find((s) => s.primary) || ick.settings[0];
    const subs = ick.settings.filter((s) => s !== primary);

    // Primary toggle, labelled with the ick itself.
    const toggle = buildControl(primary);
    inputs[primary.key] = toggle;
    const label = document.createElement("label");
    label.className = "switch";
    const span = document.createElement("span");
    span.textContent = ick.ick;
    label.append(toggle, span);

    const row = document.createElement("div");
    row.className = "row";
    row.appendChild(label);
    card.appendChild(row);

    if (ick.area) {
      const tag = document.createElement("span");
      tag.className = "area";
      tag.textContent = ick.area;
      row.appendChild(tag);
    }

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = ick.fix;
    card.appendChild(hint);

    // Sub-settings (only when the ick has any).
    if (subs.length) {
      const split = document.createElement("div");
      split.className = "row split";
      for (const s of subs) {
        const field = document.createElement("div");
        field.className = "field";
        const lab = document.createElement("label");
        lab.textContent = s.label || s.key;
        const ctrl = buildControl(s);
        lab.htmlFor = "ctl-" + s.key;
        ctrl.id = "ctl-" + s.key;
        inputs[s.key] = ctrl;
        field.append(lab, ctrl);
        split.appendChild(field);
      }
      card.appendChild(split);
    }

    // Disable sub-controls when the primary toggle is off.
    card._sync = () => {
      const on = toggle.checked;
      for (const s of subs) inputs[s.key].disabled = !on;
    };
    return card;
  }

  // ---- Validation (e.g. quality min <= max) ------------------------------
  function rangeError() {
    for (const ick of REG.ICKS) {
      if (!ick.validateRange) continue;
      const min = parseInt(inputs[ick.validateRange.minKey].value, 10);
      const max = parseInt(inputs[ick.validateRange.maxKey].value, 10);
      if (min > max) return true;
    }
    return false;
  }

  // ---- Read current UI into a settings object ----------------------------
  function collect() {
    const out = {};
    for (const ick of REG.ICKS) {
      for (const s of ick.settings) {
        const el = inputs[s.key];
        if (s.type === "toggle") out[s.key] = el.checked;
        else if (s.type === "number") {
          let n = parseInt(el.value, 10);
          if (isNaN(n)) n = s.default;
          if (s.min != null) n = Math.max(s.min, n);
          if (s.max != null) n = Math.min(s.max, n);
          out[s.key] = n;
        } else out[s.key] = parseInt(el.value, 10);
      }
    }
    return out;
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
    if (document.hidden) return; // options page in a background tab
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

  let savedTimer = null;
  function flashSaved() {
    $("savedNote").hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($("savedNote").hidden = true), 1200);
  }

  function syncAll() {
    document.querySelectorAll("#icks .card").forEach((c) => c._sync && c._sync());
  }

  function save() {
    const invalid = rangeError();
    $("rangeError").hidden = !invalid;
    if (invalid) return;
    const settings = collect();
    api.storage.sync.set(settings);
    setMixerEnabled(!!settings.volumeMixer);
    flashSaved();
  }

  // ---- Load stored values -------------------------------------------------
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

  async function init() {
    // Build the cards.
    const container = $("icks");
    for (const ick of REG.ICKS) container.appendChild(buildIck(ick));

    // Footer links.
    if (REG.LINKS) {
      $("submitIck").href = REG.LINKS.submit || "#";
      $("browseIcks").href = REG.LINKS.browse || "#";
    }

    // Fill from storage.
    const stored = await getStored();
    for (const key in inputs) {
      const el = inputs[key];
      if (el.type === "checkbox") el.checked = !!stored[key];
      else el.value = String(stored[key]);
    }
    syncAll();
    setMixerEnabled(!!stored.volumeMixer);

    // Save on any change.
    for (const key in inputs) {
      inputs[key].addEventListener("change", () => {
        syncAll();
        save();
      });
    }
  }

  init();
})();
