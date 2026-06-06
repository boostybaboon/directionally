import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { ProceduralHumanoid } from './ProceduralHumanoid.js';

/**
 * Locomotion clips have a net XY displacement over their duration that fights
 * authored move actions — strip the hips XY so position is driven by the action
 * alone. Action clips (jump, turns) use XY displacement for internal physics
 * (e.g. the hips shift over the planted foot during a jump launch) and should
 * keep it, otherwise the feet slide sideways.
 */
const LOCOMOTION_CLIP_PATTERNS = /walk|run|strafe/i;

/**
 * Zero out the XY components of the `mixamorigHips.position` track for
 * locomotion clips, leaving the Z (vertical) axis intact. Mixamo exports bake
 * a -90° X rotation into the Armature, so hips local X/Y = world side/forward.
 * Non-locomotion clips are returned unchanged.
 */
function toInPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  if (!LOCOMOTION_CLIP_PATTERNS.test(clip.name)) return clip;
  const tracks = clip.tracks.map((t) => {
    if (t.name !== 'mixamorigHips.position') return t;
    const vt = t as THREE.VectorKeyframeTrack;
    const values = Float32Array.from(vt.values);
    for (let i = 0; i < values.length; i += 3) {
      values[i]     = 0; // X — world side-to-side
      values[i + 1] = 0; // Y — world forward/back
      // values[i + 2]: Z (world up) preserved — vertical bob, crouch
    }
    return new THREE.VectorKeyframeTrack(t.name, Array.from(vt.times), Array.from(values));
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

/**
 * Exports a ProceduralHumanoid as a binary GLB file, including the full rig
 * and all loaded animation clips. Each rigid body segment moves with its parent
 * bone, giving correct playback for robotic (non-skinned) characters.
 *
 * Clips are exported as in-place animations (root motion stripped) so that
 * authored move-action blocks control position without fighting the animation.
 */
export async function exportCharacterGLB(humanoid: ProceduralHumanoid): Promise<{ blob: Blob; filename: string }> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(humanoid.root, {
    binary: true,
    animations: humanoid.clips.map(toInPlace),
  });
  const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
  return { blob, filename: `character-${Date.now()}.glb` };
}
