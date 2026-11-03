/**
 * The figure that performs a psychological gesture: a pale, glowing body of
 * capsules, a centre in the chest that lights up as the gesture goes inside,
 * and light trails from both hands. It only draws poses; the movement itself is
 * lib/studio/gesture.ts.
 *
 * Coordinates: the figure stands at the group's origin, faces +z (the camera),
 * about 1.75 tall.
 */

import * as THREE from "three/webgpu";
import type { Pose } from "@/lib/studio/gesture";

// Dim enough that bloom keeps the shape of the body; the hands and centre carry the light.
const BODY = new THREE.Color("#9c9c9a");

function limb(len: number, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 6, 14), mat);
  m.position.y = -len / 2; // hangs down from its joint
  return m;
}

export type Figure = {
  group: THREE.Group;
  /** Put the body in a pose, exactly (used to sample the sculpture). */
  apply: (pose: Pose) => void;
  /**
   * Move toward a pose like a body does: each joint on a spring, the arms a little
   * looser than the torso so they follow through, a breath when the gesture is inside.
   */
  animate: (target: Pose, dt: number, breath: number, t: number) => void;
  /** Hands in world space, after apply(). */
  hands: () => [THREE.Vector3, THREE.Vector3];
  /** 0 dark .. 1 burning: the centre, for a gesture taken inside. */
  /** The centre burns in the gesture's heat colour (0..1 channels). */
  setCentre: (glow: number, r?: number, g?: number, b?: number) => void;
  /** The body's own light, 0..1 (fades when the gesture is inner). */
  setBody: (light: number) => void;
};

