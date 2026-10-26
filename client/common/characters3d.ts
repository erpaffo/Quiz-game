import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getCharacter, getSkin, lookKey, resolveLook, type CharacterKind, type CustomChoice, type ResolvedLook } from '../../shared/characters';
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

  /** Texture disegnata su canvas (scritte su biglietti, copertine, stampe). */
  canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.disposables.push(t);
    return t;
  }

  /** Cartoncino piatto con una texture (biglietti, carte, copertine). */
  card(w: number, h: number, tex: THREE.Texture, parent: THREE.Object3D, o: MeshOpts = {}) {
    return this.mesh(new THREE.PlaneGeometry(w, h), this.flat('#ffffff', { map: tex, side: THREE.DoubleSide }), parent, { ...o, outline: false, shadow: false });
  }
}

/** Testo centrato su più righe, ridotto finché non entra in larghezza. */
function writeLines(g: CanvasRenderingContext2D, w: number, h: number, lines: string[], color: string, weight = 900) {
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  lines.forEach((line, i) => {
    let size = Math.floor(h / (lines.length + 0.6));
    do {
      g.font = `${weight} ${size}px Baloo 2, Arial, sans-serif`;
      size -= 2;
    } while (g.measureText(line).width > w * 0.88 && size > 8);
    g.fillText(line, w / 2, (h * (i + 1)) / (lines.length + 1));
  });
}

/** Posa di riposo (animazione idle) scelta dagli oggetti in mano. */
type Pose = 'normal' | 'read' | 'readL' | 'raise';
/** Espressione a riposo: la bocca è un arco (sorriso) che si schiaccia o si allarga. */
type Mood = 'normal' | 'happy' | 'worried' | 'serious' | 'smirk' | 'smile';

