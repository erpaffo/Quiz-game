import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getCharacter, getSkin, type CharacterKind, type SkinDef } from '../../shared/characters';
import type { PowerType } from '../../shared/types';
import { addOutline, toonMat } from './toon';

// Personaggi cartoon costruiti via codice (nessun asset esterno). Il resto del gioco usa solo
// l'interfaccia pubblica di CharacterRig: per passare a modelli .glb (Blender/Mixamo) basta
// sostituire buildModel() mantenendo le parti nominate (body, head, armL, armR, face, mouth).

export type AnimName = 'idle' | 'wave' | 'cheer' | 'dance' | 'sad' | 'hit' | 'think';

type V3 = [number, number, number];

interface MeshOpts {
  p?: V3;
  s?: V3 | number;
  r?: V3;
  outline?: number | false;
  shadow?: boolean;
}

/** Raccoglie geometrie e materiali creati, per poterli liberare con dispose(). */
class Kit {
  readonly disposables: { dispose(): void }[] = [];

  mat(color: THREE.ColorRepresentation, extra?: THREE.MeshToonMaterialParameters) {
    const m = toonMat(color, extra);
    this.disposables.push(m);
    return m;
  }

  flat(color: THREE.ColorRepresentation, extra?: THREE.MeshBasicMaterialParameters) {
    const m = new THREE.MeshBasicMaterial({ color, ...extra });
    this.disposables.push(m);
    return m;
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, o: MeshOpts = {}) {
    this.disposables.push(geo);
    const m = new THREE.Mesh(geo, mat);
    if (o.p) m.position.set(...o.p);
    if (o.s !== undefined) typeof o.s === 'number' ? m.scale.setScalar(o.s) : m.scale.set(...o.s);
    if (o.r) m.rotation.set(...o.r);
    m.castShadow = o.shadow ?? true;
    if (o.outline !== false) addOutline(m, o.outline ?? 0.022);
    parent.add(m);
    return m;
  }

  sphere(r: number, color: THREE.ColorRepresentation, parent: THREE.Object3D, o: MeshOpts = {}) {
    return this.mesh(new THREE.SphereGeometry(r, 28, 20), this.mat(color), parent, o);
  }

  capsule(r: number, len: number, color: THREE.ColorRepresentation, parent: THREE.Object3D, o: MeshOpts = {}) {
    return this.mesh(new THREE.CapsuleGeometry(r, len, 6, 14), this.mat(color), parent, o);
  }
}

interface Parts {
  model: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  face: THREE.Group;
  mouth: THREE.Mesh;
  selfie: THREE.Mesh;
}

const HEAD_Y = 1.28;
const HEAD_R = 0.6;

