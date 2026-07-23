import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

export interface LoadProgress {
  loaded: number;
  total: number;
  ratio: number;
}

/**
 * Wraps THREE.LoadingManager so the UI gets real progress, and folds the
 * webfont load into the same progress bar (signs are drawn with the Korean
 * webfont, so it must be ready before world building).
 */
export class AssetLoader {
  readonly manager: THREE.LoadingManager;
  private gltfLoader: GLTFLoader;
  private progressCbs: ((p: LoadProgress) => void)[] = [];

  constructor() {
    this.manager = new THREE.LoadingManager();
    this.gltfLoader = new GLTFLoader(this.manager);
    this.manager.onProgress = (_url, loaded, total) => {
      this.emit({ loaded, total, ratio: total > 0 ? loaded / total : 0 });
    };
  }

  onProgress(cb: (p: LoadProgress) => void): void {
    this.progressCbs.push(cb);
  }

  private emit(p: LoadProgress): void {
    for (const cb of this.progressCbs) cb(p);
  }

  loadGLTF(url: string): Promise<GLTF> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(url, resolve, undefined, reject);
    });
  }

  /** Waits for the sign/UI fonts; never rejects (fallback fonts are fine). */
  async loadFonts(): Promise<void> {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('700 64px "IBM Plex Sans KR"'),
          document.fonts.load('400 16px "Silkscreen"'),
        ]),
        new Promise((r) => setTimeout(r, 3500)),
      ]);
    } catch {
      /* offline dev: canvas falls back to system fonts */
    }
  }
}
