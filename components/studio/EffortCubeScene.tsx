"use client";

/**
 * The effort cube stage. three.js WebGPU renderer (falls back to WebGL2 by
 * itself), TSL materials, a GPU compute dust field and bloom.
 *
 * All the Laban maths lives in lib/studio/effort.ts. This file only draws it:
 *  - the cube, with Laban's eight working actions on its corners, threads of
 *    light from the point to each corner (brighter = more of that action);
 *  - the performer, a light that moves the way the point says, leaving a trail;
 *  - the dust in the air, which drifts heavier, quicker or straighter with it.
 *
 * React talks to it through `pointRef` (where the point should go) and
 * `onDrag` (the actor moved it in 3D). Nothing here calls setState per frame.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three/webgpu";
import {
  uniform,
  vec2,
  vec3,
  float,
  uv,
  length,
  smoothstep,
  mix,
  positionWorld,
  distance,
  pass,
} from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ACTIONS,
  blend,
  clampPoint,
  gestureAt,
  qualities,
  type ActionId,
  type EffortPoint,
} from "@/lib/studio/effort";
import { airOf, type AirId } from "@/lib/studio/air";
import { period, poseAt, progressAt, type GestureSpec } from "@/lib/studio/gesture";
import { buildFigure } from "./figure";
import { heatOf, heatRGB } from "@/lib/studio/heat";
import { effortOf } from "@/lib/studio/gesture";

const BG = "#0b0b0c"; // ink, never flat black
const PALE = new THREE.Color("#f4f4f2");

/** Cube axes: x = space (direct +), y = weight (light up, strong down), z = time (sudden toward you). */
function toLocal(p: EffortPoint): THREE.Vector3 {
  return new THREE.Vector3(p.space, -p.weight, p.time);
}
function fromLocal(v: THREE.Vector3): EffortPoint {
  return clampPoint({ space: v.x, weight: -v.y, time: v.z });
}

/** The light's colour is its heat: white when light and sustained, orange to red as it gets strong and sudden. */
function performerColor(p: EffortPoint, out: THREE.Color) {
  const [r, g, b] = heatRGB(heatOf(p));
  return out.setRGB(r, g, b);
}

export type CornerLabel = { id: ActionId; x: number; y: number; share: number; visible: boolean };
export type PinLabel = { index: number; x: number; y: number; visible: boolean };

/**
 * The psychological gesture on stage. While `active`, the cube and performer
 * step back and the figure performs `spec` at `size` (1 full out, 0 inside).
 * `inward` runs Chekhov's progression by itself: full out, then smaller, then
 * only the centre. Bump `version` when the spec or `sculpt` changes.
 */
export type GestureState = {
  active: boolean;
  spec: GestureSpec | null;
  size: number;
  sculpt: boolean;
  inward: { start: number; dur: number } | null;
  /** The actor's own hand paths from the camera (body-centred metres, y up), shown beside the figure's. */
  mine: [number, number, number][][] | null;
  version: number;
};

/** The role's pinned moments, as the scene needs them. Bump `version` on any change. */
export type ArcState = { version: number; points: EffortPoint[]; active: number | null };

/** What the page can ask of the stage. */
export type SceneApi = {
  /** Lights down and pull back; resolves when dark. */
  close: () => Promise<void>;
  /** Fly the camera back to where it started. */
  home: () => void;
  /** Keep the stage centred in the part of the screen not covered on the left. */
  setInset: (px: number) => void;
  /** Move in close on the performer (Places). `home()` comes back out. */
  focusPerformer: () => void;
};

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

type Props = {
  pointRef: React.MutableRefObject<EffortPoint>;
  onDrag: (p: EffortPoint) => void;
  onCorner: (id: ActionId) => void;
  onLabels: (corners: CornerLabel[], pins: PinLabel[]) => void;
  arcRef: React.MutableRefObject<ArcState>;
  /** The atmosphere the stage should be in; it eases there over a second or two. */
  airRef: React.MutableRefObject<AirId>;
  gestureRef: React.MutableRefObject<GestureState>;
  onFail: (why: string) => void;
  /** WebGPU died (or never really started): the parent remounts us on WebGL2. */
  onGpuLost: () => void;
  onHover: (id: ActionId | null) => void;
  apiRef: React.MutableRefObject<SceneApi | null>;
  reducedMotion: boolean;
  forceWebGL: boolean;
};