export function buildFigure(): Figure {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshBasicNodeMaterial({ color: BODY.clone(), transparent: true, opacity: 0.85 });
  const jointMat = new THREE.MeshBasicNodeMaterial({ color: BODY.clone().multiplyScalar(0.9) });

  const root = new THREE.Group();
  group.add(root);
  const HIP_Y = 0.95;

  // Legs.
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(0.09 * side, 0, 0);
    root.add(hip);
    hip.add(limb(0.46, 0.055, bodyMat));
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    hip.add(knee);
    knee.add(limb(0.46, 0.048, bodyMat));
    return { hip, knee };
  });

  // Torso, head.
  const spine = new THREE.Group();
  root.add(spine);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 6, 16), bodyMat);
  torso.position.y = 0.26;
  spine.add(torso);
  const chest = new THREE.Group();
  chest.position.y = 0.5;
  spine.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 16), bodyMat);
  head.position.y = 0.2;
  chest.add(head);

  // The centre: where the gesture lives once it is inside.
  const centreMat = new THREE.MeshBasicNodeMaterial({
    color: new THREE.Color("#f4f4f2"),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const centre = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), centreMat);
  centre.position.set(0, -0.12, 0.06);
  chest.add(centre);

  // Arms: spread (around y), a little abduction (z), raise (x), then the elbow.
  const handMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color("#f4f4f2").multiplyScalar(2.2) });
  const arms = [-1, 1].map((side) => {
    const spread = new THREE.Group();
    spread.position.set(0.19 * side, -0.02, 0);
    chest.add(spread);
    const abd = new THREE.Group();
    spread.add(abd);
    const raise = new THREE.Group();
    abd.add(raise);
    raise.add(limb(0.3, 0.042, bodyMat));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    raise.add(elbow);
    elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), jointMat));
    elbow.add(limb(0.27, 0.037, bodyMat));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), handMat);
    hand.position.y = -0.29;
    elbow.add(hand);
    return { side, spread, abd, raise, elbow, hand };
  });

  const apply = (pose: Pose, breath = 0, t = 0) => {
    const c = pose.crouch;
    // Knees bend forward as the hips drop; up on the toes lifts a little.
    const thigh = Math.max(0, c) * 1.1;
    const shin = Math.max(0, c) * 2.0;
    // Leaning in, the body steps into it: the front foot forward, the back one behind.
    const stance = Math.max(-0.5, Math.min(0.5, pose.lean));
    legs.forEach(({ hip, knee }, i) => {
      const front = i === 1 ? 1 : -0.6; // the right leg leads
      hip.rotation.x = -thigh - stance * 0.55 * front;
      knee.rotation.x = shin + Math.max(0, stance * front) * 0.35;
    });
    const drop = 0.46 * (1 - Math.cos(thigh)) + 0.46 * (1 - Math.cos(shin - thigh)) + Math.abs(stance) * 0.04;
    root.position.y = HIP_Y - drop + Math.max(0, -c) * 0.12;
    // The hips turn against the shoulders; the head keeps looking out.
    root.rotation.y = -pose.twist * 0.3;
    const b = Math.sin(t * 1.7) * breath;
    spine.rotation.x = pose.lean + b * 0.02;
    spine.rotation.y = pose.twist;
    chest.scale.set(1 + b * 0.012, 1 + b * 0.018, 1 + b * 0.012);
    head.rotation.x = -pose.lean * 0.55;
    head.rotation.y = -pose.twist * 0.45;
    arms.forEach(({ side, spread, abd, raise, elbow }, i) => {
      const a = pose.arms[i];
      spread.rotation.y = side * a.spread * 0.9;
      abd.rotation.z = side * Math.max(0, a.spread) * 0.55 * Math.cos(Math.min(Math.PI / 2, a.raise));
      raise.rotation.x = -a.raise;
      elbow.rotation.x = -a.bend;
    });
    group.updateMatrixWorld(true);
  };

  // Springs, one per joint value. Torso stiffer, arms looser: the arms arrive a beat late
  // and overshoot a touch, which is what makes it read as a body and not a puppet.
  const KEYS = ["lean", "twist", "crouch"] as const;
  const STIFF = { lean: 90, twist: 80, crouch: 75, raise: 55, spread: 55, bend: 48 };
  const DAMP = 0.7; // under 1: a little follow-through
  const st = {
    lean: [0, 0],
    twist: [0, 0],
    crouch: [0, 0],
    arms: [0, 1].map(() => ({ raise: [0.15, 0], spread: [0.12, 0], bend: [0.15, 0] })),
  };
  const step = (v: number[], target: number, k: number, dt: number) => {
    const c = 2 * Math.sqrt(k) * DAMP;
    v[1] += (k * (target - v[0]) - c * v[1]) * dt;
    v[0] += v[1] * dt;
  };
  const animate = (target: Pose, dt: number, breath: number, t: number) => {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))); // small steps keep stiff springs stable
    const h = Math.min(dt, 0.05) / n;
    for (let s = 0; s < n; s++) {
      KEYS.forEach((key) => step(st[key], target[key], STIFF[key], h));
      st.arms.forEach((a, i) => {
        step(a.raise, target.arms[i].raise, STIFF.raise, h);
        step(a.spread, target.arms[i].spread, STIFF.spread, h);
        step(a.bend, target.arms[i].bend, STIFF.bend, h);
      });
    }
    apply(
      {
        lean: st.lean[0],
        twist: st.twist[0],
        crouch: st.crouch[0],
        arms: st.arms.map((a) => ({ raise: a.raise[0], spread: a.spread[0], bend: Math.max(0, a.bend[0]) })) as Pose["arms"],
      },
      breath,
      t,
    );
  };

  const hands = (): [THREE.Vector3, THREE.Vector3] => [
    arms[0].hand.getWorldPosition(new THREE.Vector3()),
    arms[1].hand.getWorldPosition(new THREE.Vector3()),
  ];

  const setCentre = (glow: number, r = 0.96, gr = 0.96, b = 0.95) => {
    const g = Math.max(0, glow);
    centre.scale.setScalar(0.6 + g * 1.4);
    centreMat.color.setRGB(r, gr, b).multiplyScalar(0.6 + g * 3.2);
  };

  const setBody = (light: number) => {
    const l = Math.max(0, Math.min(1, light));
    // Dim: the hands, their trails and the centre carry the light, not the body.
    bodyMat.opacity = 0.18 + 0.42 * l;
    bodyMat.color.copy(BODY).multiplyScalar(0.3 + 0.25 * l);
  };

  apply({ lean: 0, twist: 0, crouch: 0, arms: [{ raise: 0.15, spread: 0.12, bend: 0.15 }, { raise: 0.15, spread: 0.12, bend: 0.15 }] });
  return { group, apply: (p: Pose) => apply(p), animate, hands, setCentre, setBody };
}