interface Parts {
  model: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  face: THREE.Group;
  mouth: THREE.Mesh;
  pose: Pose;
  mood: Mood;
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

function buildModel(k: Kit, kind: CharacterKind, look: ResolvedLook): Parts {
  const c = look.colors;
  const robot = kind === 'robot';
  // Corporatura: Sandro è robusto (W > 1), Basso è piccolo (si rimpicciolisce tutto tranne la testa);
  // gli amici hanno le misure in PLANS (busto, forma della testa, occhi, sopracciglia).
  const plan = PLANS[kind];
  const W = plan?.w ?? 1;
  const model = new THREE.Group();
  const body = new THREE.Group();
  model.add(body);

  // --- gambe, bacino, busto
  for (const sx of [-1, 1]) {
    k.capsule(0.12 * (W > 1 ? 1.15 : 1), 0.26, c.pants, body, { p: [0.17 * W * sx, 0.32, 0] });
    k.sphere(0.15, robot ? c.hair : '#2b2d42', body, { p: [0.17 * W * sx, 0.1, 0.06], s: [1, 0.6, 1.4] });
  }
  k.sphere(0.4, c.pants, body, { p: [0, 0.6, 0], s: [W, 0.62, 0.85 * W] });
  k.sphere(0.42, c.body, body, { p: [0, 0.9, 0], s: [W, 1.05, 0.85 * W] });
  if (kind === 'sandro') k.sphere(0.3, c.body, body, { p: [0, 0.8, 0.13], s: [1.05, 0.95, 0.9] }); // pancia
  k.mesh(new THREE.TorusGeometry(0.36 * W, 0.05, 8, 28), k.mat(c.accent), body, { p: [0, 0.68, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1] });

  // --- braccia (pivot sulla spalla, il braccio pende verso -Y)
  const arm = (sx: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.38 * W * sx, 1.13, 0);
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

  if (robot) {
    k.mesh(new RoundedBoxGeometry(1.1, 0.92, 0.92, 4, 0.18), k.mat(c.skin), head, { p: [0, 0.52, 0] });
    for (const sx of [-1, 1]) {
      k.mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 18), k.mat(c.hair), head, { p: [0.58 * sx, 0.52, 0], r: [0, 0, Math.PI / 2] });
      k.mesh(new THREE.SphereGeometry(0.11, 18, 14), k.flat(c.accent), face, { p: [0.22 * sx, 0.6, 0.45], s: [1, 1, 0.5], outline: 0.015 });
    }
    k.mesh(new RoundedBoxGeometry(0.46, 0.14, 0.06, 2, 0.03), k.mat(c.hair), face, { p: [0, 0.3, 0.46] });
    mouth = k.mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 16, Math.PI), k.flat(c.accent), face, { p: [0, 0.31, 0.5], r: [0, 0, Math.PI], outline: false });
  } else {
    const hsc: V3 = plan?.head ?? [1, 0.95, 0.95];
    k.sphere(HEAD_R, c.skin, head, { p: [0, 0.55, 0], s: hsc });
    for (const sx of [-1, 1]) {
      k.sphere(0.12, c.skin, head, { p: [0.59 * hsc[0] * sx, 0.52, 0], s: [0.6, 1, 0.8] });
      k.sphere(0.15, '#ffffff', face, { p: [0.21 * sx, 0.63, 0.47], s: [1, 1.18, 0.6], outline: 0.015 });
      if (plan?.iris) {
        // occhi chiari: iride colorata con una pupilla scura al centro
        k.mesh(new THREE.SphereGeometry(0.09, 14, 10), k.flat(plan.iris), face, { p: [0.21 * sx, 0.61, 0.545], outline: false });
        k.mesh(new THREE.SphereGeometry(0.045, 12, 8), k.flat('#14101f'), face, { p: [0.21 * sx, 0.61, 0.6], outline: false });
      } else {
        k.mesh(new THREE.SphereGeometry(0.075, 14, 10), k.flat('#14101f'), face, { p: [0.21 * sx, 0.61, 0.55], outline: false });
      }
      // sopracciglia: con l'espressione preoccupata si alzano verso il centro
      const brow = look.traits.mood === 'worried' ? -0.38 * sx : (plan?.browTilt ?? 0.18) * sx;
      k.capsule(plan?.brow ?? 0.03, 0.12, c.hair, face, { p: [0.21 * sx, 0.86, 0.5], r: [0, 0, Math.PI / 2 + brow], outline: 0.01 });
    }
    k.sphere(0.1, c.skin, face, { p: [0, 0.5, 0.58], s: [1, 0.9, 1] });
    mouth = k.mesh(new THREE.TorusGeometry(0.12, 0.028, 8, 20, Math.PI), k.flat('#7a1f2b'), face, { p: [0, 0.33, 0.52], r: [0, 0, Math.PI], outline: false });
  }

  const { pose = 'normal', mood = 'normal' } = addAccessories(k, kind, look, { body, head, face, armL, armR, mouth }) ?? {};
  if (kind === 'basso') {
    model.scale.setScalar(0.68);
    head.scale.setScalar(1.32);
  } else if (plan?.scale) {
    model.scale.setScalar(plan.scale);
  }
  return { model, body, head, armL, armR, face, mouth, pose, mood };
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
  look: ResolvedLook,
  { body, head, face, armL, armR, mouth }: Friend
): { pose?: Pose; mood?: Mood } | void {
  const c = look.colors;
  const skin = look.skin;
  const v = skin.variant;
  switch (kind) {
    case 'sandro':
      return sandro(k, look, { body, head, face, armL, armR });
    case 'basso':
      return basso(k, look, { body, head, face, armR });
    case 'samuele':
      return samuele(k, look, { body, head, face, armL, armR, mouth });
    case 'valerio':
      return valerio(k, look, { body, head, face, armL, armR, mouth });
    case 'paffo':
      return paffo(k, look, { body, head, face, armL, armR, mouth });
    case 'pacio':
      return pacio(k, look, { body, head, face, armL, armR, mouth });
    case 'j':
      return jay(k, look, { body, head, face, armL, armR, mouth });
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

// ------------------------------------------------------------------ Sandro e Basso

type Rig = { body: THREE.Group; head: THREE.Group; face: THREE.Group; armL: THREE.Group; armR: THREE.Group };
/** Rig completo, con la bocca (Valerio ci attacca i denti). */
type Friend = Rig & { mouth: THREE.Mesh };

/**
 * Sandro: capelli scuri corti, sopracciglia marcate, barba e baffi ben definiti, fisico robusto a torso nudo
 * con il petto villoso, espressione rilassata. Gratta e vinci, schedine, carte e fiches restano come oggetti facoltativi.
 */
function sandro(k: Kit, look: ResolvedLook, { body, head, face, armL, armR }: Rig): { pose: Pose; mood: Mood } {
  const c = look.colors;
  const t = look.traits;
  hairCapFit(k, c.hair, head, PLANS.sandro!.head, 1.1, { grow: 1.045, tilt: -0.36 });
  if (t.beard === 'full') {
    // barba folta con baffi marcati e basette
    beardShell(k, face, c.hair, { sideburns: true, mustache: true, stache: 0.05 });
    k.sphere(0.16, c.hair, face, { p: [0, 0.12, 0.4], s: [1.5, 0.8, 0.8], outline: 0.01 });
  } else if (t.beard === 'short') {
    beardShell(k, face, shade(c.hair, -0.1), { sideburns: true, mustache: true });
  }
  if (t.chest === 'hairy') chestHair(k, body, c.hair, PLANS.sandro!.w);
  if (t.glasses === 'yes') glasses(k, face, '#2b2b2b');
  if (t.mood === 'worried') {
    // goccia di sudore sulla tempia
    k.sphere(0.07, '#8fd3ff', head, { p: [0.5, 0.82, 0.3], s: [0.8, 1.3, 0.6], outline: 0.008 });
  }
  // espressione rilassata = sorriso disteso
  const mood = (t.mood === 'normal' ? 'smile' : t.mood) as Mood;

  // tasca dei jeans (a destra) con fiches o carte che spuntano
  const pocket = new THREE.Group();
  pocket.position.set(0.27, 0.55, 0.31);
  pocket.rotation.y = 0.55;
  body.add(pocket);
  if (t.pocket !== 'none') k.mesh(new RoundedBoxGeometry(0.2, 0.14, 0.03, 2, 0.02), k.mat(shade(c.pants, -0.25)), pocket, { outline: 0.008 });
  if (t.pocket === 'chips') {
    const colors = ['#e63946', '#1d1d24', '#f1f3f5', '#2a9d8f'];
    colors.forEach((col, i) => {
      const chip = k.mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.022, 18), k.mat(col), pocket, { p: [-0.05 + i * 0.035, 0.08 + i * 0.025, 0.02], r: [Math.PI / 2, 0, 0.25 - i * 0.18], outline: 0.006 });
      k.mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 18), k.flat('#ffd60a'), chip, { p: [0, 0.012, 0], r: [Math.PI / 2, 0, 0], outline: false });
    });
  }
  if (t.pocket === 'cards') {
    const back = cardBack(k);
    k.card(0.12, 0.17, back, pocket, { p: [-0.03, 0.1, 0.02], r: [0, 0, 0.2] });
    k.card(0.12, 0.17, back, pocket, { p: [0.04, 0.12, 0.025], r: [0, 0, -0.15] });
  }

  if (t.hands === 'tickets') {
    // ventaglio di gratta e vinci e biglietti della lotteria nella mano destra
    const fan = new THREE.Group();
    fan.position.set(0.14, -0.6, 0.12);
    armR.add(fan);
    const tickets: [string[], string, string][] = [
      [['LOTTERIA', 'N° 07734'], '#4361ee', '#ffffff'],
      [['VINCI!', '€ €  €'], '#ffd60a', '#d62828'],
      [['GRATTA', 'E VINCI'], '#06d6a0', '#14101f']
    ];
    tickets.forEach(([lines, bg, fg], i) => {
      const tex = k.canvas(256, 160, (g, w, h) => {
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        g.strokeStyle = fg;
        g.lineWidth = 8;
        g.setLineDash([14, 8]);
        g.strokeRect(10, 10, w - 20, h - 20);
        writeLines(g, w, h, lines, fg);
      });
      k.card(0.3, 0.19, tex, fan, { p: [(i - 1) * 0.07, (1 - Math.abs(i - 1)) * 0.03, i * 0.012], r: [0, 0, (1 - i) * 0.32] });
    });
    return { pose: 'normal', mood };
  }
  if (t.hands === 'slip') {
    // schedina da controllare nella mano sinistra, carte da gioco nella destra
    const slipTex = k.canvas(192, 288, (g, w, h) => {
      g.fillStyle = '#fffdf2';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d62828';
      g.fillRect(0, 0, w, 54);
      writeLines(g, w, 54, ['SCHEDINA'], '#ffffff');
      g.fillStyle = '#14101f';
      g.font = '700 30px Arial, sans-serif';
      g.textAlign = 'left';
      ['1  X  2', 'X  1  1', '2  2  X', '1  X  1'].forEach((r, i) => g.fillText(r, 24, 96 + i * 38));
      g.fillStyle = '#d62828';
      g.font = '900 30px Arial, sans-serif';
      g.fillText('QUOTA 87', 24, 262);
    });
    const slip = new THREE.Group();
    slip.position.set(-0.08, -0.62, 0.02);
    // ordine ZYX: annulla l'inclinazione del braccio e lascia la schedina rivolta verso lo schermo
    slip.rotation.set(Math.PI / 2 - 0.5, 0, -0.3, 'ZYX');
    armL.add(slip);
    k.card(0.2, 0.3, slipTex, slip);

    const fan = new THREE.Group();
    fan.position.set(0.13, -0.58, 0.12);
    armR.add(fan);
    ['A♠', 'K♥', 'Q♦'].forEach((label, i) => {
      const red = label.includes('♥') || label.includes('♦');
      const tex = k.canvas(128, 180, (g, w, h) => {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#adb5bd';
        g.lineWidth = 6;
        g.strokeRect(3, 3, w - 6, h - 6);
        writeLines(g, w, h, [label], red ? '#d62828' : '#14101f');
      });
      k.card(0.13, 0.18, tex, fan, { p: [(i - 1) * 0.045, 0, i * 0.01], r: [0, 0, (1 - i) * 0.3] });
    });
    return { pose: 'readL', mood };
  }
  return { pose: 'normal', mood };
}

