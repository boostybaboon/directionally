/** Rig skeleton GLB (no mesh) the procedural humanoid builds its body around. */
export const RIG_GLB_PATH = '/models/gltf/xbot-rig.glb';

/**
 * Animation GLBs loaded as clips for the procedural humanoid. Each filename
 * becomes the clip label ("anim-walk.glb" → "walk"), immune to whatever Blender
 * puts in the animation.name field.
 */
export const ANIM_GLB_PATHS = [
  '/models/gltf/anim-tpose.glb',
  '/models/gltf/anim-idle.glb',
  '/models/gltf/anim-walk.glb',
  '/models/gltf/anim-run.glb',
  '/models/gltf/anim-jump.glb',
  '/models/gltf/anim-turn-left.glb',
  '/models/gltf/anim-turn-right.glb',
  '/models/gltf/anim-turn-left-90.glb',
  '/models/gltf/anim-turn-right-90.glb',
  '/models/gltf/anim-strafe-left.glb',
  '/models/gltf/anim-strafe-right.glb',
  '/models/gltf/anim-strafe-left-walk.glb',
  '/models/gltf/anim-strafe-right-walk.glb',
];
