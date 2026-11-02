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
  Fn,
  instancedArray,
  instanceIndex,
  uniform,
  vec2,
  vec3,
  float,
  hash,
  time,
  sin,
  floor,
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

const BG = "#130b08"; // warm near-black, never flat black
const EMBER = new THREE.Color("#CB4B00");
const PALE = new THREE.Color("#ffe2b8");
const COOL = new THREE.Color("#9fb7ff");

/** Cube axes: x = space (direct +), y = weight (light up, strong down), z = time (sudden toward you). */
function toLocal(p: EffortPoint): THREE.Vector3 {
  return new THREE.Vector3(p.space, -p.weight, p.time);
}
function fromLocal(v: THREE.Vector3): EffortPoint {
  return clampPoint({ space: v.x, weight: -v.y, time: v.z });
}

/** The performer's colour: light is pale and cool, strong is ember. */
function performerColor(p: EffortPoint, out: THREE.Color) {
  const m = (p.weight + 1) / 2;
  out.copy(COOL).lerp(PALE, Math.min(1, m * 2)).lerp(EMBER, Math.max(0, m * 2 - 1));
  return out;
}

export type CornerLabel = { id: ActionId; x: number; y: number; share: number; visible: boolean };

type Props = {
  pointRef: React.MutableRefObject<EffortPoint>;
  onDrag: (p: EffortPoint) => void;
  onCorner: (id: ActionId) => void;
  onLabels: (labels: CornerLabel[]) => void;
  onFail: (why: string) => void;
  /** WebGPU died (or never really started): the parent remounts us on WebGL2. */
  onGpuLost: () => void;
  reducedMotion: boolean;
  forceWebGL: boolean;
};

