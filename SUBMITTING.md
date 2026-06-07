# Getting a signed `.xpi` (AMO self-distribution)

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

## Option A — Automated signing with `web-ext sign` (recommended)

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

## Option B — Manual upload via the AMO website

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

## Listing metadata (only needed for a *public* listing)

Not required for unlisted, but handy if you ever go public:

- **Name:** no-icks-tube
- **Summary:** Force a preferred YouTube video quality, scroll suggested videos
  independently, and view comments as collapsible cards.
- **Categories:** Appearance / Photos, Music & Videos
- **Tags:** youtube, video quality, comments, layout
- **Support site:** https://github.com/HADO564/no-icks-tube
- **License:** MIT

---

## Cutting a release

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