function starShape(outer: number, inner: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    i === 0 ? s.moveTo(Math.cos(a) * r, Math.sin(a) * r) : s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

function buildModel(k: Kit, kind: CharacterKind, skin: SkinDef): Parts {
  const c = skin.colors;
  const robot = kind === 'robot';
  const model = new THREE.Group();
  const body = new THREE.Group();
  model.add(body);

  // --- gambe, bacino, busto
  for (const sx of [-1, 1]) {
    k.capsule(0.12, 0.26, c.pants, body, { p: [0.17 * sx, 0.32, 0] });
    k.sphere(0.15, robot ? c.hair : '#2b2d42', body, { p: [0.17 * sx, 0.1, 0.06], s: [1, 0.6, 1.4] });
  }
  k.sphere(0.4, c.pants, body, { p: [0, 0.6, 0], s: [1, 0.62, 0.85] });
  k.sphere(0.42, c.body, body, { p: [0, 0.9, 0], s: [1, 1.05, 0.85] });
  k.mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 28), k.mat(c.accent), body, { p: [0, 0.68, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1] });

  // --- braccia (pivot sulla spalla, il braccio pende verso -Y)
  const arm = (sx: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.38 * sx, 1.13, 0);
    body.add(pivot);
    k.capsule(0.09, 0.3, c.body, pivot, { p: [0.05 * sx, -0.22, 0], r: [0, 0, 0.18 * sx] });
    k.sphere(0.12, robot ? c.hair : c.skin, pivot, { p: [0.1 * sx, -0.48, 0] });
    return pivot;
  };
  const armL = arm(-1);
  const armR = arm(1);

  // --- testa
  const head = new THREE.Group();
  head.position.set(0, HEAD_Y, 0);
  body.add(head);
  const face = new THREE.Group();
  head.add(face);
  let mouth: THREE.Mesh;
  let selfie: THREE.Mesh;
  const selfieMat = k.flat('#ffffff');

  if (robot) {
    k.mesh(new RoundedBoxGeometry(1.1, 0.92, 0.92, 4, 0.18), k.mat(c.skin), head, { p: [0, 0.52, 0] });
    for (const sx of [-1, 1]) {
      k.mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 18), k.mat(c.hair), head, { p: [0.58 * sx, 0.52, 0], r: [0, 0, Math.PI / 2] });
      k.mesh(new THREE.SphereGeometry(0.11, 18, 14), k.flat(c.accent), face, { p: [0.22 * sx, 0.6, 0.45], s: [1, 1, 0.5], outline: 0.015 });
    }
    k.mesh(new RoundedBoxGeometry(0.46, 0.14, 0.06, 2, 0.03), k.mat(c.hair), face, { p: [0, 0.3, 0.46] });
    mouth = k.mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 16, Math.PI), k.flat(c.accent), face, { p: [0, 0.31, 0.5], r: [0, 0, Math.PI], outline: false });
    selfie = k.mesh(new THREE.PlaneGeometry(0.84, 0.7), selfieMat, head, { p: [0, 0.52, 0.465], outline: false, shadow: false });
  } else {
    k.sphere(HEAD_R, c.skin, head, { p: [0, 0.55, 0], s: [1, 0.95, 0.95] });
    for (const sx of [-1, 1]) {
      k.sphere(0.12, c.skin, head, { p: [0.59 * sx, 0.52, 0], s: [0.6, 1, 0.8] });
      k.sphere(0.15, '#ffffff', face, { p: [0.21 * sx, 0.63, 0.47], s: [1, 1.18, 0.6], outline: 0.015 });
      k.mesh(new THREE.SphereGeometry(0.075, 14, 10), k.flat('#14101f'), face, { p: [0.21 * sx, 0.61, 0.55], outline: false });
      k.capsule(0.03, 0.12, c.hair, face, { p: [0.21 * sx, 0.86, 0.5], r: [0, 0, Math.PI / 2 + 0.18 * sx], outline: 0.01 });
    }
    k.sphere(0.1, c.skin, face, { p: [0, 0.5, 0.58], s: [1, 0.9, 1] });
    mouth = k.mesh(new THREE.TorusGeometry(0.12, 0.028, 8, 20, Math.PI), k.flat('#7a1f2b'), face, { p: [0, 0.33, 0.52], r: [0, 0, Math.PI], outline: false });
    // Calotta sferica frontale su cui viene proiettato il selfie (come in Sapere è Potere).
    const cap = new THREE.SphereGeometry(HEAD_R * 1.012, 32, 20, Math.PI / 2 - 0.78, 1.56, Math.PI / 2 - 0.72, 1.4);
    selfie = k.mesh(cap, selfieMat, head, { p: [0, 0.55, 0], s: [1, 0.95, 0.95], outline: false, shadow: false });
  }
  selfie.visible = false;

  addAccessories(k, kind, skin, { body, head, face, armR });
  return { model, body, head, armL, armR, face, mouth, selfie };
}

/** Calotta di capelli: porzione superiore di sfera inclinata all'indietro (fronte scoperta). */
function hairCap(k: Kit, color: string, head: THREE.Group, coverage = 1.15) {
  k.mesh(new THREE.SphereGeometry(HEAD_R * 1.04, 28, 14, 0, Math.PI * 2, 0, coverage), k.mat(color), head, {
    p: [0, 0.55, -0.02],
    s: [1, 0.95, 0.95],
    r: [-0.38, 0, 0]
  });
}

function glasses(k: Kit, face: THREE.Group, color = '#2b2b2b') {
  const m = k.mat(color);
  for (const sx of [-1, 1]) {
    k.mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 24), m, face, { p: [0.21 * sx, 0.63, 0.58], outline: false });
  }
  k.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8), m, face, { p: [0, 0.66, 0.6], r: [0, 0, Math.PI / 2], outline: false });
}

