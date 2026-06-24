/*
 * inject.js — runs in the PAGE context (not the isolated content-script world),
 * so it can call YouTube's internal player API:
 *   player.getAvailableQualityLevels()
 *   player.setPlaybackQualityRange(min, max)
 *   player.setPlaybackQuality(q)        // legacy, kept for good measure
 *
 * It receives settings from the content script via window.postMessage.
 */
(function () {
  "use strict";

  // YouTube quality-level string  ->  vertical resolution in pixels.
  const LEVEL_PX = {
    highres: 4320,
    hd2880: 2880,
    hd2160: 2160,
    hd1440: 1440,
    hd1080: 1080,
    hd720: 720,
    large: 480,
    medium: 360,
    small: 240,
    tiny: 144,
  };

  // Current settings (updated whenever the content script posts new ones).
  let settings = {
    qualityEnabled: true,
    maxPx: 4320, // best available, capped here
    minPx: 1080, // try to stay at/above this when possible
  };

  // The video id we've already applied a default to. We set quality ONCE per
  // video so the viewer can freely override it in the player afterwards.
  let appliedFor = null;

  // ---- Codec control ------------------------------------------------------
  // YouTube probes which video codecs the browser can play — via
  // MediaSource.isTypeSupported and HTMLMediaElement.canPlayType — and serves
  // the best codec it thinks you support. By answering "no" for the heavier
  // codecs we make it fall back to a lighter one. The wrappers are installed
  // synchronously here at document_start (before YouTube's player code runs)
  // and we seed the choice from localStorage so even the very first probe on a
  // fresh page load is already filtered; the content script then keeps it in
  // sync via the settings message below.
  //
  // Each entry is the set of codec tokens to reject when that codec is enforced,
  // so YouTube is left serving the chosen one.
  const CODEC_BLOCK = {
    // VP9: drop AV1. H.264 stays as a safety net for the rare video with no VP9,
    // but YouTube serves VP9 whenever it exists — so playback never breaks.
    vp9: /av01/i,
    // H.264/AVC: drop AV1 and VP9, leaving only H.264 (present on every video).
    h264: /av01|vp0?9/i,
    // AV1: drop H.264 and VP9 so AV1 is the only option. A video with no AV1
    // track may then fail to play — that trade-off is spelled out in its cons.
    av1: /avc1|avc3|vp0?9/i,
  };
  let codecBlockRe = null;

  function setCodec(pref) {
    codecBlockRe = (pref && CODEC_BLOCK[pref]) || null;
  }

  function codecBlocked(type) {
    return !!(codecBlockRe && typeof type === "string" && codecBlockRe.test(type));
  }

  // Seed from the last choice cached by the content script (page-origin
  // localStorage is shared between the two worlds).
  try {
    setCodec(localStorage.getItem("ytql-codec"));
  } catch (e) {
    /* storage blocked — the codec filter stays off until settings arrive */
  }

  // Wrap the probing APIs once. They consult `codecBlockRe` live, so toggling
  // the setting takes effect on the next probe without re-wrapping anything.
  (function installCodecFilter() {
    try {
      if (window.MediaSource && typeof MediaSource.isTypeSupported === "function") {
        const orig = MediaSource.isTypeSupported.bind(MediaSource);
        MediaSource.isTypeSupported = function (type) {
          return codecBlocked(type) ? false : orig(type);
        };
      }
    } catch (e) {
      /* leave the native method in place */
    }
    try {
      const proto = window.HTMLMediaElement && HTMLMediaElement.prototype;
      if (proto && typeof proto.canPlayType === "function") {
        const orig = proto.canPlayType;
        proto.canPlayType = function (type) {
          return codecBlocked(type) ? "" : orig.call(this, type);
        };
      }
    } catch (e) {
      /* leave the native method in place */
    }
  })();

  function getPlayer() {
    // The watch-page player; the API methods live on this DOM element.
    return (
      document.getElementById("movie_player") ||
      document.querySelector(".html5-video-player")
    );
  }

  /**
   * Choose the best quality string given what's available and the user's range.
   * `levels` is YouTube's array, already sorted best -> worst, e.g.
   *   ["hd2160","hd1440","hd1080","hd720","large","medium","small","tiny","auto"]
   */
  function pickQuality(levels) {
    // Normalize to {name, px}, dropping "auto" and anything we don't know.
    const ranked = levels
      .filter((l) => l in LEVEL_PX)
      .map((l) => ({ name: l, px: LEVEL_PX[l] }))
      .sort((a, b) => b.px - a.px);

    if (!ranked.length) return null;

    const { minPx, maxPx } = settings;

    // 1) Highest option that fits inside [min, max].
    const within = ranked.filter((l) => l.px <= maxPx && l.px >= minPx);
    if (within.length) return within[0].name;

    // 2) Nothing reaches the minimum -> give the best the video offers.
    if (ranked.every((l) => l.px < minPx)) return ranked[0].name;

    // 3) Otherwise pick the highest that is still <= max.
    const belowMax = ranked.filter((l) => l.px <= maxPx);
    if (belowMax.length) return belowMax[0].name;

    // 4) Fallback: lowest available.
    return ranked[ranked.length - 1].name;
  }

  function currentVideoId() {
    return new URLSearchParams(location.search).get("v");
  }

  /**
   * Returns:
   *   "skip" — feature off (don't retry)
   *   "done" — already applied for this video (don't retry, leave overrides)
   *   true   — applied successfully now
   *   false  — player not ready yet (caller should retry)
   */
  function applyQuality() {
    if (!settings.qualityEnabled) return "skip";

    const id = currentVideoId();
    // Apply only once per video so a manual change in the menu sticks.
    if (id && id === appliedFor) return "done";

    const player = getPlayer();
    if (!player || typeof player.getAvailableQualityLevels !== "function") {
      return false;
    }

    const levels = player.getAvailableQualityLevels();
    if (!levels || !levels.length) return false; // not ready yet

    const target = pickQuality(levels);
    if (!target) return false;

    try {
      if (typeof player.setPlaybackQualityRange === "function") {
        player.setPlaybackQualityRange(target, target);
      }
      if (typeof player.setPlaybackQuality === "function") {
        player.setPlaybackQuality(target);
      }
      appliedFor = id; // mark done; we won't fight the user from here on
    } catch (e) {
      return false; // player not fully initialized; a later trigger retries
    }
    return true;
  }

  /**
   * The player often reports an empty quality list for a moment after
   * navigation, so retry a handful of times until it's ready — then stop.
   */
  function applyQualityWithRetries(tries = 12, delay = 500) {
    if (applyQuality() === false && tries > 0) {
      setTimeout(() => applyQualityWithRetries(tries - 1, delay), delay);
    }
  }

  function onNavigation() {
    // New URL => new video id => applyQuality will run once for it.
    applyQualityWithRetries();
  }

  // --- Wire up triggers ----------------------------------------------------

  // SPA navigation between videos.
  window.addEventListener("yt-navigate-finish", onNavigation, true);
  // Fires when the player's data (incl. quality list) is ready.
  window.addEventListener("yt-player-updated", () => applyQualityWithRetries(6), true);
  document.addEventListener(
    "loadeddata",
    (e) => {
      if (e.target && e.target.tagName === "VIDEO") applyQualityWithRetries(6);
    },
    true
  );

  // ---- Volume bridge (for the popup's volume mixer) -----------------------
  // The player API is the only way to change volume so YouTube's own volume
  // slider stays in sync (and the value persists like a manual change).
  function postVolumeState() {
    const player = getPlayer();
    if (!player || typeof player.getVolume !== "function") return;
    try {
      window.postMessage(
        {
          __ytql: "volume-state",
          payload: {
            volume: Math.round(player.getVolume()),
            muted:
              typeof player.isMuted === "function" ? player.isMuted() : false,
          },
        },
        "*"
      );
    } catch (e) {
      /* player mid-teardown; the next poll will catch up */
    }
  }

  function handleVolumeCommand(data) {
    const player = getPlayer();
    if (player) {
      try {
        if (data.cmd === "set" && typeof player.setVolume === "function") {
          // Dragging the slider up should always become audible.
          if (
            data.value > 0 &&
            typeof player.isMuted === "function" &&
            player.isMuted() &&
            typeof player.unMute === "function"
          ) {
            player.unMute();
          }
          player.setVolume(Math.max(0, Math.min(100, data.value)));
        } else if (data.cmd === "mute" && typeof player.mute === "function") {
          player.mute();
        } else if (
          data.cmd === "unmute" &&
          typeof player.unMute === "function"
        ) {
          player.unMute();
        }
      } catch (e) {
        /* not ready; state below reports whatever is true */
      }
    }
    // Every command — including a plain "get" — answers with fresh state.
    postVolumeState();
  }

  // Receive settings + volume commands from the content script.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data) return;
    if (data.__ytql === "volume-cmd") {
      handleVolumeCommand(data);
      return;
    }
    if (data.__ytql !== "settings") return;
    settings = Object.assign(settings, data.payload);
    if ("codecOverride" in data.payload) {
      setCodec(data.payload.codecOverride ? data.payload.codecPreference : null);
    }
    // Settings changed intentionally: re-apply once for the current video.
    appliedFor = null;
    applyQualityWithRetries(6);
  });

  // First load (in case we missed the initial navigate event).
  onNavigation();
})();
