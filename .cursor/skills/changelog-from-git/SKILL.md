---
name: changelog-from-git
description: Generate or update the app changelog from git commits. Use when the user wants to add changelog entries from commits, generate changelog from git, update changelog from recent commits, or release notes from version control.
---

# Changelog from Git

ActorRise keeps its changelog in **public/changelog.json**. Entries can be generated from git commit history and then edited by the AI or user.

## When to use

- User says: "update changelog from commits", "add changelog from git", "generate changelog from recent commits", "changelog from last commit" (use `--count=1`), "changelog from last release", "release notes from git"
- User wants to add a new changelog entry and is okay using recent commits as a source

## Changelog entry shape (public/changelog.json)

Each entry in `updates` must have:

- **id**: unique slug (e.g. `film-tv-search-feb-2026`)
- **date**: `YYYY-MM-DD`
- **title**: short title
- **emoji**: optional (e.g. `"🎬"`)
- **description**: 1–2 sentences
- **category**: `"feature"` | `"improvement"` | `"fix"`
- **show_modal**: `true` for the one feature to show in the "What's new" modal after login
- **cta_text**, **cta_link**: optional (e.g. "Try it now", "/search")
- **image_url**: optional or `null`

Newest entry must be **first** in the array.

## Workflow

### 1. Generate suggested entries from git

Run:

```bash
npm run changelog:dry-run
```

Or with a custom count:

```bash
node scripts/changelog-from-git.mjs --count=10 --dry-run
```

This prints a JSON array of entries. The script maps conventional commits: `feat` → feature, `fix` → fix, `perf`/`refactor`/`chore`/`docs` → improvement.

### 2. Append to changelog (optional)

To prepend new entries to **public/changelog.json** without editing by hand:

```bash
npm run changelog:from-git -- --append
```

Or with count:

```bash
node scripts/changelog-from-git.mjs --count=10 --append
```

This dedupes by `id` and only adds commits that are not already in the file.

### 3. Polish and curate

After generating or appending:

1. Open **public/changelog.json**.
2. **Tidy titles and descriptions** (user-facing; remove "Co-authored-by", internal jargon).
3. Add **emoji** and **show_modal** / **cta_link** for the one entry that should trigger the post-login modal.
4. Remove or merge entries that are too granular or not user-relevant.
5. Keep **newest entry first**.

## Script options

| Option | Effect |
|--------|--------|
| `--count=N` | Number of commits to consider (default 15). Use `--count=1` for "last commit". |
| `--dry-run` | Print JSON only; do not modify changelog.json |
| `--append` | Prepend new entries to public/changelog.json (dedupe by id) |

## Summary

- **Dry-run only**: `npm run changelog:dry-run` → use output to draft or suggest entries.
- **Append then edit**: `node scripts/changelog-from-git.mjs --append` → then polish public/changelog.json (titles, descriptions, emoji, show_modal, order).