function bandana(k: Kit, color: string, head: THREE.Group, y = 0.82) {
  k.mesh(new THREE.TorusGeometry(HEAD_R * 0.98, 0.07, 10, 36), k.mat(color), head, { p: [0, y, 0], r: [Math.PI / 2 + 0.1, 0, 0] });
  k.sphere(0.1, color, head, { p: [0, y - 0.05, -0.62] });
  k.capsule(0.05, 0.25, color, head, { p: [0.08, y - 0.22, -0.66], r: [0.3, 0, 0.3] });
  k.capsule(0.05, 0.22, color, head, { p: [-0.08, y - 0.2, -0.66], r: [0.3, 0, -0.4] });
}

function addAccessories(
  k: Kit,
  kind: CharacterKind,
  skin: SkinDef,
  { body, head, face, armR }: { body: THREE.Group; head: THREE.Group; face: THREE.Group; armR: THREE.Group }
) {
  const c = skin.colors;
  const v = skin.variant;
  switch (kind) {
    case 'rocker': {
      if (v === 'mohawk') {
        for (let i = 0; i < 6; i++) {
          const a = -0.9 + i * 0.36;
          k.mesh(new THREE.ConeGeometry(0.1, 0.4, 10), k.mat(c.hair), head, {
            p: [0, 0.55 + Math.cos(a) * 0.62, Math.sin(a) * 0.62],
            r: [a, 0, 0]
          });
        }
      } else {
        hairCap(k, c.hair, head);
        if (v === 'glam') {
          const puffs: V3[] = [[-0.45, 0.85, -0.1], [0.45, 0.85, -0.1], [0, 1.1, -0.15], [-0.3, 1.0, 0.25], [0.3, 1.0, 0.25], [-0.55, 0.45, -0.25], [0.55, 0.45, -0.25]];
          for (const p of puffs) k.sphere(0.27, c.hair, head, { p });
          const star = new THREE.ShapeGeometry(starShape(0.2, 0.09));
          for (const sx of [-1, 1]) k.mesh(star.clone(), k.flat(c.accent, { side: THREE.DoubleSide }), face, { p: [0.21 * sx, 0.63, 0.6], outline: false });
          star.dispose();
        } else {
          k.capsule(0.2, 0.42, c.hair, head, { p: [0, 1.12, 0.32], r: [-1.15, 0, 0], s: [1.25, 1, 1] });
          // chitarra a tracolla
          const g = new THREE.Group();
          g.position.set(0.05, 0.8, 0.38);
          g.rotation.set(0.15, 0, 0.75);
          body.add(g);
          k.sphere(0.2, c.accent, g, { p: [0, -0.12, 0], s: [1, 1, 0.35] });
          k.sphere(0.15, c.accent, g, { p: [0, 0.12, 0], s: [1, 1, 0.35] });
          k.mesh(new THREE.BoxGeometry(0.07, 0.6, 0.05), k.mat('#5c3a21'), g, { p: [0, 0.48, 0] });
          k.sphere(0.05, '#1b1b1f', g, { p: [0, -0.05, 0.07], outline: false });
        }
      }
      break;
    }
    case 'astronaut': {
      hairCap(k, c.hair, head, 0.9);
      const helmet = k.mesh(
        new THREE.SphereGeometry(0.84, 32, 24),
        k.mat('#cfe8ff', { transparent: true, opacity: 0.22, depthWrite: false }),
        head,
        { p: [0, 0.55, 0], outline: false, shadow: false }
      );
      helmet.renderOrder = 2;
      k.mesh(new THREE.TorusGeometry(0.42, 0.1, 10, 28), k.mat(c.accent), head, { p: [0, -0.02, 0], r: [Math.PI / 2, 0, 0] });
      k.mesh(new RoundedBoxGeometry(0.68, 0.78, 0.3, 3, 0.08), k.mat(c.body), body, { p: [0, 0.95, -0.42] });
      k.sphere(0.07, c.accent, body, { p: [-0.18, 1.02, 0.35], s: [1, 1, 0.5], outline: 0.01 });
      if (v === 'retro') {
        k.mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), k.mat('#8d99ae'), head, { p: [0.3, 1.45, 0], r: [0, 0, -0.3] });
        k.mesh(new THREE.SphereGeometry(0.08, 14, 10), k.flat(c.accent), head, { p: [0.36, 1.65, 0] });
      }
      if (v === 'martian') {
        for (const sx of [-1, 1]) {
          k.mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8), k.mat(c.skin), head, { p: [0.22 * sx, 1.18, 0], r: [0, 0, -0.35 * sx], outline: 0.01 });
          k.mesh(new THREE.SphereGeometry(0.08, 14, 10), k.flat(c.accent), head, { p: [0.31 * sx, 1.4, 0] });
        }
      }
      break;
    }
    case 'chef': {
      if (v === 'bandana') {
        hairCap(k, c.hair, head);
        bandana(k, c.accent, head);
      } else {
        const hatColor = v === 'toque' && skin.id === 'pastry' ? '#fff0f6' : '#ffffff';
        k.mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.42, 24), k.mat(hatColor), head, { p: [0, 1.12, -0.02] });
        const puffs: V3[] = [[0, 1.45, 0], [-0.25, 1.38, 0.05], [0.25, 1.38, 0.05], [0, 1.38, -0.25], [0, 1.38, 0.25]];
        for (const p of puffs) k.sphere(0.24, hatColor, head, { p });
        k.mesh(new THREE.TorusGeometry(0.38, 0.04, 8, 28), k.mat(c.accent), head, { p: [0, 0.94, -0.02], r: [Math.PI / 2, 0, 0] });
      }
      for (const sx of [-1, 1]) {
        k.capsule(0.06, 0.2, c.hair, face, { p: [0.14 * sx, 0.43, 0.56], r: [0, 0, (Math.PI / 2 - 0.35) * sx] });
        k.sphere(0.06, c.hair, face, { p: [0.28 * sx, 0.47, 0.5] });
      }
      k.mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 20), k.mat(c.accent), body, { p: [0, 1.25, 0.05], r: [Math.PI / 2 - 0.2, 0, 0] });
      break;
    }
    case 'granny': {
      hairCap(k, c.hair, head, 1.25);
      if (v === 'afro') {
        const puffs: V3[] = [[0, 1.05, -0.1], [-0.42, 0.9, -0.15], [0.42, 0.9, -0.15], [-0.55, 0.55, -0.2], [0.55, 0.55, -0.2], [0, 0.85, -0.45], [-0.3, 1.0, 0.2], [0.3, 1.0, 0.2]];
        for (const p of puffs) k.sphere(0.32, c.hair, head, { p });
      } else {
        k.sphere(0.24, c.hair, head, { p: [0, 1.12, -0.25] });
      }
      if (v === 'ninja') bandana(k, c.accent, head, 0.88);
      glasses(k, face, v === 'disco' ? c.accent : '#3a3a3a');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        k.mesh(new THREE.SphereGeometry(0.045, 10, 8), k.mat('#fdfdfd'), body, { p: [Math.cos(a) * 0.27, 1.22 - Math.sin(a) * 0.04 - (Math.sin(a) > 0 ? 0.06 : 0), Math.sin(a) * 0.24 + 0.02], outline: 0.008 });
      }
      break;
    }
    case 'robot': {
      const antenna = (x: number, tilt: number) => {
        k.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 8), k.mat(c.hair), head, { p: [x, 1.14, 0], r: [0, 0, tilt], outline: 0.01 });
        k.mesh(new THREE.SphereGeometry(0.09, 14, 10), k.flat(c.accent), head, { p: [x - Math.sin(tilt) * 0.2, 1.34, 0] });
      };
      if (v === 'glitch') {
        antenna(-0.22, 0.3);
        antenna(0.22, -0.3);
        k.mesh(new RoundedBoxGeometry(0.9, 0.16, 0.06, 2, 0.03), k.flat(c.accent, { transparent: true, opacity: 0.55 }), face, { p: [0, 0.62, 0.48], outline: false });
      } else {
        antenna(0, 0);
      }
      k.mesh(new RoundedBoxGeometry(0.36, 0.26, 0.06, 2, 0.03), k.mat(c.hair), body, { p: [0, 0.95, 0.36] });
      for (const [x, col] of [[-0.09, c.accent], [0, '#ffd166'], [0.09, '#ef476f']] as const) {
        k.mesh(new THREE.SphereGeometry(0.035, 10, 8), k.flat(col), body, { p: [x, 0.96, 0.4], outline: false });
      }
      break;
    }
    case 'pirate': {
      hairCap(k, c.hair, head);
      if (v === 'bandana') {
        bandana(k, c.accent, head);
      } else {
        const hatColor = skin.id === 'ghost' ? '#5c677d' : '#1d1d24';
        k.mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 3), k.mat(hatColor), head, { p: [0, 1.0, 0], r: [0, Math.PI / 2, 0] });
        k.sphere(0.45, hatColor, head, { p: [0, 1.04, 0], s: [1, 0.7, 1] });
        k.mesh(new THREE.TorusGeometry(0.43, 0.04, 8, 28), k.mat(c.accent), head, { p: [0, 1.06, 0], r: [Math.PI / 2, 0, 0] });
      }
      k.sphere(0.18, '#14101f', face, { p: [-0.21, 0.63, 0.5], s: [1, 1.1, 0.5], outline: false });
      k.mesh(new THREE.TorusGeometry(HEAD_R * 0.99, 0.018, 6, 36), k.mat('#14101f'), head, { p: [0, 0.75, 0], r: [Math.PI / 2 - 0.35, 0, 0.35], outline: false });
      k.sphere(0.38, c.hair, head, { p: [0, 0.08, 0.3], s: [1, 0.6, 0.65] });
      // spadino nella mano destra
      k.mesh(new THREE.BoxGeometry(0.05, 0.55, 0.02), k.mat('#ced4da'), armR, { p: [0.1, -0.78, 0.05] });
      k.mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 14, Math.PI), k.mat(c.accent), armR, { p: [0.1, -0.52, 0.05], r: [0, 0, Math.PI] });
      break;
    }
  }
}

