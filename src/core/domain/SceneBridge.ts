import * as THREE from 'three';
import { Model } from '../../lib/Model.js';
import { PerspectiveCameraAsset } from '../../lib/model/Camera.js';
import {
  DirectionalLightAsset,
  HemisphereLightAsset,
  SpotLightAsset,
  type LightAsset,
} from '../../lib/model/Light.js';
import {
  BoxGeometryAsset,
  PlaneGeometryAsset,
  SphereGeometryAsset,
  type GeometryAsset,
} from '../../lib/model/Geometry.js';
import { MeshStandardMaterialAsset } from '../../lib/model/Material.js';
import { MeshAsset } from '../../lib/model/Mesh.js';
import { GLTFAsset } from '../../lib/model/GLTF.js';
import {
  KeyframeAction,
  GLTFAction,
  KeyframeTrackType,
  LoopStyle as ModelLoopStyle,
  type Action,
} from '../../lib/model/Action.js';
import type { Scene } from './Scene.js';
import type { Actor } from './Production.js';
import type { GeometryConfig, MaterialConfig, LightConfig, TrackType } from './types.js';

// --- helpers ---

function buildGeometry(config: GeometryConfig): GeometryAsset {
  switch (config.type) {
    case 'box':
      return new BoxGeometryAsset(config.width, config.height, config.depth);
    case 'plane':
      return new PlaneGeometryAsset(config.width, config.height);
    case 'sphere':
      return new SphereGeometryAsset(config.radius, config.widthSegments, config.heightSegments);
  }
}

function buildMaterial(config: MaterialConfig): MeshStandardMaterialAsset {
  return new MeshStandardMaterialAsset(
    config.color,
    config.emissive,
    config.metalness,
    config.roughness,
  );
}

function buildLight(config: LightConfig): LightAsset | null {
  switch (config.type) {
    case 'directional': {
      const light = new DirectionalLightAsset(config.id, config.color, config.intensity);
      light.position = new THREE.Vector3(...config.position);
      return light;
    }
    case 'hemisphere': {
      const light = new HemisphereLightAsset(config.id, config.skyColor, config.groundColor, config.intensity);
      if (config.position) {
        light.position = new THREE.Vector3(...config.position);
      }
      return light;
    }
    case 'spot': {
      const light = new SpotLightAsset(
        config.id,
        config.color,
        config.intensity,
        config.angle ?? Math.PI / 4,
        config.penumbra ?? 0,
        config.decay ?? 2,
      );
      light.position = new THREE.Vector3(...config.position);
      if (config.target) {
        light.target = new THREE.Vector3(...config.target);
      }
      return light;
    }
    case 'point':
      // PointLightAsset not yet in model layer; skip with warning
      console.warn(`SceneBridge: point light "${config.id}" skipped — no PointLightAsset in model layer yet`);
      return null;
  }
}

function trackTypeToDomain(trackType: TrackType): KeyframeTrackType {
  switch (trackType) {
    case 'number':
      return KeyframeTrackType.NumberKeyframeTrack;
    case 'vector':
      return KeyframeTrackType.VectorKeyframeTrack;
    case 'quaternion':
      return KeyframeTrackType.QuaternionKeyframeTrack;
  }
}

// ---

/**
 * Convert a domain Scene + production actor roster into a Model that the existing
 * Presenter/PlaybackEngine pipeline can render.
 *
 * Not all SceneAction types have renderer support yet:
 *   - SpeakAction, EnterAction, ExitAction are logged and skipped.
 */
