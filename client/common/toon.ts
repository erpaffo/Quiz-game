import * as THREE from 'three';

// Cel-shading: MeshToonMaterial con una gradient map a 3 toni (ombra, mezzatinta, luce)
// e contorno nero ottenuto con la tecnica "inverted hull" (copia della mesh, facce
// posteriori, vertici spinti lungo la normale).

let gradient: THREE.DataTexture | null = null;

export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMat(color: THREE.ColorRepresentation, extra: THREE.MeshToonMaterialParameters = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

const outlineCache = new Map<string, THREE.MeshBasicMaterial>();

export function outlineMaterial(thickness: number, color = '#14101f'): THREE.MeshBasicMaterial {
  const key = `${thickness.toFixed(4)}|${color}`;
  let m = outlineCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n  transformed += normalize(normal) * ${thickness.toFixed(4)};`
      );
    };
    m.customProgramCacheKey = () => `outline-${key}`;
    outlineCache.set(key, m);
  }
  return m;
}

export function addOutline(mesh: THREE.Mesh, thickness = 0.022) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  o.raycast = () => {};
  o.userData.isOutline = true;
  mesh.add(o);
  return o;
}