/** Basso, il fan degli anime: piccolo, biondo, felpa a tema, manga o action figure. */
function basso(k: Kit, look: ResolvedLook, { body, head, face, armR }: Pick<Rig, 'body' | 'head' | 'face' | 'armR'>): { pose: Pose; mood: Mood } {
  const c = look.colors;
  const t = look.traits;
  const dynamic = t.pose === 'dynamic';

  // capelli: corti a punte (stile anime) o con il codino
  hairCap(k, c.hair, head, 1.12);
  const spikes: [number, number, number, number][] = [[-0.3, 1.08, 0.32, -0.5], [0, 1.15, 0.38, 0], [0.3, 1.08, 0.32, 0.5], [-0.15, 1.18, 0.1, -0.2], [0.15, 1.18, 0.1, 0.2]];
  for (const [x, y, z, tilt] of spikes) k.mesh(new THREE.ConeGeometry(0.11, 0.3, 8), k.mat(c.hair), head, { p: [x, y, z], r: [0.9, 0, -tilt] });
  // barbetta: per far capire che è un adulto anche se è piccolo
  if (t.beard === 'light') beardShell(k, face, shade(c.hair, -0.35), { light: true });
  if (t.hair === 'tail') {
    k.sphere(0.06, c.accent, head, { p: [0, 0.92, -0.58] });
    k.capsule(0.08, 0.3, c.hair, head, { p: [0, 0.7, -0.68], r: [0.45, 0, 0] });
  }

  // felpa: cappuccio, laccetti e tasca
  k.mesh(new THREE.TorusGeometry(0.27, 0.1, 10, 24), k.mat(c.body), body, { p: [0, 1.2, -0.12], r: [-(Math.PI / 2 - 0.35), 0, 0] });
  for (const sx of [-1, 1]) k.capsule(0.015, 0.16, '#f1f3f5', body, { p: [0.07 * sx, 1.07, 0.34], outline: 0.004 });
  k.mesh(new RoundedBoxGeometry(0.4, 0.14, 0.04, 2, 0.03), k.mat(shade(c.body, -0.18)), body, { p: [0, 0.74, 0.31], r: [-0.25, 0, 0], outline: 0.008 });
  if (t.print !== 'none') {
    const tex = k.canvas(256, 256, (g, w, h) => (t.print === 'robot' ? drawRobotPrint(g, w, h, c.accent) : drawStarPrint(g, w, h, c.accent)));
    const m = k.card(0.28, 0.28, tex, body, { p: [0, 0.97, 0.37], r: [-0.12, 0, 0] });
    (m.material as THREE.MeshBasicMaterial).transparent = true;
  }

  // borsa a tracolla con spille e portachiavi
  if (t.bag === 'yes') {
    const strap = k.mesh(new THREE.TorusGeometry(0.47, 0.025, 6, 40), k.mat('#3a3a46'), body, { p: [0, 0.9, 0], outline: 0.006 });
    strap.rotation.set(0, Math.PI / 2, 0.62, 'ZYX');
    strap.scale.set(0.8, 1, 1); // aderente al busto davanti e dietro
    const bag = new THREE.Group();
    bag.position.set(0.42, 0.52, 0.12);
    bag.rotation.y = 0.6;
    body.add(bag);
    k.mesh(new RoundedBoxGeometry(0.32, 0.26, 0.12, 3, 0.04), k.mat('#3a3a46'), bag);
    k.mesh(new RoundedBoxGeometry(0.33, 0.1, 0.13, 2, 0.03), k.mat('#4a4a58'), bag, { p: [0, 0.09, 0.005], outline: false });
    const pins = ['#ff4fb8', '#ffd60a', '#06d6a0', '#4361ee', '#e63946', '#ffffff'];
    pins.forEach((col, i) => {
      const x = -0.1 + (i % 3) * 0.1;
      const y = i < 3 ? 0.0 : -0.08;
      k.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 14), k.mat(col), bag, { p: [x, y, 0.065], r: [Math.PI / 2, 0, 0], outline: 0.005 });
    });
    // portachiavi che pendono
    for (const [x, col] of [[-0.08, '#ff9f1c'], [0.06, '#80ffdb']] as const) {
      k.mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12), k.mat('#c0c0c0'), bag, { p: [x, -0.15, 0.04], outline: false });
      k.sphere(0.045, col, bag, { p: [x, -0.21, 0.05], outline: 0.006 });
    }
  }

  // oggetto in mano: manga o action figure
  if (t.hands === 'manga') {
    const holder = new THREE.Group();
    armR.add(holder);
    if (dynamic) {
      holder.position.set(0.2, -0.6, 0.05);
      holder.rotation.set(0, 0, -2.3);
    } else {
      // tenuto aperto davanti al petto, con la copertina verso lo schermo
      holder.position.set(-0.25, -0.55, 0);
      holder.rotation.set(Math.PI / 2 - 0.5, 0, 0.3, 'ZYX');
    }
    const cover = k.canvas(200, 280, (g, w, h) => drawMangaCover(g, w, h, c.accent));
    k.mesh(new THREE.BoxGeometry(0.25, 0.34, 0.035), k.mat('#fdfdfd'), holder, { outline: 0.008 });
    k.card(0.25, 0.34, cover, holder, { p: [0, 0, 0.02] });
  } else if (t.hands === 'figure') {
    const fig = new THREE.Group();
    armR.add(fig);
    if (dynamic) {
      fig.position.set(0.19, -0.56, 0.04);
      fig.rotation.set(0, 0, -2.3);
    } else {
      fig.position.set(0.12, -0.5, 0.14);
    }
    actionFigure(k, fig, c.accent);
  }
  const holding = t.hands === 'manga' || t.hands === 'figure';
  return { pose: dynamic ? 'raise' : t.hands === 'manga' ? 'read' : 'normal', mood: dynamic || holding ? 'happy' : 'normal' };
}

