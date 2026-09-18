import * as THREE from 'three';
import { buildExtrusionGeometry } from './ExtrusionHandle.js';
import {
  PRESET_BY_NAME,
  buildCatalogueGeometry,
  buildCatalogueMaterial,
  buildLatheGeometry,
  buildMaterials,
  withSingleFaceGroup,
} from './geometry.js';
import type { PartDraft } from './types.js';
import { isPartNode, isRefNode } from './documentTree.js';
import type { SetDocument, SetNode } from './documentTree.js';
import type { Transform } from './transform.js';

/**
 * Build a nested THREE scene from a tree document — pure, headless, no Sketcher
 * state. Every node carries its own local transform, so a group node becomes a
 * THREE.Group placed at its transform and a part leaf becomes a mesh placed at its
 * own (the group's transform then composes with the leaf's, reproducing world
 * space) — plus `userData.sketcherPartId`. Geometry and materials (including face
 * colours and textures) are realised here; group re-parenting and attach joints live
 * in the interactive Sketcher.
 *
 * An instance (`node.ref`) is expanded from its Definition by `resolve`, under the
 * instance's own transform, so the reference — not a copy — is what the document holds and
 * the paths inside the expansion stay the Definition's. Without a resolver, or when the
 * Definition cannot be found, an instance contributes no geometry.
 */
export type RefResolver = (ref: string) => SetDocument | null;

/** A Definition may contain instances of its own, so expansion needs a depth limit. */
const MAX_REF_DEPTH = 16;

export function realiseDocument(doc: { root: SetNode[] }, resolve?: RefResolver): THREE.Group {
  const root = new THREE.Group();
  root.name = 'realised-set';
  for (const node of doc.root) {
    const object = realiseNode(node, resolve, 0);
    if (object) root.add(object);
  }
  return root;
}

function realiseNode(node: SetNode, resolve: RefResolver | undefined, depth: number): THREE.Object3D | null {
  if (isRefNode(node)) return realiseInstance(node, resolve, depth);
  if (isPartNode(node)) return buildPartMesh(node.content, node.transform);
  // A light is not geometry, so it is not realised here: a model's lights come from its
  // `LightAsset[]` (built from the scene's `LightConfig[]`), and a THREE.Light buried in
  // a realised group would be invisible to light animation. `collectLights()` is the one
  // reader of a document's lights — the model boundary and the Sketcher both use it.
  if (node.role === 'light') return null;

  const group = new THREE.Group();
  group.name = node.name ?? 'group';
  // Tag group nodes so the runtime can map them back to the tree when building
  // SketcherParts + AssemblyGroups from the realised scene.
  group.userData = { isGroupNode: true, groupName: node.name, groupIsGroup: node.isGroup === true };
  applyTransform(group, node.transform);
  for (const child of node.children) {
    const object = realiseNode(child, resolve, depth);
    if (object) group.add(object);
  }
  return group;
}

/**
 * Realise a node's Definition as one object under the node's own transform: the
 * Definition's root nodes become children of that object, so an instance composes exactly
 * as a group does.
 */
function realiseInstance(node: SetNode, resolve: RefResolver | undefined, depth: number): THREE.Object3D | null {
  if (!resolve || depth >= MAX_REF_DEPTH) return null;
  const definition = resolve(node.ref!);
  if (!definition) return null;

  const instance = new THREE.Group();
  instance.name = node.ref!;
  // Tagged so a caller can tell instance geometry from the host document's own nodes.
  instance.userData = { isRefNode: true, ref: node.ref };
  applyTransform(instance, node.transform);
  for (const child of definition.root) {
    const object = realiseNode(child, resolve, depth + 1);
    if (object) instance.add(object);
  }
  return instance;
}

/** Place a realised object at a node's local transform. */
function applyTransform(object: THREE.Object3D, t: Transform): void {
  object.position.set(t.position[0], t.position[1], t.position[2]);
  object.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
  object.scale.set(t.scale[0], t.scale[1], t.scale[2]);
}

export function buildPartMesh(pd: PartDraft, transform: Transform): THREE.Mesh | null {
  let geometry: THREE.BufferGeometry;
  let lathePoints: [number, number][] | null = null;
  let depth = 0;

  if (pd.kind === 'primitive') {
    const preset = PRESET_BY_NAME.get(pd.name.toLowerCase());
    if (!preset) return null;
    geometry = preset.geometry();
  } else if (pd.kind === 'catalogue') {
    if (!pd.geometry) return null;
    geometry = withSingleFaceGroup(buildCatalogueGeometry(pd.geometry));
  } else if (pd.kind === 'lathed') {
    if (!pd.lathePoints) return null;
    lathePoints = pd.lathePoints;
    geometry = buildLatheGeometry(pd.lathePoints, pd.phiLength ?? Math.PI * 2);
  } else {
    if (!pd.shapePoints || !pd.depth) return null;
    depth = pd.depth;
    const pts = pd.shapePoints.map(([x, y]) => new THREE.Vector2(x, y));
    const shape = new THREE.Shape(pts);
    if (pd.holes) {
      for (const holePts of pd.holes) {
        shape.holes.push(new THREE.Path(holePts.map(([x, y]) => new THREE.Vector2(x, y))));
      }
    }
    geometry = buildExtrusionGeometry(shape, depth);
  }

  // A catalogue part carries its own material (roughness/metalness/texture), so it
  // keeps that body instead of the flat colour a sketched part is built from.
  const materials = pd.kind === 'catalogue' && pd.material
    ? [buildCatalogueMaterial(pd.material)]
    : buildMaterials(geometry, pd.color, lathePoints !== null ? THREE.DoubleSide : THREE.FrontSide);
  const faceColors = pd.faceColors ? [...pd.faceColors] : materials.map(() => pd.color);
  faceColors.forEach((c, i) => { if (i < materials.length) materials[i].color.setHex(c); });
  const faceTextures = pd.faceTextures ? [...pd.faceTextures] : materials.map(() => null);
  faceTextures.forEach((url, i) => {
    if (url && i < materials.length) {
      materials[i].map = new THREE.TextureLoader().load(url);
      materials[i].needsUpdate = true;
    }
  });
  const mesh = new THREE.Mesh(geometry, materials);
  applyTransform(mesh, transform);
  mesh.updateWorldMatrix(false, true);
  mesh.userData = { sketcherPartId: pd.id, depth };
  return mesh;
}
