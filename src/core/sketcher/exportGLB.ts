import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { SketcherSession } from './types.js';

/**
 * Exports a SketcherSession as a binary GLB file.
 *
 * All parts are merged into a single THREE.Group so the resulting GLB is
 * self-contained and importable into any standard 3D tool.
 */
export async function exportGLB(session: SketcherSession): Promise<{ blob: Blob; filename: string }> {
  const group = new THREE.Group();
  for (const part of session.parts) {
    const clone = part.mesh.clone();
    clone.userData = { sketcherPartId: part.id, depth: part.depth };
    group.add(clone);
  }
  group.userData = {
    source: 'directionally-sketcher',
    createdAt: new Date().toISOString(),
  };

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary: true });
  const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
  const filename = `sketch-${Date.now()}.glb`;
  return { blob, filename };
}
