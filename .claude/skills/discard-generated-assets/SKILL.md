---
name: discard-generated-assets
description: Revert the 9 generated PNG/icon files under public/ that scripts/build-assets.mjs regenerates non-deterministically (ImageMagick `convert` embeds fresh metadata/timestamps even when the visual output is identical). Run this after `pnpm build`, `pnpm postinstall`, `pnpm test:e2e`, or any command that shells out to build-assets.mjs, whenever `git status` shows those files as modified but no icon/logo source actually changed. Trigger phrases: "limpia los iconos regenerados", "descarta los PNG de test", "revert generated assets".
---

# Discard non-deterministic generated assets

`scripts/build-assets.mjs` regenerates icon/favicon/OG-image PNGs from `logo.svg` via ImageMagick `convert`. It runs on `postinstall`, on `pnpm build` (which `pnpm test:e2e` requires first per `CLAUDE.md`), and via `pnpm build:assets`. `convert` writes fresh PNG metadata/timestamps on every run, so these files come out byte-different even when nothing about the logo changed — they show up as spurious `git status` noise after almost any build or e2e run.

## The 9 files

```
public/favicon-16x16.png
public/favicon-32x32.png
public/favicon-48x48.png
public/icon-192.png
public/icon-512.png
public/android-chrome-192x192.png
public/android-chrome-512x512.png
public/apple-touch-icon.png
public/og-image.png
```

(`public/favicon.svg`, `public/logo.svg`, `public/favicon.ico`, `public/site.webmanifest` are also written by the same script but are deterministic in practice — only check them if `git status` ever shows them dirty too.)

## When to run this

- Immediately after `pnpm build`, `pnpm postinstall`, `pnpm test:e2e`, or `pnpm build:assets` — proactively, without being asked, whenever one of those commands ran in this session.
- Whenever `git status` shows any of the 9 files above as modified and the working session did **not** intentionally touch `logo.svg` or `scripts/build-assets.mjs`.

## Steps

1. Confirm the only diffs on these paths are binary/no-op noise from the generator, not real design changes:
   ```sh
   git status --porcelain -- public/favicon-16x16.png public/favicon-32x32.png public/favicon-48x48.png public/icon-192.png public/icon-512.png public/android-chrome-192x192.png public/android-chrome-512x512.png public/apple-touch-icon.png public/og-image.png
   ```
   If `logo.svg` or `scripts/build-assets.mjs` was deliberately edited this session, the new bytes in these PNGs are the intended output — do NOT discard them; let the user commit normally instead.

2. Discard the regenerated files, restoring the committed versions:
   ```sh
   git checkout -- public/favicon-16x16.png public/favicon-32x32.png public/favicon-48x48.png public/icon-192.png public/icon-512.png public/android-chrome-192x192.png public/android-chrome-512x512.png public/apple-touch-icon.png public/og-image.png
   ```
   Only ever target these specific paths — never a bare `git checkout .` or `git clean -f`, which could discard unrelated in-progress work elsewhere in the tree.

3. Verify: `git status --porcelain -- public/` should be empty (aside from any genuinely new/untracked asset the user added on purpose).

## Things this skill must NOT do

- Don't touch any `public/` file outside the 9 listed above.
- Don't run this if `logo.svg` or `build-assets.mjs` changed on purpose in the session — that would silently discard real work.
- Don't patch `build-assets.mjs` to make `convert` deterministic (e.g. stripping metadata) as part of this skill — that's a separate, opt-in fix; ask the user if they want it instead of doing it inline here.
