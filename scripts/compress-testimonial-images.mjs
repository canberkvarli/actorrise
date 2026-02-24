#!/usr/bin/env node
/**
 * Compress testimonial headshots in public/testimonials/ for faster loading.
 * Target: max width 800px; JPEG quality 82, PNG compressed. Overwrites in place.
 *
 * Usage: node scripts/compress-testimonial-images.mjs
 * Requires: npm install --save-dev sharp
 */

import { readdir } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const TESTIMONIALS_DIR = join(ROOT, "public", "testimonials");

const EXT = [".jpg", ".jpeg", ".png"];
const JPEG_QUALITY = 82;
const MAX_WIDTH = 800;

async function findImages(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith(".")) {
      await findImages(full, files);
    } else if (EXT.includes(extname(e.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("Run: npm install --save-dev sharp");
    process.exit(1);
  }

  const images = await findImages(TESTIMONIALS_DIR);
  if (images.length === 0) {
    console.log("No images found in public/testimonials/");
    return;
  }

  const { writeFile } = await import("fs/promises");
  console.log(`Compressing ${images.length} image(s) (max width ${MAX_WIDTH}, JPEG q${JPEG_QUALITY})...`);
  for (const filePath of images) {
    try {
      const ext = extname(filePath).toLowerCase();
      let pipeline = sharp(filePath).resize(MAX_WIDTH, null, { withoutEnlargement: true });
      if (ext === ".png") {
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else {
        pipeline = pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
      }
      const buf = await pipeline.toBuffer();
      await writeFile(filePath, buf);
      console.log("  OK", filePath.replace(ROOT, ""));
    } catch (err) {
      console.error("  FAIL", filePath.replace(ROOT, ""), err.message);
    }
  }
  console.log("Done.");
}

main();
