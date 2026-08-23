#!/usr/bin/env node
// PostToolUse(Bash) hook: scripts/build-assets.mjs (postinstall/build/build:assets,
// and transitively test:e2e which requires a build first) regenerates these PNGs via
// ImageMagick `convert`, which is not byte-deterministic even when the visual output
// is unchanged. Discard the resulting git noise automatically instead of leaving it
// for someone to notice in `git status`.
import { execSync } from 'node:child_process'

const FILES = [
  'public/favicon-16x16.png',
  'public/favicon-32x32.png',
  'public/favicon-48x48.png',
  'public/icon-192.png',
  'public/icon-512.png',
  'public/android-chrome-192x192.png',
  'public/android-chrome-512x512.png',
  'public/apple-touch-icon.png',
  'public/og-image.png',
]

const TRIGGER = /\bpnpm(?:\s+run)?\s+(build|test:e2e|postinstall|build:assets)\b|\bnode\s+scripts\/build-assets\.mjs\b/

let input = ''
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', () => {
  let command = ''
  try {
    command = JSON.parse(input)?.tool_input?.command ?? ''
  } catch {
    process.exit(0)
  }

  if (!TRIGGER.test(command)) process.exit(0)

  try {
    execSync(`git checkout -- ${FILES.join(' ')}`, { stdio: 'ignore' })
  } catch {
    // Not a git repo, nothing to discard, or files untracked — fine either way.
  }
})
