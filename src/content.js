/*
 * content.js — runs in the isolated content-script world at document_start.
 *
 *  - Loads the page-context script (inject.js) that talks to the player API.
 *  - Reads settings from storage and forwards them to the page.
 *  - Injects / removes the "independent sidebar scroll" CSS on demand.
 */
(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  const LEVEL_PX = {
    highres: 4320, hd2880: 2880, hd2160: 2160, hd1440: 1440, hd1080: 1080,
    hd720: 720, large: 480, medium: 360, small: 240, tiny: 144,
  };

  const DEFAULTS = {
    qualityEnabled: true,
    maxQuality: 4320, // best available, capped here (px)
    minQuality: 1080, // try to stay >= this when the video allows (px)
    sidebarEnabled: true,
    commentsCards: true,
    cardMinWidth: 330, // px, minimum width of a comment card before wrapping
    cardMinHeight: 150, // px, minimum height of a comment card
  };

  // ---- Inject the page-context script ------------------------------------
  function injectPageScript() {
    const s = document.createElement("script");
    s.src = api.runtime.getURL("src/inject.js");
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.addEventListener("load", () => s.remove());
  }

  // ---- Forward settings to the page --------------------------------------
  function postSettings(settings) {
    window.postMessage(
      {
        __ytql: "settings",
        payload: {
          qualityEnabled: settings.qualityEnabled,
          maxPx: settings.maxQuality,
          minPx: settings.minQuality,
        },
      },
      "*"
    );
  }

  // ---- Independent sidebar scroll CSS ------------------------------------
  const SIDEBAR_STYLE_ID = "ytql-sidebar-style";

  const SIDEBAR_CSS = `
    /* Two-column watch page: let the related-videos column scroll on its own. */
    ytd-watch-flexy[is-two-columns_]:not([fullscreen]) #secondary.ytd-watch-flexy {
      position: -webkit-sticky;
      position: sticky;
      top: var(--ytd-toolbar-height, 56px);
      align-self: flex-start;
      max-height: calc(100vh - var(--ytd-toolbar-height, 56px) - 16px);
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;          /* don't bleed scroll into the page */
      scrollbar-width: thin;
    }
    ytd-watch-flexy[is-two-columns_]:not([fullscreen]) #secondary.ytd-watch-flexy::-webkit-scrollbar {
      width: 8px;
    }
    ytd-watch-flexy[is-two-columns_]:not([fullscreen]) #secondary.ytd-watch-flexy::-webkit-scrollbar-thumb {
      background: rgba(128,128,128,0.5);
      border-radius: 4px;
    }
    /* Stop YouTube from collapsing/hiding the secondary column on scroll. */
    ytd-watch-flexy[is-two-columns_]:not([fullscreen]) #secondary-inner.ytd-watch-flexy {
      position: static !important;
    }
  `;

  function setSidebar(enabled) {
    const existing = document.getElementById(SIDEBAR_STYLE_ID);
    if (enabled) {
      if (existing) return;
      const style = document.createElement("style");
      style.id = SIDEBAR_STYLE_ID;
      style.textContent = SIDEBAR_CSS;
      (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  // ---- Comments as responsive cards --------------------------------------
  const COMMENTS_STYLE_ID = "ytql-comments-style";

  function commentsCss(minWidth, minHeight) {
    // The threads sit in #contents (which carries the ytd-item-section-renderer
    // scope class). Targeting that class avoids matching the replies' own
    // #contents, which is scoped to ytd-comment-replies-renderer.
    const grid =
      "ytd-comments#comments #contents.ytd-item-section-renderer";

    // A thread is "expanded" (=> full-width) when the top comment's text is
    // open, or its replies are showing. The `:not([data-ytql-collapsed])` lets
    // our Collapse button fold a card back without a CSS specificity fight:
    // once the marker is set, none of these match.
    const card = `${grid} > ytd-comment-thread-renderer`;
    const open = `${card}:not([data-ytql-collapsed])`;
    const expandedSelectors = [
      // Top comment text expanded ("Read more"): #expander loses [collapsed].
      `${open}:has(> #comment-container ytd-expander#expander:not([collapsed]))`,
      // Modern replies open: a sub-thread reply is rendered and visible.
      `${open}:has(#replies #expanded-threads:not([hidden]) ytd-comment-thread-renderer[is-sub-thread])`,
      // Legacy replies open: a reply renderer is present in #expander-contents.
      `${open}:has(#replies #expander-contents:not([hidden]) ytd-comment-view-model)`,
    ];

    return `
    /* Lay the comment threads out as a responsive grid of vertical cards. */
    ${grid} {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(${minWidth}px, 1fr));
      gap: 14px;
      align-items: start;          /* cards keep their natural height */
    }

    /* Each top-level comment thread becomes a card. */
    ${card} {
      position: relative;       /* anchor for the collapse button */
      margin: 0 !important;
      padding: 14px 14px 10px;
      border: 1px solid var(--yt-spec-10-percent-layer, rgba(128,128,128,0.25));
      border-radius: 12px;
      background: var(--yt-spec-badge-chip-background, rgba(128,128,128,0.06));
      box-sizing: border-box;
      overflow: hidden;
      width: auto;
      min-height: ${minHeight}px;
      display: flex;            /* let the inner chain stretch to full height */
      flex-direction: column;
    }

    /* Stretch the comment body to fill the card's min-height so we can push
       the action bar to the bottom on short comments. */
    ${grid} > ytd-comment-thread-renderer > #comment-container {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
    }
    ${grid} > ytd-comment-thread-renderer > #comment-container > ytd-comment-view-model#comment {
      flex: 1 1 auto;
      display: flex;
      max-width: none;          /* ignore YouTube's reading-width cap in a card */
    }
    ${grid} > ytd-comment-thread-renderer > #comment-container > ytd-comment-view-model#comment > #body {
      flex: 1 1 auto;
      align-items: stretch;
    }
    ${grid} > ytd-comment-thread-renderer > #comment-container > ytd-comment-view-model#comment > #body > #main {
      display: flex;
      flex-direction: column;
    }
    /* Header + text stay grouped at the top; the like/reply bar drops to the
       bottom when there's spare vertical room. */
    ${grid} > ytd-comment-thread-renderer > #comment-container #action-buttons {
      margin-top: auto;
    }

    /* Go full-width while the top comment's text or its replies are open. */
    ${expandedSelectors.join(",\n    ")} {
      grid-column: 1 / -1;
    }

    /* Our injected "collapse" button: hidden unless the card is full-width. */
    ${card} > .ytql-collapse-btn {
      display: none;
      position: absolute;
      bottom: 10px;
      right: 12px;
      z-index: 5;
      padding: 6px 14px;
      border: none;
      border-radius: 18px;
      font: 500 12px/1 Roboto, system-ui, sans-serif;
      cursor: pointer;
      background: var(--yt-spec-badge-chip-background-hover, rgba(128,128,128,0.25));
      color: var(--yt-spec-text-primary, inherit);
    }
    ${card} > .ytql-collapse-btn:hover {
      background: var(--yt-spec-10-percent-layer, rgba(128,128,128,0.4));
    }
    ${expandedSelectors.map((s) => `${s} > .ytql-collapse-btn`).join(",\n    ")} {
      display: inline-flex !important;
    }

    /* Folded by our Collapse button: force card shape, hide the expanded reply
       list, but RE-SHOW the "N replies" toggle so replies can be reopened.
       (The modern reply UI has no "hide replies" control to click, so we fold
       visually; clicking the toggle / Read more clears the marker.) */
    ${card}[data-ytql-collapsed] {
      grid-column: auto !important;
    }
    ${card}[data-ytql-collapsed] #expanded-threads,
    ${card}[data-ytql-collapsed] #expander-contents {
      display: none !important;
    }
    ${card}[data-ytql-collapsed] #collapsed-threads[hidden] {
      display: block !important;
    }
    `;
  }

  function setComments(enabled, minWidth, minHeight) {
    const existing = document.getElementById(COMMENTS_STYLE_ID);
    const css = commentsCss(minWidth, minHeight);
    if (enabled) {
      if (existing) {
        if (existing.textContent !== css) existing.textContent = css;
        return;
      }
      const style = document.createElement("style");
      style.id = COMMENTS_STYLE_ID;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    } else if (existing) {
      existing.remove();
    }
  }

  // ---- "Collapse card" button --------------------------------------------
  // A real button is needed (CSS can't trigger YouTube's collapse actions).
  // We add one to each thread; CSS shows it only while the card is full-width.
  let commentsOn = false;

  function ensureCollapseButtons() {
    if (!commentsOn) return;
    // Only top-level threads (direct children of the comments grid) become
    // cards — never the nested reply (is-sub-thread) renderers.
    const threads = document.querySelectorAll(
      "ytd-comments#comments #contents.ytd-item-section-renderer > " +
        "ytd-comment-thread-renderer:not([data-ytql-btn]):not([is-sub-thread])"
    );
    for (const thread of threads) {
      const btn = document.createElement("button");
      btn.className = "ytql-collapse-btn";
      btn.type = "button";
      btn.textContent = "Collapse";
      btn.setAttribute("aria-label", "Collapse this comment back to a card");
      thread.appendChild(btn);
      thread.setAttribute("data-ytql-btn", "1");
    }
  }

  // Fold a thread back to a collapsed card. We collapse the comment text for
  // real (clicking "Show less"), then mark the thread so CSS forces it back to
  // card width and hides the replies block. YouTube's modern sub-thread reply
  // UI has no "hide replies" control to click, so the marker is how we fold.
  function collapseThread(thread) {
    const less = thread.querySelector(
      "#comment-container > ytd-comment-view-model#comment ytd-expander#expander #less:not([hidden])"
    );
    if (less) less.click();
    thread.setAttribute("data-ytql-collapsed", "1");
    thread.scrollIntoView({ block: "nearest" });
  }

  // One delegated listener (capture) so it works for recycled/new threads.
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;

      const btn = t.closest(".ytql-collapse-btn");
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const thread = btn.closest("ytd-comment-thread-renderer");
        if (thread) collapseThread(thread);
        return;
      }

      // Any other click inside a folded card (e.g. "Read more") un-folds it so
      // YouTube's natural expand behaviour takes over again.
      const folded = t.closest("ytd-comment-thread-renderer[data-ytql-collapsed]");
      if (folded) folded.removeAttribute("data-ytql-collapsed");
    },
    true
  );

  // Add buttons as comments load / the user scrolls (debounced).
  let btnTimer = null;
  const commentsObserver = new MutationObserver(() => {
    if (!commentsOn) return;
    clearTimeout(btnTimer);
    btnTimer = setTimeout(ensureCollapseButtons, 250);
  });
  commentsObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // ---- Load + apply settings ---------------------------------------------
  function loadSettings() {
    return new Promise((resolve) => {
      try {
        const res = api.storage.sync.get(DEFAULTS);
        if (res && typeof res.then === "function") {
          res.then((s) => resolve(Object.assign({}, DEFAULTS, s)));
        } else {
          api.storage.sync.get(DEFAULTS, (s) =>
            resolve(Object.assign({}, DEFAULTS, s))
          );
        }
      } catch (e) {
        resolve(DEFAULTS);
      }
    });
  }

  function applyAll(settings) {
    setSidebar(settings.sidebarEnabled);
    setComments(settings.commentsCards, settings.cardMinWidth, settings.cardMinHeight);
    commentsOn = settings.commentsCards;
    if (commentsOn) ensureCollapseButtons();
    postSettings(settings);
  }

  // React to changes made in the options page without a reload.
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    loadSettings().then(applyAll);
  });

  // Re-post settings on SPA navigation (page context may have been recreated).
  window.addEventListener(
    "yt-navigate-finish",
    () => loadSettings().then((s) => postSettings(s)),
    true
  );

  // ---- Boot ---------------------------------------------------------------
  injectPageScript();
  loadSettings().then((settings) => {
    applyAll(settings);
    // The page script may load slightly after us; re-post shortly to be safe.
    setTimeout(() => postSettings(settings), 800);
  });

  // Expose the px map for nothing in particular, but keep lint quiet.
  void LEVEL_PX;
})();