export function sceneToModel(scene: Scene, actors: Actor[]): Model {
  const actorMap = new Map<string, Actor>(actors.map((a) => [a.id, a]));

  // Camera
  const camCfg = scene.camera;
  const camera = new PerspectiveCameraAsset(
    'camera',
    camCfg.fov ?? 60,
    camCfg.near ?? 0.1,
    camCfg.far ?? 1000,
  );
  camera.position = new THREE.Vector3(...camCfg.position);
  camera.lookAt = new THREE.Vector3(...camCfg.lookAt);

  // Lights
  const lights: LightAsset[] = [];
  for (const lCfg of scene.lights) {
    const light = buildLight(lCfg);
    if (light) lights.push(light);
  }

  // Set pieces → MeshAssets
  const meshes: MeshAsset[] = [];
  for (const piece of scene.set) {
    const mesh = new MeshAsset(piece.name, buildGeometry(piece.geometry), buildMaterial(piece.material));
    if (piece.position) mesh.position = new THREE.Vector3(...piece.position);
    if (piece.rotation) mesh.rotation = new THREE.Euler(...piece.rotation);
    if (piece.scale) mesh.scale = new THREE.Vector3(...piece.scale);
    if (piece.parent) mesh.parent = piece.parent;
    meshes.push(mesh);
  }

  // Staged actors → MeshAssets or GLTFAssets
  const gltfs: GLTFAsset[] = [];
  for (const staged of scene.stagedActors) {
    const actor = actorMap.get(staged.actorId);
    if (!actor) {
      console.warn(`SceneBridge: unknown actorId "${staged.actorId}" — skipping`);
      continue;
    }
    if (staged.offstage) continue;

    const asset = actor.asset;
    if (asset.type === 'gltf') {
      const gltf = new GLTFAsset(actor.id, asset.url);
      if (staged.startPosition) gltf.position = new THREE.Vector3(...staged.startPosition);
      if (staged.startRotation) gltf.rotation = new THREE.Euler(...staged.startRotation);
      gltfs.push(gltf);
    } else {
      const mesh = new MeshAsset(actor.id, buildGeometry(asset.geometry), buildMaterial(asset.material));
      if (staged.startPosition) mesh.position = new THREE.Vector3(...staged.startPosition);
      if (staged.startRotation) mesh.rotation = new THREE.Euler(...staged.startRotation);
      meshes.push(mesh);
    }
  }

  // Actions
  const actions: Action[] = [];
  for (const action of scene.actions) {
    switch (action.type) {
      case 'move': {
        const kf = action.keyframes;
        actions.push(
          new KeyframeAction(
            `${action.targetId}_${kf.property}_move`,
            action.targetId,
            action.startTime,
            trackTypeToDomain(kf.trackType),
            { property: kf.property, times: kf.times, values: kf.values },
            kf.loop === 'repeat' ? ModelLoopStyle.LoopRepeat : ModelLoopStyle.LoopOnce,
            kf.loop === 'repeat' ? Infinity : 1,
            kf.loop !== 'repeat',
          ),
        );
        break;
      }
      case 'animate': {
        actions.push(
          new GLTFAction(
            `${action.actorId}_${action.animationName}`,
            action.actorId,
            action.startTime,
            action.animationName,
          ),
        );
        break;
      }
      case 'lighting': {
        const kf = action.keyframes;
        actions.push(
          new KeyframeAction(
            `${action.lightId}_${kf.property}_lighting`,
            action.lightId,
            action.startTime,
            trackTypeToDomain(kf.trackType),
            { property: kf.property, times: kf.times, values: kf.values },
            kf.loop === 'repeat' ? ModelLoopStyle.LoopRepeat : ModelLoopStyle.LoopOnce,
            kf.loop === 'repeat' ? Infinity : 1,
            kf.loop !== 'repeat',
          ),
        );
        break;
      }
      case 'camera': {
        const kf = action.keyframes;
        actions.push(
          new KeyframeAction(
            `camera_${kf.property}_camera`,
            'camera',
            action.startTime,
            trackTypeToDomain(kf.trackType),
            { property: kf.property, times: kf.times, values: kf.values },
            kf.loop === 'repeat' ? ModelLoopStyle.LoopRepeat : ModelLoopStyle.LoopOnce,
            kf.loop === 'repeat' ? Infinity : 1,
            kf.loop !== 'repeat',
          ),
        );
        break;
      }
      case 'speak':
      case 'enter':
      case 'exit':
        console.warn(`SceneBridge: action type "${action.type}" has no renderer support yet — skipped`);
        break;
    }
  }

  return new Model(camera, meshes, gltfs, actions, lights, scene.backgroundColor);
}