/**
 * Barba sul mento e sulla mascella (sotto la bocca), più basette e baffetti a scelta.
 * Sta nel gruppo `face`, quindi sparisce con il selfie come il resto del viso disegnato.
 */
function beardShell(k: Kit, face: THREE.Group, color: THREE.ColorRepresentation, o: { sideburns?: boolean; mustache?: boolean; light?: boolean; opacity?: number; stache?: number } = {}) {
  const translucent = o.light || o.opacity !== undefined;
  const mat = k.mat(color, { side: THREE.DoubleSide, ...(translucent ? { transparent: true, opacity: o.opacity ?? 0.8 } : {}) });
  // leggera: copre solo la parte bassa del mento
  const start = o.light ? 2.3 : 2.18;
  k.mesh(new THREE.SphereGeometry(HEAD_R * 1.03, 28, 12, 0.2, Math.PI - 0.4, start, o.light ? 0.6 : 0.85), mat, face, { p: [0, 0.55, 0], s: [1, 0.95, 0.95], outline: o.light || (o.opacity ?? 1) < 0.6 ? false : 0.012 });
  if (o.sideburns) for (const sx of [-1, 1]) k.capsule(0.07, 0.22, color, face, { p: [0.56 * sx, 0.42, 0.18], r: [0.35, 0, -0.2 * sx], outline: 0.01 });
  if (o.mustache) for (const sx of [-1, 1]) k.capsule(o.stache ?? 0.035, 0.1, color, face, { p: [0.07 * sx, 0.41, 0.585], r: [0, 0, (Math.PI / 2 - 0.25) * sx], outline: 0.008 });
  if (o.light) k.sphere(0.06, color, face, { p: [0, 0.12, 0.38], s: [1.1, 0.9, 0.7], outline: 0.008 }); // pizzetto sulla punta del mento
}

/** Schiarisce (amount > 0) o scurisce un colore esadecimale. */
function shade(hex: string, amount: number) {
  const col = new THREE.Color(hex);
  return amount >= 0 ? col.lerp(new THREE.Color('#ffffff'), amount) : col.lerp(new THREE.Color('#000000'), -amount);
}

function cardBack(k: Kit) {
  return k.canvas(96, 136, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c1121f';
    g.fillRect(8, 8, w - 16, h - 16);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    for (let i = -h; i < w; i += 14) {
      g.beginPath();
      g.moveTo(i, 8);
      g.lineTo(i + h, h - 8);
      g.stroke();
    }
  });
}

function drawRobotPrint(g: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  g.clearRect(0, 0, w, h);
  g.lineJoin = 'round';
  // testa del mecha
  g.fillStyle = '#e9ecef';
  g.strokeStyle = '#14101f';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(w * 0.5, h * 0.1);
  g.lineTo(w * 0.85, h * 0.32);
  g.lineTo(w * 0.78, h * 0.82);
  g.lineTo(w * 0.22, h * 0.82);
  g.lineTo(w * 0.15, h * 0.32);
  g.closePath();
  g.fill();
  g.stroke();
  // cresta a V
  g.fillStyle = '#ffd60a';
  g.beginPath();
  g.moveTo(w * 0.5, h * 0.3);
  g.lineTo(w * 0.12, h * 0.02);
  g.lineTo(w * 0.5, h * 0.2);
  g.lineTo(w * 0.88, h * 0.02);
  g.closePath();
  g.fill();
  g.stroke();
  // visiera e occhi
  g.fillStyle = accent;
  g.fillRect(w * 0.27, h * 0.42, w * 0.46, h * 0.16);
  g.strokeRect(w * 0.27, h * 0.42, w * 0.46, h * 0.16);
  g.fillStyle = '#80ffdb';
  g.fillRect(w * 0.31, h * 0.46, w * 0.14, h * 0.08);
  g.fillRect(w * 0.55, h * 0.46, w * 0.14, h * 0.08);
  // bocca
  g.fillStyle = '#d62828';
  g.fillRect(w * 0.38, h * 0.65, w * 0.24, h * 0.1);
  g.strokeRect(w * 0.38, h * 0.65, w * 0.24, h * 0.1);
}

