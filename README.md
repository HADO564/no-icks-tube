# no-icks-tube

A browser extension (Firefox / Zen first, Chromium-compatible) that takes the
icks out of YouTube:

1. **Sets a default video quality.** Picks the highest quality inside a range
   you choose — e.g. "best available, but at least 1080p" — once per video. You
   can still override it manually in the player; the extension won't fight you.
2. **Independent suggested-videos scrolling.** Turns the related-videos column
   into its own scroll container so scrolling there doesn't move the video, and
   scrolling over the video scrolls down into the comments.
3. **Comments as cards.** Lays comments out as vertical cards in a responsive
   grid. Clicking a comment's *Read more* (or opening its replies) expands that
   card to a full-width row; *Show less* shrinks it back. Done purely with CSS
   `:has()`, so it tracks YouTube's own expand state.

Configure all three in the extension's options/popup.

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
