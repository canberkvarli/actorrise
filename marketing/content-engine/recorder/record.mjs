#!/usr/bin/env node
// Record the real ActorRise web app at phone resolution, for the daily video.
//
//   node recorder/record.mjs explore /monologues          -> out/explore/<slug>.png + .json (what is on the page)
//   node recorder/record.mjs flow flows/<name>.json       -> out/rec/<name>.mp4 + <name>.events.json
//
// Logs in with DEMO_EMAIL / DEMO_PASSWORD (environment, never in the repo) against
// BASE_URL (default https://www.actorrise.com) and keeps the session in out/.auth.json.
//
// explore is how the daily run reads the app before it writes a flow: a full-page screenshot
// and every button, link and input with its visible text, so the flow uses real labels.
//
// A flow is a list of steps:
//   {"goto": "/monologues"}
//   {"click": "Search"}                    visible text, a role name, or {"css": "..."}
//   {"type": "comedic, a girl around sixteen", "into": "Describe"}   placeholder, label or {"css"}
//   {"press": "Enter"}
//   {"wait": 1500}                          ms, or {"waitFor": "text that should appear"}
//   {"scroll": 600}                         px, smooth
//   {"mark": "results"}                     a named moment the edit can cut to
//   {"mic": "My lord, I have..."}          the scene partner's scripted microphone (the actor's line), one word every `ms`
//   {"cam": 6.1, "say": "cut"}              timed on the camera's clock instead of the recording's:
//                                           second 6.1 of the FAKE_CAM clip (it starts when the camera opens)
// Every click is logged with its position so the edit can zoom and draw the tap.
// Audio the page plays (the scene partner reading) is logged with its time and saved.
import { createRequire } from "node:module";
// The cloud sessions ship Playwright globally (require works anywhere); a local machine can npm i playwright.
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASE = (process.env.BASE_URL || "https://www.actorrise.com").replace(/\/$/, "");
const AUTH = path.join(ROOT, "out", process.env.APP === "ghostlight" ? ".auth-ghostlight.json" : ".auth.json");
const VIEW = { width: 390, height: 844 }; // iPhone 15 logical size
const DPR = 3;
const OUT_W = 1080;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  const base = "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base)) {
    for (const p of [
      `${base}/${d}/chrome-linux/chrome`,
      `${base}/${d}/chrome-headless-shell-linux64/chrome-headless-shell`,
    ]) if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function open() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || chromePath(),
    // FAKE_CAM=<file.y4m> puts real footage in the camera instead of Chromium's green test pattern
    // (the Tape room opens on the camera). Stock footage only, never a real user.
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required",
      ...(process.env.FAKE_CAM ? [`--use-file-for-fake-video-capture=${process.env.FAKE_CAM}`] : [])],
  });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
    // SCHEME=dark|light. Ghost Light's home is the dark stage, so it records dark unless told otherwise
    // (Canberk, 2026-11-04: mostly dark, light now and then for variety).
    colorScheme: process.env.SCHEME || (process.env.APP === "ghostlight" ? "dark" : "light"),
    // The site picks Turkish on the client from a tr language or a Europe/Istanbul clock
    // (lib/i18n/locale.ts). This machine runs on Istanbul time, so pin English three ways.
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  const host = new URL(BASE).hostname;
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", domain: host, path: "/" }]);
  // Web-only artefacts that never show on the phone (Canberk, 2026-11-04): the browser's focus box
  // around a typed field, the tap flash, and react-native-web turning the lamp's soft shadow into a
  // square box-shadow behind the logo. Hide them and give the lamp its glow back as a drop-shadow.
  await ctx.addInitScript(() => {
    const css = `
      input, textarea, [contenteditable], *:focus, *:focus-visible { outline: none !important; }
      input:focus, textarea:focus { box-shadow: none !important; }
      * { -webkit-tap-highlight-color: transparent !important; }
      [aria-label="Ghost Light"], [aria-label="Ghost Light"] * { box-shadow: none !important; }
      /* The lamp's img sits in a 30x30 overflow:hidden box, so a glow on the img is clipped into a
         square. Put the glow on the unclipped wrapper instead. */
      [aria-label="Ghost Light"] img { filter: none !important; }
      [aria-label="Ghost Light"] { filter: drop-shadow(0 0 7px rgba(255, 184, 108, 0.6)); }
      ::selection { background: transparent; }`;
    const add = () => { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  });
  // Ghost Light's scene partner on the web preview: headless Chromium has no speech recogniser, so
  // the recorder brings a scripted one. A flow step {"mic": "the actor's line"} hands it the words,
  // one every `ms`, as interim results and then one final, the way a browser recogniser reports a
  // phrase; the app's own engine (mic.ts, the run) decides what they mean. Never in the iOS app.
  await ctx.addInitScript(() => {
    // Chromium has a webkitSpeechRecognition that needs Google's servers and a real microphone: replace it.
    class ScriptedRecognition extends EventTarget {
      constructor() { super(); this.lang = "en-US"; this.interimResults = true; this.continuous = true; this.maxAlternatives = 1; this.live = false; }
      fire(type, extra = {}) { const ev = new Event(type); Object.assign(ev, extra); this.dispatchEvent(ev); const h = this["on" + type]; if (typeof h === "function") h.call(this, ev); }
      start() { this.live = true; window.__micRec = this; setTimeout(() => { this.fire("start"); this.fire("audiostart"); }, 0); }
      stop() { if (!this.live) return; this.live = false; setTimeout(() => { this.fire("audioend"); this.fire("end"); }, 0); }
      abort() { if (!this.live) return; this.live = false; setTimeout(() => { this.fire("error", { error: "aborted", message: "" }); this.fire("end"); }, 0); }
    }
    window.webkitSpeechRecognition = ScriptedRecognition;
    const result = (text, isFinal) => {
      const list = [{ transcript: text, confidence: 0.95 }]; list.isFinal = isFinal;
      return { resultIndex: 0, results: [list] };
    };
    window.__micSay = async (text, ms = 240) => {
      const words = text.split(/\s+/).filter(Boolean);
      for (let i = 1; i <= words.length; i++) {
        window.__micRec?.live && window.__micRec.fire("result", result(words.slice(0, i).join(" "), false));
        await new Promise((r) => setTimeout(r, ms));
      }
      window.__micRec?.live && window.__micRec.fire("result", result(words.join(" "), true));
    };
  });
  // The camera's clock: when the page's camera stream opened. Chromium's FAKE_CAM file starts at its
  // first frame when the device opens, so a flow step with "cam": <s> lands on second <s> of the clip.
  await ctx.addInitScript(() => {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const s = await orig(c);
      if (c && c.video) { (window.__camAts = window.__camAts || []).push(performance.timeOrigin + performance.now()); window.__camAt = window.__camAts[window.__camAts.length - 1]; }
      return s;
    };
  });
  // Log every <audio>/Audio() play with its source and time.
  await ctx.addInitScript(() => {
    window.__plays = [];
    const orig = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      try { window.__plays.push({ src: this.currentSrc || this.src, t: performance.timeOrigin + performance.now() }); } catch {}
      return orig.apply(this, arguments);
    };
  });
  return { browser, ctx };
}

