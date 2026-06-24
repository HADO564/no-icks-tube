# no-icks-tube

A browser extension (Firefox / Zen first, Chromium-compatible) that takes the
icks out of YouTube:

1. **Sets a default video quality.** Picks the highest quality inside a range
   you choose — e.g. "best available, but at least 1080p" — once per video. You
   can still override it manually in the player; the extension won't fight you.
2. **Controls which codec YouTube serves.** Lets you enforce a video codec
   instead of leaving it to YouTube. Pick from cards that lay out each codec's
   pros and cons: **H.264 / AVC** (lightest on CPU and battery, but capped at
   1080p), **VP9** (the balanced default — 4K+ with good compression and no
   breakage), or **AV1** (most efficient, but CPU-heavy without recent hardware
   and missing from some videos). Off by default; takes effect on the next video
   you open (reload to switch the current one).
3. **Disables autoplay.** Switches YouTube's Autoplay toggle off on each video
   so it never auto-advances to the next one. Flip it back on in the player any
   time.
4. **Resumes videos where you actually left off.** Remembers your exact
   position in every video and seeks back to it when the video loads again —
   after a refresh, a crash, or coming back days later. Links with an explicit
   `?t=` timestamp still win, and videos you finished start fresh.
5. **Volume mixer for all your YouTube tabs.** The popup lists every open
   YouTube tab that has a video, each with a live volume slider and mute
   button — turn one tab down without hunting for it, or click its title to
   jump there. Volume changes go through YouTube's own player API, so the
   player's volume control stays in sync.
6. **Independent suggested-videos scrolling.** Turns the related-videos column
   into its own scroll container so scrolling there doesn't move the video, and
   scrolling over the video scrolls down into the comments.
7. **Comments scroll pane + "Back to video".** Gives the comments their own
   sticky scrollbar, and shows a fixed *Back to video* button once the player
   scrolls out of view that jumps you back to the top.
8. **Comments as cards.** Lays comments out as vertical cards in a responsive
   grid. Clicking a comment's *Read more* (or opening its replies) expands that
   card to a full-width row; *Show less* shrinks it back. Done purely with CSS
   `:has()`, so it tracks YouTube's own expand state.

Configure all of these in the extension's options/popup — a "Fix your icks"
list where each toggle removes one ick.

## Install

### Firefox / Zen (and other Firefox-based browsers)

### ⬇️ [Download no-icks-tube (.xpi)](https://github.com/HADO564/no-icks-tube/releases/latest/download/no-icks-tube.xpi)

That link always points at the newest signed version.

1. Click the download link **in Firefox or Zen** (not Chrome).
2. Firefox will ask **“Add no-icks-tube?”** — click **Add**, then **Okay**.
   - If it downloads the file instead of asking: open `about:addons`, click the
     gear ⚙ at the top-right → **Install Add-on From File…** → choose the
     downloaded `no-icks-tube.xpi`.
3. Click the no-icks-tube icon in the toolbar to open the popup (volume mixer +
   quick toggles); hit **Manage all icks** there for the full catalog. (If you
   don't see the icon, click the puzzle-piece 🧩 icon and pin it.)

The add-on is signed by Mozilla, so it installs permanently and survives
restarts. To update later, just install a newer `.xpi` the same way — it
upgrades in place and keeps your settings.

### Chrome / Edge / Brave

The `.xpi` is Firefox-only. On Chromium browsers, install from source — see
[Run from source](#run-from-source-development) below.

## Got an ick?

no-icks-tube is built around **icks** — the things about YouTube that bug you.
Each ick that gets enough support becomes a toggle in the extension.

- **Suggest an ick:** [open the ick form](https://github.com/HADO564/no-icks-tube/issues/new?template=ick.yml)
- **Browse & upvote icks:** [see what others raised](https://github.com/HADO564/no-icks-tube/issues?q=is%3Aissue+label%3Aick) and 👍 the ones you share — reactions decide what gets built next.

Icks live as GitHub issues labelled `ick` (→ `ick:planned` → `ick:fixed`). The
fixes themselves are defined in [`src/icks.js`](src/icks.js): add an entry there
and the options UI + defaults update automatically.

## How it works

- `src/content.js` — runs in the isolated content-script world. Reads settings
  from `storage.sync`, injects the page script, and injects/removes the sidebar
  CSS. Reacts live to settings changes.
- `src/inject.js` — runs in the **page** context so it can call YouTube's
  internal player API (`getAvailableQualityLevels`, `setPlaybackQualityRange`,
  `getVolume`/`setVolume`). Picks the best quality within your range, re-applies
  on navigation, and answers the popup's volume-mixer commands. It also wraps
  `MediaSource.isTypeSupported` / `canPlayType` to hide heavier codecs from
  YouTube when codec control is on.
- `src/icks.js` — the **ick registry**: every ick, its settings, defaults, the
  area it belongs to, and the version it was `added` in. Loaded by the content
  scripts, the popup, and the catalog alike.
- `options/popup.html` + `popup.js` — the **toolbar popup**: the lightweight
  day-to-day surface. Volume mixer for your YouTube tabs, quick on/off toggles
  for the icks you have enabled, and a button into the full catalog.
- `options/options.html` + `options.js` — the **catalog** (opens in a tab):
  every ick grouped by area into collapsible sections, with a search box, live
  per-area counts, and a *New* badge on icks added in the version you're
  running. This is where you discover and configure fixes.

## Run from source (development)

For hacking on the extension, or to use it on Chromium.

### Firefox / Zen

1. Go to `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → pick `manifest.json` in this folder.
3. Open YouTube, click the toolbar icon to set preferences.

(Temporary add-ons are removed on restart — for a permanent install use the
[signed `.xpi`](#install) above.)

### Chromium (Chrome / Edge / Brave)

1. Go to `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder. (Chrome prints a harmless warning
   about the Firefox-only `browser_specific_settings` key and ignores it.)

To produce a clean Chrome Web Store package with that key stripped, run
`./build.ps1 -Target chrome` — see [SUBMITTING.md](SUBMITTING.md) for the full
store-submission flow (Chrome Web Store and the public Firefox listing).

## Notes & limitations

- YouTube ships internal UI changes frequently; the sidebar CSS targets
  `ytd-watch-flexy #secondary`. If a future redesign breaks it, the selectors in
  `src/content.js` (`SIDEBAR_CSS`) are where to adjust.
- The player only exposes a quality list a moment after navigation, so the
  quality script retries for a few seconds. This is normal.
- "Force quality" sets a *range* on the player (`setPlaybackQualityRange`), which
  YouTube treats as a strong hint; it generally sticks but can be overridden if
  a level genuinely isn't available for that video.
- Forcing **H.264 / AVC** caps quality at 1080p, because YouTube only offers
  resolutions above 1080p in VP9 and AV1. If you want 4K with codec control on,
  choose VP9.

## License

[MIT](LICENSE) © 2026 HADO564