function drawStarPrint(g: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  g.clearRect(0, 0, w, h);
  const star = (cx: number, cy: number, r: number, fill: string) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      i === 0 ? g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#14101f';
    g.stroke();
  };
  star(w * 0.5, h * 0.52, w * 0.4, '#ffd60a');
  star(w * 0.18, h * 0.18, w * 0.1, accent);
  star(w * 0.84, h * 0.82, w * 0.08, accent);
  // occhioni "kawaii" nella stella
  g.fillStyle = '#14101f';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(w * (0.5 + 0.09 * sx), h * 0.52, w * 0.035, h * 0.055, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function drawMangaCover(g: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(0, 0, w, h * 0.22);
  writeLines(g, w, h * 0.22, ['MANGA'], '#ffffff');
  // linee cinetiche
  g.strokeStyle = '#14101f';
  g.lineWidth = 2;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.beginPath();
    g.moveTo(w / 2 + Math.cos(a) * w * 0.18, h * 0.6 + Math.sin(a) * w * 0.18);
    g.lineTo(w / 2 + Math.cos(a) * w * 0.6, h * 0.6 + Math.sin(a) * w * 0.6);
    g.stroke();
  }
  // faccia dell'eroe
  g.fillStyle = '#f6d2b0';
  g.beginPath();
  g.arc(w / 2, h * 0.62, w * 0.17, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#14101f';
  g.beginPath();
  g.moveTo(w * 0.3, h * 0.56);
  g.lineTo(w * 0.42, h * 0.38);
  g.lineTo(w * 0.5, h * 0.5);
  g.lineTo(w * 0.6, h * 0.36);
  g.lineTo(w * 0.7, h * 0.56);
  g.closePath();
  g.fill();
  g.fillRect(w * 0.42, h * 0.62, w * 0.04, h * 0.04);
  g.fillRect(w * 0.54, h * 0.62, w * 0.04, h * 0.04);
  g.fillStyle = accent;
  g.font = '900 30px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('VOL. 1', w / 2, h * 0.95);
}

/** Pupazzetto in stile anime alto circa 0,3 (centrato sul gruppo). */
function actionFigure(k: Kit, g: THREE.Group, accent: string) {
  k.mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 16), k.mat('#14101f'), g, { p: [0, -0.15, 0], outline: 0.006 });
  for (const sx of [-1, 1]) k.capsule(0.02, 0.06, '#1d3557', g, { p: [0.025 * sx, -0.1, 0], outline: 0.005 });
  k.capsule(0.04, 0.06, accent, g, { p: [0, -0.02, 0], outline: 0.006 });
  k.capsule(0.015, 0.07, accent, g, { p: [-0.055, 0.0, 0], r: [0, 0, -0.5], outline: 0.004 });
  k.capsule(0.015, 0.07, accent, g, { p: [0.06, 0.04, 0], r: [0, 0, 2.4], outline: 0.004 }); // pugno alzato
  k.sphere(0.055, '#f6d2b0', g, { p: [0, 0.07, 0], outline: 0.006 });
  for (let i = 0; i < 5; i++) {
    const a = -1.1 + i * 0.55;
    k.mesh(new THREE.ConeGeometry(0.025, 0.08, 6), k.mat('#ff4fb8'), g, { p: [Math.sin(a) * 0.05, 0.1 + Math.cos(a) * 0.04, -0.01], r: [0, 0, -a], outline: 0.004 });
  }
  // mantello
  k.mesh(new THREE.PlaneGeometry(0.1, 0.12), k.mat('#d62828', { side: THREE.DoubleSide }), g, { p: [0, -0.02, -0.035], r: [0.15, 0, 0], outline: false });
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

// ------------------------------------------------------------------ testa fatta con il selfie

/** Foto pronta per la testa 3D: immagine trasparente, maschera della sagoma e colore dei capelli. */
interface SelfieAssets {
  image: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  hair: string;
  /** Altezza / larghezza. */
  aspect: number;
}

const selfieCache = new Map<string, Promise<SelfieAssets>>();

function prepareSelfie(dataUrl: string): Promise<SelfieAssets> {
  let p = selfieCache.get(dataUrl);
  if (!p) {
    p = buildSelfieAssets(dataUrl);
    selfieCache.set(dataUrl, p);
    // pochi selfie alla volta: i più vecchi escono dalla cache
    if (selfieCache.size > 40) selfieCache.delete(selfieCache.keys().next().value!);
    p.catch(() => selfieCache.delete(dataUrl));
  }
  return p;
}

async function buildSelfieAssets(dataUrl: string): Promise<SelfieAssets> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const image = document.createElement('canvas');
  image.width = w;
  image.height = h;
  const g = image.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  let px = g.getImageData(0, 0, w, h).data;
  let clear = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 128) clear++;
  if (clear < w * h * 0.02) {
    // Selfie vecchio (JPEG senza sfondo trasparente): si ritaglia un ovale.
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.ellipse(w / 2, h / 2, w * 0.46, h * 0.48, 0, 0, Math.PI * 2);
    g.clip();
    g.drawImage(img, 0, 0);
    g.restore();
    px = g.getImageData(0, 0, w, h).data;
  }
  // Maschera in scala di grigi (alphaMap legge il canale verde) e colore medio dei capelli in alto.
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mg = mask.getContext('2d')!;
  const md = mg.createImageData(w, h);
  let r = 0, gg = 0, b = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = px[i + 3];
      md.data[i] = md.data[i + 1] = md.data[i + 2] = a;
      md.data[i + 3] = 255;
      if (a > 200 && y < h * 0.22) {
        r += px[i];
        gg += px[i + 1];
        b += px[i + 2];
        n++;
      }
    }
  }
  mg.putImageData(md, 0, 0);
  const hair = n > 20 ? `rgb(${Math.round(r / n)}, ${Math.round(gg / n)}, ${Math.round(b / n)})` : '#3b2a20';
  return { image, mask, hair, aspect: h / w };
}

/**
 * Testa «a cuscino» come in Buzz!: la foto ritagliata (viso e capelli) è applicata su una superficie
 * bombata con la sua stessa sagoma; dietro c'è il colore dei capelli. Si vede bene di fronte e di tre quarti.
 */
function buildPhotoHead(k: Kit, a: SelfieAssets): { group: THREE.Group; top: number } {
  const W = 1.34;
  const H = W * a.aspect;
  const D = W * 0.42;
  const group = new THREE.Group();
  // il mento della foto sta all'altezza del mento del personaggio
  const bottom = -0.04;
  group.position.set(0, bottom + H / 2, 0.06);

  const bulge = (geo: THREE.PlaneGeometry, depth: number) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = (2 * pos.getX(i)) / W;
      const v = (2 * pos.getY(i)) / H;
      pos.setZ(i, depth * Math.sqrt(Math.max(0, 1 - u * u * 0.85 - v * v * 0.85)));
    }
    geo.computeVertexNormals();
    return geo;
  };

  const map = new THREE.CanvasTexture(a.image);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const alpha = new THREE.CanvasTexture(a.mask);
  k.disposables.push(map, alpha);

  const front = k.mesh(bulge(new THREE.PlaneGeometry(W, H, 28, 34), D), k.flat('#ffffff', { map, alphaTest: 0.5 }), group, { outline: false, shadow: false });
  front.castShadow = true;
  const back = k.mesh(bulge(new THREE.PlaneGeometry(W, H, 20, 24), -D * 0.75), k.mat(a.hair, { alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide }), group, { outline: false });
  back.castShadow = true;
  return { group, top: bottom + H };
}

// ------------------------------------------------------------------ gli amici: Samuele, Valerio, Paffo, Pacio, J (e Sandro)

/** Corporatura, forma della testa, colore dell'iride e spessore delle sopracciglia: valori di partenza = personaggio «tondo». */
interface BodyPlan {
  /** Larghezza del busto (1 = normale). */
  w: number;
  /** Scala della testa: [larghezza, altezza, profondità]. */
  head: V3;
  /** Iride chiara (di default gli occhi sono scuri). */
  iris?: string;
  /** Raggio delle sopracciglia (0.03 = sottili). */
  brow?: number;
  /** Inclinazione delle sopracciglia (0.18 = default, 0 = dritte e serie). */
  browTilt?: number;
  /** Rimpicciolisce tutto il personaggio (corporatura più raccolta). */
  scale?: number;
}

