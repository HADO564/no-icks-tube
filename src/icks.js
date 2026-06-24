/*
 * icks.js — the "ick registry": the single source of truth for every ick
 * no-icks-tube fixes, the settings that control each fix, and their defaults.
 *
 * This runs both as a content script (sharing scope with content.js) and via a
 * <script> tag in the options page. It exposes `globalThis.NoIcksTube`.
 *
 * To add a new ick fix:
 *   1. Add an entry here (its settings auto-build the options UI + DEFAULTS).
 *      Set `added` to the version it first ships in — that's what drives the
 *      "New" badge in the catalog (an ick is "New" while added === current
 *      extension version).
 *   2. Implement the behavior in src/content.js (and src/inject.js if it needs
 *      the page context), keyed off the same setting(s).
 */
(function () {
  "use strict";

  // Selectable video-quality steps (px -> label), best -> worst.
  const QUALITY = [
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

  const CARD_WIDTHS = [
    [260, "Narrow (260px — more columns)"],
    [330, "Medium (330px)"],
    [420, "Wide (420px — fewer columns)"],
  ];

  // The video codec to enforce on YouTube. Each option carries its own pros and
  // cons so the options page can lay them out as pickable cards — the choice is
  // a genuine trade-off, not an obvious default. `value` is what we persist and
  // hand to inject.js, which blocks the other codecs so YouTube serves this one.
  const CODECS = [
    {
      value: "h264",
      name: "H.264 / AVC",
      tag: "Lightest",
      summary:
        "The universally supported codec. Best if your device is older or you care about battery life and fan noise.",
      pros: [
        "Hardware-decoded on virtually every device — lowest CPU/GPU load",
        "Best battery life; keeps laptops cool and fans quiet",
        "Plays smoothly on old or low-powered machines",
      ],
      cons: [
        "Capped at 1080p — no 1440p, 4K or 8K on YouTube",
        "Largest files, so it uses the most data for the same quality",
      ],
    },
    {
      value: "vp9",
      name: "VP9",
      tag: "Balanced",
      summary:
        "YouTube's usual default. High resolutions with good compression — the safe all-rounder, and it never breaks playback.",
      pros: [
        "Supports 1440p, 4K and 8K",
        "~30% less data than H.264 for the same quality",
        "Hardware-decoded on most GPUs from ~2015 onward",
      ],
      cons: [
        "Heavier on the CPU than H.264 where there's no hardware decoding",
        "A touch less efficient than AV1",
      ],
    },
    {
      value: "av1",
      name: "AV1",
      tag: "Most efficient",
      summary:
        "The newest, most efficient codec — the best picture per megabyte, if your hardware can decode it.",
      pros: [
        "Best compression: the least data for a given quality",
        "Sharpest quality on slow connections and at low bitrates",
        "Royalty-free and future-proof (4K/8K and beyond)",
      ],
      cons: [
        "Very CPU-heavy without a recent GPU (Intel 11th-gen+, RTX 30-series+, RX 6000+, Apple M3+) — can spike the CPU and spin up fans",
        "Not every video has an AV1 version; those may fail to play — switch to VP9 if you hit that",
      ],
    },
  ];

  // Each ick: the annoyance (`ick`), what we do about it (`fix`), where it
  // happens (`area`), and the settings that control it. The first setting is
  // the primary on/off toggle; the rest are options shown underneath it.
  const ICKS = [
    {
      id: "low-quality",
      ick: "Videos play below the quality I want",
      fix: "Sets a default quality inside the range below, once per video — you can still override it in the player afterwards.",
      area: "Player",
      added: "1.0.0",
      // min must not exceed max; the options page enforces this.
      validateRange: { minKey: "minQuality", maxKey: "maxQuality" },
      settings: [
        { key: "qualityEnabled", type: "toggle", default: true, primary: true },
        { key: "maxQuality", type: "select", label: "Maximum (cap)", default: 4320, options: QUALITY },
        { key: "minQuality", type: "select", label: "Minimum (target)", default: 1080, options: QUALITY },
      ],
    },
    {
      id: "autoplay",
      ick: "Autoplay keeps starting the next video",
      fix: "Switches YouTube's Autoplay toggle off on each video so nothing auto-advances. You can still flip it back on in the player.",
      area: "Player",
      added: "1.3.0",
      settings: [
        { key: "disableAutoplay", type: "toggle", default: true, primary: true },
      ],
    },
    {
      id: "wrong-resume",
      ick: "Videos restart from the wrong timestamp after a refresh",
      fix: "Remembers exactly where you were in every video and seeks back there when it loads again — after a refresh, a crash, or coming back days later. Links with an explicit ?t= timestamp still win, and videos you finished start fresh.",
      area: "Player",
      added: "1.5.0",
      settings: [
        { key: "resumeEnabled", type: "toggle", default: true, primary: true },
      ],
    },
    {
      id: "tab-volumes",
      ick: "No one place to control the volume of every YouTube tab",
      fix: "Adds a Volume mixer to the toolbar popup: every YouTube tab with a video gets a live slider and a mute button, so you can turn one tab down (or jump to it) without hunting through your tabs.",
      area: "Player",
      added: "1.5.0",
      settings: [
        { key: "volumeMixer", type: "toggle", default: true, primary: true },
      ],
    },
    {
      id: "heavy-codec",
      ick: "YouTube forces a video codec my device chokes on (AV1 spikes the CPU and the fans)",
      fix: "Lets you choose which video codec YouTube serves you and enforces it, instead of leaving it to YouTube. Pick the one that suits your hardware below — each lists its trade-offs. Takes effect on the next video you open; reload the current one to switch it right now.",
      area: "Player",
      added: "1.7.0",
      settings: [
        { key: "codecOverride", type: "toggle", default: false, primary: true },
        { key: "codecPreference", type: "choice", label: "Codec to enforce", default: "vp9", valueType: "string", options: CODECS },
      ],
    },
    {
      id: "suggestions-scroll",
      ick: "Scrolling suggested videos scrolls the whole page and the video disappears",
      fix: "Turns the suggested-videos column into its own scroll container, independent of the video and comments.",
      area: "Suggested / sidebar",
      added: "1.0.0",
      settings: [
        { key: "sidebarEnabled", type: "toggle", default: true, primary: true },
      ],
    },
    {
      id: "comments-scroll",
      ick: "Comments hijack the page scroll and the video scrolls away",
      fix: "Gives the comments their own sticky scrollbar, plus a fixed “Back to video” button once the player scrolls out of view.",
      area: "Comments",
      added: "1.1.0",
      settings: [
        { key: "commentsScroll", type: "toggle", default: true, primary: true },
      ],
    },
    {
      id: "comments-wide",
      ick: "Comments are one giant wide column",
      fix: "Lays comments out as a responsive grid of cards that expand to full-width rows on Read more / replies, with a Collapse button.",
      area: "Comments",
      added: "1.0.0",
      settings: [
        { key: "commentsCards", type: "toggle", default: true, primary: true },
        { key: "cardMinWidth", type: "select", label: "Minimum card width", default: 330, options: CARD_WIDTHS },
        { key: "cardMinHeight", type: "number", label: "Card height (px)", default: 150, min: 100, max: 600, step: 10 },
      ],
    },
  ];

  // Flatten every setting's default into one DEFAULTS object.
  const DEFAULTS = {};
  for (const ick of ICKS) {
    for (const s of ick.settings) DEFAULTS[s.key] = s.default;
  }

  // Repo links for the "Submit an ick" / "Browse icks" buttons.
  const REPO = "https://github.com/HADO564/no-icks-tube";
  const LINKS = {
    submit: REPO + "/issues/new?template=ick.yml",
    browse: REPO + "/issues?q=is%3Aissue+label%3Aick",
  };

  // This build's version, read from the manifest. Used to flag freshly-added
  // icks: an ick is "New" while it was added in the version you're running.
  function version() {
    try {
      const api = typeof browser !== "undefined" ? browser : chrome;
      return api.runtime.getManifest().version;
    } catch (e) {
      return null;
    }
  }
  function isNew(ick) {
    return !!ick.added && ick.added === version();
  }

  globalThis.NoIcksTube = {
    ICKS,
    DEFAULTS,
    QUALITY,
    CARD_WIDTHS,
    CODECS,
    LINKS,
    version,
    isNew,
  };
})();
