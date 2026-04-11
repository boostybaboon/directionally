import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CartoonSketcher } from './CartoonSketcher.js';
import { PolygonSketcher } from './PolygonSketcher.js';
import { ExtrusionHandle } from './ExtrusionHandle.js';
import { exportGLB } from './exportGLB.js';
import type { SketcherSession } from './types.js';

// GLTFExporter uses FileReader internally which is not available in the Node
// test environment. Mock the module so exportGLB tests are self-contained.
vi.mock('three/examples/jsm/exporters/GLTFExporter.js', () => ({
  GLTFExporter: class {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async parseAsync(_input: unknown, _options: unknown): Promise<ArrayBuffer> {
      return new ArrayBuffer(16);
    }
  },
}))

// TextureLoader.load() creates a DOM Image element which does not exist in
// the Node test environment. Return a bare Texture so texture-related unit
// tests stay in-process without any browser globals.
beforeAll(() => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene(): THREE.Scene {
  return new THREE.Scene();
}

function makePerspectiveCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  cam.position.set(0, 10, 10);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  return cam;
}

/**
 * Build a simple THREE.Shape square in the XZ plane
 * (PolygonSketcher produces Vector2(x, z) points).
 */
function makeSquareShape(): THREE.Shape {
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(1, 0),
    new THREE.Vector2(1, 1),
    new THREE.Vector2(0, 1),
  ]);
  return shape;
}

// ---------------------------------------------------------------------------
// PolygonSketcher unit tests
// ---------------------------------------------------------------------------

describe('PolygonSketcher', () => {
  it('starts with 0 committed points', () => {
    const sk = new PolygonSketcher();
    expect(sk.pointCount).toBe(0);
    sk.dispose();
  });

  it('onShapeClosed fires when polygon is closed near first point', () => {
    const sk = new PolygonSketcher();
    const closed = vi.fn();
    sk.onShapeClosed = closed;
    const cam = makePerspectiveCamera();

    // Place camera directly above at y=5 looking straight down so NDC (0,0) → world (0,0,0)
    const topCam = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    topCam.position.set(0, 10, 0);
    topCam.lookAt(0, 0, 0);
    topCam.updateMatrixWorld(true);

    // Use four clicks to form a square: the 4th click returns to the first
    // but we need ≥3 points first. We place 3 distinct points, then click
    // near the first to close.
    // Direct invocation on the internal _raycast substitute: we drive through
    // the public onClick API using carefully-chosen camera math OR we can
    // directly call the callback by mocking _closeShape behavior.
    //
    // Simpler: verify fire count via 3 raw .onClick calls that land on grid,
    // then a 4th that lands within GRID_SNAP*2 of the first.
    // At y=10 with 90° fov and aspect=1, NDC x/y map approximately to ±10 in world.
    // Skip raw-camera approach and test _closeShape indirectly via the shape callback:
    sk.onShapeClosed = (shape, centroid) => {
      expect(shape.curves.length + shape.getPoints().length).toBeGreaterThan(0);
      expect(centroid).toBeInstanceOf(THREE.Vector3);
      closed();
    };

    // Manually inject points by simulating exactly: first add 3 points via
    // the internal points array trick — which is private. Instead, call
    // onClick directly with an orthographic camera so NDC → world is simple.
    const ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    ortho.position.set(0, 10, 0);
    ortho.lookAt(0, 0, 0);
    ortho.updateProjectionMatrix();
    ortho.updateMatrixWorld(true);

    // With this orthographic camera the ground plane intersect may not work
    // reliably. Instead test closing behaviour by driving PolygonSketcher
    // through a perspective camera positioned to give predictable NDC→world.
    // Easiest: just check the onShapeClosed callback is wired, not the full
    // camera math (that's an integration concern).
    // Trigger _closeShape by clicking the SAME spot 4 times (≥3 points placed
    // and a 4th click within GRID_SNAP*2 distance).
    // Use the perspective camera from above. NDC (0,0) → ray straight down → hits (0,0,0).
    sk.onClick(0, 0, cam);   // p0 = (0,0,0)
    sk.onClick(0.1, 0, cam); // p1  (different x)
    sk.onClick(0, 0.1, cam); // p2  (different y NDC)
    sk.onClick(0, 0, cam);   // close near p0 (same NDC → same snapped world point → dist 0)
    expect(closed).toHaveBeenCalledTimes(1);
    sk.dispose();
  });

  it('does not close until at least 3 committed points', () => {
    const sk = new PolygonSketcher();
    const closed = vi.fn();
    sk.onShapeClosed = closed;
    const cam = makePerspectiveCamera();
    // Click the same NDC point twice — should not close (only 1 point placed then 2nd click)
    sk.onClick(0, 0, cam);
    sk.onClick(0, 0, cam); // 2nd click at same location — fewer than 3 → no close
    expect(closed).not.toHaveBeenCalled();
    sk.dispose();
  });

  it('reset() brings pointCount back to 0', () => {
    const sk = new PolygonSketcher();
    const cam = makePerspectiveCamera();
    sk.onClick(0, 0, cam);
    sk.onClick(0.1, 0, cam);
    expect(sk.pointCount).toBeGreaterThan(0);
    sk.reset();
    expect(sk.pointCount).toBe(0);
    sk.dispose();
  });
});

