import * as THREE from 'three';

/**
 * Runtime-synthesised face animation (Track CAT, blink-as-animation).
 *
 * ProceduralHumanoid drives blinking in its update loop by tweening each eyelid
 * hemisphere's rotation.x. The eyelids are exported with stable names, so the
 * production scene view can rebuild the same 4s cycle as a real looping
 * AnimationClip and play it through the actor's AnimationMixer — a first-class
 * animation that blends and seeks like idle/walk rather than a per-frame hack.
 */

/** Named eyelid meshes exported by ProceduralHumanoid. */
export const EYELID_NAMES = ['eyeLidUpperL', 'eyeLidUpperR', 'eyeLidLowerL', 'eyeLidLowerR'] as const;

const BLINK_PERIOD = 4.0;
const BLINK_HALF = 0.15;

// Resting open angles, matching ProceduralHumanoid's hardcoded cover values
// (upper cover 0.35, lower cover 0.30). Fully closed is always 0.
const UPPER_OPEN_RX = (0.35 - 0.5) * Math.PI;
const LOWER_OPEN_RX = (0.30 - 0.5) * Math.PI;

/** Returns the named eyelid meshes present under `root` (missing ones are skipped). */
export function findEyelids(root: THREE.Object3D): THREE.Mesh[] {
  return EYELID_NAMES
    .map((name) => root.getObjectByName(name))
    .filter((obj): obj is THREE.Mesh => obj instanceof THREE.Mesh);
}

/**
 * Builds a looping blink clip: close over [0, 0.15], open over [0.15, 0.30],
 * hold open until the loop point. Tracks target each lid's local rotation.x.
 */
export function buildBlinkClip(actorName: string, lids: THREE.Mesh[]): THREE.AnimationClip {
  const times = [0, BLINK_HALF, BLINK_HALF * 2, BLINK_PERIOD];
  const tracks = lids.map((lid) => {
    const openRx = lid.name.startsWith('eyeLidUpper') ? UPPER_OPEN_RX : LOWER_OPEN_RX;
    return new THREE.NumberKeyframeTrack(`${lid.name}.rotation[x]`, times, [openRx, 0, openRx, openRx]);
  });
  return new THREE.AnimationClip(`${actorName}_blink`, BLINK_PERIOD, tracks);
}