// ------------------------------------------------------------------ effetti dei poteri sul personaggio

function buildEffect(k: Kit, type: PowerType): THREE.Object3D {
  const g = new THREE.Group();
  g.userData.type = type;
  switch (type) {
    case 'ICE': {
      const block = k.mesh(
        new RoundedBoxGeometry(1.8, 2.75, 1.6, 4, 0.16),
        k.mat('#a5e8ff', { transparent: true, opacity: 0.5, depthWrite: false }),
        g,
        { p: [0, 1.32, 0], outline: false, shadow: false }
      );
      block.renderOrder = 3;
      for (let i = 0; i < 5; i++) {
        k.mesh(new THREE.ConeGeometry(0.08, 0.35, 6), k.mat('#e0f7ff'), g, { p: [-0.7 + i * 0.35, 2.65, 0.6], r: [Math.PI, 0, 0], outline: 0.01 });
      }
      break;
    }
    case 'GOO': {
      const spots: V3[] = [[0.2, 2.1, 0.45], [-0.3, 1.85, 0.5], [0.35, 1.55, 0.45], [-0.15, 1.0, 0.38], [0.25, 0.8, 0.35], [-0.4, 2.3, 0.1], [0.1, 2.38, 0.2]];
      spots.forEach((p, i) => {
        const blob = k.sphere(0.16 + (i % 3) * 0.05, '#5fd13a', g, { p, s: [1.2, 0.9, 0.6], outline: 0.012 });
        blob.userData.wobble = i;
        if (i % 2 === 0) {
          const drip = k.capsule(0.05, 0.18, '#4fbf2c', g, { p: [p[0], p[1] - 0.2, p[2] + 0.02], outline: 0.01 });
          drip.userData.wobble = i + 10;
        }
      });
      break;
    }
    case 'BOMB': {
      const ring = new THREE.Group();
      ring.position.y = 2.45;
      ring.userData.spin = true;
      g.add(ring);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const b = new THREE.Group();
        b.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8);
        ring.add(b);
        k.sphere(0.15, '#1f1f24', b);
        k.mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), k.mat('#c9a227'), b, { p: [0, 0.18, 0], outline: false });
        const spark = k.mesh(new THREE.SphereGeometry(0.05, 8, 6), k.flat('#ffb703'), b, { p: [0, 0.26, 0], outline: false });
        spark.userData.flicker = i;
      }
      break;
    }
    case 'LOCK': {
      const lock = new THREE.Group();
      lock.position.set(0, 1.05, 0.62);
      lock.userData.swing = true;
      g.add(lock);
      k.mesh(new RoundedBoxGeometry(0.52, 0.42, 0.18, 3, 0.06), k.mat('#f5b82e'), lock);
      k.mesh(new THREE.TorusGeometry(0.17, 0.05, 8, 18, Math.PI), k.mat('#adb5bd'), lock, { p: [0, 0.2, 0] });
      k.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), k.flat('#14101f'), lock, { p: [0, 0.02, 0.1], r: [Math.PI / 2, 0, 0], outline: false });
      for (let i = 0; i < 6; i++) {
        k.mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), k.mat('#8d99ae'), g, {
          p: [-0.45 + i * 0.18, 0.95 + (i % 2) * 0.03, 0.55 - Math.abs(i - 2.5) * 0.05],
          r: [0, i % 2 ? Math.PI / 2 : 0, 0],
          outline: 0.008
        });
      }
      break;
    }
  }
  return g;
}