// ---------------------------------------------------------------------------
// CartoonSketcher integration tests
// ---------------------------------------------------------------------------

describe('CartoonSketcher', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let sketcher: CartoonSketcher;

  beforeEach(() => {
    scene = makeScene();
    camera = makePerspectiveCamera();
    sketcher = new CartoonSketcher(scene, camera);
  });

  it('starts with an empty session', () => {
    expect(sketcher.getSession().parts).toHaveLength(0);
  });

  it('startNewSketch() sets phase to drawing and adds helpers to scene', () => {
    sketcher.startNewSketch();
    expect(sketcher.currentPhase).toBe('drawing');
    // line + rubberBand added
    expect(scene.children.length).toBeGreaterThanOrEqual(2);
  });

  it('a completed polygon+extrusion adds a part to the session', () => {
    sketcher.startNewSketch();
    // Drive clicks to close a square shape (≥3 pts then near first)
    sketcher.onClick(0, 0);       // p0
    sketcher.onClick(0.1, 0);     // p1
    sketcher.onClick(0, 0.1);     // p2
    sketcher.onClick(0, 0);       // close → fires onShapeClosed → ExtrusionHandle created
    expect(sketcher.currentPhase).toBe('extruding');

    // Simulate pointer interactions to commit the extrusion
    sketcher.onPointerDown(0, 0);
    sketcher.onPointerUp();       // endDrag → onExtrusionComplete → part committed
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.currentPhase).toBe('idle');
  });

  it('clearSession() empties the parts array', () => {
    sketcher.startNewSketch();
    sketcher.onClick(0, 0);
    sketcher.onClick(0.1, 0);
    sketcher.onClick(0, 0.1);
    sketcher.onClick(0, 0);
    sketcher.onPointerDown(0, 0);
    sketcher.onPointerUp();
    expect(sketcher.getSession().parts).toHaveLength(1);

    sketcher.clearSession();
    expect(sketcher.getSession().parts).toHaveLength(0);
    expect(sketcher.currentPhase).toBe('idle');
  });

  it('part mesh has non-zero vertex count after extrusion', () => {
    sketcher.startNewSketch();
    sketcher.onClick(0, 0);
    sketcher.onClick(0.1, 0);
    sketcher.onClick(0, 0.1);
    sketcher.onClick(0, 0);
    sketcher.onPointerDown(0, 0);
    sketcher.onPointerUp();
    const part = sketcher.getSession().parts[0];
    const count = part.mesh.geometry.attributes.position?.count ?? 0;
    expect(count).toBeGreaterThan(0);
  });

  it('multiple sketches accumulate parts', () => {
    for (let i = 0; i < 2; i++) {
      sketcher.startNewSketch();
      sketcher.onClick(0, 0);
      sketcher.onClick(0.1, 0);
      sketcher.onClick(0, 0.1);
      sketcher.onClick(0, 0);
      sketcher.onPointerDown(0, 0);
      sketcher.onPointerUp();
    }
    expect(sketcher.getSession().parts).toHaveLength(2);
  });

  it('insertPrimitive() adds a part and returns it', () => {
    const part = sketcher.insertPrimitive('cylinder');
    expect(part).not.toBeNull();
    expect(part!.name).toBe('Cylinder');
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0]).toBe(part);
  });

  it('insertPrimitive() adds the mesh to the scene', () => {
    const part = sketcher.insertPrimitive('box');
    expect(scene.children).toContain(part!.mesh);
  });

  it('insertPrimitive() produces a mesh with non-zero vertices', () => {
    const names = ['box', 'sphere', 'cylinder', 'capsule', 'cone'];
    for (const name of names) {
      const part = sketcher.insertPrimitive(name);
      expect(part, `${name} should resolve`).not.toBeNull();
      const count = part!.mesh.geometry.attributes.position?.count ?? 0;
      expect(count, `${name} should have vertices`).toBeGreaterThan(0);
    }
  });

  it('insertPrimitive() returns null for an unknown name', () => {
    expect(sketcher.insertPrimitive('prism')).toBeNull();
  });

  it('multiple primitives accumulate as independent parts', () => {
    sketcher.insertPrimitive('box');
    sketcher.insertPrimitive('sphere');
    sketcher.insertPrimitive('cylinder');
    expect(sketcher.getSession().parts).toHaveLength(3);
  });

  it('removePart() removes the primitive mesh from the scene', () => {
    const part = sketcher.insertPrimitive('cone')!;
    sketcher.removePart(part.id);
    expect(scene.children).not.toContain(part.mesh);
    expect(sketcher.getSession().parts).toHaveLength(0);
  });

  it('setPartColor() updates part.color and mesh material', () => {
    const part = sketcher.insertPrimitive('box')!;
    sketcher.setPartColor(part.id, 0xff0000);
    expect(part.color).toBe(0xff0000);
    expect(part.faceColors.every((c) => c === 0xff0000)).toBe(true);
    const mats = part.mesh.material as THREE.MeshStandardMaterial[];
    expect(mats.every((m) => m.color.getHex() === 0xff0000)).toBe(true);
  });

  it('setPartColor() is a no-op for unknown id', () => {
    expect(() => sketcher.setPartColor('nonexistent', 0xff0000)).not.toThrow();
  });

  it('insertPrimitive() initialises faceTextures to null for each material slot', () => {
    const part = sketcher.insertPrimitive('box')!;
    // Box has 6 face groups.
    expect(part.faceTextures).toHaveLength(6);
    expect(part.faceTextures.every((t) => t === null)).toBe(true);
  });

  it('setFaceTexture() stores the data URL and leaves other slots unaffected', () => {
    const part = sketcher.insertPrimitive('cylinder')!;
    const dataUrl = 'data:image/png;base64,abc123';
    sketcher.setFaceTexture(part.id, 0, dataUrl);
    expect(part.faceTextures[0]).toBe(dataUrl);
    expect(part.faceTextures[1]).toBeNull();
  });

  it('setFaceTexture(null) clears the slot', () => {
    const part = sketcher.insertPrimitive('box')!;
    const dataUrl = 'data:image/png;base64,abc123';
    sketcher.setFaceTexture(part.id, 0, dataUrl);
    sketcher.setFaceTexture(part.id, 0, null);
    expect(part.faceTextures[0]).toBeNull();
  });

  it('setFaceTexture() is a no-op for unknown id', () => {
    expect(() => sketcher.setFaceTexture('nonexistent', 0, 'data:image/png;base64,')).not.toThrow();
  });

  it('duplicatePart() clones faceTextures independently', () => {
    const part = sketcher.insertPrimitive('box')!;
    const dataUrl = 'data:image/png;base64,xyz';
    sketcher.setFaceTexture(part.id, 0, dataUrl);
    const clone = sketcher.duplicatePart(part.id)!;
    expect(clone.faceTextures[0]).toBe(dataUrl);
    // Mutating source does not affect clone.
    sketcher.setFaceTexture(part.id, 0, null);
    expect(clone.faceTextures[0]).toBe(dataUrl);
  });

  it('duplicatePart() creates independent clone with same color', () => {
    const src = sketcher.insertPrimitive('cylinder')!;
    sketcher.setPartColor(src.id, 0x00ff00);
    const clone = sketcher.duplicatePart(src.id);
    expect(clone).not.toBeNull();
    expect(clone!.color).toBe(0x00ff00);
    expect(clone!.id).not.toBe(src.id);
    expect(sketcher.getSession().parts).toHaveLength(2);
  });

  it('duplicatePart() clone is offset by +1 on X from source', () => {
    const src = sketcher.insertPrimitive('box')!;
    src.mesh.position.set(2, 0, 0);
    const clone = sketcher.duplicatePart(src.id);
    expect(clone!.mesh.position.x).toBeCloseTo(3);
  });

  it('duplicatePart() returns null for unknown id', () => {
    expect(sketcher.duplicatePart('nonexistent')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// exportGLB tests
// ---------------------------------------------------------------------------

describe('exportGLB', () => {
  it('returns a non-empty Blob for a session with parts', async () => {
    const shape = makeSquareShape();
    const centroid = new THREE.Vector3(0.5, 0, 0.5);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());

    const session: SketcherSession = {
      parts: [{ id: 'part-1', mesh, depth: 1, centroid, name: 'Shape', color: 0x8888cc, shapePoints: null, faceColors: [0x8888cc], faceTextures: [null] }],
      joints: [],
      assemblyGroups: [],
    };

    const { blob, filename } = await exportGLB(session);
    expect(blob.size).toBeGreaterThan(0);
    expect(filename).toMatch(/^sketch-\d+\.glb$/);
  });

  it('returns a Blob for an empty session', async () => {
    const session: SketcherSession = { parts: [], joints: [], assemblyGroups: [] };
    const { blob } = await exportGLB(session);
    expect(blob.size).toBeGreaterThan(0); // GLTF header is always present
  });
});

// ---------------------------------------------------------------------------
// toDraft / loadDraft round-trip tests
// ---------------------------------------------------------------------------

describe('toDraft / loadDraft', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let sketcher: CartoonSketcher;

  beforeEach(() => {
    scene = makeScene();
    camera = makePerspectiveCamera();
    sketcher = new CartoonSketcher(scene, camera);
  });

  it('toDraft() on an empty session produces a valid draft with no parts', () => {
    const draft = sketcher.toDraft();
    expect(draft.version).toBe(2);
    expect(draft.parts).toHaveLength(0);
    expect(draft.joints).toHaveLength(0);
  });

  it('toDraft() round-trip preserves primitive position and color', () => {
    const part = sketcher.insertPrimitive('box')!;
    part.mesh.position.set(3, 1, 2);
    part.mesh.updateWorldMatrix(false, true);
    sketcher.setPartColor(part.id, 0xff0000);

    const draft = sketcher.toDraft();
    sketcher.loadDraft(draft);

    const restored = sketcher.getSession().parts[0];
    expect(restored.mesh.position).toMatchObject({ x: expect.closeTo(3, 3), y: expect.closeTo(1, 3), z: expect.closeTo(2, 3) });
    expect(restored.color).toBe(0xff0000);
    expect(restored.name).toBe('Box');
    expect(restored.shapePoints).toBeNull();
  });

  it('toDraft() round-trip preserves multiple primitives', () => {
    sketcher.insertPrimitive('box');
    sketcher.insertPrimitive('sphere');
    sketcher.insertPrimitive('cylinder');

    const draft = sketcher.toDraft();
    sketcher.loadDraft(draft);

    expect(sketcher.getSession().parts).toHaveLength(3);
  });

  it('loadDraft() restores part ids so future inserts do not collide', () => {
    sketcher.insertPrimitive('box'); // part-1
    sketcher.insertPrimitive('box'); // part-2

    const draft = sketcher.toDraft();
    sketcher.loadDraft(draft);

    const newPart = sketcher.insertPrimitive('sphere')!;
    const ids = sketcher.getSession().parts.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids).toContain(newPart.id);
  });

  it('toDraft() round-trip preserves a sketch part with shapePoints and depth', () => {
    // Drive the sketcher to produce a committed extrusion part.
    sketcher.startNewSketch();
    sketcher.onClick(0, 0);
    sketcher.onClick(0.1, 0);
    sketcher.onClick(0, 0.1);
    sketcher.onClick(0, 0);       // close
    sketcher.onPointerDown(0, 0);
    sketcher.onPointerUp();       // commit

    expect(sketcher.getSession().parts).toHaveLength(1);
    const original = sketcher.getSession().parts[0];
    expect(original.shapePoints).not.toBeNull();
    expect(original.shapePoints!.length).toBeGreaterThan(2);

    const draft = sketcher.toDraft();
    expect(draft.parts[0].kind).toBe('sketch');
    expect(draft.parts[0].shapePoints).toBeDefined();

    sketcher.loadDraft(draft);

    const restored = sketcher.getSession().parts[0];
    expect(restored.name).toBe('Shape');
    expect(restored.shapePoints).not.toBeNull();
    expect(restored.mesh.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('toDraft() round-trip preserves face texture data URLs', () => {
    const part = sketcher.insertPrimitive('box')!;
    const dataUrl = 'data:image/png;base64,abc123';
    sketcher.setFaceTexture(part.id, 0, dataUrl);

    const draft = sketcher.toDraft();
    expect(draft.parts[0].faceTextures?.[0]).toBe(dataUrl);
    expect(draft.parts[0].faceTextures?.[1]).toBeNull();

    sketcher.loadDraft(draft);
    const restored = sketcher.getSession().parts[0];
    expect(restored.faceTextures[0]).toBe(dataUrl);
    expect(restored.faceTextures[1]).toBeNull();
  });

  it('toDraft() round-trip preserves a glue joint', () => {
    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(2, 0, 0);
    pB.mesh.updateWorldMatrix(false, true);

    sketcher.glueManager.commitGlue(
      pA, new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(1, 0, 0),
      pB, new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(-1, 0, 0),
    );
    expect(sketcher.getSession().joints).toHaveLength(1);

    const draft = sketcher.toDraft();
    expect(draft.joints).toHaveLength(1);

    sketcher.loadDraft(draft);

    expect(sketcher.getSession().joints).toHaveLength(1);
    expect(sketcher.getSession().parts).toHaveLength(2);
    // SA15: glue is a live constraint — no group is created on joint restore.
    const ag = sketcher.glueManager.groupForPart(sketcher.getSession().parts[0].id);
    expect(ag).toBeUndefined();
  });

  it('loadDraft() on empty draft produces an empty session', () => {
    sketcher.insertPrimitive('box');
    sketcher.loadDraft({ version: 2, parts: [], joints: [] });
    expect(sketcher.getSession().parts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ExtrusionHandle — face labels and duplicate-mesh fix
// ---------------------------------------------------------------------------

describe('ExtrusionHandle via CartoonSketcher', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let sketcher: CartoonSketcher;

  beforeEach(() => {
    scene = makeScene();
    camera = makePerspectiveCamera();
    sketcher = new CartoonSketcher(scene, camera);
  });

  function commitSquareExtrusion(): void {
    sketcher.startNewSketch();
    // click four corners of a square in XZ then close
    sketcher.onClick(-0.5, -0.5);
    sketcher.onClick(0.5, -0.5);
    sketcher.onClick(0.5, 0.5);
    sketcher.onClick(-0.5, 0.5);
    sketcher.onClick(-0.5, -0.5); // close
    // commit at default depth (no drag)
    sketcher.onPointerDown(0, 0);
    sketcher.onPointerUp();
  }

  it('committed sketch part faceGroups has side-N labels for each edge', () => {
    commitSquareExtrusion();
    const parts = sketcher.getSession().parts;
    expect(parts).toHaveLength(1);
    const groups: { label: string }[] = parts[0].mesh.geometry.userData.faceGroups;
    const labels = groups.map((g) => g.label);
    // Square has 4 edges: side-0 … side-3 plus combined caps group
    expect(labels).toContain('side-0');
    expect(labels).toContain('side-1');
    expect(labels).toContain('side-2');
    expect(labels).toContain('side-3');
    expect(labels).toContain('caps');
    expect(labels.filter((l) => l === 'Side')).toHaveLength(0);
    expect(labels.filter((l) => l === 'Top')).toHaveLength(0);
    expect(labels.filter((l) => l === 'Bottom')).toHaveLength(0);
  });

  it('scene contains exactly one extruded mesh after a drag rebuild', () => {    sketcher.startNewSketch();
    sketcher.onClick(-0.5, -0.5);
    sketcher.onClick(0.5, -0.5);
    sketcher.onClick(0.5, 0.5);
    sketcher.onClick(-0.5, 0.5);
    sketcher.onClick(-0.5, -0.5); // close → enters extruding phase

    // Simulate two drag updates — should not accumulate meshes
    sketcher.onPointerDown(0, 0);
    sketcher.onPointerMove(0, 0.1);
    sketcher.onPointerMove(0, 0.2);
    sketcher.onPointerUp(); // commit

    // Count Mesh children in the scene (exclude lines/handle sphere)
    const meshes = scene.children.filter(
      (c) => c instanceof THREE.Mesh && c.geometry instanceof THREE.ExtrudeGeometry,
    );
    expect(meshes).toHaveLength(1);
  });

  it('ExtrusionHandle mesh.position equals the supplied centroid', () => {
    // Shape is centroid-relative; mesh.position must carry the world offset.
    const shape = new THREE.Shape([
      new THREE.Vector2(-5, -5),
      new THREE.Vector2( 5, -5),
      new THREE.Vector2( 5,  5),
      new THREE.Vector2(-5,  5),
    ]);
    const centroid = new THREE.Vector3(10, 0, 7);
    const handle = new ExtrusionHandle(shape, centroid);

    expect(handle.mesh.position.x).toBeCloseTo(10, 5);
    expect(handle.mesh.position.y).toBeCloseTo(0.5, 5); // depth/2 = 1/2
    expect(handle.mesh.position.z).toBeCloseTo(7, 5);
    handle.dispose();
  });
});

// ---------------------------------------------------------------------------
// snapToFloor
// ---------------------------------------------------------------------------
describe('snapToFloor', () => {
  let scene: THREE.Scene;
  let sketcher: CartoonSketcher;

  beforeEach(() => {
    scene = makeScene();
    sketcher = new CartoonSketcher(scene, makePerspectiveCamera());
  });

  it('moves a standalone part so its lowest vertex sits at y = 0', () => {
    const part = sketcher.insertPrimitive('box')!;
    // Lift the box off the floor.
    part.mesh.position.y = 5;
    part.mesh.updateMatrixWorld(true);

    sketcher.snapToFloor(part.id);

    // A default BoxGeometry(1,1,1) has its extent from -0.5 to +0.5 in each axis.
    // After snap, min.y of the world AABB should be 0.
    const box = new THREE.Box3().setFromObject(part.mesh);
    expect(box.min.y).toBeCloseTo(0, 5);
  });

  it('moves the entire assembly group when the part is glued', () => {
    const partA = sketcher.insertPrimitive('box')!;
    const partB = sketcher.insertPrimitive('box')!;
    // Glue them together (SA15: parts remain at scene root, no group created).
    sketcher.glueManager.commitGlue(
      partA,
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(0, 1, 0),
      partB,
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Vector3(0, -1, 0),
    );
    // Lift partA (standalone, no group under SA15).
    partA.mesh.position.y = 10;
    partA.mesh.updateMatrixWorld(true);
    // Replay constraints so partB follows.
    sketcher.glueManager.resolveConstraints([partA.id], sketcher.getSession().parts);

    sketcher.snapToFloor(partA.id);

    const box = new THREE.Box3().setFromObject(partA.mesh);
    expect(box.min.y).toBeCloseTo(0, 4);
  });

  it('is a no-op for an unknown id', () => {
    expect(() => sketcher.snapToFloor('nonexistent')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// weld / unweld
// ---------------------------------------------------------------------------
describe('weld / unweld', () => {
  let scene: THREE.Scene;
  let sketcher: CartoonSketcher;

  beforeEach(() => {
    scene = makeScene();
    sketcher = new CartoonSketcher(scene, makePerspectiveCamera());
  });

  it('welds two standalone parts into a weld AssemblyGroup', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;

    const ag = sketcher.weld([a.id, b.id]);

    expect(ag).not.toBeNull();
    expect(ag!.partIds).toContain(a.id);
    expect(ag!.partIds).toContain(b.id);
    expect(sketcher.glueManager.isWeldGroup(a.id)).toBe(true);
    expect(sketcher.glueManager.isWeldGroup(b.id)).toBe(true);
  });

  it('preserves world positions of parts after weld', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    a.mesh.position.set(2, 0, 0);
    b.mesh.position.set(-2, 0, 0);
    a.mesh.updateMatrixWorld(true);
    b.mesh.updateMatrixWorld(true);

    sketcher.weld([a.id, b.id]);

    const posA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    a.mesh.getWorldPosition(posA);
    b.mesh.getWorldPosition(posB);
    expect(posA.x).toBeCloseTo(2, 5);
    expect(posB.x).toBeCloseTo(-2, 5);
  });

  it('returns null if fewer than two part ids are given', () => {
    const a = sketcher.insertPrimitive('box')!;
    expect(sketcher.weld([a.id])).toBeNull();
    expect(sketcher.weld([])).toBeNull();
  });

  it('returns null if any part is already in an assembly group', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    const c = sketcher.insertPrimitive('box')!;
    // Weld a and b.
    sketcher.weld([a.id, b.id]);
    // Trying to weld a (already grouped) with c should fail.
    const result = sketcher.weld([a.id, c.id]);
    expect(result).toBeNull();
  });

  it('unweld dissolves a weld group and returns parts to scene root', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    sketcher.weld([a.id, b.id]);

    sketcher.unweld(a.id);

    expect(sketcher.glueManager.groupForPart(a.id)).toBeUndefined();
    expect(sketcher.glueManager.groupForPart(b.id)).toBeUndefined();
    expect(sketcher.glueManager.isWeldGroup(a.id)).toBe(false);
    // Parts should now be direct children of the scene.
    expect(a.mesh.parent).toBe(scene);
    expect(b.mesh.parent).toBe(scene);
  });

  it('unweld is a no-op for a part not in a weld group', () => {
    const a = sketcher.insertPrimitive('box')!;
    expect(() => sketcher.unweld(a.id)).not.toThrow();
  });
});

// takeSnapshot / restoreSnapshot — weld group round-trip
describe('snapshot weld group round-trip', () => {
  let scene: THREE.Scene;
  let sketcher: CartoonSketcher;

  beforeEach(() => {
    scene = makeScene();
    sketcher = new CartoonSketcher(scene, makePerspectiveCamera());
  });

  it('takeSnapshot captures weld group membership', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    sketcher.weld([a.id, b.id]);

    const snap = sketcher.takeSnapshot();

    expect(snap.weldGroups).toHaveLength(1);
    expect(snap.weldGroups![0].partIds).toContain(a.id);
    expect(snap.weldGroups![0].partIds).toContain(b.id);
  });

  it('takeSnapshot returns empty weldGroups when no weld groups exist', () => {
    sketcher.insertPrimitive('box');
    sketcher.insertPrimitive('sphere');

    const snap = sketcher.takeSnapshot();

    expect(snap.weldGroups).toHaveLength(0);
  });

  it('restoreSnapshot re-creates weld groups at correct world positions', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    a.mesh.position.set(2, 0, 0);
    b.mesh.position.set(5, 0, 0);
    sketcher.weld([a.id, b.id]);
    const snap = sketcher.takeSnapshot();

    // Dissolve group externally, then restore.
    sketcher.unweld(a.id);
    sketcher.restoreSnapshot(snap);

    expect(sketcher.glueManager.isWeldGroup(a.id)).toBe(true);
    expect(sketcher.glueManager.isWeldGroup(b.id)).toBe(true);
    const ag = sketcher.glueManager.groupForPart(a.id)!;
    expect(ag).toBeDefined();
    // World positions should be preserved through the round-trip.
    const wpA = new THREE.Vector3();
    const wpB = new THREE.Vector3();
    a.mesh.updateWorldMatrix(true, false);
    b.mesh.updateWorldMatrix(true, false);
    a.mesh.getWorldPosition(wpA);
    b.mesh.getWorldPosition(wpB);
    expect(wpA.x).toBeCloseTo(2);
    expect(wpB.x).toBeCloseTo(5);
  });

  it('restoreSnapshot is backward-compatible when weldGroups is absent', () => {
    const a = sketcher.insertPrimitive('box')!;
    const snap = sketcher.takeSnapshot();
    // Simulate an old snapshot without weldGroups.
    const oldSnap = { parts: snap.parts, joints: snap.joints };

    expect(() => sketcher.restoreSnapshot(oldSnap)).not.toThrow();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].id).toBe(a.id);
  });
});
