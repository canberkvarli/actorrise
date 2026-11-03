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
const BODY = new THREE.Color("#a8907c");

function limb(len: number, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 6, 14), mat);
  m.position.y = -len / 2; // hangs down from its joint
  return m;
}

export type Figure = {
  group: THREE.Group;
  /** Put the body in a pose. */
  apply: (pose: Pose) => void;
  /** Hands in world space, after apply(). */
  hands: () => [THREE.Vector3, THREE.Vector3];
  /** 0 dark .. 1 burning: the centre, for a gesture taken inside. */
  setCentre: (glow: number) => void;
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
    color: new THREE.Color("#9B1C22"),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const centre = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), centreMat);
  centre.position.set(0, -0.12, 0.06);
  chest.add(centre);

  // Arms: spread (around y), a little abduction (z), raise (x), then the elbow.
  const handMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color("#F3E6DA").multiplyScalar(2.2) });
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

  const apply = (pose: Pose) => {
    const c = pose.crouch;
    // Knees bend forward as the hips drop; up on the toes lifts a little.
    const thigh = Math.max(0, c) * 1.1;
    const shin = Math.max(0, c) * 2.0;
    legs.forEach(({ hip, knee }) => {
      hip.rotation.x = -thigh;
      knee.rotation.x = shin;
    });
    const drop = 0.46 * (1 - Math.cos(thigh)) + 0.46 * (1 - Math.cos(shin - thigh));
    root.position.y = HIP_Y - drop + Math.max(0, -c) * 0.12;
    spine.rotation.x = pose.lean;
    spine.rotation.y = pose.twist;
    arms.forEach(({ side, spread, abd, raise, elbow }, i) => {
      const a = pose.arms[i];
      spread.rotation.y = side * a.spread * 0.9;
      abd.rotation.z = side * Math.max(0, a.spread) * 0.55 * Math.cos(Math.min(Math.PI / 2, a.raise));
      raise.rotation.x = -a.raise;
      elbow.rotation.x = -a.bend;
    });
    group.updateMatrixWorld(true);
  };

  const hands = (): [THREE.Vector3, THREE.Vector3] => [
    arms[0].hand.getWorldPosition(new THREE.Vector3()),
    arms[1].hand.getWorldPosition(new THREE.Vector3()),
  ];

  const setCentre = (glow: number) => {
    const g = Math.max(0, glow);
    centre.scale.setScalar(0.6 + g * 1.4);
    centreMat.color.set("#9B1C22").multiplyScalar(0.6 + g * 3.2);
  };

  const setBody = (light: number) => {
    const l = Math.max(0, Math.min(1, light));
    bodyMat.opacity = 0.22 + 0.5 * l;
    bodyMat.color.copy(BODY).multiplyScalar(0.45 + 0.35 * l);
  };

  apply({ lean: 0, twist: 0, crouch: 0, arms: [{ raise: 0.15, spread: 0.12, bend: 0.15 }, { raise: 0.15, spread: 0.12, bend: 0.15 }] });
  return { group, apply, hands, setCentre, setBody };
}