export default function EffortCubeScene({
  pointRef,
  onDrag,
  onCorner,
  onLabels,
  arcRef,
  airRef,
  gestureRef,
  onFail,
  onGpuLost,
  onHover,
  apiRef,
  reducedMotion,
  forceWebGL,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Keep the latest callbacks without restarting the scene.
  const cb = useRef({ onDrag, onCorner, onLabels, onFail, onGpuLost, onHover });
  cb.current = { onDrag, onCorner, onLabels, onFail, onGpuLost, onHover };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
      renderer.onDeviceLost = () => {
        if (!disposed && !forceWebGL) cb.current.onGpuLost();
      };
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      try {
        await renderer.init();
      } catch (e) {
        if (!forceWebGL) {
          cb.current.onGpuLost();
          return;
        }
        cb.current.onFail(e instanceof Error ? e.message : "This browser could not start 3D.");
        return;
      }
      if (disposed) {
        renderer.dispose();
        return;
      }
      el.appendChild(renderer.domElement);
      renderer.domElement.style.touchAction = "none";
      renderer.domElement.style.display = "block";

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(BG);
      scene.fog = new THREE.Fog(BG, 10, 24);

      const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 100);

      // ---------- Floor: a dark stage with two pools of light ----------
      const poolA = uniform(new THREE.Vector2(-1.8, 0));
      const poolB = uniform(new THREE.Vector2(1.8, 0));
      const poolHeat = uniform(0.5);
      const uPoolA = uniform(new THREE.Color("#2a2a2c"));
      const floorMat = new THREE.MeshBasicNodeMaterial();
      const xz = vec2(positionWorld.x, positionWorld.z);
      const base = vec3(0.055, 0.055, 0.058).mul(smoothstep(float(11), float(0), length(xz)));
      const pool = (c: typeof poolA, r: number) => smoothstep(float(r), float(0), distance(xz, c));
      floorMat.colorNode = base
        .add(uPoolA.mul(pool(poolA, 2.6)).mul(0.6))
        .add(mix(vec3(0.22, 0.24, 0.36), vec3(0.6, 0.22, 0.05), poolHeat).mul(pool(poolB, 1.9)).mul(0.4));
      const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(12, 96), floorMat);

      // The air you can see: a wide glow behind the stage in the atmosphere's colour.
      const uAirGlow = uniform(new THREE.Color("#2a2a2c"));
      const uAirGlowStrength = uniform(0.35);
      const glowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
      const g = smoothstep(float(0.62), float(0.0), length(uv().sub(vec2(0.5, 0.42)).mul(vec2(1.0, 1.6))));
      glowMat.colorNode = uAirGlow;
      glowMat.opacityNode = g.mul(g).mul(uAirGlowStrength);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(44, 22), glowMat);
      glow.position.set(0, 5, -12);
      scene.add(glow);
      floorMesh.rotation.x = -Math.PI / 2;
      scene.add(floorMesh);

      // ---------- The cube ----------
      const cube = new THREE.Group();
      scene.add(cube);

      const edgesMat = new THREE.LineBasicNodeMaterial({
        color: new THREE.Color("#e8e8e6"),
        transparent: true,
        opacity: 0.55,
      });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), edgesMat);
      cube.add(edges);

      const glassMat = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color("#f4f4f2"),
        transparent: true,
        opacity: 0.035,
        side: THREE.BackSide,
        depthWrite: false,
      });
      cube.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), glassMat));

      // Corner nodes, one per working action.
      const cornerGeo = new THREE.SphereGeometry(0.055, 20, 14);
      const corners = ACTIONS.map((a) => {
        const mat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color("#f4f4f2") });
        const m = new THREE.Mesh(cornerGeo, mat);
        m.position.copy(toLocal(a.corner));
        m.userData.action = a.id;
        cube.add(m);
        return { action: a, mesh: m, mat };
      });
      // Bigger invisible targets so a corner is easy to tap.
      const cornerHits = corners.map((c) => {
        const h = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 8, 6),
          new THREE.MeshBasicNodeMaterial({ visible: false }),
        );
        h.position.copy(c.mesh.position);
        h.userData.action = c.action.id;
        cube.add(h);
        return h;
      });

      // The point.
      const pointMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color("#ffffff") });
      const pointMesh = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 20), pointMat);
      cube.add(pointMesh);
      const pointHalo = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 32, 20),
        new THREE.MeshBasicNodeMaterial({
          color: new THREE.Color("#f4f4f2"),
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      pointMesh.add(pointHalo);
      pointMat.visible = false;
      pointHalo.visible = false;
      const pointHit = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 8),
        new THREE.MeshBasicNodeMaterial({ visible: false }),
      );
      pointMesh.add(pointHit);

      // Threads from the point to each corner. Brightness = share of that action.
      const threadPos = new Float32Array(ACTIONS.length * 6);
      const threadCol = new Float32Array(ACTIONS.length * 6);
      const threadGeo = new THREE.BufferGeometry();
      threadGeo.setAttribute("position", new THREE.BufferAttribute(threadPos, 3));
      threadGeo.setAttribute("color", new THREE.BufferAttribute(threadCol, 3));
      const threads = new THREE.LineSegments(
        threadGeo,
        new THREE.LineBasicNodeMaterial({
          vertexColors: true,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      cube.add(threads);

      // The arc: each pinned moment is a small diamond; a glowing path joins them in order,
      // and a spark runs along it so you can watch the journey.
      const arc = new THREE.Group();
      cube.add(arc);
      const pinGeo = new THREE.OctahedronGeometry(0.065, 0);
      const pinMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color("#f4f4f2") });
      const pinActiveMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color("#f4f4f2").multiplyScalar(2.2) });
      const pathMat = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color("#f4f4f2").multiplyScalar(1.6),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 16, 12),
        new THREE.MeshBasicNodeMaterial({ color: new THREE.Color("#f4f4f2").multiplyScalar(3) }),
      );
      spark.visible = false;
      cube.add(spark);
      let pins: THREE.Mesh[] = [];
      let curve: THREE.CatmullRomCurve3 | null = null;
      let arcVersion = -1;
      const rebuildArc = () => {
        const a = arcRef.current;
        arcVersion = a.version;
        arc.children.forEach((o) => {
          if (o instanceof THREE.Mesh && o.geometry !== pinGeo) o.geometry.dispose();
        });
        arc.clear();
        pins = a.points.map((p, i) => {
          const m = new THREE.Mesh(pinGeo, i === a.active ? pinActiveMat : pinMat);
          m.position.copy(toLocal(p));
          m.scale.setScalar(i === a.active ? 1.5 : 1);
          arc.add(m);
          return m;
        });
        curve = null;
        if (pins.length >= 2) {
          curve = new THREE.CatmullRomCurve3(
            pins.map((m) => m.position.clone()),
            false,
            "centripetal",
          );
          arc.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40 * pins.length, 0.011, 6, false), pathMat));
        }
        spark.visible = !!curve;
      };

      // ---------- The performer ----------
      // The light lives in the cube: it rides the point and moves the way the point says.
      const performer = new THREE.Group();
      performer.scale.setScalar(0.34);
      cube.add(performer);
      const coreColor = new THREE.Color();
      const coreMat = new THREE.MeshBasicNodeMaterial({ color: coreColor });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 20), coreMat);
      performer.add(core);

      const TRAIL = 260;
      const trailMat = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const trail = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), trailMat, TRAIL);
      trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      trail.frustumCulled = false;
      const black = new THREE.Color(0, 0, 0);
      for (let i = 0; i < TRAIL; i++) trail.setColorAt(i, black);
      performer.add(trail);
      const history: THREE.Vector3[] = [];

      // ---------- The gesture figure ----------
      const figure = buildFigure();
      figure.group.visible = false;
      figure.group.position.set(0, -1, 0); // feet on the cube's floor
      cube.add(figure.group);
      const HAND_TRAIL = 110;
      const handTrailMat = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const handTrails = [0, 1].map(() => {
        const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), handTrailMat, HAND_TRAIL);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        for (let i = 0; i < HAND_TRAIL; i++) m.setColorAt(i, new THREE.Color(0, 0, 0));
        m.visible = false;
        scene.add(m);
        return { mesh: m, history: [] as THREE.Vector3[] };
      });
      // The shape the hands leave over one full cycle, kept standing on the stage.
      const sculpture = new THREE.Group();
      cube.add(sculpture);
      const sculptMat = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color("#f4f4f2").multiplyScalar(1.4),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mineMat = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color("#cfe0ff").multiplyScalar(1.6),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      let gestureVersion = -1;
      const rebuildSculpture = () => {
        const g = gestureRef.current;
        gestureVersion = g.version;
        sculpture.children.forEach((o) => (o as THREE.Mesh).geometry?.dispose());
        sculpture.clear();
        // Yours, from the camera: paler and cooler than the figure's, so the two read apart.
        if (g.mine)
          g.mine.forEach((pts) => {
            if (pts.length < 4) return;
            const curve = new THREE.CatmullRomCurve3(
              pts.map(([x, y, z]) => new THREE.Vector3(x, y - 0.05, z)), // hips 0.95 above the cube's floor
              false,
              "centripetal",
            );
            sculpture.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.014, 6, false), mineMat));
          });
        if (!g.spec || !g.sculpt) return;
        const T = period(g.spec);
        const paths: THREE.Vector3[][] = [[], []];
        for (let n = 0; n <= 90; n++) {
          figure.apply(poseAt(g.spec, (n / 90) * T, 1));
          figure.hands().forEach((h, i) => paths[i].push(cube.worldToLocal(h)));
        }
        paths.forEach((pts) => {
          const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
          sculpture.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.012, 6, false), sculptMat));
        });
      };

      // ---------- Post: bloom ----------
      const pipeline = new THREE.RenderPipeline(renderer);
      const scenePass = pass(scene, camera);
      const sceneColor = scenePass.getTextureNode("output");
      // Everything passes through one fader: the house lights.
      const uFade = uniform(0);
      pipeline.outputNode = sceneColor.add(bloom(sceneColor, 0.95, 0.55, 0.12)).mul(uFade);

      // ---------- Layout ----------
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 4;
      controls.maxDistance = 16;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.rotateSpeed = 0.6;

      // ---------- Camera flights ----------
      const rest = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
      let cubeScale = 1;
      type Flight = {
        fromPos: THREE.Vector3;
        fromTarget: THREE.Vector3;
        toPos: THREE.Vector3;
        toTarget: THREE.Vector3;
        t: number;
        dur: number;
        ease: (t: number) => number;
        done?: () => void;
      };
      let flight: Flight | null = null;
      let closing = false;
      const flyTo = (
        pos: THREE.Vector3,
        target: THREE.Vector3,
        dur: number,
        ease = easeOutExpo,
        done?: () => void,
      ) => {
        flight = {
          fromPos: camera.position.clone(),
          fromTarget: controls.target.clone(),
          toPos: pos.clone(),
          toTarget: target.clone(),
          t: 0,
          dur: reducedMotion ? Math.min(dur, 0.2) : dur,
          ease,
          done,
        };
        controls.enabled = false;
      };
      let introStarted = false;
      let inset = 0;
      const applyInset = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (inset > 0 && w - inset > 320) camera.setViewOffset(w + inset, h, 0, 0, w, h);
        else camera.clearViewOffset();
        camera.updateProjectionMatrix();
      };

      const layout = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        const portrait = h > w;
        camera.aspect = w / h;
        if (portrait) {
          cube.position.set(0, 2.35, 0);
          cubeScale = 0.95;
          camera.fov = 52;
          rest.pos.set(2.6, 3.3, 9.8);
          rest.target.set(0, 2.2, 0);
        } else {
          cube.position.set(0, 1.75, 0);
          cubeScale = 1.3;
          camera.fov = 38;
          rest.pos.set(2.5, 3.0, 8.8);
          rest.target.set(0, 1.6, 0);
        }
        if (!introStarted) {
          // Arrive from high and far, then settle: about a second.
          introStarted = true;
          camera.position.copy(rest.pos).sub(rest.target).multiplyScalar(1.9).add(rest.target);
          camera.position.y += 2.4;
          controls.target.copy(rest.target).add(new THREE.Vector3(0, 0.8, 0));
          flyTo(rest.pos, rest.target, 1.35);
        } else if (!flight) {
          camera.position.copy(rest.pos);
          controls.target.copy(rest.target);
        }
        poolA.value.set(cube.position.x, cube.position.z);
        poolB.value.set(100, 100); // one pool of light now, under the cube
        applyInset();
        renderer.setSize(w, h);
        camera.lookAt(controls.target);
      };
      layout();
      const ro = new ResizeObserver(layout);
      ro.observe(el);
      cleanups.push(() => ro.disconnect());

      // ---------- Dragging the point ----------
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const plane = new THREE.Plane();
      const hitV = new THREE.Vector3();
      let dragging = false;
      let hovered: ActionId | null = null;
      let downAt: { x: number; y: number } | null = null;

      const setNdc = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
      };

      const onDown = (e: PointerEvent) => {
        setNdc(e);
        downAt = { x: e.clientX, y: e.clientY };
        if (ray.intersectObject(pointHit, false).length) {
          dragging = true;
          controls.enabled = false;
          renderer.domElement.setPointerCapture(e.pointerId);
          const n = camera.getWorldDirection(new THREE.Vector3()).negate();
          plane.setFromNormalAndCoplanarPoint(n, pointMesh.getWorldPosition(new THREE.Vector3()));
          renderer.domElement.style.cursor = "grabbing";
        }
      };
      const onMove = (e: PointerEvent) => {
        setNdc(e);
        if (dragging) {
          if (ray.ray.intersectPlane(plane, hitV)) {
            const p = fromLocal(cube.worldToLocal(hitV.clone()));
            pointRef.current = p;
            cb.current.onDrag(p);
          }
          return;
        }
        const corner = ray.intersectObjects(cornerHits, false)[0];
        const id = (corner?.object.userData.action as ActionId | undefined) ?? null;
        if (id !== hovered) {
          hovered = id;
          cb.current.onHover(id);
        }
        const over = ray.intersectObject(pointHit, false).length || corner;
        renderer.domElement.style.cursor = over ? (corner ? "pointer" : "grab") : "default";
      };
      const onUp = (e: PointerEvent) => {
        if (dragging) {
          dragging = false;
          controls.enabled = true;
          renderer.domElement.releasePointerCapture?.(e.pointerId);
          renderer.domElement.style.cursor = "grab";
        } else if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) {
          setNdc(e);
          const hit = ray.intersectObjects(cornerHits, false)[0];
          if (hit) cb.current.onCorner(hit.object.userData.action as ActionId);
        }
        downAt = null;
      };
      const home = () => {
        if (!closing) flyTo(rest.pos, rest.target, 0.75, easeInOutCubic);
      };
      const c = renderer.domElement;
      c.addEventListener("dblclick", home);
      c.addEventListener("pointerdown", onDown);
      c.addEventListener("pointermove", onMove);
      c.addEventListener("pointerup", onUp);
      c.addEventListener("pointercancel", onUp);
      cleanups.push(() => {
        c.removeEventListener("dblclick", home);
        c.removeEventListener("pointerdown", onDown);
        c.removeEventListener("pointermove", onMove);
        c.removeEventListener("pointerup", onUp);
        c.removeEventListener("pointercancel", onUp);
      });

      let fade = 0; // 0 dark .. 1 lit
      let closeResolve: (() => void) | null = null;
      apiRef.current = {
        home,
        focusPerformer: () => {
          if (closing) return;
          const c = cube.getWorldPosition(new THREE.Vector3());
          const k = cube.scale.x;
          flyTo(
            c.clone().add(new THREE.Vector3(0.7 * k, 0.35 * k, 3.7 * k)),
            c.clone().add(new THREE.Vector3(0, 0.05 * k, 0)),
            1.6,
            easeInOutCubic,
          );
        },
        setInset: (px: number) => {
          inset = px;
          applyInset();
        },
        close: () =>
          new Promise<void>((resolve) => {
            if (closing) return resolve();
            closing = true;
            closeResolve = resolve;
            const back = camera.position.clone().sub(controls.target).multiplyScalar(1.35).add(controls.target);
            back.y += 0.8;
            flyTo(back, controls.target, 0.42, (t) => t * t);
          }),
      };
      cleanups.push(() => {
        apiRef.current = null;
      });

      // Keep it smooth: if frames run long, render fewer pixels.
      let pixelRatio = Math.min(window.devicePixelRatio, 2);
      let slowFor = 0;

      // The air the stage is in, eased toward airRef so a change of atmosphere is felt, not cut.
      const sky = new THREE.Color(BG);
      const air = { near: 10, far: 24, drift: 0, unrest: 0.15, light: 1 };
      const airDust = new THREE.Color("#e8e8e6");
      const tmpAir = new THREE.Color();

      // ---------- Frame ----------
      const shown = { ...pointRef.current }; // eased toward pointRef
      const timer = new THREE.Timer();
      let gestureT = 0;
      let labelTick = 0;
      const tmpM = new THREE.Matrix4();
      const tmpQ = new THREE.Quaternion();
      const tmpS = new THREE.Vector3();
      const tmpC = new THREE.Color();
      const proj = new THREE.Vector3();
      const motionScale = reducedMotion ? 0.35 : 1;

      renderer.setAnimationLoop((now) => {
        timer.update(now);
        const dt = Math.min(timer.getDelta(), 0.05);
        // House lights: up in ~0.9s on arrival, down in ~0.35s on leaving.
        fade = closing ? Math.max(0, fade - dt / 0.35) : Math.min(1, fade + dt / (reducedMotion ? 0.3 : 0.9));
        const lit = closing ? fade * fade : 1 - Math.pow(1 - fade, 3);
        const A = airOf(airRef.current);
        const k = 1 - Math.exp(-dt * (reducedMotion ? 20 : 1.6));
        sky.lerp(tmpAir.set(A.sky), k);
        (scene.background as THREE.Color).copy(sky);
        const fog = scene.fog as THREE.Fog;
        fog.color.copy(sky);
        air.near += (A.fogNear - air.near) * k;
        air.far += (A.fogFar - air.far) * k;
        fog.near = air.near;
        fog.far = air.far;
        air.drift += (A.drift - air.drift) * k;
        air.unrest += (A.unrest - air.unrest) * k;
        air.light += (A.light - air.light) * k;
        (uPoolA.value as THREE.Color).lerp(tmpAir.set(A.floor), k);
        (uAirGlow.value as THREE.Color).lerp(tmpAir.set(A.floor), k);
        uAirGlowStrength.value += ((A.id === "still" ? 0.28 : 0.62) * lit - uAirGlowStrength.value) * k;
        airDust.lerp(tmpAir.set(A.dust), k);
        uFade.value = lit * air.light;
        if (closing && fade === 0 && closeResolve) {
          const r = closeResolve;
          closeResolve = null;
          r();
        }
        // The cube draws itself in: scale up from 70%, edges brighten, corners pop in turn.
        cube.scale.setScalar(cubeScale * (0.7 + 0.3 * easeOutExpo(fade)));
        edgesMat.opacity = 0.55 * fade;

        if (!reducedMotion && dt > 1 / 40) slowFor += dt;
        else slowFor = Math.max(0, slowFor - dt * 0.5);
        if (slowFor > 1.5 && pixelRatio > 1) {
          pixelRatio = Math.max(1, pixelRatio - 0.5);
          renderer.setPixelRatio(pixelRatio);
          renderer.setSize(el.clientWidth, el.clientHeight);
          slowFor = 0;
        }

        const target = pointRef.current;
        const ease = 1 - Math.exp(-dt * (dragging ? 30 : 7));
        shown.weight += (target.weight - shown.weight) * ease;
        shown.space += (target.space - shown.space) * ease;
        shown.time += (target.time - shown.time) * ease;

        if (arcRef.current.version !== arcVersion) rebuildArc();
        if (curve) {
          const period = 1.4 * pins.length;
          spark.position.copy(curve.getPointAt(((performance.now() / 1000) % period) / period));
        }
        pins.forEach((m, i) => (m.rotation.y += dt * (i === arcRef.current.active ? 1.6 : 0.6)));

        const q = qualities(shown);
        const b = blend(shown);

        // Point and threads.
        pointMesh.position.copy(toLocal(shown));
        performer.position.copy(pointMesh.position);
        performerColor(shown, tmpC);
        (pointHalo.material as THREE.MeshBasicNodeMaterial).color.copy(tmpC);
        ACTIONS.forEach((a, i) => {
          const share = b[a.id];
          const cp = corners[i].mesh.position;
          threadPos.set([pointMesh.position.x, pointMesh.position.y, pointMesh.position.z, cp.x, cp.y, cp.z], i * 6);
          const k = 0.05 + share * 1.9;
          const col = tmpC.clone().multiplyScalar(k);
          threadCol.set([col.r, col.g, col.b, col.r * 0.25, col.g * 0.25, col.b * 0.25], i * 6);
          const pop = easeOutExpo(clamp01(fade * 1.8 - i * 0.07));
          corners[i].mesh.scale.setScalar((0.8 + share * 0.5) * pop); // the light, not the corner, is what you look at
          corners[i].mat.color.copy(PALE).multiplyScalar(0.4 + share * 0.7);
        });
        threadGeo.attributes.position.needsUpdate = true;
        threadGeo.attributes.color.needsUpdate = true;

        // Performer.
        gestureT += dt * motionScale;
        const [gx, gy, gz] = gestureAt(gestureT, q);
        core.position.set(gx * 1.05, gy, gz * 0.9);
        core.scale.setScalar((0.9 + q.mass * 0.8) * 1.9);
        performerColor(shown, coreColor);
        // Bright enough to glow, not so bright that bloom burns its heat out to white.
        coreMat.color.copy(coreColor).multiplyScalar(1.05 + (1 - heatOf(shown)) * 0.9);

        history.unshift(core.position.clone());
        if (history.length > TRAIL) history.pop();
        const trailLen = Math.floor(80 + (1 - q.suddenness) * 160);
        for (let i = 0; i < TRAIL; i++) {
          const h = history[i];
          const life = i < trailLen && h ? 1 - i / trailLen : 0;
          const s = life > 0 ? (0.007 + 0.034 * life) * (0.6 + q.mass * 0.9) : 0;
          tmpS.setScalar(s);
          tmpM.compose(h ?? core.position, tmpQ, tmpS);
          trail.setMatrixAt(i, tmpM);
          tmpC.copy(coreColor).multiplyScalar(life * life * 1.4);
          trail.setColorAt(i, tmpC);
        }
        trail.instanceMatrix.needsUpdate = true;
        if (trail.instanceColor) trail.instanceColor.needsUpdate = true;

        // The gesture: the figure takes the stage while it is active.
        const G = gestureRef.current;
        const gOn = G.active && !!G.spec;
        figure.group.visible = gOn;
        performer.visible = !gOn;
        threads.visible = !gOn;
        arc.visible = !gOn;
        corners.forEach((c) => (c.mesh.visible = !gOn));
        sculpture.visible = gOn;
        handTrails.forEach((h) => (h.mesh.visible = gOn));
        if (G.version !== gestureVersion) rebuildSculpture();
        if (gOn && G.spec) {
          let size = G.size;
          if (G.inward) {
            const e = (performance.now() - G.inward.start) / G.inward.dur;
            size = e < 0.38 ? 1 : 1 - easeInOutCubic(clamp01((e - 0.38) / 0.55));
          }
          const tSec = performance.now() / 1000;
          figure.apply(poseAt(G.spec, tSec, size));
          const { p, radiate } = progressAt(G.spec, tSec);
          const gHeat = heatOf(effortOf(G.spec));
          const [hr, hg, hb] = heatRGB(gHeat);
          figure.setCentre((1 - size) * (0.35 + 0.65 * p) + radiate * 0.5 * size + 0.15, hr, hg, hb);
          figure.setBody(0.25 + 0.75 * size);
          const hs = figure.hands();
          handTrails.forEach((h, i) => {
            h.history.unshift(hs[i]);
            if (h.history.length > HAND_TRAIL) h.history.pop();
            for (let n = 0; n < HAND_TRAIL; n++) {
              const pos = h.history[n];
              const life = pos ? 1 - n / HAND_TRAIL : 0;
              tmpS.setScalar(life > 0 ? (0.006 + 0.022 * life) * (0.3 + 0.7 * size) : 0);
              tmpM.compose(pos ?? hs[i], tmpQ, tmpS);
              h.mesh.setMatrixAt(n, tmpM);
              tmpC.setRGB(hr, hg, hb).multiplyScalar(life * life * 1.6 * (0.25 + 0.75 * size));
              h.mesh.setColorAt(n, tmpC);
            }
            h.mesh.instanceMatrix.needsUpdate = true;
            if (h.mesh.instanceColor) h.mesh.instanceColor.needsUpdate = true;
          });
        } else {
          handTrails.forEach((h) => (h.history.length = 0));
        }

        // Air.

        poolHeat.value = q.mass;

        if (flight) {
          flight.t = Math.min(1, flight.t + dt / flight.dur);
          const k = flight.ease(flight.t);
          camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
          controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
          camera.lookAt(controls.target);
          if (flight.t >= 1) {
            const done = flight.done;
            flight = null;
            controls.enabled = !closing;
            done?.();
          }
        } else {
          controls.update();
        }
        pipeline.render();

        // Corner labels for the HTML overlay, ~20 times a second.
        labelTick += dt;
        if (labelTick > 0.05) {
          labelTick = 0;
          const w = el.clientWidth;
          const h = el.clientHeight;
          cube.getWorldPosition(proj);
          proj.project(camera);
          const cx = (proj.x * 0.5 + 0.5) * w;
          const cy = (-proj.y * 0.5 + 0.5) * h;
          const pinLabels: PinLabel[] = pins.map((m, index) => {
            m.getWorldPosition(proj);
            proj.project(camera);
            return {
              index,
              x: (proj.x * 0.5 + 0.5) * w,
              y: (-proj.y * 0.5 + 0.5) * h,
              visible: proj.z < 1,
            };
          });
          cb.current.onLabels(
            corners.map(({ action, mesh }) => {
              mesh.getWorldPosition(proj);
              proj.project(camera);
              const x = (proj.x * 0.5 + 0.5) * w;
              const y = (-proj.y * 0.5 + 0.5) * h;
              const d = Math.hypot(x - cx, y - cy) || 1;
              return {
                id: action.id,
                x: x + ((x - cx) / d) * 22,
                y: y + ((y - cy) / d) * 16,
                share: b[action.id],
                visible: proj.z < 1,
              };
            }),
            pinLabels,
          );
        }
      });

      cleanups.push(() => {
        renderer.setAnimationLoop(null);
        controls.dispose();
        pipeline.dispose();
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose?.();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      });
    })();

    return () => {
      disposed = true;
      cleanups.splice(0).reverse().forEach((f) => f());
    };
    // The scene is built once; it reads the point through pointRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, forceWebGL]);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}