export default function EffortCubeScene({
  pointRef,
  onDrag,
  onCorner,
  onLabels,
  onFail,
  onGpuLost,
  reducedMotion,
  forceWebGL,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Keep the latest callbacks without restarting the scene.
  const cb = useRef({ onDrag, onCorner, onLabels, onFail, onGpuLost });
  cb.current = { onDrag, onCorner, onLabels, onFail, onGpuLost };

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
      const floorMat = new THREE.MeshBasicNodeMaterial();
      const xz = vec2(positionWorld.x, positionWorld.z);
      const base = vec3(0.075, 0.045, 0.032).mul(smoothstep(float(11), float(0), length(xz)));
      const pool = (c: typeof poolA, r: number) => smoothstep(float(r), float(0), distance(xz, c));
      floorMat.colorNode = base
        .add(vec3(0.42, 0.2, 0.08).mul(pool(poolA, 2.4)).mul(0.3))
        .add(mix(vec3(0.22, 0.24, 0.36), vec3(0.6, 0.22, 0.05), poolHeat).mul(pool(poolB, 1.9)).mul(0.4));
      const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(12, 96), floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      scene.add(floorMesh);

      // ---------- The cube ----------
      const cube = new THREE.Group();
      scene.add(cube);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)),
        new THREE.LineBasicNodeMaterial({ color: new THREE.Color("#f3d9bf"), transparent: true, opacity: 0.55 }),
      );
      cube.add(edges);

      const glassMat = new THREE.MeshBasicNodeMaterial({
        color: new THREE.Color("#ffb27a"),
        transparent: true,
        opacity: 0.035,
        side: THREE.BackSide,
        depthWrite: false,
      });
      cube.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), glassMat));

      // Corner nodes, one per working action.
      const cornerGeo = new THREE.SphereGeometry(0.055, 20, 14);
      const corners = ACTIONS.map((a) => {
        const mat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color("#ffd2a6") });
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
          color: new THREE.Color("#CB4B00"),
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      pointMesh.add(pointHalo);
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

      // ---------- The performer ----------
      const performer = new THREE.Group();
      scene.add(performer);
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

      // A faint stage mark under the performer.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.17, 96),
        new THREE.MeshBasicNodeMaterial({
          color: new THREE.Color("#f3d9bf"),
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      performer.add(ring);

      // ---------- Dust: a GPU compute particle field ----------
      const DUST = 4000;
      const SIZE = new THREE.Vector3(16, 6.5, 10);
      const ORIGIN = new THREE.Vector3(0, 3.1, 0);
      const dust = instancedArray(DUST, "vec3");
      const uSpeed = uniform(0.3);
      const uGravity = uniform(0);
      const uSwirl = uniform(1);
      const uDirect = uniform(0);
      const uDelta = uniform(1 / 60);
      const uFlicker = uniform(0);
      const uDustColor = uniform(new THREE.Color("#ffcf9e"));
      const size = vec3(SIZE.x, SIZE.y, SIZE.z);
      const origin = vec3(ORIGIN.x, ORIGIN.y, ORIGIN.z);

      const initDust = Fn(() => {
        const p = dust.element(instanceIndex);
        const r = vec3(hash(instanceIndex), hash(instanceIndex.add(7919)), hash(instanceIndex.add(15485)));
        p.assign(r.sub(0.5).mul(size).add(origin));
      })().compute(DUST);

      const stepDust = Fn(() => {
        const p = dust.element(instanceIndex);
        const s = p.mul(0.42);
        const t = time.mul(0.25);
        const swirl = vec3(sin(s.y.add(t)), sin(s.z.add(t.mul(1.3))), sin(s.x.add(t.mul(0.8)))).mul(uSwirl);
        const flow = vec3(uDirect.mul(1.4), uGravity.negate(), 0);
        const np = p.add(swirl.add(flow).mul(uSpeed).mul(uDelta));
        // Wrap inside the box (no negative modulo surprises across backends).
        const rel = np.sub(origin).div(size).add(0.5);
        const wrapped = rel.sub(floor(rel)).sub(0.5).mul(size).add(origin);
        p.assign(wrapped);
      })().compute(DUST);

      const dustMat = new THREE.SpriteNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      dustMat.positionNode = dust.toAttribute();
      const seed = hash(instanceIndex.add(311));
      dustMat.scaleNode = float(0.022).add(seed.mul(0.03));
      const disc = smoothstep(float(0.5), float(0.0), length(uv().sub(0.5)));
      const twinkle = mix(float(1), sin(time.mul(14).add(seed.mul(40))).mul(0.5).add(0.5), uFlicker);
      dustMat.colorNode = uDustColor;
      dustMat.opacityNode = disc.mul(seed.mul(0.45).add(0.15)).mul(twinkle);
      const dustSprites = new THREE.Sprite(dustMat);
      dustSprites.count = DUST;
      dustSprites.frustumCulled = false;
      scene.add(dustSprites);

      renderer.compute(initDust);

      // ---------- Post: bloom ----------
      const pipeline = new THREE.RenderPipeline(renderer);
      const scenePass = pass(scene, camera);
      const sceneColor = scenePass.getTextureNode("output");
      pipeline.outputNode = sceneColor.add(bloom(sceneColor, 0.95, 0.55, 0.12));

      // ---------- Layout ----------
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 4;
      controls.maxDistance = 16;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.rotateSpeed = 0.6;

      const layout = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        const portrait = h > w;
        camera.aspect = w / h;
        if (portrait) {
          cube.position.set(0, 4.15, 0);
          cube.scale.setScalar(0.8);
          performer.position.set(0, 0.55, 0.4);
          performer.scale.setScalar(0.85);
          camera.fov = 52;
          camera.position.set(3.4, 3.6, 9.2);
          controls.target.set(0, 2.15, 0);
        } else {
          cube.position.set(-1.8, 1.7, 0);
          cube.scale.setScalar(1);
          performer.position.set(1.8, 0.2, 0);
          performer.scale.setScalar(1);
          camera.fov = 38;
          camera.position.set(2.6, 3.0, 8.4);
          controls.target.set(0, 0.95, 0);
        }
        poolA.value.set(cube.position.x, cube.position.z);
        poolB.value.set(performer.position.x, performer.position.z);
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        controls.update();
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
        const over = ray.intersectObject(pointHit, false).length || ray.intersectObjects(cornerHits, false).length;
        renderer.domElement.style.cursor = over ? "grab" : "default";
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
      const c = renderer.domElement;
      c.addEventListener("pointerdown", onDown);
      c.addEventListener("pointermove", onMove);
      c.addEventListener("pointerup", onUp);
      c.addEventListener("pointercancel", onUp);
      cleanups.push(() => {
        c.removeEventListener("pointerdown", onDown);
        c.removeEventListener("pointermove", onMove);
        c.removeEventListener("pointerup", onUp);
        c.removeEventListener("pointercancel", onUp);
      });

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
        const target = pointRef.current;
        const ease = 1 - Math.exp(-dt * (dragging ? 30 : 7));
        shown.weight += (target.weight - shown.weight) * ease;
        shown.space += (target.space - shown.space) * ease;
        shown.time += (target.time - shown.time) * ease;

        const q = qualities(shown);
        const b = blend(shown);

        // Point and threads.
        pointMesh.position.copy(toLocal(shown));
        performerColor(shown, tmpC);
        (pointHalo.material as THREE.MeshBasicNodeMaterial).color.copy(tmpC);
        ACTIONS.forEach((a, i) => {
          const share = b[a.id];
          const cp = corners[i].mesh.position;
          threadPos.set([pointMesh.position.x, pointMesh.position.y, pointMesh.position.z, cp.x, cp.y, cp.z], i * 6);
          const k = 0.05 + share * 1.9;
          const col = tmpC.clone().multiplyScalar(k);
          threadCol.set([col.r, col.g, col.b, col.r * 0.25, col.g * 0.25, col.b * 0.25], i * 6);
          corners[i].mesh.scale.setScalar(0.8 + share * 1.8);
          corners[i].mat.color.copy(PALE).multiplyScalar(0.45 + share * 2.2);
        });
        threadGeo.attributes.position.needsUpdate = true;
        threadGeo.attributes.color.needsUpdate = true;

        // Performer.
        gestureT += dt * motionScale;
        const [gx, gy, gz] = gestureAt(gestureT, q);
        const lift = 1.25;
        core.position.set(gx * 1.05, gy + lift, gz * 0.9);
        core.scale.setScalar(0.7 + q.mass * 0.9);
        performerColor(shown, coreColor);
        coreMat.color.copy(coreColor).multiplyScalar(1.6 + q.mass * 1.4);

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

        // Air.
        uDelta.value = dt;
        uSpeed.value = (0.12 + q.suddenness * 0.9) * motionScale;
        uGravity.value = (q.mass - 0.5) * 0.9;
        uSwirl.value = 1.2 - q.directness;
        uDirect.value = q.directness;
        uFlicker.value = reducedMotion ? 0 : q.suddenness * 0.8;
        performerColor(shown, uDustColor.value as THREE.Color);
        poolHeat.value = q.mass;

        controls.update();
        renderer.compute(stepDust);
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
