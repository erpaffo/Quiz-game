import gsap from 'gsap';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { BRAND } from '../../shared/brand';
import { CARDS } from '../../shared/cards';
import { CONFIG } from '../../shared/config';
import type { CardEvent, PlayerPublic, PowerType, PyramidMove } from '../../shared/types';
import { CharacterRig, type AnimName } from '../common/characters3d';
import { esc, PLAYER_COLORS, playerShape } from '../common/net';
import { addOutline, toonMat } from '../common/toon';

interface Slot {
  id: string;
  rig: CharacterRig | null;
  anchor: THREE.Group;
  podium: THREE.Group;
  podiumTop: THREE.MeshToonMaterial;
  label: CSS2DObject;
  labelEl: HTMLElement;
  color: string;
  selfie: string | null;
}

/**
 * Libera ricorsivamente geometrie e materiali di una mesh/gruppo Three.js
 * e rimuove dal DOM eventuali elementi attaccati a CSS2DObject (es. etichette, numeri gradini).
 */
export function disposeDeep(obj: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  obj.traverse((child) => {
    // Non toccare i contorni: usano outlineMaterial (cache globale) e condividono la geometria del padre.
    if (child.userData?.isOutline) return;
    if (child instanceof CSS2DObject || (child as any).isCSS2DObject) {
      (child as CSS2DObject).element?.remove();
    }
    const withGeom = child as { geometry?: THREE.BufferGeometry };
    if (withGeom.geometry && !geometries.has(withGeom.geometry)) {
      geometries.add(withGeom.geometry);
      withGeom.geometry.dispose();
    }
    const withMat = child as { material?: THREE.Material | THREE.Material[] };
    if (withMat.material) {
      const mats = Array.isArray(withMat.material) ? withMat.material : [withMat.material];
      for (const m of mats) {
        if (m && !materials.has(m)) {
          materials.add(m);
          m.dispose();
        }
      }
    }
  });
}

const STEP_H = 0.45;
const STEP_D = 1.1;
const PYRAMID_ORIGIN = new THREE.Vector3(60, 0, 0);
const PYRAMID_SCALE = 0.72;
/** Altezza della gradinata della fila posteriore (gruppi numerosi). */
const RISER_H = 0.8;
// Il target è alto di proposito: la scena scende nella metà bassa dello schermo, sotto i pannelli e le targhe dei giocatori restano visibili.
const STUDIO_CAM = { pos: new THREE.Vector3(0, 3.3, 11.5), target: new THREE.Vector3(0, 3.9, 0) };
// Menù dei giochi aperto in sala d'attesa: camera più lontana e più alta, i personaggi diventano una fascia in basso.
const MENU_CAM = { pos: new THREE.Vector3(0, 3.0, 16.5), target: new THREE.Vector3(0, 5.6, 0) };
const MENU_CAM_LARGE = { pos: new THREE.Vector3(0, 3.6, 19.5), target: new THREE.Vector3(0, 6.6, -0.6) };
const STUDIO_CAM_LARGE = { pos: new THREE.Vector3(0, 4.2, 14.2), target: new THREE.Vector3(0, 3.9, -0.6) };

export interface VideoSettings {
  /** Qualità degli effetti (luci, ombre, materiali): automatica, alta o bassa. */
  quality: 'auto' | 'high' | 'low';
  /** Scala della risoluzione di disegno (0.5 = metà, 1 = piena, 1.5 = super-nitida). */
  scale: number;
  shadows: boolean;
  antialias: boolean;
  /** Limite di fotogrammi al secondo (0 = nessun limite). */
  fps: number;
}

