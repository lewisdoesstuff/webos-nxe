#!/usr/bin/env node
// Writes app/src/avatar/fixture.glb: a blocky rigged figure carrying four of
// the console's idle clips under their own names, for running the avatar
// renderer without a 360sona export.
//
//   node tools/avatar-fixture.mjs

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Euler,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Scene,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  VectorKeyframeTrack,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.();
    });
  }
};

// name, parent, world joint position
const JOINTS = [
  ["root", null, [0, 0, 0]],
  ["hips", "root", [0, 0.92, 0]],
  ["spine", "hips", [0, 1.1, 0]],
  ["head", "spine", [0, 1.5, 0]],
  ["armL", "spine", [-0.24, 1.44, 0]],
  ["foreL", "armL", [-0.24, 1.16, 0]],
  ["armR", "spine", [0.24, 1.44, 0]],
  ["foreR", "armR", [0.24, 1.16, 0]],
  ["legL", "hips", [-0.1, 0.9, 0]],
  ["shinL", "legL", [-0.1, 0.46, 0]],
  ["legR", "hips", [0.1, 0.9, 0]],
  ["shinR", "legR", [0.1, 0.46, 0]],
];

// joint, box size, box centre, colour
const PARTS = [
  ["hips", [0.34, 0.2, 0.2], [0, 0.95, 0], [0.18, 0.2, 0.3]],
  ["spine", [0.4, 0.42, 0.22], [0, 1.26, 0], [0.55, 0.75, 0.1]],
  ["head", [0.3, 0.34, 0.3], [0, 1.7, 0], [0.93, 0.78, 0.66]],
  ["armL", [0.1, 0.3, 0.1], [-0.27, 1.3, 0], [0.55, 0.75, 0.1]],
  ["foreL", [0.09, 0.3, 0.09], [-0.27, 1.02, 0], [0.93, 0.78, 0.66]],
  ["armR", [0.1, 0.3, 0.1], [0.27, 1.3, 0], [0.55, 0.75, 0.1]],
  ["foreR", [0.09, 0.3, 0.09], [0.27, 1.02, 0], [0.93, 0.78, 0.66]],
  ["legL", [0.14, 0.44, 0.14], [-0.1, 0.68, 0], [0.18, 0.2, 0.3]],
  ["shinL", [0.13, 0.46, 0.13], [-0.1, 0.23, 0.02], [0.18, 0.2, 0.3]],
  ["legR", [0.14, 0.44, 0.14], [0.1, 0.68, 0], [0.18, 0.2, 0.3]],
  ["shinR", [0.13, 0.46, 0.13], [0.1, 0.23, 0.02], [0.18, 0.2, 0.3]],
];

const index = new Map(JOINTS.map(([name], at) => [name, at]));
const world = new Map(JOINTS.map(([name, , at]) => [name, at]));
const bones = JOINTS.map(([name, parent, at]) => {
  const bone = new Bone();
  bone.name = name;
  const base = parent === null ? [0, 0, 0] : world.get(parent);
  bone.position.set(at[0] - base[0], at[1] - base[1], at[2] - base[2]);
  return bone;
});
JOINTS.forEach(([, parent], at) => {
  if (parent !== null) bones[index.get(parent)].add(bones[at]);
});

const pieces = PARTS.map(([joint, size, centre, colour]) => {
  const box = new BoxGeometry(...size).toNonIndexed();
  box.translate(...centre);
  const count = box.getAttribute("position").count;
  box.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute(
      Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? index.get(joint) : 0)),
      4,
    ),
  );
  box.setAttribute(
    "skinWeight",
    new Float32BufferAttribute(
      Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
      4,
    ),
  );
  box.setAttribute(
    "color",
    new Float32BufferAttribute(Array.from({ length: count }, () => colour).flat(), 3),
  );
  return box;
});
const geometry = mergeGeometries(pieces);
const mesh = new SkinnedMesh(
  geometry,
  new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }),
);
mesh.name = "fixture";
mesh.add(bones[0]);
mesh.bind(new Skeleton(bones));

const rad = Math.PI / 180;
function q(x, y, z) {
  return new Quaternion().setFromEuler(new Euler(x * rad, y * rad, z * rad)).toArray();
}
function turn(bone, times, eulers) {
  return new QuaternionKeyframeTrack(
    `${bone}.quaternion`,
    times,
    eulers.flatMap((e) => q(...e)),
  );
}

const clips = [
  new AnimationClip("GenericStand5", 3, [
    turn(
      "spine",
      [0, 1.5, 3],
      [
        [0, 0, 0],
        [2, 0, 1.5],
        [0, 0, 0],
      ],
    ),
    turn(
      "head",
      [0, 1.5, 3],
      [
        [0, 0, 0],
        [-3, 0, -1],
        [0, 0, 0],
      ],
    ),
    turn(
      "armL",
      [0, 1.5, 3],
      [
        [0, 0, -4],
        [0, 0, -6],
        [0, 0, -4],
      ],
    ),
    turn(
      "armR",
      [0, 1.5, 3],
      [
        [0, 0, 4],
        [0, 0, 6],
        [0, 0, 4],
      ],
    ),
  ]),
  new AnimationClip("IdleLooksAround", 4, [
    turn(
      "head",
      [0, 0.8, 1.8, 2.8, 4],
      [
        [0, 0, 0],
        [0, 40, 0],
        [0, 40, 0],
        [0, -35, 0],
        [0, 0, 0],
      ],
    ),
    turn(
      "spine",
      [0, 2, 4],
      [
        [0, 0, 0],
        [0, 8, 0],
        [0, 0, 0],
      ],
    ),
  ]),
  new AnimationClip("GenericWave", 3, [
    turn(
      "armR",
      [0, 0.5, 2.5, 3],
      [
        [0, 0, 4],
        [0, 0, 150],
        [0, 0, 150],
        [0, 0, 4],
      ],
    ),
    turn(
      "foreR",
      [0, 0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 3],
      [
        [0, 0, 0],
        [0, 0, 25],
        [0, 0, -25],
        [0, 0, 25],
        [0, 0, -25],
        [0, 0, 25],
        [0, 0, 0],
        [0, 0, 0],
      ],
    ),
    turn(
      "head",
      [0, 1, 2.5, 3],
      [
        [0, 0, 0],
        [0, 0, 6],
        [0, 0, 6],
        [0, 0, 0],
      ],
    ),
  ]),
  new AnimationClip("IdleShiftsWeight", 4, [
    new VectorKeyframeTrack("hips.position", [0, 2, 4], [0, 0.92, 0, 0.05, 0.9, 0, 0, 0.92, 0]),
    turn(
      "hips",
      [0, 2, 4],
      [
        [0, 0, 0],
        [0, 0, 5],
        [0, 0, 0],
      ],
    ),
    turn(
      "spine",
      [0, 2, 4],
      [
        [0, 0, 0],
        [0, 0, -7],
        [0, 0, 0],
      ],
    ),
    turn(
      "legL",
      [0, 2, 4],
      [
        [0, 0, 0],
        [0, 0, 5],
        [0, 0, 0],
      ],
    ),
    turn(
      "legR",
      [0, 2, 4],
      [
        [0, 0, 0],
        [0, 0, 5],
        [0, 0, 0],
      ],
    ),
  ]),
];

const scene = new Scene();
scene.add(mesh);
const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips });
const out = resolve(import.meta.dirname, "../app/src/avatar/fixture.glb");
writeFileSync(out, Buffer.from(glb));
console.log(`wrote ${out} (${glb.byteLength} bytes)`);