// ------------------------------------------------------------------ rig pubblico

const textureLoader = new THREE.TextureLoader();

export class CharacterRig {
  readonly root = new THREE.Group();
  characterId: CharacterKind;
  skinId: string;

  private kit = new Kit();
  private parts!: Parts;
  private anim: AnimName = 'idle';
  private prevAnim: AnimName = 'idle';
  private animStart = 0;
  private t = Math.random() * 10;
  private effects = new Map<PowerType, { obj: THREE.Object3D; kit: Kit }>();
  private selfieUrl: string | null = null;
  private selfieTex: THREE.Texture | null = null;

  constructor(characterId: string, skinId: string) {
    const def = getCharacter(characterId) ?? getCharacter('rocker')!;
    this.characterId = def.id;
    this.skinId = getSkin(def.id, skinId) ? skinId : def.skins[0].id;
    this.build();
  }

  private build() {
    const skin = getSkin(this.characterId, this.skinId)!;
    this.parts = buildModel(this.kit, this.characterId, skin);
    this.root.add(this.parts.model);
    this.applySelfie();
  }

  /** Cambia personaggio e/o skin ricostruendo il modello (gli effetti attivi restano). */
  setLook(characterId: string, skinId: string) {
    if (characterId === this.characterId && skinId === this.skinId) return;
    const def = getCharacter(characterId);
    if (!def || !getSkin(characterId, skinId)) return;
    this.root.remove(this.parts.model);
    this.kit.disposables.forEach((d) => d.dispose());
    this.kit = new Kit();
    this.characterId = def.id;
    this.skinId = skinId;
    this.build();
  }

