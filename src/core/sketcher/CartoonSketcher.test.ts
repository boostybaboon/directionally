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
    sketcher.onClick(0, 0);       // close → pending-holes
    expect(sketcher.currentPhase).toBe('pending-holes');
    sketcher.confirmShape();      // → ExtrusionHandle created
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
    sketcher.confirmShape();
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
    sketcher.confirmShape();
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
      sketcher.confirmShape();
      sketcher.onPointerDown(0, 0);
      sketcher.onPointerUp();
    }
    expect(sketcher.getSession().parts).toHaveLength(2);
  });

  // ── Hole drawing ────────────────────────────────────────────────────────────

  it('closing outer polygon enters pending-holes phase', () => {
    sketcher.startNewSketch();
    sketcher.onClick(0, 0);
    sketcher.onClick(0.1, 0);
    sketcher.onClick(0, 0.1);
    sketcher.onClick(0, 0); // close
    expect(sketcher.currentPhase).toBe('pending-holes');
    expect(sketcher.pendingHoleCount).toBe(0);
  });

  it('onShapeReadyForHoles callback fires when outer polygon closes', () => {
    const cb = vi.fn();
    sketcher.onShapeReadyForHoles = cb;
    sketcher.startNewSketch();
    sketcher.onClick(0, 0);
    sketcher.onClick(0.1, 0);
    sketcher.onClick(0, 0.1);
    sketcher.onClick(0, 0);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cancelPendingShape() returns to idle', () => {
    sketcher.startNewSketch();
    sketcher.onClick(0, 0); sketcher.onClick(0.1, 0); sketcher.onClick(0, 0.1); sketcher.onClick(0, 0);
    expect(sketcher.currentPhase).toBe('pending-holes');
    sketcher.cancelPendingShape();
    expect(sketcher.currentPhase).toBe('idle');
    expect(sketcher.pendingHoleCount).toBe(0);
  });

  it('addHole() enters hole-drawing phase', () => {
    sketcher.startNewSketch();
    sketcher.onClick(0, 0); sketcher.onClick(0.2, 0); sketcher.onClick(0, 0.2); sketcher.onClick(0, 0);
    sketcher.addHole();
    expect(sketcher.currentPhase).toBe('hole-drawing');
  });

  it('cancelHole() returns to pending-holes and fires onShapeReadyForHoles', () => {
    const cb = vi.fn();
    sketcher.onShapeReadyForHoles = cb;
    sketcher.startNewSketch();
    sketcher.onClick(0, 0); sketcher.onClick(0.2, 0); sketcher.onClick(0, 0.2); sketcher.onClick(0, 0);
    cb.mockClear();
    sketcher.addHole();
    sketcher.cancelHole();
    expect(sketcher.currentPhase).toBe('pending-holes');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('closing a hole inside the outer shape increments pendingHoleCount', () => {
    sketcher.startNewSketch();
    // Outer: large square (-0.5 .. +0.5 in shape space after centroid shift)
    sketcher.onClick(-0.5, -0.5);
    sketcher.onClick(0.5, -0.5);
    sketcher.onClick(0.5, 0.5);
    sketcher.onClick(-0.5, 0.5);
    sketcher.onClick(-0.5, -0.5); // close outer
    expect(sketcher.pendingHoleCount).toBe(0);

    sketcher.addHole();
    // Draw a small hole centred at world (0,0,0) — inside the outer shape.
    sketcher.onClick(0, 0);
    sketcher.onClick(0.05, 0);
    sketcher.onClick(0, 0.05);
    sketcher.onClick(0, 0); // close hole
    expect(sketcher.currentPhase).toBe('pending-holes');
    expect(sketcher.pendingHoleCount).toBe(1);
  });

  it('confirmShape() with a hole produces a mesh with vertices', () => {
    sketcher.startNewSketch();
    sketcher.onClick(-0.5, -0.5);
    sketcher.onClick(0.5, -0.5);
    sketcher.onClick(0.5, 0.5);
    sketcher.onClick(-0.5, 0.5);
    sketcher.onClick(-0.5, -0.5);
    sketcher.addHole();
    sketcher.onClick(0, 0);
    sketcher.onClick(0.05, 0);
    sketcher.onClick(0, 0.05);
    sketcher.onClick(0, 0);
    sketcher.confirmShape();
    sketcher.onPointerDown(0, 0);
    sketcher.onPointerUp();
    expect(sketcher.getSession().parts).toHaveLength(1);
    const count = sketcher.getSession().parts[0].mesh.geometry.attributes.position?.count ?? 0;
    expect(count).toBeGreaterThan(0);
    expect(sketcher.getSession().parts[0].holes).not.toBeNull();
    expect(sketcher.getSession().parts[0].holes!.length).toBe(1);
  });

  it('toDraft() round-trip preserves holes', () => {
    sketcher.startNewSketch();
    sketcher.onClick(-0.5, -0.5);
    sketcher.onClick(0.5, -0.5);
    sketcher.onClick(0.5, 0.5);
    sketcher.onClick(-0.5, 0.5);
    sketcher.onClick(-0.5, -0.5);
    sketcher.addHole();
    sketcher.onClick(0, 0);
    sketcher.onClick(0.05, 0);
    sketcher.onClick(0, 0.05);
    sketcher.onClick(0, 0);
    sketcher.confirmShape();
    sketcher.onPointerDown(0, 0);
    sketcher.onPointerUp();

    const draft = sketcher.toDraft();
    expect(draft.parts[0].holes).toBeDefined();
    expect(draft.parts[0].holes!.length).toBe(1);

    sketcher.loadDraft(draft);
    const restored = sketcher.getSession().parts[0];
    expect(restored.holes).not.toBeNull();
    expect(restored.holes!.length).toBe(1);
    expect(restored.mesh.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('hole outside the outer shape bbox is silently discarded', () => {
    sketcher.startNewSketch();
    sketcher.onClick(-0.5, -0.5);
    sketcher.onClick(0.5, -0.5);
    sketcher.onClick(0.5, 0.5);
    sketcher.onClick(-0.5, 0.5);
    sketcher.onClick(-0.5, -0.5);
    sketcher.addHole();
    // Hole clearly outside outer shape (world coords far away)
    sketcher.onClick(5, 5);
    sketcher.onClick(5.1, 5);
    sketcher.onClick(5, 5.1);
    sketcher.onClick(5, 5);
    expect(sketcher.pendingHoleCount).toBe(0); // discarded
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
      parts: [{ id: 'part-1', mesh, depth: 1, centroid, name: 'Shape', color: 0x8888cc, shapePoints: null, holes: null, lathePoints: null, lathePhiLength: null, faceColors: [0x8888cc], faceTextures: [null] }],
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
    sketcher.onClick(0, 0);       // close → pending-holes
    sketcher.confirmShape();
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

  it('toDraft() round-trip preserves an attach joint', () => {
    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(2, 0, 0);
    pB.mesh.updateWorldMatrix(false, true);

    sketcher.attachManager.commitAttach(
      pA, new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(1, 0, 0),
      pB, new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(-1, 0, 0),
      [pA, pB],
    );
    expect(sketcher.getSession().joints).toHaveLength(1);

    const draft = sketcher.toDraft();
    expect(draft.joints).toHaveLength(1);

    sketcher.loadDraft(draft);

    expect(sketcher.getSession().joints).toHaveLength(1);
    expect(sketcher.getSession().parts).toHaveLength(2);
    // Attach creates a group; after draft round-trip the group is restored.
    const ag = sketcher.attachManager.groupForPart(sketcher.getSession().parts[0].id);
    expect(ag).toBeDefined();
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
    sketcher.onClick(-0.5, -0.5); // close → pending-holes
    sketcher.confirmShape();      // → ExtrusionHandle created
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
    sketcher.onClick(-0.5, -0.5); // close → pending-holes
    sketcher.confirmShape();      // → enters extruding phase

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

  it('moves the entire assembly group when the part is attached', () => {
    const partA = sketcher.insertPrimitive('box')!;
    const partB = sketcher.insertPrimitive('box')!;
    sketcher.attachManager.commitAttach(
      partA,
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(0, 1, 0),
      partB,
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Vector3(0, -1, 0),
      [partA, partB],
    );

    // Lift the attach group and snap the whole assembly to the floor.
    const ag = sketcher.attachManager.groupForPart(partA.id)!;
    ag.group.position.y = 10;
    ag.group.updateMatrixWorld(true);

    sketcher.snapToFloor(partA.id);

    const box = new THREE.Box3().setFromObject(ag.group);
    expect(box.min.y).toBeCloseTo(0, 4);
  });

  it('is a no-op for an unknown id', () => {
    expect(() => sketcher.snapToFloor('nonexistent')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// group / ungroup
// ---------------------------------------------------------------------------
describe('group / ungroup', () => {
  let scene: THREE.Scene;
  let sketcher: CartoonSketcher;

  beforeEach(() => {
    scene = makeScene();
    sketcher = new CartoonSketcher(scene, makePerspectiveCamera());
  });

  it('groups two standalone parts into a group AssemblyGroup', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;

    const ag = sketcher.group([a.id, b.id]);

    expect(ag).not.toBeNull();
    expect(ag!.partIds).toContain(a.id);
    expect(ag!.partIds).toContain(b.id);
    expect(sketcher.attachManager.isGroup(a.id)).toBe(true);
    expect(sketcher.attachManager.isGroup(b.id)).toBe(true);
  });

  it('preserves world positions of parts after group', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    a.mesh.position.set(2, 0, 0);
    b.mesh.position.set(-2, 0, 0);
    a.mesh.updateMatrixWorld(true);
    b.mesh.updateMatrixWorld(true);

    sketcher.group([a.id, b.id]);

    const posA = new THREE.Vector3();
    const posB = new THREE.Vector3();
    a.mesh.getWorldPosition(posA);
    b.mesh.getWorldPosition(posB);
    expect(posA.x).toBeCloseTo(2, 5);
    expect(posB.x).toBeCloseTo(-2, 5);
  });

  it('returns null if fewer than two part ids are given', () => {
    const a = sketcher.insertPrimitive('box')!;
    expect(sketcher.group([a.id])).toBeNull();
    expect(sketcher.group([])).toBeNull();
  });

  it('groups a standalone part into an existing group (group merging)', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    const d = sketcher.insertPrimitive('box')!;
    sketcher.group([a.id, b.id]);

    // Now group D into the A+B group — all three should end up in one group.
    const result = sketcher.group([a.id, b.id, d.id]);
    expect(result).not.toBeNull();

    const ag = sketcher.attachManager.groupForPart(a.id);
    expect(ag).toBeDefined();
    expect(ag!.partIds).toHaveLength(3);
    expect(ag!.partIds).toContain(d.id);
    expect(sketcher.attachManager.isGroup(d.id)).toBe(true);
    // Merged group component should cover all three parts.
    expect(sketcher.attachManager.isInGroupComponent(a.id)).toBe(true);
    expect(sketcher.attachManager.isInGroupComponent(d.id)).toBe(true);
    // No stale old group — all three share one group.
    expect(sketcher.attachManager.groupForPart(b.id)?.id).toBe(ag!.id);
    expect(sketcher.attachManager.groupForPart(d.id)?.id).toBe(ag!.id);
  });

  it('merges two independent groups into one', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    const c = sketcher.insertPrimitive('box')!;
    const d = sketcher.insertPrimitive('box')!;
    sketcher.group([a.id, b.id]);
    sketcher.group([c.id, d.id]);

    // Group all four parts together.
    const result = sketcher.group([a.id, c.id]);
    expect(result).not.toBeNull();

    const ag = sketcher.attachManager.groupForPart(a.id);
    expect(ag).toBeDefined();
    expect(ag!.partIds).toHaveLength(4);
    [a, b, c, d].forEach((p) => {
      expect(sketcher.attachManager.groupForPart(p.id)?.id).toBe(ag!.id);
      expect(sketcher.attachManager.isGroup(p.id)).toBe(true);
    });
    // Single merged group component.
    expect(sketcher.attachManager.getGroupComponents()).toHaveLength(1);
    expect(sketcher.attachManager.getGroupComponents()[0].sort()).toEqual(
      [a.id, b.id, c.id, d.id].sort(),
    );
  });

  it('ungroup dissolves a group and returns parts to scene root', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    sketcher.group([a.id, b.id]);

    sketcher.ungroup(a.id);

    expect(sketcher.attachManager.groupForPart(a.id)).toBeUndefined();
    expect(sketcher.attachManager.groupForPart(b.id)).toBeUndefined();
    expect(sketcher.attachManager.isGroup(a.id)).toBe(false);
    // Parts should now be direct children of the scene.
    expect(a.mesh.parent).toBe(scene);
    expect(b.mesh.parent).toBe(scene);
  });

  it('ungroup is a no-op for a part not in a group', () => {
    const a = sketcher.insertPrimitive('box')!;
    expect(() => sketcher.ungroup(a.id)).not.toThrow();
  });
});

// takeSnapshot / restoreSnapshot — group round-trip
describe('snapshot group round-trip', () => {
  let scene: THREE.Scene;
  let sketcher: CartoonSketcher;

  beforeEach(() => {
    scene = makeScene();
    sketcher = new CartoonSketcher(scene, makePerspectiveCamera());
  });

  it('takeSnapshot captures group membership', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    sketcher.group([a.id, b.id]);

    const snap = sketcher.takeSnapshot();

    expect(snap.groups).toHaveLength(1);
    expect(snap.groups![0].partIds).toContain(a.id);
    expect(snap.groups![0].partIds).toContain(b.id);
  });

  it('takeSnapshot returns empty groups when no groups exist', () => {
    sketcher.insertPrimitive('box');
    sketcher.insertPrimitive('sphere');

    const snap = sketcher.takeSnapshot();

    expect(snap.groups).toHaveLength(0);
  });

  it('restoreSnapshot re-creates groups at correct world positions', () => {
    const a = sketcher.insertPrimitive('box')!;
    const b = sketcher.insertPrimitive('box')!;
    a.mesh.position.set(2, 0, 0);
    b.mesh.position.set(5, 0, 0);
    sketcher.group([a.id, b.id]);
    const snap = sketcher.takeSnapshot();

    // Dissolve group externally, then restore.
    sketcher.ungroup(a.id);
    sketcher.restoreSnapshot(snap);

    expect(sketcher.attachManager.isGroup(a.id)).toBe(true);
    expect(sketcher.attachManager.isGroup(b.id)).toBe(true);
    const ag = sketcher.attachManager.groupForPart(a.id)!;
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

  it('restoreSnapshot is backward-compatible when groups is absent', () => {
    const a = sketcher.insertPrimitive('box')!;
    const snap = sketcher.takeSnapshot();
    // Simulate an old snapshot without groups.
    const oldSnap = { parts: snap.parts, joints: snap.joints };

    expect(() => sketcher.restoreSnapshot(oldSnap)).not.toThrow();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].id).toBe(a.id);
  });
});

// ── SA18a: dedicated revolve sketch mode ──────────────────────────────────────

describe('CartoonSketcher lathe / revolve (SA18a)', () => {
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let sketcher: CartoonSketcher;

  function drawAndCloseProfile() {
    sketcher.startRevolveSketch();
    sketcher.onClick(0, 0);
    sketcher.onClick(0.3, 0);
    sketcher.onClick(0, 0.3);
    sketcher.onClick(0, 0); // close → pending-revolve
  }

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    sketcher = new CartoonSketcher(scene, camera);
  });

  it('startRevolveSketch transitions to revolve-drawing phase', () => {
    sketcher.startRevolveSketch();
    expect(sketcher.currentPhase).toBe('revolve-drawing');
  });

  it('closing the profile fires onRevolveReady and transitions to pending-revolve', () => {
    let fired = false;
    sketcher.onRevolveReady = () => { fired = true; };
    drawAndCloseProfile();
    expect(fired).toBe(true);
    expect(sketcher.currentPhase).toBe('pending-revolve');
  });

  it('confirmLathe() transitions from pending-revolve to idle and commits a part', () => {
    drawAndCloseProfile();
    expect(sketcher.currentPhase).toBe('pending-revolve');
    sketcher.confirmLathe();
    expect(sketcher.currentPhase).toBe('idle');
    expect(sketcher.getSession().parts).toHaveLength(1);
  });

  it('confirmLathe() is a no-op if not in pending-revolve phase', () => {
    sketcher.confirmLathe();
    expect(sketcher.getSession().parts).toHaveLength(0);
    expect(sketcher.currentPhase).toBe('idle');
  });

  it('cancelRevolveSketch returns to idle from revolve-drawing', () => {
    sketcher.startRevolveSketch();
    sketcher.cancelRevolveSketch();
    expect(sketcher.currentPhase).toBe('idle');
  });

  it('cancelPendingRevolve returns to idle from pending-revolve', () => {
    drawAndCloseProfile();
    expect(sketcher.currentPhase).toBe('pending-revolve');
    sketcher.cancelPendingRevolve();
    expect(sketcher.currentPhase).toBe('idle');
    expect(sketcher.getSession().parts).toHaveLength(0);
  });

  it('lathed part has lathePoints set and shapePoints null', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe();
    const part = sketcher.getSession().parts[0];
    expect(part.lathePoints).not.toBeNull();
    expect(part.lathePoints!.length).toBeGreaterThan(0);
    expect(part.shapePoints).toBeNull();
    expect(part.name).toBe('Lathe');
  });

  it('lathed part mesh is added to the scene with non-zero vertices', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe();
    const part = sketcher.getSession().parts[0];
    expect(scene.children).toContain(part.mesh);
    const count = part.mesh.geometry.attributes.position?.count ?? 0;
    expect(count).toBeGreaterThan(0);
  });

  it('lathed part mesh sits on the floor (position.y >= 0)', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe();
    const part = sketcher.getSession().parts[0];
    expect(part.mesh.position.y).toBeGreaterThanOrEqual(0);
  });

  it('duplicatePart copies lathePoints to the clone', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe();
    const part = sketcher.getSession().parts[0];
    const clone = sketcher.duplicatePart(part.id)!;
    expect(clone.lathePoints).not.toBeNull();
    expect(clone.lathePoints).toEqual(part.lathePoints);
  });

  it('toDraft / loadDraft round-trip preserves kind=lathed and lathePoints', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe();
    const draft = sketcher.toDraft();
    expect(draft.parts[0].kind).toBe('lathed');
    expect(draft.parts[0].lathePoints).toBeDefined();
    expect(draft.parts[0].lathePoints!.length).toBeGreaterThan(0);

    sketcher.loadDraft(draft);
    const restored = sketcher.getSession().parts[0];
    expect(restored.lathePoints).not.toBeNull();
    expect(restored.lathePoints!.length).toBeGreaterThan(0);
    expect(restored.mesh.geometry.attributes.position?.count ?? 0).toBeGreaterThan(0);
  });
});