async function login(ctx) {
  // ANON=1 records the public, signed out site (landing, public monologue pages) with no login.
  if (process.env.ANON === "1") return;
  if (process.env.APP === "ghostlight") return loginGhostLight(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/monologues`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  if (!/\/login|\/signup/.test(page.url())) {
    // Already signed in if there is no sign in prompt on the page.
    const signIn = await page.getByRole("link", { name: /sign in|log in/i }).count();
    if (!signIn) { await page.close(); return; }
  }
  const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error("DEMO_EMAIL / DEMO_PASSWORD are not set in this environment");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  const emailToggle = page.getByRole("button", { name: /email/i }).first();
  if (await emailToggle.count()) await emailToggle.click().catch(() => {});
  await page.locator('input[type="email"]').first().fill(DEMO_EMAIL);
  await page.locator('input[type="password"]').first().fill(DEMO_PASSWORD);
  await page.locator('input[type="password"]').first().press("Enter");
  await page.waitForURL((u) => !/\/login/.test(u.toString()), { timeout: 20000 });
  await ctx.storageState({ path: AUTH });
  await page.close();
}

// Ghost Light (ghostlight-web/serve.sh): /auth has Sign in / New account tabs and an email +
// password form (Supabase signInWithPassword), so the same demo account works.
async function loginGhostLight(ctx) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/saves`, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(1500);
  const prompt = await page.getByText(/sign in/i).count();
  if (!prompt) { await page.close(); return; }
  const { DEMO_EMAIL, DEMO_PASSWORD } = process.env;
  if (!DEMO_EMAIL || !DEMO_PASSWORD) throw new Error("DEMO_EMAIL / DEMO_PASSWORD are not set in this environment");
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(1000);
  const tab = page.getByText(/^sign in$/i).first();
  if (await tab.count()) await tab.click().catch(() => {});
  const email = page.locator('input[type="email"], input[autocomplete="email"], input[inputmode="email"]').first();
  await email.fill(DEMO_EMAIL);
  const pw = page.locator('input[type="password"]').first();
  await pw.fill(DEMO_PASSWORD);
  await pw.press("Enter");
  await sleep(4000);
  await ctx.storageState({ path: AUTH });
  await page.close();
}

function locate(page, target) {
  if (typeof target === "object" && target.css) return page.locator(target.css).first();
  const t = String(target);
  return page
    .getByRole("button", { name: t, exact: false })
    .or(page.getByRole("link", { name: t, exact: false }))
    .or(page.getByRole("tab", { name: t, exact: false }))
    .or(page.getByText(t, { exact: false }))
    .first();
}

function field(page, target) {
  if (typeof target === "object" && target.css) return page.locator(target.css).first();
  if (!target) return page.locator("input:visible, textarea:visible").first();
  const t = String(target);
  return page.getByPlaceholder(t, { exact: false }).or(page.getByLabel(t, { exact: false })).first();
}

async function explore(urlPath) {
  const { browser, ctx } = await open();
  await login(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE + urlPath, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(1200);
  const slug = urlPath.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
  const dir = path.join(ROOT, "out", "explore");
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${slug}.png`), fullPage: true });
  const items = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("a, button, input, textarea, select, [role=button], [role=tab]")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || undefined,
        text: (el.innerText || el.value || "").trim().slice(0, 80) || undefined,
        label: el.getAttribute("aria-label") || el.getAttribute("placeholder") || undefined,
        href: el.getAttribute("href") || undefined,
        y: Math.round(r.top + window.scrollY),
      });
    }
    return out;
  });
  fs.writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify({ url: page.url(), title: await page.title(), items }, null, 2));
  console.log(path.join(dir, `${slug}.png`), `${items.length} elements`);
  await browser.close();
}

async function flow(file) {
  const spec = JSON.parse(fs.readFileSync(file, "utf8"));
  const name = path.basename(file, ".json");
  const { browser, ctx } = await open();
  await login(ctx);
  const page = await ctx.newPage();
  if (spec.start) await page.goto(BASE + spec.start, { waitUntil: "networkidle" }).catch(() => {});
  await sleep(800);

  // High resolution capture: CDP screencast frames at device pixels, timed.
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const frameDir = path.join(ROOT, "out", "rec", `${name}_frames`);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  cdp.on("Page.screencastFrame", async (f) => {
    const i = frames.length;
    const p = path.join(frameDir, `${String(i).padStart(5, "0")}.jpg`);
    fs.writeFileSync(p, Buffer.from(f.data, "base64"));
    frames.push({ p, t: f.metadata.timestamp * 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: VIEW.width * DPR, maxHeight: VIEW.height * DPR });
  const t0 = Date.now();
  const events = [];
  const now = () => (Date.now() - t0) / 1000;
  await sleep(spec.lead ?? 700);

  const camAt = await page.evaluate(() => window.__camAt || null);
  if (camAt) events.push({ t: (camAt - t0) / 1000, mark: "camera-open" });
  for (const s of spec.steps) {
    // "at": run this step at a fixed second of the recording (so cues land under a voice-over).
    if (s.at !== undefined) await sleep(Math.max(0, s.at * 1000 - (Date.now() - t0)));
    // "cam": the same on the camera clip's clock, so the scripted ear lands on the actor's words.
    if (s.cam !== undefined) {
      if (!camAt) throw new Error('"cam" step but the page never opened a camera');
      await sleep(Math.max(0, camAt + s.cam * 1000 - Date.now()));
    }
    if (s.goto) { await page.goto(BASE + s.goto, { waitUntil: "networkidle" }).catch(() => {}); events.push({ t: now(), goto: s.goto }); }
    else if (s.click !== undefined) {
      const el = locate(page, s.click);
      await el.scrollIntoViewIfNeeded().catch(() => {});
      const b = await el.boundingBox();
      if (b) events.push({ t: now(), tap: { x: (b.x + b.width / 2) / VIEW.width, y: (b.y + b.height / 2) / VIEW.height }, label: String(s.click.css || s.click) });
      await sleep(250);
      await el.tap().catch(() => el.click());
    } else if (s.type !== undefined) {
      const el = field(page, s.into);
      const b = await el.boundingBox();
      if (b) events.push({ t: now(), tap: { x: (b.x + b.width / 2) / VIEW.width, y: (b.y + b.height / 2) / VIEW.height }, label: "field" });
      await el.tap().catch(() => el.click());
      events.push({ t: now(), typing: s.type });
      await el.pressSequentially(s.type, { delay: s.delay ?? 55 });
    } else if (s.press) { await page.keyboard.press(s.press); events.push({ t: now(), press: s.press }); }
    else if (s.wait) await sleep(s.wait);
    else if (s.waitFor) await page.getByText(s.waitFor, { exact: false }).first().waitFor({ timeout: 20000 }).catch(() => {});
    else if (s.scroll) {
      events.push({ t: now(), scroll: s.scroll });
      const steps = 24;
      for (let k = 0; k < steps; k++) { await page.mouse.wheel(0, s.scroll / steps); await sleep(16); }
    } else if (s.mark) events.push({ t: now(), mark: s.mark });
    // Ghost Light's Tape room on the web preview: hand the scripted ear words to "hear"
    // (tape-ear.web.ts), one every `ms`. The app's own cue rules decide what they mean.
    else if (s.mic !== undefined) {
      events.push({ t: now(), mic: s.mic });
      await page.evaluate(([t, ms]) => window.__micSay?.(t, ms), [s.mic, s.ms ?? 240]);
      events.push({ t: now(), heard: s.mic.split(" ").slice(-1)[0] });
    }
    else if (s.say !== undefined) {
      events.push({ t: now(), say: s.say });
      await page.evaluate(([t, ms]) => window.__tapeSay?.(t, ms), [s.say, s.ms ?? 240]);
      events.push({ t: now(), said: s.say.split(" ").slice(-1)[0] });
    }
    await sleep(s.after ?? 350);
  }
  await sleep(spec.tail ?? 900);
  await cdp.send("Page.stopScreencast");
  const camAts = await page.evaluate(() => window.__camAts || []);
  if (camAts.length > 1) console.warn(`camera opened ${camAts.length} times at ${camAts.map((a) => ((a - t0) / 1000).toFixed(2)).join(', ')}s: a FAKE_CAM clip restarts on each open`);
  const plays = await page.evaluate(() => window.__plays || []);
  // Save audio the page played (scene partner lines), timed against the recording.
  const audio = [];
  for (const [k, pl] of plays.entries()) {
    if (!pl.src || pl.src.startsWith("blob:")) { audio.push({ t: (pl.t - t0) / 1000, src: pl.src, saved: null }); continue; }
    try {
      const res = await ctx.request.get(pl.src);
      const out = path.join(ROOT, "out", "rec", `${name}_audio${k}.mp3`);
      fs.writeFileSync(out, await res.body());
      audio.push({ t: (pl.t - t0) / 1000, src: pl.src, saved: out });
    } catch { audio.push({ t: (pl.t - t0) / 1000, src: pl.src, saved: null }); }
  }
  await browser.close();

  // Frames come only when the screen changes: hold each until the next, at 30 fps.
  if (!frames.length) throw new Error("no frames captured");
  const start = frames[0].t;
  const list = frames.map((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : start + now() * 1000;
    return `file '${f.p}'\nduration ${Math.max(0.001, (next - f.t) / 1000).toFixed(3)}`;
  });
  list.push(`file '${frames[frames.length - 1].p}'`);
  const listFile = path.join(frameDir, "list.txt");
  fs.writeFileSync(listFile, "ffconcat version 1.0\n" + list.join("\n") + "\n");
  const mp4 = path.join(ROOT, "out", "rec", `${name}.mp4`);
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", `fps=30,scale=${OUT_W}:-2:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", mp4]);
  const offset = (start - t0) / 1000; // events are relative to t0, video starts at the first frame
  const shift = (e) => ({ ...e, t: +(e.t - offset).toFixed(3) });
  fs.writeFileSync(path.join(ROOT, "out", "rec", `${name}.events.json`),
    JSON.stringify({ base: BASE, view: VIEW, events: events.map(shift), audio: audio.map(shift) }, null, 2));
  fs.rmSync(frameDir, { recursive: true, force: true });
  console.log(mp4, `${events.length} events, ${audio.length} audio`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "explore") await explore(arg || "/");
else if (cmd === "flow") await flow(arg);
else { console.error("usage: record.mjs explore <path> | flow <flow.json>"); process.exit(1); }
