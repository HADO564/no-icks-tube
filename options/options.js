/* options.js — the full ick catalog. Builds collapsible, searchable groups
 * from the registry (icks.js) and persists settings to storage.sync.
 *
 * The lightweight day-to-day surface (volume mixer + quick toggles) lives in
 * the toolbar popup (popup.html / popup.js); this page is the place to browse
 * and configure every ick. */
(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;
  const REG = globalThis.NoIcksTube || { ICKS: [], DEFAULTS: {}, LINKS: {} };
  const DEFAULTS = REG.DEFAULTS;

  const $ = (id) => document.getElementById(id);
  // input element for each setting key, filled while building the UI.
  const inputs = {};
  // One record per ick card: lets us count, filter and collapse cheaply.
  const cards = []; // { ick, el, primaryKey, text }
  const groups = []; // { area, section, body, countEl, cardRecs }

  // Collapse state lives in this extension page's localStorage (not in the
  // synced settings) so tidying the catalog never touches a user's choices.
  const COLLAPSE_KEY = "noicks:collapsed";
  let searching = false;

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

  // ---- Build a "choice" control: one pickable card per option ------------
  // Used by the codec ick: each option shows its name, a one-line summary and
  // its pros/cons, so the trade-off is visible before you pick. Returns the DOM
  // plus an adapter that mimics a form control (value/disabled/change) so the
  // rest of the page treats it like any other input.
  function buildPoints(kind, items) {
    const ul = document.createElement("ul");
    ul.className = "codec-points codec-" + kind;
    for (const text of items) {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    }
    return ul;
  }

  function buildChoice(setting) {
    const wrap = document.createElement("div");
    wrap.className = "choice";

    if (setting.label) {
      const lab = document.createElement("p");
      lab.className = "choice-label";
      lab.textContent = setting.label;
      wrap.appendChild(lab);
    }

    const grid = document.createElement("div");
    grid.className = "choice-grid";
    wrap.appendChild(grid);

    const radios = [];
    for (const opt of setting.options) {
      const card = document.createElement("label");
      card.className = "codec";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "ctl-" + setting.key;
      radio.value = String(opt.value);
      radios.push(radio);

      const body = document.createElement("div");
      body.className = "codec-body";

      const head = document.createElement("div");
      head.className = "codec-head";
      const name = document.createElement("span");
      name.className = "codec-name";
      name.textContent = opt.name;
      head.appendChild(name);
      if (opt.tag) {
        const tag = document.createElement("span");
        tag.className = "codec-tag";
        tag.textContent = opt.tag;
        head.appendChild(tag);
      }
      body.appendChild(head);

      if (opt.summary) {
        const sum = document.createElement("p");
        sum.className = "codec-summary";
        sum.textContent = opt.summary;
        body.appendChild(sum);
      }
      if (opt.pros && opt.pros.length) body.appendChild(buildPoints("pros", opt.pros));
      if (opt.cons && opt.cons.length) body.appendChild(buildPoints("cons", opt.cons));

      card.append(radio, body);
      grid.appendChild(card);
    }

    const adapter = {
      type: "choice",
      get value() {
        const on = radios.find((r) => r.checked);
        return on ? on.value : setting.default;
      },
      set value(v) {
        const want = String(v);
        let matched = false;
        for (const r of radios) {
          r.checked = r.value === want;
          matched = matched || r.checked;
        }
        if (!matched && radios.length) radios[0].checked = true;
      },
      set disabled(d) {
        for (const r of radios) r.disabled = !!d;
        wrap.classList.toggle("disabled", !!d);
      },
      addEventListener(type, fn) {
        for (const r of radios) r.addEventListener(type, fn);
      },
    };

    return { el: wrap, adapter };
  }

  // ---- Build one ick card -------------------------------------------------
  function buildIck(ick) {
    const card = document.createElement("section");
    card.className = "card";
    card.dataset.ick = ick.id;

    const primary = ick.settings.find((s) => s.primary) || ick.settings[0];
    const subs = ick.settings.filter((s) => s !== primary);
    // Choice controls (codec cards) get their own full-width block; the rest
    // share the side-by-side field row.
    const choiceSubs = subs.filter((s) => s.type === "choice");
    const fieldSubs = subs.filter((s) => s.type !== "choice");

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

    // "New" badge while this ick shipped in the version you're running.
    if (REG.isNew && REG.isNew(ick)) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "New";
      row.appendChild(badge);
    }

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

    // Plain sub-settings (selects / numbers) share a side-by-side field row.
    if (fieldSubs.length) {
      const split = document.createElement("div");
      split.className = "row split";
      for (const s of fieldSubs) {
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

    // Choice sub-settings (codec cards) span the full card width below.
    let choiceText = "";
    for (const s of choiceSubs) {
      const { el, adapter } = buildChoice(s);
      inputs[s.key] = adapter;
      card.appendChild(el);
      for (const opt of s.options) {
        choiceText += " " + opt.name + " " + opt.value + " " + (opt.summary || "");
      }
    }

    // Disable sub-controls when the primary toggle is off.
    card._sync = () => {
      const on = toggle.checked;
      for (const s of subs) inputs[s.key].disabled = !on;
    };

    cards.push({
      ick,
      el: card,
      primaryKey: primary.key,
      // Everything we let the search box match against, lower-cased once.
      text: `${ick.ick} ${ick.fix} ${ick.area || ""} ${choiceText}`.toLowerCase(),
    });
    return card;
  }

  // ---- Group the cards into collapsible sections by area -----------------
  function buildGroups() {
    const container = $("groups");
    const byArea = new Map(); // area -> card records (first-seen order)

    // Build the cards first so `cards` is populated, then bucket by area.
    for (const ick of REG.ICKS) buildIck(ick);

    for (const rec of cards) {
      const area = rec.ick.area || "Other";
      if (!byArea.has(area)) byArea.set(area, []);
      byArea.get(area).push(rec);
    }

    for (const [area, recs] of byArea) {
      const section = document.createElement("section");
      section.className = "group";
      section.dataset.area = area;

      const head = document.createElement("button");
      head.className = "group-head";
      head.type = "button";
      head.setAttribute("aria-expanded", "true");

      const chevron = document.createElement("span");
      chevron.className = "chevron";
      chevron.textContent = "▾";
      const name = document.createElement("span");
      name.className = "group-name";
      name.textContent = area;
      const count = document.createElement("span");
      count.className = "group-count";

      head.append(chevron, name, count);

      const body = document.createElement("div");
      body.className = "group-body";
      for (const rec of recs) body.appendChild(rec.el);

      const group = { area, section, body, countEl: count, cardRecs: recs };
      head.addEventListener("click", () => {
        if (searching) return; // collapse is meaningless mid-search
        setCollapsed(group, !section.classList.contains("collapsed"), true);
      });

      section.append(head, body);
      container.appendChild(section);
      groups.push(group);
    }
  }

  // ---- Collapse state -----------------------------------------------------
  function loadCollapsed() {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      return raw ? new Set(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCollapsed() {
    const collapsed = groups
      .filter((g) => g.section.classList.contains("collapsed"))
      .map((g) => g.area);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch (e) {
      /* private mode / storage blocked — collapse just won't persist */
    }
  }

  function setCollapsed(group, collapsed, persist) {
    group.section.classList.toggle("collapsed", collapsed);
    group.section
      .querySelector(".group-head")
      .setAttribute("aria-expanded", String(!collapsed));
    if (persist) saveCollapsed();
  }

  function applyInitialCollapse() {
    const saved = loadCollapsed();
    for (const group of groups) {
      let collapse;
      if (saved) {
        collapse = saved.has(group.area);
      } else {
        // First run: keep it tidy by folding away areas that are entirely off
        // and have nothing new to show off.
        collapse = group.cardRecs.every(
          (r) => !inputs[r.primaryKey].checked && !(REG.isNew && REG.isNew(r.ick))
        );
      }
      setCollapsed(group, collapse, false);
    }
  }

  // ---- Live counts --------------------------------------------------------
  function recount() {
    let onTotal = 0;
    for (const group of groups) {
      const on = group.cardRecs.filter(
        (r) => inputs[r.primaryKey].checked
      ).length;
      onTotal += on;
      group.countEl.textContent = `${on} of ${group.cardRecs.length} on`;
    }
    $("summary").textContent = `${onTotal} of ${cards.length} icks on`;
  }

  // ---- Search -------------------------------------------------------------
  function applySearch(raw) {
    const q = raw.trim().toLowerCase();
    searching = q.length > 0;
    let totalMatches = 0;

    for (const group of groups) {
      let groupMatches = 0;
      for (const rec of group.cardRecs) {
        const hit = !q || rec.text.includes(q);
        rec.el.hidden = !hit;
        if (hit) groupMatches++;
      }
      totalMatches += groupMatches;
      // Hide groups with no hits; while searching, force every group open so
      // matches are never buried in a collapsed section.
      group.section.hidden = q && groupMatches === 0;
      if (searching) setCollapsed(group, false, false);
    }

    $("noMatches").hidden = !(searching && totalMatches === 0);

    // Search cleared: restore the saved/derived collapse state.
    if (!searching) applyInitialCollapse();
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
        } else if (s.valueType === "string") {
          // String-valued select (e.g. codec name) — keep it as text; the
          // default numeric parse would turn it into NaN.
          out[s.key] = el.value;
        } else out[s.key] = parseInt(el.value, 10);
      }
    }
    return out;
  }

  let savedTimer = null;
  function flashSaved() {
    $("savedNote").hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => ($("savedNote").hidden = true), 1200);
  }

  function syncAll() {
    for (const rec of cards) rec.el._sync && rec.el._sync();
  }

  function save() {
    const invalid = rangeError();
    $("rangeError").hidden = !invalid;
    if (invalid) return;
    api.storage.sync.set(collect());
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
    // Build the grouped catalog.
    buildGroups();

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
    recount();
    applyInitialCollapse();

    // Save + recount on any change.
    for (const key in inputs) {
      inputs[key].addEventListener("change", () => {
        syncAll();
        recount();
        save();
      });
    }

    $("search").addEventListener("input", (e) => applySearch(e.target.value));
  }

  init();
})();