// ── SA18b: partial-angle sweeps ───────────────────────────────────────────────

describe('CartoonSketcher partial-angle revolve (SA18b)', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let sketcher: CartoonSketcher;

  // Camera at (0,0,10) looking at origin. XY-mode raycasts hit z=0 plane and
  // produce non-degenerate profile points for NDC coords in [0.1, 0.3].
  function makeFrontCam(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 0, 10);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return cam;
  }

  function drawAndCloseProfile() {
    sketcher.startRevolveSketch();
    sketcher.onClick(0.1, 0.0);
    sketcher.onClick(0.2, 0.0);
    sketcher.onClick(0.1, 0.1);
    sketcher.onClick(0.1, 0.0); // close
  }

  beforeEach(() => {
    scene = new THREE.Scene();
    camera = makeFrontCam();
    sketcher = new CartoonSketcher(scene, camera);
  });

  it('confirmLathe(90) produces a part with 3 draw groups (surface + 2 caps)', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe(90);
    const part = sketcher.getSession().parts[0];
    expect(part.mesh.geometry.groups.length).toBe(3);
  });

  it('confirmLathe(180) stores phiLength as π', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe(180);
    const part = sketcher.getSession().parts[0];
    expect(part.lathePhiLength).toBeCloseTo(Math.PI);
  });

  it('confirmLathe(360) produces a full-revolution part with 1 draw group', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe(360);
    const part = sketcher.getSession().parts[0];
    expect(part.mesh.geometry.groups.length).toBe(1);
  });

  it('confirmLathe(360) stores lathePhiLength of 2π', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe(360);
    const part = sketcher.getSession().parts[0];
    expect(part.lathePhiLength).toBeCloseTo(Math.PI * 2);
  });

  it('toDraft writes phiLength for partial sweep, omits it for full', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe(90);
    const draft = sketcher.toDraft();
    expect(draft.parts[0].phiLength).toBeCloseTo(Math.PI / 2);

    drawAndCloseProfile();
    sketcher.confirmLathe(360);
    const draft2 = sketcher.toDraft();
    expect(draft2.parts[1].phiLength).toBeUndefined();
  });

  it('loadDraft round-trip preserves partial phiLength and group count', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe(90);
    const draft = sketcher.toDraft();

    sketcher.loadDraft(draft);
    const restored = sketcher.getSession().parts[0];
    expect(restored.lathePhiLength).toBeCloseTo(Math.PI / 2);
    expect(restored.mesh.geometry.groups.length).toBe(3);
  });

  it('loadDraft round-trip defaults to full revolution when phiLength absent', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe(360);
    const draft = sketcher.toDraft();
    expect(draft.parts[0].phiLength).toBeUndefined();

    sketcher.loadDraft(draft);
    const restored = sketcher.getSession().parts[0];
    expect(restored.lathePhiLength).toBeCloseTo(Math.PI * 2);
    expect(restored.mesh.geometry.groups.length).toBe(1);
  });

  it('non-lathed parts have lathePhiLength null', () => {
    sketcher.insertPrimitive('box');
    const part = sketcher.getSession().parts[0];
    expect(part.lathePhiLength).toBeNull();
  });

  it('duplicatePart copies lathePhiLength', () => {
    drawAndCloseProfile();
    sketcher.confirmLathe(180);
    const orig = sketcher.getSession().parts[0];
    const clone = sketcher.duplicatePart(orig.id)!;
    expect(clone.lathePhiLength).toBeCloseTo(Math.PI);
  });
});

