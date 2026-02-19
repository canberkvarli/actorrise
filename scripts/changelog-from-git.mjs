#!/usr/bin/env node
/**
 * Generate changelog entries from git log. Outputs JSON for public/changelog.json.
 *
 * Usage:
 *   node scripts/changelog-from-git.mjs [options]
 *
 * Options:
 *   --count=N     Number of commits to consider (default: 15)
 *   --dry-run     Print suggested entries only, do not modify changelog.json
 *   --append      Prepend new entries to public/changelog.json (dedupe by id)
 *
 * Conventional commits: feat → feature, fix → fix, perf/refactor/chore/docs → improvement.
 * Commit subject (without prefix) becomes title; body first line or subject becomes description.
 */

import { spawnSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const args = process.argv.slice(2);
const countIdx = args.findIndex((a) => a.startsWith("--count="));
const count = countIdx >= 0 ? parseInt(args[countIdx].split("=")[1], 10) || 15 : 15;
const dryRun = args.includes("--dry-run");
const append = args.includes("--append");

const { status, stdout } = spawnSync(
  "git",
  ["log", `-n${count}`, "--format=%aI%n%s%n%b---"],
  { cwd: root, encoding: "utf-8" }
);

if (status !== 0) {
  console.error("git log failed");
  process.exit(1);
}

const raw = stdout.trim();
const blocks = raw ? raw.split("---").map((b) => b.trim()).filter(Boolean) : [];

const categoryByType = {
  feat: "feature",
  fix: "fix",
  perf: "improvement",
  refactor: "improvement",
  chore: "improvement",
  docs: "improvement",
  style: "improvement",
};

function parseCommitBlock(block) {
  const lines = block.split("\n");
  const dateIso = lines[0] || "";
  const subject = lines[1] || "";
  const body = lines.slice(2).join("\n").trim();

  const dateOnly = dateIso.slice(0, 10);
  const match = subject.match(/^(feat|fix|perf|refactor|chore|docs|style)(\([^)]*\))?!?:\s*(.+)$/i);
  const type = match ? match[1].toLowerCase() : null;
  const titleRaw = match ? match[3].trim() : subject;
  const category = type ? (categoryByType[type] || "improvement") : "improvement";

  const title = titleRaw.charAt(0).toUpperCase() + titleRaw.slice(1);
  const bodyLine = body.split("\n").find((l) => {
    const t = l.trim();
    return t && !t.startsWith("Co-authored-by") && !t.startsWith("---");
  });
  const descSource = bodyLine?.trim() || title;
  const description = descSource.length > 160 ? descSource.slice(0, 157) + "…" : descSource;

  const slug = titleRaw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const id = `${slug}-${dateOnly}`.slice(0, 80);

  return {
    id,
    date: dateOnly,
    title,
    description,
    category,
    show_modal: false,
    image_url: null,
  };
}

const suggested = blocks.map(parseCommitBlock).filter((e) => e.title && e.date);

if (dryRun) {
  console.log(JSON.stringify(suggested, null, 2));
  process.exit(0);
}

if (!append) {
  console.log(JSON.stringify(suggested, null, 2));
  process.exit(0);
}

const changelogPath = join(root, "public", "changelog.json");
let data = { updates: [] };
try {
  const rawData = readFileSync(changelogPath, "utf-8");
  data = JSON.parse(rawData);
  if (!Array.isArray(data.updates)) data.updates = [];
} catch {
  // use default
}

const existingIds = new Set(data.updates.map((e) => e.id));
const newEntries = suggested.filter((e) => !existingIds.has(e.id));
data.updates = [...newEntries, ...data.updates];

writeFileSync(changelogPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
console.log(`Appended ${newEntries.length} entries to public/changelog.json.`);
if (newEntries.length > 0) {
  console.log("Ids:", newEntries.map((e) => e.id).join(", "));
}