  setSelfie(dataUrl: string | null) {
    if (dataUrl === this.selfieUrl) return;
    this.selfieUrl = dataUrl;
    this.selfieTex?.dispose();
    this.selfieTex = null;
    if (dataUrl) {
      this.selfieTex = textureLoader.load(dataUrl);
      this.selfieTex.colorSpace = THREE.SRGBColorSpace;
    }
    this.applySelfie();
  }

  private applySelfie() {
    const { selfie, face } = this.parts;
    const mat = selfie.material as THREE.MeshBasicMaterial;
    mat.map = this.selfieTex;
    mat.needsUpdate = true;
    selfie.visible = !!this.selfieTex;
    // Con il selfie la faccia disegnata sparisce (resta la bocca solo per il robot).
    face.visible = !this.selfieTex;
  }

  play(anim: AnimName) {
    if (anim === this.anim && anim !== 'hit') return;
    if (anim === 'hit' && this.anim !== 'hit') this.prevAnim = this.anim;
    this.anim = anim;
    this.animStart = this.t;
  }

  get currentAnim() {
    return this.anim;
  }

  setEffects(types: PowerType[]) {
    for (const [type, e] of this.effects) {
      if (!types.includes(type)) {
        this.root.remove(e.obj);
        e.kit.disposables.forEach((d) => d.dispose());
        this.effects.delete(type);
      }
    }
    for (const type of types) {
      if (this.effects.has(type)) continue;
      const kit = new Kit();
      const obj = buildEffect(kit, type);
      obj.scale.setScalar(0.01);
      this.root.add(obj);
      this.effects.set(type, { obj, kit });
    }
  }

  hasEffect(type: PowerType) {
    return this.effects.has(type);
  }