// ── PolygonSketcher drawPlane='xy' ────────────────────────────────────────────

describe('PolygonSketcher drawPlane xy', () => {
  // Camera at (0, 0, 10) looking toward origin along -Z.
  // Rays for NDC (x, y) intersect the z=0 plane at approximately (x*scale, y*scale, 0).
  function makeFrontCamera(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 0, 10);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    return cam;
  }

  it('drawPlane defaults to xz', () => {
    const ps = new PolygonSketcher();
    expect(ps.drawPlane).toBe('xz');
  });

  it('drawPlane=xy: _closeShape passes world XY coords with no centroid offset', () => {
    const cam = makeFrontCamera();
    const ps = new PolygonSketcher();
    ps.drawPlane = 'xy';
    ps.snapSize = 0.01; // fine snap so test coords are not heavily quantised

    let capturedShape: THREE.Shape | null = null;
    let capturedCentroid: THREE.Vector3 | null = null;
    ps.onShapeClosed = (shape, centroid) => {
      capturedShape = shape;
      capturedCentroid = centroid;
    };

    // Click three distinct NDC positions. With camera at z=10, fov=50,
    // the visible frustum half-width at z=0 ≈ 10*tan(25°) ≈ 4.66.
    // NDC (0.1, 0.2) → world ≈ (0.466, 0.932, 0) before snap.
    ps.onClick(0.0, 0.0, cam); // → snapped near (0, 0, 0)
    ps.onClick(0.1, 0.0, cam); // → snapped to some (rx, 0, 0)
    ps.onClick(0.0, 0.1, cam); // → snapped to some (0, ry, 0)
    ps.onClick(0.0, 0.0, cam); // close

    expect(capturedShape).not.toBeNull();
    expect(capturedCentroid).not.toBeNull();
    // Centroid must be (0, 0, 0) — no offset applied in XY mode.
    expect(capturedCentroid!.x).toBeCloseTo(0);
    expect(capturedCentroid!.y).toBeCloseTo(0);
    expect(capturedCentroid!.z).toBeCloseTo(0);
    // Shape points should have z=0 (they live in XY plane).
    const pts = capturedShape!.getPoints();
    for (const p of pts) {
      // shape is THREE.Shape so points are Vector2; only x and y matter
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
    }
  });

  it('drawPlane=xy: shape points have positive x for positive-x world clicks', () => {
    const cam = makeFrontCamera();
    const ps = new PolygonSketcher();
    ps.drawPlane = 'xy';
    ps.snapSize = 0.01;

    let capturedShape: THREE.Shape | null = null;
    ps.onShapeClosed = (shape) => { capturedShape = shape; };

    // All clicks at positive NDC x (right of centre → positive world x)
    ps.onClick(0.1, 0.0, cam);
    ps.onClick(0.2, 0.0, cam);
    ps.onClick(0.1, 0.1, cam);
    ps.onClick(0.1, 0.0, cam); // close

    expect(capturedShape).not.toBeNull();
    const pts = capturedShape!.getPoints();
    // Every shape point should have positive x (radial distance from axis > 0)
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0);
    }
  });

  it('drawPlane=xz: _closeShape applies centroid offset (unchanged behaviour)', () => {
    const cam = new THREE.PerspectiveCamera();
    const ps = new PolygonSketcher();
    // drawPlane remains 'xz' (default)

    let capturedCentroid: THREE.Vector3 | null = null;
    ps.onShapeClosed = (_, centroid) => { capturedCentroid = centroid; };

    // Three clicks producing points all at origin (camera at (0,0,0)).
    ps.onClick(0, 0, cam);
    ps.onClick(0.3, 0, cam);
    ps.onClick(0, 0.3, cam);
    ps.onClick(0, 0, cam); // close

    expect(capturedCentroid).not.toBeNull();
    // In XZ mode the centroid carries the world offset; all points were (0,0,0)
    // so centroid is (0, 0, 0) but the contract is it IS the average of the points.
    expect(capturedCentroid!.y).toBeCloseTo(0); // centroid.y is always 0 in XZ mode
  });
});
