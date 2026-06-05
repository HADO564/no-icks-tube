# no-icks-tube

A browser extension (Firefox / Zen first, Chromium-compatible) that takes the
icks out of YouTube:

1. **Sets a default video quality.** Picks the highest quality inside a range
   you choose — e.g. "best available, but at least 1080p" — once per video. You
   can still override it manually in the player; the extension won't fight you.
2. **Independent suggested-videos scrolling.** Turns the related-videos column
   into its own scroll container so scrolling there doesn't move the video, and
   scrolling over the video scrolls down into the comments.
3. **Comments scroll pane + "Back to video".** Gives the comments their own
   sticky scrollbar, and shows a fixed *Back to video* button once the player
   scrolls out of view that jumps you back to the top.
4. **Comments as cards.** Lays comments out as vertical cards in a responsive
   grid. Clicking a comment's *Read more* (or opening its replies) expands that
   card to a full-width row; *Show less* shrinks it back. Done purely with CSS
   `:has()`, so it tracks YouTube's own expand state.

Configure all of these in the extension's options/popup — a "Fix your icks"
list where each toggle removes one ick.

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
  internal player API (`getAvailableQualityLevels`, `setPlaybackQualityRange`).
  Picks the best quality within your range and re-applies on navigation.
- `options/` — settings UI (also used as the toolbar popup).

## Load it temporarily

### Firefox / Zen

1. Go to `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…** → pick `manifest.json` in this folder.
3. Open YouTube, click the toolbar icon to set preferences.

(Temporary add-ons are removed on restart. For permanent use the add-on must be
signed via addons.mozilla.org, or use Firefox Developer/Nightly with
`xpinstall.signatures.required = false`.)

### Chromium (Chrome / Edge / Brave)

1. Go to `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select this folder.

## Notes & limitations

- YouTube ships internal UI changes frequently; the sidebar CSS targets
  `ytd-watch-flexy #secondary`. If a future redesign breaks it, the selectors in
  `src/content.js` (`SIDEBAR_CSS`) are where to adjust.
- The player only exposes a quality list a moment after navigation, so the
  quality script retries for a few seconds. This is normal.
- "Force quality" sets a *range* on the player (`setPlaybackQualityRange`), which
  YouTube treats as a strong hint; it generally sticks but can be overridden if
  a level genuinely isn't available for that video.

## License

[MIT](LICENSE) © 2026 HADO564