const PLANS: Partial<Record<CharacterKind, BodyPlan>> = {
  sandro: { w: 1.12, head: [1.02, 0.95, 0.95], brow: 0.05 },
  samuele: { w: 0.94, head: [1, 0.93, 0.95], iris: '#8ecae6' },
  valerio: { w: 0.95, head: [0.9, 1.1, 0.95] },
  paffo: { w: 0.9, head: [0.96, 0.98, 0.95], browTilt: 0.02 },
  pacio: { w: 1.04, head: [1, 0.94, 0.95], brow: 0.045, scale: 0.92 },
  j: { w: 1.06, head: [1.08, 0.96, 0.98], brow: 0.05 }
};

/** Calotta di capelli che segue la forma della testa; `grow` la ingrossa, `tilt` la porta indietro. */
function hairCapFit(k: Kit, color: THREE.ColorRepresentation, head: THREE.Group, scale: V3, coverage = 1.15, o: { grow?: number; tilt?: number; opacity?: number } = {}) {
  const mat = k.mat(color, o.opacity !== undefined ? { transparent: true, opacity: o.opacity } : undefined);
  k.mesh(new THREE.SphereGeometry(HEAD_R * (o.grow ?? 1.04), 28, 14, 0, Math.PI * 2, 0, coverage), mat, head, {
    p: [0, 0.55, -0.02],
    s: scale,
    r: [o.tilt ?? -0.38, 0, 0],
    outline: o.opacity !== undefined ? false : undefined
  });
}

/** Occhiali grandi e tondi con montatura nera spessa. */
function bigGlasses(k: Kit, face: THREE.Group) {
  const m = k.mat('#14101f');
  for (const sx of [-1, 1]) k.mesh(new THREE.TorusGeometry(0.185, 0.03, 10, 30), m, face, { p: [0.21 * sx, 0.625, 0.575], outline: 0.008 });
  k.mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 8), m, face, { p: [0, 0.66, 0.6], r: [0, 0, Math.PI / 2], outline: false });
  for (const sx of [-1, 1]) k.mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), m, face, { p: [0.4 * sx, 0.64, 0.42], r: [Math.PI / 2, 0, 0], outline: false });
}

/**
 * Punto appena fuori dal busto (un ellissoide: raggio 0.42, schiacciato in z) all'angolo `a` attorno al collo.
 * `droop` abbassa la parte davanti: la catenina pende a V sul petto.
 */
function neckPoint(a: number, w: number, droop: number, y0 = 1.24): THREE.Vector3 {
  const y = y0 - droop * Math.pow(Math.max(0, Math.sin(a)), 1.4);
  const kk = Math.sqrt(Math.max(0.04, 1 - ((y - 0.9) / 0.441) ** 2));
  return new THREE.Vector3(Math.cos(a) * 0.42 * w * kk + Math.sign(Math.cos(a)) * 0.012, y, Math.sin(a) * 0.357 * w * kk + 0.02);
}

/** Catenina al collo: un filo sottile continuo, oppure una catena a maglia (anelli alternati). */
function neckChain(k: Kit, body: THREE.Group, o: { color: string; w: number; droop: number; tube?: number; links?: boolean }) {
  if (!o.links) {
    const pts = Array.from({ length: 48 }, (_, i) => neckPoint((i / 48) * Math.PI * 2, o.w, o.droop));
    k.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, o.tube ?? 0.013, 6, true), k.mat(o.color), body, { outline: 0.005 });
    return;
  }
  const N = 30;
  for (let i = 0; i < N; i++) {
    const cur = neckPoint((i / N) * Math.PI * 2, o.w, o.droop);
    const next = neckPoint(((i + 1) / N) * Math.PI * 2, o.w, o.droop);
    const link = k.mesh(new THREE.TorusGeometry(0.036, 0.013, 6, 12), k.mat(o.color), body, { p: [cur.x, cur.y, cur.z], outline: 0.006 });
    // il piano dell'anello contiene la direzione della catena; gli anelli si alternano di 90°
    link.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), next.sub(cur).normalize());
    if (i % 2) link.rotateX(Math.PI / 2);
  }
}

/** Giro di perline chiare (girocollo) attorno al collo. */
function beadChoker(k: Kit, body: THREE.Group, color: string, w: number) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const pt = neckPoint((i / n) * Math.PI * 2, w, 0.05, 1.22);
    k.mesh(new THREE.SphereGeometry(0.043, 12, 10), k.mat(color), body, { p: [pt.x, pt.y, pt.z], outline: 0.008 });
  }
}

/** Piccoli riccioli sul petto (texture trasparente, sempre uguale: niente casualità vera). */
function chestHair(k: Kit, body: THREE.Group, color: string, w: number) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tex = k.canvas(256, 256, (g, cw, ch) => {
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (let i = 0; i < 380; i++) {
      const u = rnd() * 2 - 1;
      const v = rnd() * 2 - 1;
      // due placche ai lati dello sterno + una striscia centrale verso la pancia
      const inPecs = u * u + (v + 0.15) * (v + 0.15) < 0.9 && Math.abs(u) > 0.06;
      const inLine = Math.abs(u) < 0.1 && v > -0.1;
      if (!inPecs && !inLine) continue;
      g.beginPath();
      const a = rnd() * Math.PI * 2;
      g.arc(cw / 2 + u * cw * 0.46, ch / 2 + v * ch * 0.46, 3 + rnd() * 3, a, a + Math.PI * 0.9);
      g.stroke();
    }
  });
  const y = 0.98;
  const z = 0.357 * w * Math.sqrt(Math.max(0, 1 - ((y - 0.9) / 0.441) ** 2)) + 0.012;
  const m = k.card(0.5, 0.5, tex, body, { p: [0, y, z], r: [-0.18, 0, 0] });
  (m.material as THREE.MeshBasicMaterial).transparent = true;
}

