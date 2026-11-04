import * as THREE from 'three';
import { CharacterRig } from '../common/characters3d';
import { lookKey, type CustomChoice } from '../../shared/characters';

/**
 * Anteprima 3D del personaggio nella lobby del controller. Un solo renderer WebGL
 * riusato a ogni ridisegno della vista (i telefoni hanno pochi contesti WebGL disponibili).
 */
class Preview {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private rig: CharacterRig | null = null;
  private clock = new THREE.Clock();
  private running = false;
  private lastFrame = 0;
  private container: HTMLElement | null = null;

  constructor() {
    window.addEventListener('resize', this.resize);
  }

  private init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.domElement.className = 'preview-canvas';
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#2f6f80', 1.7));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(3, 6, 6);
    this.scene.add(sun);
    this.camera.position.set(0, 1.6, 6.4);
    this.camera.lookAt(0, 1.25, 0);
  }

  mount(container: HTMLElement) {
    if (!this.renderer) this.init();
    container.appendChild(this.renderer!.domElement);
    this.container = container;
    this.resize();
    if (!this.running) {
      this.running = true;
      this.renderer!.setAnimationLoop((now) => this.frame(now));
    }
  }

  // updateStyle=false: la dimensione CSS (100%) resta del layout, altrimenti i px inline
  // restano vecchi dopo la rotazione e il layout oscilla ("vibrazione").
  private resize = () => {
    const c = this.container;
    if (!c || !this.renderer) return;
    const w = c.clientWidth || 240;
    const h = c.clientHeight || 240;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  show(characterId: string, skinId: string, selfie: string | null, custom: CustomChoice = {}) {
    if (!this.rig) {
      this.rig = new CharacterRig(characterId, skinId, custom);
      this.scene.add(this.rig.root);
    } else if (this.rig.lookKey !== lookKey(characterId, skinId, custom)) {
      // cambio di personaggio o skin: piccolo sobbalzo; cambio di un tratto: saluto
      const bigChange = this.rig.characterId !== characterId || this.rig.skinId !== skinId;
      this.rig.setLook(characterId, skinId, custom);
      this.rig.play(bigChange ? 'hit' : 'wave');
      if (!bigChange) setTimeout(() => this.rig?.currentAnim === 'wave' && this.rig.play('idle'), 900);
    }
    this.rig.setSelfie(selfie);
  }

  wave() {
    this.rig?.play('wave');
  }

  unmount() {
    this.running = false;
    this.renderer?.setAnimationLoop(null);
    this.renderer?.domElement.remove();
  }

  private frame(now: number) {
    // 30 fps bastano per un'anteprima e dimezzano il consumo di batteria del telefono.
    if (now - this.lastFrame < 1000 / 30 - 2) return;
    this.lastFrame = now;
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.rig) {
      this.rig.update(dt);
      this.rig.root.rotation.y = Math.sin(this.clock.elapsedTime * 0.7) * 0.5;
    }
    this.renderer!.render(this.scene, this.camera);
  }
}

export const preview = new Preview();
