import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralHumanoid, DEFAULT_COLORS } from './ProceduralHumanoid.js';
import { resolveCharacterSpec } from './characterSpec.js';
import type { CharacterSpec } from './characterSpec.js';
import { semanticToBoneParams, semanticToRingParams } from './semanticParams.js';
import { exportCharacterGLB } from './exportCharacterGLB.js';
import { RIG_GLB_PATH, ANIM_GLB_PATHS } from './animationClips.js';

/**
 * Build a ProceduralHumanoid from a high-level `CharacterSpec`, mirroring the
 * character page's `buildHumanoid` (organic loft body + face, height scale).
 */
export function buildHumanoidFromSpec(
  spec: CharacterSpec,
  rigGltfScene: THREE.Group,
  clips: THREE.AnimationClip[],
): ProceduralHumanoid {
  const resolved = resolveCharacterSpec(spec);
  const boneParams = semanticToBoneParams(resolved.semantic);
  const ringParams = semanticToRingParams(resolved.semantic);
  const colors = { ...DEFAULT_COLORS, skin: resolved.skinColor };
  const humanoid = new ProceduralHumanoid(
    rigGltfScene,
    clips,
    colors,
    'organic',
    boneParams,
    0,
    resolved.faceParams,
    -20,
    ringParams,
    resolved.outfit,
  );
  humanoid.root.scale.setScalar(resolved.heightScale);
  return humanoid;
}

async function loadClips(loader: GLTFLoader): Promise<THREE.AnimationClip[]> {
  const results = await Promise.allSettled(
    ANIM_GLB_PATHS.map(async (path) => {
      const gltf = await loader.loadAsync(path);
      const label = path.split('/').pop()!.replace(/^anim-/, '').replace(/\.glb$/, '');
      for (const clip of gltf.animations) clip.name = label;
      return gltf;
    }),
  );
  const clips: THREE.AnimationClip[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') clips.push(...result.value.animations);
  }
  return clips;
}

/**
 * Materialize a spec-backed character into a GLB blob URL (body + baked clips)
 * so the existing GLB scene pipeline can load it unchanged. The spec stays the
 * source of truth; the GLB is derived at load time (ROADMAP_API.md API-2).
 */
export async function specCharacterToGlbUrl(spec: CharacterSpec): Promise<string> {
  const loader = new GLTFLoader();
  const rig = await loader.loadAsync(RIG_GLB_PATH);
  const clips = await loadClips(loader);
  const humanoid = buildHumanoidFromSpec(spec, rig.scene, clips);
  const { blob } = await exportCharacterGLB(humanoid);
  return URL.createObjectURL(blob);
}