/** Samuele: asciutto, capelli corti con ciuffo, occhi chiari, viso squadrato con barba incolta, catenina sottile. */
function samuele(k: Kit, look: ResolvedLook, { body, head, face }: Friend): { pose: Pose; mood: Mood } {
  const c = look.colors;
  const t = look.traits;
  const hs = PLANS.samuele!.head;
  hairCapFit(k, c.hair, head, hs, 1.1, { grow: 1.035, tilt: -0.34 });
  // ciuffo leggero sulla fronte
  k.sphere(0.17, c.hair, head, { p: [0.1, 1.0, 0.4], s: [1.35, 0.7, 0.9], r: [0.5, 0, -0.2] });
  k.capsule(0.06, 0.2, c.hair, head, { p: [-0.1, 0.97, 0.47], r: [1.15, 0, 0.35] });
  // mascella squadrata
  k.mesh(new RoundedBoxGeometry(0.72, 0.3, 0.5, 3, 0.13), k.mat(c.skin), head, { p: [0, 0.19, 0.0], outline: false });
  if (t.stubble === 'yes') beardShell(k, face, shade(c.skin, -0.62), { opacity: 0.62 });
  if (t.necklace === 'yes') neckChain(k, body, { color: '#e2e6ec', tube: 0.014, w: PLANS.samuele!.w, droop: 0.2 });
  return { pose: 'normal', mood: 'normal' };
}

/** Valerio: viso allungato, ciuffo morbido all'insù, orecchino a cerchio, sorriso con i denti, girocollo di perline. */
function valerio(k: Kit, look: ResolvedLook, { body, head, mouth }: Friend): { pose: Pose; mood: Mood } {
  const c = look.colors;
  const t = look.traits;
  const hs = PLANS.valerio!.head;
  hairCapFit(k, c.hair, head, hs, 1.1, { grow: 1.04 });
  // ciuffo pettinato verso l'alto
  k.capsule(0.17, 0.2, c.hair, head, { p: [0, 1.14, 0.24], r: [-0.8, 0, 0], s: [1.2, 1, 1] });
  k.sphere(0.2, c.hair, head, { p: [0, 1.08, -0.1], s: [1.1, 0.8, 1] });
  if (t.earring === 'yes') k.mesh(new THREE.TorusGeometry(0.07, 0.017, 8, 20), k.mat('#e3c25a'), head, { p: [0.53, 0.33, 0.03], r: [0, 0.5, 0], outline: 0.006 });
  if (t.choker === 'yes') beadChoker(k, body, '#f3ecd9', PLANS.valerio!.w);
  // denti: mezzo disco bianco dentro l'arco del sorriso (figlio della bocca, quindi si muove con lei)
  k.mesh(new THREE.CircleGeometry(0.112, 20, 0, Math.PI), k.flat('#ffffff'), mouth, { p: [0, 0, -0.004], outline: false, shadow: false });
  return { pose: 'normal', mood: 'happy' };
}

/** Paffo: capelli scuri mossi con ciocche sulla fronte, grandi occhiali tondi neri, slanciato, sguardo serio. */
function paffo(k: Kit, look: ResolvedLook, { head, face }: Friend): { pose: Pose; mood: Mood } {
  const c = look.colors;
  const t = look.traits;
  const hs = PLANS.paffo!.head;
  hairCapFit(k, c.hair, head, hs, 1.2, { grow: 1.055, tilt: -0.3 });
  // ciocche mosse che ricadono sulla fronte
  const locks: [number, number, number][] = [[-0.3, -0.35, 1.2], [-0.1, 0.1, 1.35], [0.12, -0.15, 1.2], [0.31, 0.35, 1.3]];
  locks.forEach(([x, tilt, len]) => k.sphere(0.1, c.hair, head, { p: [x, 0.9, 0.465], s: [0.75, len, 0.45], r: [0.45, 0, tilt] }));
  // onde ai lati della testa
  for (const sx of [-1, 1]) {
    k.sphere(0.2, c.hair, head, { p: [0.5 * sx, 0.78, -0.05], s: [0.7, 1.2, 1] });
    k.sphere(0.16, c.hair, head, { p: [0.46 * sx, 0.52, -0.22] });
  }
  k.sphere(0.34, c.hair, head, { p: [0, 0.5, -0.4], s: [1.15, 1.1, 0.7] });
  if (t.glasses === 'yes') bigGlasses(k, face);
  return { pose: 'normal', mood: 'serious' };
}

/** Pacio: testa rasata, barba corta curata, sorriso accennato, catenina a maglia metallica, corporatura compatta. */
function pacio(k: Kit, look: ResolvedLook, { body, head, face }: Friend): { pose: Pose; mood: Mood } {
  const c = look.colors;
  const t = look.traits;
  const hs = PLANS.pacio!.head;
  // rasato: solo un velo scuro sul cranio
  hairCapFit(k, c.hair, head, hs, 1.05, { grow: 1.012, tilt: -0.45, opacity: 0.55 });
  if (t.beard === 'yes') beardShell(k, face, c.hair, { mustache: true, stache: 0.03, opacity: 0.92 });
  if (t.chain === 'yes') neckChain(k, body, { color: '#c3c8d0', links: true, w: PLANS.pacio!.w, droop: 0.15 });
  return { pose: 'normal', mood: 'smirk' };
}

/** J: capelli neri pettinati all'indietro, barba e baffi pieni, viso pieno, t-shirt scura con stampa. */
function jay(k: Kit, look: ResolvedLook, { body, head, face, armL, armR }: Friend): { pose: Pose; mood: Mood } {
  const c = look.colors;
  const t = look.traits;
  const hs = PLANS.j!.head;
  hairCapFit(k, c.hair, head, hs, 1.08, { grow: 1.05, tilt: -0.62 });
  k.sphere(0.4, c.hair, head, { p: [0, 0.88, -0.2], s: [1.05, 0.75, 0.9] });
  // barba piena e ben rifinita + baffi
  beardShell(k, face, c.hair, { sideburns: true, mustache: true, stache: 0.045 });
  k.sphere(0.17, c.hair, face, { p: [0, 0.13, 0.4], s: [1.5, 0.8, 0.8], outline: 0.01 });
  // t-shirt: maniche corte (avambraccio scoperto), colletto a girocollo e stampa
  for (const [arm, sx] of [[armL, -1], [armR, 1]] as const) {
    k.capsule(0.096, 0.1, c.skin, arm, { p: [0.0715 * sx, -0.345, 0], r: [0, 0, 0.18 * sx], outline: 0.012 });
  }
  k.mesh(new THREE.TorusGeometry(0.26, 0.05, 8, 28), k.mat(shade(c.body, 0.14)), body, { p: [0, 1.22, 0.03], r: [Math.PI / 2 + 0.25, 0, 0], s: [1, 1, 0.9], outline: 0.012 });
  if (t.print === 'bolt') {
    const tex = k.canvas(256, 256, (g, w, h) => {
      g.fillStyle = c.accent;
      g.beginPath();
      g.moveTo(w * 0.56, h * 0.08);
      g.lineTo(w * 0.28, h * 0.54);
      g.lineTo(w * 0.47, h * 0.54);
      g.lineTo(w * 0.4, h * 0.94);
      g.lineTo(w * 0.74, h * 0.4);
      g.lineTo(w * 0.53, h * 0.4);
      g.closePath();
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = '#ffffff';
      g.stroke();
    });
    const y = 0.97;
    const z = 0.357 * 1.06 * Math.sqrt(Math.max(0, 1 - ((y - 0.9) / 0.441) ** 2)) + 0.012;
    const m = k.card(0.3, 0.3, tex, body, { p: [0, y, z], r: [-0.18, 0, 0] });
    (m.material as THREE.MeshBasicMaterial).transparent = true;
  }
  return { pose: 'normal', mood: 'smile' };
}

