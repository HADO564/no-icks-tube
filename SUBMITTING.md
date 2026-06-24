# Distributing no-icks-tube

The same source tree ships to three places:

| Channel | What it is | How |
| --- | --- | --- |
| **GitHub `.xpi`** | Firefox self-distribution (unlisted), the README download link | `./release.ps1 -Sign` |
| **Firefox Add-ons (AMO)** | Public Firefox listing | `./sign.ps1 -Channel listed` → submit |
| **Chrome Web Store** | Public Chrome/Edge/Brave listing | `./build.ps1 -Target chrome` → upload |

Sections below cover each. Start with the store-package build, then jump to the
channel you want.

## Building store packages

`build.ps1` emits **unsigned** store zips from the one source tree, containing
only the runtime files (manifest, `src/`, `options/`, `icons/`, LICENSE):

```powershell
./build.ps1                 # both: …-chrome.zip and …-firefox.zip
./build.ps1 -Target chrome  # Chrome only
```

The Chrome zip is identical to the Firefox one except its manifest drops the
Firefox-only `browser_specific_settings` key (Chrome ignores it; the Web Store
is happier without it). Output lands in `web-ext-artifacts/`.

---

## Firefox: signed `.xpi` (AMO self-distribution)

Firefox/Zen only **permanently** install add-ons that Mozilla has signed.
"Self-distribution" (a.k.a. *unlisted*) gets you a signed `.xpi` you can host
yourself (e.g. on the GitHub release) — no public listing, no review queue.

The package to upload is built with `web-ext` and lives in
`web-ext-artifacts/no-icks-tube-<version>.zip`.

```bash
# Validate (0 errors expected; an Android-only warning is fine — desktop ext)
npx web-ext lint --source-dir . --self-hosted

# Build the upload package
npx web-ext build --source-dir . --overwrite-dest --ignore-files "*.xpi" ".git/**"
```

---

### Option A — Automated signing with `web-ext sign` (recommended)

1. Create AMO API credentials (one-time):
   <https://addons.mozilla.org/developers/addon/api/key/>
   You'll get a **JWT issuer** (`user:...`) and a **JWT secret**.

2. Sign for self-distribution:

   ```bash
   npx web-ext sign \
     --source-dir . \
     --channel=unlisted \
     --api-key="<JWT issuer>" \
     --api-secret="<JWT secret>" \
     --ignore-files "*.xpi" ".git/**"
   ```

   On success it downloads the **signed** `.xpi` into `web-ext-artifacts/`.
   That file installs permanently in Zen/Firefox (drag it onto the browser, or
   `about:addons` → gear → *Install Add-on From File…*).

   > Keep the API secret out of git. Prefer env vars:
   > `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`.

---

### Option B — Manual upload via the AMO website

1. Go to <https://addons.mozilla.org/developers/> → **Submit a New Add-on**.
2. Choose **"On your own"** (self-distribution / unlisted).
3. Upload `web-ext-artifacts/no-icks-tube-1.0.0.zip`.
4. Answer the validator prompts:
   - **Data collection:** *Does not collect data* (the manifest already declares
     `data_collection_permissions.required = ["none"]`).
   - **Source code:** Not required — the add-on is plain JS/CSS/HTML with no build
     step or minification. If asked anyway, upload the same zip or point to
     <https://github.com/HADO564/no-icks-tube>.
5. Download the signed `.xpi` when it finishes and install it from file.

---

### Listing metadata (shared by both public stores)

- **Name:** no-icks-tube
- **Summary:** Force a preferred YouTube video quality and codec, scroll
  suggested videos independently, and view comments as collapsible cards.
- **Categories:** AMO — *Appearance*, *Photos, Music & Videos*; Chrome —
  *Productivity* (or *Tools*).
- **Tags / keywords:** youtube, video quality, codec, comments, layout
- **Support site:** <https://github.com/HADO564/no-icks-tube>
- **License:** MIT
- **Privacy / data:** collects nothing. Permissions to justify: `storage`
  (saves your ick settings) and the youtube.com host access (the extension only
  runs on YouTube).

---

## Firefox Add-ons (AMO) — public listing

A *listed* version gets a public page on addons.mozilla.org and auto-updates for
users, on top of (or instead of) the self-hosted `.xpi`. Same add-on ID, so
existing users keep their settings.

1. Build the package: `./build.ps1 -Target firefox` (or reuse the `web-ext
   build` zip).
2. Submit, either way:
   - **CLI:** `./sign.ps1 -Channel listed` — uploads the current version for
     listing using your `.env` credentials.
   - **Dashboard:** <https://addons.mozilla.org/developers/> → **Submit a New
     Add-on** → **"On this site"** → upload the firefox zip.
3. Fill the listing from *Listing metadata* above; declare **no data
   collection** (the manifest already sets `data_collection_permissions =
   ["none"]`).
4. Submit for review. Listed reviews are usually automated + a human pass;
   it can take from minutes to a few days. The source is plain JS/CSS/HTML, so
   no source-upload step is needed.

> You can keep both: the GitHub `.xpi` for a direct download and the AMO listing
> for discovery. Just bump `version` for each new upload — AMO won't re-accept a
> used version number.

---

## Chrome Web Store (also Edge / Brave)

Chrome's manifest is the same minus the Firefox-only `browser_specific_settings`
key, which `build.ps1` strips for you.

1. **Register once:** <https://chrome.google.com/webstore/devconsole> — a
   **one-time US$5** developer-registration fee. Use a Google account you're
   happy to own the listing long-term.
2. **Build:** `./build.ps1 -Target chrome` → upload
   `web-ext-artifacts/no-icks-tube-<version>-chrome.zip` as a **new item**.
3. **Store listing:** description, category (*Productivity*), language, and at
   least one **1280×800** (or 640×400) screenshot. A 128×128 store icon is taken
   from the manifest; an optional 440×280 promo tile helps.
4. **Privacy practices:** declare a **single purpose** ("customise YouTube
   playback and layout"), justify each permission (`storage`, youtube host
   access), and select **does not collect user data**. A privacy-policy URL is
   only required if you collect data — you don't.
5. **Submit for review.** First reviews typically take a few days. After it's
   approved you get a public Web Store URL to add to the README.

> Chrome auto-updates installs from the store; there's no signing step on your
> side — Google signs on publish. To push an update, bump `version`, rebuild,
> and upload a new package to the same item.

---

## Cutting a GitHub release (Firefox `.xpi`)

`release.ps1` ties signing and publishing together so the download link stays
fresh. Full flow for a new version:

```powershell
# 1. Bump "version" in manifest.json, commit and push.
# 2. Sign + publish in one step:
./release.ps1 -Sign                       # auto-generated notes
./release.ps1 -Sign -NotesFile notes.md   # or supply your own notes
```

It signs (via `sign.ps1`/`.env`), then creates the `v<version>` release with
**both** assets:

- `no-icks-tube-<version>.xpi` — the immutable per-version file
- `no-icks-tube.xpi` — a stable name so
  `…/releases/latest/download/no-icks-tube.xpi` (the README download link)
  always resolves to the newest build

`release.ps1` refuses to run if the release tag already exists (bump the version
first). Pass `-Draft` to stage it without publishing.

---

## Notes

- **Version bumps:** AMO refuses to re-sign an already-signed version number.
  Bump `version` in `manifest.json` before each new signing.
- **Extension ID:** `no-icks-tube@hado564` (in `browser_specific_settings.gecko`).
  Keep it stable so updates and stored settings carry over.
- **Minimum Firefox:** 140 (needed for the `data_collection_permissions` key and
  the `:has()` CSS used by the comment cards).