  /** Posizione mondo sopra la testa (per etichette e proiettili). */
  headWorldPosition(target = new THREE.Vector3()) {
    return this.parts.head.getWorldPosition(target).add(new THREE.Vector3(0, 0.55 * this.root.scale.y, 0));
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const lt = t - this.animStart;
    const { body, head, armL, armR, mouth } = this.parts;

    // Effetti: comparsa elastica + animazioni proprie.
    for (const { obj } of this.effects.values()) {
      const s = obj.scale.x;
      if (s < 1) obj.scale.setScalar(Math.min(1, s + dt * 4 * (1.2 - s)));
      obj.traverse((o) => {
        if (o.userData.wobble !== undefined) o.scale.y = 0.9 + Math.sin(t * 3 + o.userData.wobble) * 0.12;
        if (o.userData.spin) o.rotation.y += dt * 2.2;
        if (o.userData.flicker !== undefined) o.scale.setScalar(0.7 + Math.abs(Math.sin(t * 18 + o.userData.flicker)) * 0.7);
        if (o.userData.swing) o.rotation.z = Math.sin(t * 2.5) * 0.15;
      });
    }

    // Congelato: la posa resta ferma.
    if (this.effects.has('ICE')) return;

    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    armL.rotation.set(0, 0, -0.08);
    armR.rotation.set(0, 0, 0.08);
    mouth.rotation.z = Math.PI;
    mouth.scale.set(1, 1, 1);

    const breathe = Math.sin(t * 2.2);
    switch (this.anim) {
      case 'idle':
        body.position.y = Math.abs(breathe) * 0.035;
        head.rotation.z = Math.sin(t * 1.3) * 0.06;
        armL.rotation.z = -0.1 - breathe * 0.05;
        armR.rotation.z = 0.1 + breathe * 0.05;
        break;
      case 'wave':
        body.position.y = Math.abs(breathe) * 0.035;
        head.rotation.z = -0.12;
        armR.rotation.z = 2.5 + Math.sin(t * 11) * 0.35;
        break;
      case 'think':
        armR.rotation.set(-1.3, 0, 1.2);
        head.rotation.set(-0.1, 0, 0.15 + Math.sin(t * 2) * 0.04);
        mouth.scale.set(0.6, 0.4, 1);
        break;
      case 'cheer': {
        const j = Math.abs(Math.sin(t * 7));
        body.position.y = j * 0.32;
        armL.rotation.z = -2.6 - j * 0.25;
        armR.rotation.z = 2.6 + j * 0.25;
        head.rotation.x = -0.15;
        mouth.scale.set(1.3, 1.6, 1);
        break;
      }
      case 'dance': {
        const j = Math.abs(Math.sin(t * 6));
        body.position.y = j * 0.2;
        body.rotation.y = Math.sin(t * 3) * 0.7;
        body.rotation.z = Math.sin(t * 6) * 0.1;
        armL.rotation.z = -1.5 - Math.sin(t * 6) * 1.1;
        armR.rotation.z = 1.5 - Math.sin(t * 6) * 1.1;
        mouth.scale.set(1.3, 1.6, 1);
        break;
      }
      case 'sad':
        head.rotation.x = 0.35;
        head.rotation.z = Math.sin(t * 1.2) * 0.05;
        body.rotation.x = 0.1;
        armL.rotation.z = 0.05;
        armR.rotation.z = -0.05;
        mouth.rotation.z = 0;
        break;
      case 'hit': {
        const k = Math.max(0, 1 - lt / 0.7);
        body.rotation.z = Math.sin(lt * 55) * 0.18 * k;
        body.position.y = Math.sin(Math.min(1, lt / 0.25) * Math.PI) * 0.25;
        head.rotation.x = -0.3 * k;
        armL.rotation.z = -1.2 * k;
        armR.rotation.z = 1.2 * k;
        mouth.rotation.z = 0;
        mouth.scale.set(0.8, 1.4, 1);
        if (lt > 0.7) this.play(this.prevAnim === 'hit' ? 'idle' : this.prevAnim);
        break;
      }
    }
  }

  dispose() {
    this.kit.disposables.forEach((d) => d.dispose());
    for (const e of this.effects.values()) e.kit.disposables.forEach((d) => d.dispose());
    this.effects.clear();
    this.selfieTex?.dispose();
    this.root.removeFromParent();
  }
}