// ------------------------------------------------------------------ rig pubblico

export class CharacterRig {
  readonly root = new THREE.Group();
  characterId: CharacterKind;
  skinId: string;
  custom: CustomChoice = {};

  private kit = new Kit();
  private parts!: Parts;
  private anim: AnimName = 'idle';
  private prevAnim: AnimName = 'idle';
  private animStart = 0;
  private t = Math.random() * 10;
  private effects = new Map<PowerType, { obj: THREE.Object3D; kit: Kit }>();
  private selfieUrl: string | null = null;
  private selfie: SelfieAssets | null = null;
  private photo: { group: THREE.Group; kit: Kit; top: number } | null = null;

  constructor(characterId: string, skinId: string, custom: CustomChoice = {}) {
    const def = getCharacter(characterId) ?? getCharacter('rocker')!;
    this.characterId = def.id;
    this.skinId = getSkin(def.id, skinId) ? skinId : def.skins[0].id;
    this.custom = { ...custom };
    this.build();
  }

  private build() {
    const look = resolveLook(this.characterId, this.skinId, this.custom)!;
    this.parts = buildModel(this.kit, this.characterId, look);
    this.root.add(this.parts.model);
    this.applySelfie();
  }

  /** Chiave dell'aspetto attuale (personaggio, skin e tratti). */
  get lookKey() {
    return lookKey(this.characterId, this.skinId, this.custom);
  }

  /** Cambia personaggio, skin e/o tratti ricostruendo il modello (gli effetti attivi restano). */
  setLook(characterId: string, skinId: string, custom: CustomChoice = {}) {
    if (lookKey(characterId, skinId, custom) === this.lookKey) return;
    const def = getCharacter(characterId);
    if (!def || !getSkin(characterId, skinId)) return;
    this.root.remove(this.parts.model);
    this.kit.disposables.forEach((d) => d.dispose());
    this.kit = new Kit();
    this.characterId = def.id;
    this.skinId = skinId;
    this.custom = { ...custom };
    this.build();
  }

  setSelfie(dataUrl: string | null) {
    if (dataUrl === this.selfieUrl) return;
    this.selfieUrl = dataUrl;
    this.selfie = null;
    this.applySelfie();
    if (!dataUrl) return;
    prepareSelfie(dataUrl)
      .then((assets) => {
        if (this.selfieUrl !== dataUrl) return;
        this.selfie = assets;
        this.applySelfie();
      })
      .catch((err) => console.warn('[personaggi] selfie non leggibile', err));
  }

  /** Con il selfie, tutta la testa disegnata lascia il posto alla testa fatta con la foto. */
  private applySelfie() {
    const { head } = this.parts;
    if (this.photo) {
      this.photo.group.removeFromParent();
      this.photo.kit.disposables.forEach((d) => d.dispose());
      this.photo = null;
    }
    for (const child of head.children) child.visible = !this.selfie;
    if (!this.selfie) return;
    const kit = new Kit();
    const { group, top } = buildPhotoHead(kit, this.selfie);
    head.add(group);
    this.photo = { group, kit, top };
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
    // La testa-foto può essere più alta di quella disegnata (capelli lunghi o raccolti in alto).
    const extra = this.photo ? Math.max(0, this.photo.top - 1.15) * this.parts.head.scale.y * this.parts.model.scale.y : 0;
    return this.parts.head.getWorldPosition(target).add(new THREE.Vector3(0, (0.55 + extra) * this.root.scale.y, 0));
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const lt = t - this.animStart;
    const { body, head, armL, armR, mouth, pose, mood } = this.parts;

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
        if (pose === 'read') {
          // legge tenendo il libro con due mani
          armR.rotation.set(-1.2, 0, -0.3);
          armL.rotation.set(-1.2, 0, 0.3);
          head.rotation.x = 0.22 + Math.sin(t * 1.1) * 0.03;
        } else if (pose === 'readL') {
          // controlla ansioso la schedina nella mano sinistra
          armL.rotation.set(-1.2, 0, 0.3 + Math.sin(t * 1.7) * 0.04);
          head.rotation.set(0.25, 0, 0.1 + Math.sin(t * 2.4) * 0.05);
        } else if (pose === 'raise') {
          // posa da vero fan: braccio alzato e mano sul fianco
          armR.rotation.z = 2.3 + Math.sin(t * 3) * 0.06;
          armL.rotation.z = -0.9;
          body.rotation.z = -0.06;
          body.position.y = Math.abs(Math.sin(t * 3)) * 0.05;
        }
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
    if (this.anim === 'idle' || this.anim === 'think' || this.anim === 'wave') {
      if (mood === 'worried') {
        mouth.rotation.z = 0;
        mouth.scale.set(0.7, 0.6, 1);
      } else if (mood === 'happy' && this.anim === 'idle') {
        mouth.scale.set(1.25, 1.35, 1);
      } else if (this.anim !== 'think') {
        // seria = quasi una riga; sorriso accennato = arco piccolo; sorriso disteso = arco largo e basso
        if (mood === 'serious') mouth.scale.set(0.85, 0.22, 1);
        else if (mood === 'smirk') mouth.scale.set(0.75, 0.55, 1);
        else if (mood === 'smile') mouth.scale.set(1.15, 0.8, 1);
      }
    }
  }

  dispose() {
    this.kit.disposables.forEach((d) => d.dispose());
    for (const e of this.effects.values()) e.kit.disposables.forEach((d) => d.dispose());
    this.effects.clear();
    this.photo?.kit.disposables.forEach((d) => d.dispose());
    this.photo = null;
    this.root.removeFromParent();
  }
}