export const DEFAULT_VIDEO: VideoSettings = { quality: 'auto', scale: 1, shadows: true, antialias: true, fps: 60 };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  private camTarget = STUDIO_CAM.target.clone();
  private clock = new THREE.Clock();
  private slots = new Map<string, Slot>();
  private bulbs: THREE.MeshBasicMaterial[] = [];
  private bulbMode: 'chase' | 'blink' | 'calm' = 'calm';
  private bulbOn: boolean[] = [];
  private trophy: THREE.Object3D | null = null;
  private riser: THREE.Mesh | null = null;
  private large = false;
  private menuOpen = false;
  private laneSpacing = 1.5;
  private sun!: THREE.DirectionalLight;
  // Qualità: "high" di default, scende da sola a "low" se il PC non regge.
  // Si può forzare con ?q=low oppure ?q=high nell'URL dello schermo principale.
  private quality: 'high' | 'low';
  private autoQuality: boolean;
  private maxFps = 60;
  private lastFrame = 0;
  private perf = { since: performance.now() + 4000, sum: 0, n: 0 };
  private pyramid: THREE.Group | null = null;
  private pyramidLanes = new Map<string, number>();
  private attacking = false;
  private lastPlayers: PlayerPublic[] = [];
  mode: 'studio' | 'pyramid' = 'studio';

  /** Impostazioni video scelte nel menù di pausa (Esc). */
  private video: VideoSettings;

  constructor(
    private container: HTMLElement,
    video: VideoSettings = DEFAULT_VIDEO
  ) {
    this.video = video;
    const q = new URLSearchParams(location.search).get('q');
    const quality = q === 'low' || q === 'high' ? q : video.quality;
    this.quality = quality === 'low' ? 'low' : 'high';
    this.autoQuality = quality === 'auto';
    // L'antialiasing si sceglie solo alla creazione del renderer: cambiarlo richiede di ricaricare lo schermo.
    this.renderer = new THREE.WebGLRenderer({ antialias: video.antialias, alpha: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);

    this.camera.position.set(0, 3.3, 11.5);
    this.camera.lookAt(this.camTarget);

    this.buildLights();
    this.buildStudio();
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop((now) => this.frame(now));
  }

  // ------------------------------------------------------------ scena

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#2f6f80', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    this.sun = sun;
    sun.position.set(4, 10, 8);
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
    this.scene.add(sun);
  }

  private buildStudio() {
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.2, 64), toonMat('#123241'));
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ringColors = ['#ff6b5e', '#ffb52e', '#5fd4e8'];
    ringColors.forEach((col, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.5 + i * 1.6, 4.65 + i * 1.6, 96), new THREE.MeshBasicMaterial({ color: col }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      this.scene.add(ring);
    });

    // Fondale con il logo
    const tex = new THREE.CanvasTexture(this.drawBackdrop());
    tex.colorSpace = THREE.SRGBColorSpace;
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(26, 10.4), new THREE.MeshBasicMaterial({ map: tex }));
    backdrop.position.set(0, 5, -9);
    this.scene.add(backdrop);

    // Arco di lampadine da quiz show
    const bulbGeo = new THREE.SphereGeometry(0.13, 12, 8);
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * (i / 40);
      const mat = new THREE.MeshBasicMaterial({ color: '#fff3b0' });
      const b = new THREE.Mesh(bulbGeo, mat);
      b.position.set(Math.cos(a) * -11, 0.4 + Math.sin(a) * 8.5, -8.8);
      this.scene.add(b);
      this.bulbs.push(mat);
    }

    // Coni di luce dei riflettori
    for (const x of [-7, 7]) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(3, 12, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: '#fff6d5', transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      cone.position.set(x * 0.6, 6, -1);
      cone.rotation.z = x > 0 ? -0.35 : 0.35;
      this.scene.add(cone);
    }
  }

  private drawBackdrop(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 2048;
    c.height = 820;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#1a4a5b');
    grad.addColorStop(1, '#06121a');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    // raggi
    g.save();
    g.translate(c.width / 2, c.height * 0.95);
    for (let i = 0; i < 24; i++) {
      g.rotate(Math.PI / 12);
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,214,10,0.07)';
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-90, -1600);
      g.lineTo(90, -1600);
      g.fill();
    }
    g.restore();
    // Punti interrogativi decorativi sul fondale
    g.textAlign = 'center';
    g.font = '900 120px "Bricolage Grotesque Variable", "Trebuchet MS", sans-serif';
    g.fillStyle = 'rgba(255,214,10,0.10)';
    for (let i = 0; i < 9; i++) g.fillText('?', 120 + i * 225, 180 + (i % 2) * 330);
    return c;
  }

  private buildPyramid(lanes: number, steps: number) {
    if (this.pyramid) {
      disposeDeep(this.pyramid);
      this.pyramid.removeFromParent();
      this.pyramid = null;
      this.trophy = null;
    }
    const g = new THREE.Group();
    g.position.copy(PYRAMID_ORIGIN);
    this.laneSpacing = Math.min(1.5, 13 / Math.max(lanes, 1));
    const width = Math.max(4, lanes) * this.laneSpacing + 1.2;

    const ground = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.2, 48), toonMat('#123241'));
    ground.position.set(0, -0.1, -4);
    ground.receiveShadow = true;
    g.add(ground);

    const low = new THREE.Color('#2f6f80');
    const high = new THREE.Color('#ffb52e');
    for (let i = 1; i <= steps; i++) {
      const col = low.clone().lerp(high, i / steps);
      const box = new THREE.Mesh(new RoundedBoxGeometry(width - i * 0.12, STEP_H * i, STEP_D, 2, 0.05), toonMat(col));
      box.position.set(0, (STEP_H * i) / 2, -i * STEP_D);
      box.receiveShadow = true;
      box.castShadow = true;
      addOutline(box, 0.02);
      g.add(box);

      const numEl = document.createElement('div');
      numEl.className = 'step-num';
      numEl.textContent = String(i);
      const num = new CSS2DObject(numEl);
      num.position.set(-(width - i * 0.12) / 2 - 0.4, STEP_H * i, -i * STEP_D + STEP_D / 2);
      g.add(num);
    }

    // Trofeo in cima
    const trophy = new THREE.Group();
    trophy.position.set(0, STEP_H * steps, -steps * STEP_D - 0.1);
    const gold = toonMat('#ffb52e');
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 0.6, 24), gold);
    cup.position.y = 1.0;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12), gold);
    stem.position.y = 0.5;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.2, 24), gold);
    base.position.y = 0.2;
    for (const m of [cup, stem, base]) {
      addOutline(m, 0.02);
      trophy.add(m);
    }
    for (const sx of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 16), gold);
      handle.position.set(0.48 * sx, 1.05, 0);
      trophy.add(handle);
    }
    this.trophy = trophy;
    g.add(trophy);

    this.scene.add(g);
    this.pyramid = g;
  }

  // ------------------------------------------------------------ giocatori

  /**
   * Fino a 6 giocatori: un arco di podi. Oltre: due file, quella posteriore su una gradinata
   * e sfalsata di mezzo passo, così ogni personaggio resta visibile; i personaggi si rimpiccioliscono.
   */
  private layout(index: number, count: number): { pos: THREE.Vector3; scale: number } {
    if (count < CONFIG.LARGE_GROUP) {
      const x = (index - (count - 1) / 2) * 2.15;
      return { pos: new THREE.Vector3(x, 0, -Math.abs(x) * 0.22), scale: 1 };
    }
    const front = Math.ceil(count / 2);
    const row = index < front ? 0 : 1;
    const col = row === 0 ? index : index - front;
    const inRow = row === 0 ? front : count - front;
    const spacing = Math.min(2.1, 13.5 / front);
    const shift = row === 1 && inRow === front ? spacing / 2 : 0;
    const x = (col - (inRow - 1) / 2) * spacing + shift;
    const scale = count > 10 ? 0.74 : 0.84;
    return row === 0
      ? { pos: new THREE.Vector3(x, 0, 1.3 - Math.abs(x) * 0.08), scale }
      : { pos: new THREE.Vector3(x, RISER_H, -1.5), scale };
  }

  /** Gradinata e camera si adattano al numero di giocatori. */
  private setLarge(large: boolean) {
    if (large === this.large) return;
    this.large = large;
    if (large && !this.riser) {
      this.riser = new THREE.Mesh(new RoundedBoxGeometry(17, RISER_H, 2.6, 2, 0.08), toonMat('#1d4658'));
      this.riser.position.set(0, RISER_H / 2, -1.5);
      this.riser.receiveShadow = true;
      addOutline(this.riser, 0.02);
      this.scene.add(this.riser);
    }
    if (this.riser) this.riser.visible = large;
    this.refreshStudio(1);
  }

  /** Sala d'attesa: con la griglia dei giochi o le regole aperte il pannello è grande e i personaggi si fanno da parte. */
  setMenuOpen(open: boolean) {
    if (open === this.menuOpen) return;
    this.menuOpen = open;
    this.refreshStudio(0.7);
  }

  private studioCam() {
    if (this.menuOpen) return this.large ? MENU_CAM_LARGE : MENU_CAM;
    return this.large ? STUDIO_CAM_LARGE : STUDIO_CAM;
  }

  private refreshStudio(duration: number) {
    for (const slot of this.slots.values()) slot.labelEl.classList.toggle('compact', this.large || this.menuOpen);
    if (this.mode !== 'studio') return;
    const cam = this.studioCam();
    this.moveCamera(cam.pos, cam.target, duration);
  }

  private createSlot(p: PlayerPublic, index: number): Slot {
    const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
    const podium = new THREE.Group();
    const podiumTop = toonMat(color);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.5, 32), toonMat('#0b2330'));
    base.position.y = 0.25;
    base.castShadow = base.receiveShadow = true;
    addOutline(base, 0.02);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 0.08, 32), podiumTop);
    top.position.y = 0.52;
    top.receiveShadow = true;
    podium.add(base, top);
    const place = this.layout(index, Math.max(1, this.slots.size + 1));
    podium.position.copy(place.pos);
    podium.scale.setScalar(place.scale);
    this.scene.add(podium);

    const anchor = new THREE.Group();
    anchor.position.y = 0.56;
    podium.add(anchor);

    const labelEl = document.createElement('div');
    labelEl.className = `plabel ${this.large || this.menuOpen ? 'compact' : ''}`;
    labelEl.style.setProperty('--pc', color);
    const label = new CSS2DObject(labelEl);
    label.position.set(0, 2.95, 0);
    anchor.add(label);

    return { id: p.id, rig: null, anchor, podium, podiumTop, label, labelEl, color, selfie: null };
  }

  colorOf(id: string): string {
    return this.slots.get(id)?.color ?? '#ffffff';
  }

  sync(players: PlayerPublic[], opts: { phase: string }) {
    this.lastPlayers = players;
    this.setLarge(players.length >= CONFIG.LARGE_GROUP);
    const ids = new Set(players.map((p) => p.id));
    for (const [id, slot] of this.slots) {
      if (!ids.has(id)) {
        slot.rig?.dispose();
        slot.label.element.remove();
        disposeDeep(slot.podium);
        slot.podium.removeFromParent();
        this.slots.delete(id);
      }
    }

    players.forEach((p, i) => {
      let slot = this.slots.get(p.id);
      if (!slot) {
        slot = this.createSlot(p, i);
        this.slots.set(p.id, slot);
      }
      slot.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      slot.podiumTop.color.set(slot.color);
      slot.labelEl.style.setProperty('--pc', slot.color);

      if (p.characterId && p.skinId) {
        if (!slot.rig) {
          slot.rig = new CharacterRig(p.characterId, p.skinId, p.custom);
          slot.rig.setSelfie(slot.selfie);
          slot.rig.root.rotation.y = 0;
          slot.anchor.add(slot.rig.root);
          slot.rig.play('wave');
        } else {
          slot.rig.setLook(p.characterId, p.skinId, p.custom);
        }
      }
      if (!this.attacking) slot.rig?.setEffects(p.activeEffects);

      if (this.mode === 'studio') {
        const { pos, scale } = this.layout(i, players.length);
        if (slot.podium.position.distanceTo(pos) > 0.01) {
          gsap.to(slot.podium.position, { x: pos.x, y: pos.y, z: pos.z, duration: 0.6, ease: 'power2.out' });
        }
        if (Math.abs(slot.podium.scale.x - scale) > 0.001) gsap.to(slot.podium.scale, { x: scale, y: scale, z: scale, duration: 0.6 });
      }
      this.renderLabel(slot, p, opts.phase);
    });
  }

  private renderLabel(slot: Slot, p: PlayerPublic, phase: string) {
    slot.labelEl.classList.toggle('in-lobby', phase === 'LOBBY');
    // In sala d'attesa lo stato è sempre scritto (icona + parola, non solo colore): si vede subito chi deve ancora premere «Pronto».
    const status =
      !p.connected ? '<span class="pl-status off">Offline</span>' :
      phase === 'LOBBY' ? (p.ready ? '<span class="pl-status ready">Pronto</span>' : p.characterId ? '<span class="pl-status wait">Non pronto</span>' : '<span class="pl-status wait">Sceglie…</span>') :
      p.hasActed ? '<span class="pl-status ok">✓</span>' : '';
    const html =
      `<div class="pl-name"><span class="pl-shape" aria-hidden="true">${playerShape(PLAYER_COLORS.indexOf(slot.color))}</span>${p.isVip ? '👑 ' : ''}${esc(p.name)}${p.isBot ? ' 🤖' : ''}</div>` +
      (phase === 'LOBBY' ? '' : `<div class="pl-score">${p.score.toLocaleString('it-IT')}</div>`) +
      status +
      (p.defense || p.doubleArmed ? `<span class="pl-badges">${p.defense ? CARDS[p.defense].icon : ''}${p.doubleArmed ? '💎' : ''}</span>` : '');
    if (slot.labelEl.dataset.html !== html) {
      slot.labelEl.dataset.html = html;
      const floats = slot.labelEl.querySelector('.pl-float');
      slot.labelEl.innerHTML = html;
      if (floats) slot.labelEl.appendChild(floats);
    }
  }

  floatText(id: string, text: string, kind: 'good' | 'bad' | 'info' = 'good') {
    const slot = this.slots.get(id);
    if (!slot) return;
    const el = document.createElement('div');
    el.className = `pl-float ${kind}`;
    el.textContent = text;
    slot.labelEl.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  setSelfie(id: string, dataUrl: string | null) {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.selfie = dataUrl;
    slot.rig?.setSelfie(dataUrl);
  }

  play(id: string, anim: AnimName) {
    this.slots.get(id)?.rig?.play(anim);
  }

  playAll(anim: AnimName) {
    for (const s of this.slots.values()) s.rig?.play(anim);
  }

  anim(id: string): AnimName | undefined {
    return this.slots.get(id)?.rig?.currentAnim;
  }

  setBulbs(mode: 'chase' | 'blink' | 'calm') {
    this.bulbMode = mode;
  }

  // ------------------------------------------------------------ carte, bomba, monete

  private rigOf(id: string) {
    return this.slots.get(id)?.rig ?? null;
  }

  private hitPoint(id: string) {
    const rig = this.rigOf(id);
    return rig ? rig.headWorldPosition().add(new THREE.Vector3(0, -0.6, 0.3)) : new THREE.Vector3();
  }

  /** Tween di un oggetto lungo un arco (curva di Bézier quadratica). */
  private arc(obj: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, height: number, duration: number) {
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, height, 1.2));
    const s = { t: 0 };
    return gsap.to(s, {
      t: 1,
      duration,
      ease: 'power1.inOut',
      onUpdate: () => {
        const t = s.t;
        obj.position.set(
          (1 - t) ** 2 * start.x + 2 * (1 - t) * t * mid.x + t ** 2 * end.x,
          (1 - t) ** 2 * start.y + 2 * (1 - t) * t * mid.y + t ** 2 * end.y,
          (1 - t) ** 2 * start.z + 2 * (1 - t) * t * mid.z + t ** 2 * end.z
        );
        obj.rotation.x += 0.3;
      }
    });
  }

  /** Anello colorato che si allarga ai piedi del personaggio (difese e bonus attivati). */
  aura(id: string, color: string) {
    const rig = this.rigOf(id);
    if (!rig) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 40), mat);
    ring.rotation.x = -Math.PI / 2;
    rig.root.getWorldPosition(ring.position).add(new THREE.Vector3(0, 0.08, 0));
    this.scene.add(ring);
    gsap.to(ring.scale, { x: 2.4, y: 2.4, z: 2.4, duration: 0.9, ease: 'power2.out' });
    gsap.to(mat, {
      opacity: 0,
      duration: 0.9,
      ease: 'power2.in',
      onComplete: () => {
        ring.removeFromParent();
        ring.geometry.dispose();
        mat.dispose();
      }
    });
  }

  /** Bolla protettiva (Scudo, Specchio, Mantello, Antidoto) che compare e svanisce. */
  bubble(id: string, color: string) {
    const rig = this.rigOf(id);
    if (!rig) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false });
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.45, 32, 20), mat);
    rig.root.getWorldPosition(b.position).add(new THREE.Vector3(0, 1.3 * rig.root.scale.y, 0));
    b.scale.setScalar(0.3);
    this.scene.add(b);
    gsap.to(b.scale, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'back.out(2)' });
    gsap.to(mat, {
      opacity: 0,
      duration: 0.6,
      delay: 0.5,
      onComplete: () => {
        b.removeFromParent();
        b.geometry.dispose();
        mat.dispose();
      }
    });
  }

  /**
   * Eventi delle carte: auree per difese e bonus, proiettili per gli attacchi.
   * Il proiettile segue il percorso (rimbalzo dello Specchio, deviazione del Mantello)
   * e all'arrivo colpisce, viene bloccato, neutralizzato o va a vuoto.
   */
  async playCardEvents(events: CardEvent[], onEvent: (e: CardEvent) => void): Promise<void> {
    if (!events.length) return;
    this.attacking = true;
    const applied = new Map<string, Set<PowerType>>();
    const temp: THREE.Mesh[] = [];
    const anims: gsap.core.Animation[] = [];
    let delay = 0.15;
    const fast = events.length > 8;

    const all = events.map((e) => {
      const myDelay = delay;
      delay += e.result === 'self' ? (fast ? 0.12 : 0.3) : fast ? 0.3 : 0.6;
      return new Promise<void>((resolve) => {
        const card = CARDS[e.card];
        if (e.result === 'self') {
          anims.push(
            gsap.delayedCall(myDelay, () => {
              this.aura(e.from, card.color);
              this.rigOf(e.from)?.play('cheer');
              onEvent(e);
              resolve();
            })
          );
          return;
        }
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), toonMat(card.color, { emissive: card.color, emissiveIntensity: 0.4 }));
        addOutline(ball, 0.03);
        ball.visible = false;
        this.scene.add(ball);
        temp.push(ball);
        const tl = gsap.timeline({ delay: myDelay });
        anims.push(tl);
        tl.call(() => {
          ball.visible = true;
          this.rigOf(e.from)?.play('cheer');
        });
        for (let i = 0; i < e.path.length - 1; i++) {
          const start = i === 0 ? (this.rigOf(e.path[0])?.headWorldPosition() ?? new THREE.Vector3()) : this.hitPoint(e.path[i]);
          tl.add(this.arc(ball, start, this.hitPoint(e.path[i + 1]), i === 0 ? 3.2 : 2, i === 0 ? 0.85 : 0.65));
          // Rimbalzo intermedio: Specchio (torna al mittente) o Mantello (deviato su un altro).
          if (i < e.path.length - 2) {
            const via = e.path[i + 1];
            const reflected = e.path[i + 2] === e.from;
            tl.call(() => this.bubble(via, reflected ? CARDS.MIRROR.color : CARDS.CLOAK.color));
          }
        }
        if (e.result === 'missed') tl.to(ball.position, { y: '+=9', duration: 0.5, ease: 'power2.in' });
        tl.call(() => {
          ball.visible = false;
          const lastId = e.path[e.path.length - 1];
          const last = this.rigOf(lastId);
          if (e.result === 'hit' && last) {
            const set = applied.get(lastId) ?? new Set<PowerType>();
            set.add(e.card as PowerType);
            applied.set(lastId, set);
            last.setEffects([...set]);
            last.play('hit');
          }
          if ((e.result === 'blocked' || e.result === 'absorbed') && e.defense) this.bubble(lastId, CARDS[e.defense].color);
          if (e.result === 'crowded') this.bubble(lastId, '#ffffff');
          this.rigOf(e.from)?.play('idle');
          onEvent(e);
          resolve();
        });
      });
    });

    // Se la scheda è in background (rAF sospeso) l'animazione può non finire: chiude comunque.
    await Promise.race([Promise.all(all), new Promise((r) => setTimeout(r, delay * 1000 + 2500))]);
    anims.forEach((a) => a.kill());
    temp.forEach((b) => {
      b.removeFromParent();
      b.geometry.dispose();
    });
    this.attacking = false;
    this.sync(this.lastPlayers, { phase: 'CARD_RESOLVE' });
  }

  private bomb: THREE.Group | null = null;
  private bombSpark: THREE.Mesh | null = null;
  private bombHolder: string | null = null;
  private bombHeat = 0;
  private bombFlying = false;

  private buildBomb() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), toonMat('#1f1f24'));
    addOutline(body, 0.03);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 12), toonMat('#5c5c66'));
    cap.position.y = 0.44;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), toonMat('#c9a227'));
    fuse.position.set(0.06, 0.6, 0);
    fuse.rotation.z = -0.4;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffb703' }));
    spark.position.set(0.13, 0.76, 0);
    g.add(body, cap, fuse, spark);
    this.bombSpark = spark;
    return g;
  }

  private bombSpot(id: string) {
    return this.rigOf(id)?.headWorldPosition().add(new THREE.Vector3(0, 0.9, 0)) ?? new THREE.Vector3();
  }

  /** Bomba a Orologeria: la bomba fluttua sopra chi la tiene e trema sempre di più. */
  setBomb(holderId: string | null, heat = 0) {
    if (!holderId) {
      if (this.bomb) {
        disposeDeep(this.bomb);
        this.bomb.removeFromParent();
        this.bomb = null;
      }
      this.bombHolder = null;
      return;
    }
    this.bombHeat = heat;
    if (!this.bomb) {
      this.bomb = this.buildBomb();
      this.bomb.position.copy(this.bombSpot(holderId));
      this.bomb.scale.setScalar(0.01);
      gsap.to(this.bomb.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2)' });
      this.scene.add(this.bomb);
    } else if (holderId !== this.bombHolder) {
      this.bombFlying = true;
      const tw = this.arc(this.bomb, this.bomb.position.clone(), this.bombSpot(holderId), 3, 0.8);
      tw.eventCallback('onComplete', () => {
        this.bombFlying = false;
        this.rigOf(holderId)?.play('hit');
      });
    }
    this.bombHolder = holderId;
  }

  explodeBomb() {
    if (!this.bomb) return;
    const pos = this.bomb.position.clone();
    const holder = this.bombHolder;
    this.setBomb(null);
    const mat = new THREE.MeshBasicMaterial({ color: '#ff9f1c', transparent: true, opacity: 1, depthWrite: false });
    const blast = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat);
    blast.position.copy(pos);
    this.scene.add(blast);
    gsap.to(blast.scale, { x: 7, y: 7, z: 7, duration: 0.7, ease: 'power2.out' });
    gsap.to(mat, {
      opacity: 0,
      duration: 0.9,
      ease: 'power1.in',
      onComplete: () => {
        blast.removeFromParent();
        blast.geometry.dispose();
        mat.dispose();
      }
    });
    if (holder) {
      this.rigOf(holder)?.play('hit');
      setTimeout(() => this.rigOf(holder)?.play('sad'), 800);
    }
  }

  /** Ruba Punti: monete d'oro che volano dalla vittima al ladro. */
  coins(fromId: string, toId: string) {
    const start = this.rigOf(fromId)?.headWorldPosition();
    const end = this.rigOf(toId)?.headWorldPosition();
    if (!start || !end) return;
    for (let i = 0; i < 6; i++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 18), toonMat('#ffb52e'));
      coin.position.copy(start);
      this.scene.add(coin);
      const tw = this.arc(coin, start, end, 2.4, 0.7);
      tw.delay(i * 0.1);
      tw.eventCallback('onComplete', () => {
        coin.removeFromParent();
        coin.geometry.dispose();
      });
    }
    this.rigOf(fromId)?.play('sad');
    setTimeout(() => this.rigOf(toId)?.play('cheer'), 900);
  }

  // ------------------------------------------------------------ piramide

  /** `fromGround`: tutti partono da terra (l'introduzione li fa poi salire ai gradini di partenza). */
  enterPyramid(players: PlayerPublic[], steps: number, fromGround = false) {
    this.mode = 'pyramid';
    this.buildPyramid(players.length, steps);
    this.pyramidLanes.clear();
    players.forEach((p, i) => {
      this.pyramidLanes.set(p.id, i);
      const slot = this.slots.get(p.id);
      if (!slot?.rig) return;
      slot.anchor.remove(slot.label);
      this.pyramid!.add(slot.rig.root);
      slot.rig.root.add(slot.label);
      slot.label.position.set(0, 3.1, 0);
      slot.rig.root.scale.setScalar(players.length > 8 ? 0.55 : PYRAMID_SCALE);
      slot.rig.root.position.copy(this.pyramidSpot(i, players.length, fromGround ? 0 : p.pyramidStep));
      slot.rig.play('wave');
    });
    this.moveCamera(
      PYRAMID_ORIGIN.clone().add(new THREE.Vector3(0, 6.8, 9.5)),
      PYRAMID_ORIGIN.clone().add(new THREE.Vector3(0, 3.6, -4.5)),
      2.2
    );
  }

  private pyramidSpot(lane: number, lanes: number, step: number) {
    const x = (lane - (lanes - 1) / 2) * this.laneSpacing;
    return step === 0 ? new THREE.Vector3(x, 0, 1.0) : new THREE.Vector3(x, step * STEP_H, -step * STEP_D);
  }

  movePyramid(moves: PyramidMove[], onArrive: (m: PyramidMove) => void) {
    const lanes = this.pyramidLanes.size;
    for (const m of moves) {
      const rig = this.slots.get(m.playerId)?.rig;
      const lane = this.pyramidLanes.get(m.playerId);
      if (!rig || lane === undefined) continue;
      const tl = gsap.timeline({ onComplete: () => onArrive(m) });
      rig.play('cheer');
      for (let s = m.from + 1; s <= m.to; s++) {
        const target = this.pyramidSpot(lane, lanes, s);
        tl.to(rig.root.position, { x: target.x, z: target.z, duration: 0.42, ease: 'none' });
        tl.to(rig.root.position, { y: target.y + 0.7, duration: 0.21, ease: 'power2.out' }, '<');
        tl.to(rig.root.position, { y: target.y, duration: 0.21, ease: 'power2.in' }, '>');
      }
      tl.call(() => rig.play('idle'));
    }
  }

  exitPyramid() {
    if (this.mode !== 'pyramid') return;
    this.mode = 'studio';
    for (const slot of this.slots.values()) {
      if (!slot.rig) continue;
      slot.rig.root.remove(slot.label);
      slot.anchor.add(slot.label);
      slot.label.position.set(0, 2.95, 0);
      slot.anchor.add(slot.rig.root);
      slot.rig.root.position.set(0, 0, 0);
      slot.rig.root.scale.setScalar(1);
    }
    if (this.pyramid) {
      disposeDeep(this.pyramid);
      this.pyramid.removeFromParent();
      this.pyramid = null;
      this.trophy = null;
    }
    const cam = this.studioCam();
    this.moveCamera(cam.pos, cam.target, 1.2);
    this.sync(this.lastPlayers, { phase: 'LOBBY' });
  }

  private moveCamera(pos: THREE.Vector3, target: THREE.Vector3, duration: number) {
    gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration, ease: 'power2.inOut' });
    gsap.to(this.camTarget, { x: target.x, y: target.y, z: target.z, duration, ease: 'power2.inOut' });
  }

  // ------------------------------------------------------------ loop

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    // Su schermi stretti allontana la camera perché entrino tutti i podi.
    this.camera.fov = w / h < 1.4 ? 50 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** Applica subito le impostazioni video (tranne l'antialiasing, che vale dal prossimo avvio). */
  setVideo(video: VideoSettings) {
    this.video = video;
    this.autoQuality = video.quality === 'auto';
    if (video.quality !== 'auto') this.quality = video.quality;
    this.perf = { since: performance.now() + 4000, sum: 0, n: 0 };
    this.applyQuality();
  }

  private applyQuality() {
    const low = this.quality === 'low';
    // risoluzione di disegno: quella dello schermo × la scala scelta (sotto 100% = più fluido, sopra = più nitido)
    const base = low ? 1 : Math.min(window.devicePixelRatio, 1.25);
    this.renderer.setPixelRatio(Math.max(0.4, base * this.video.scale));
    const shadows = !low && this.video.shadows;
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    const fps = this.video.fps > 0 ? this.video.fps : 1000;
    this.maxFps = low ? Math.min(30, fps) : fps;
    // Attivare/disattivare le ombre richiede di ricompilare i materiali.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
    this.resize();
  }

  /** Se la media dei frame resta sotto ~35 fps per qualche secondo, passa alla qualità bassa. */
  private trackPerformance(now: number, interval: number) {
    if (!this.autoQuality || this.quality === 'low' || now < this.perf.since) return;
    if (interval > 250) return; // scheda in background o pausa: non è un dato utile
    this.perf.sum += interval;
    if (++this.perf.n < 120) return;
    const avg = this.perf.sum / this.perf.n;
    this.perf.sum = 0;
    this.perf.n = 0;
    if (avg > 28) {
      this.quality = 'low';
      this.applyQuality();
      console.info(`[${BRAND.name}] ${Math.round(1000 / avg)} fps medi: passo alla qualità bassa (?q=high per forzare l'alta)`);
    }
  }

  private frame(now: number) {
    // Limite di fps: niente lavoro oltre il necessario.
    const interval = now - this.lastFrame;
    if (interval < 1000 / this.maxFps - 2) return;
    this.lastFrame = now;
    this.trackPerformance(now, interval);

    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    for (const s of this.slots.values()) s.rig?.update(dt);

    for (let i = 0; i < this.bulbs.length; i++) {
      const on =
        this.bulbMode === 'chase' ? (Math.floor(t * 12) + i) % 4 === 0 :
        this.bulbMode === 'blink' ? Math.floor(t * 4) % 2 === i % 2 :
        (Math.floor(t * 1.5) + i) % 6 !== 0;
      if (this.bulbOn[i] !== on) {
        this.bulbOn[i] = on;
        this.bulbs[i].color.set(on ? '#fff3b0' : '#36596a');
      }
    }
    if (this.trophy) this.trophy.rotation.y += dt * 1.2;
    if (this.bomb && this.bombHolder && !this.bombFlying) {
      const spot = this.bombSpot(this.bombHolder);
      const shake = 0.02 + this.bombHeat * 0.12;
      this.bomb.position.set(spot.x + Math.sin(t * 40) * shake, spot.y + Math.sin(t * 3) * 0.08, spot.z + Math.cos(t * 37) * shake);
      if (this.bombSpark) this.bombSpark.scale.setScalar(0.7 + Math.abs(Math.sin(t * (14 + this.bombHeat * 30))) * 0.9);
    }

    this.camera.lookAt(this.camTarget);
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
