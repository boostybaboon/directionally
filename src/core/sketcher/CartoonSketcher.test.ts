import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CartoonSketcher } from './CartoonSketcher.js';
import { PolygonSketcher } from './PolygonSketcher.js';
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
      parts: [{ id: 'part-1', mesh, depth: 1, centroid }],
    };

    const { blob, filename } = await exportGLB(session);
    expect(blob.size).toBeGreaterThan(0);
    expect(filename).toMatch(/^sketch-\d+\.glb$/);
  });

  it('returns a Blob for an empty session', async () => {
    const session: SketcherSession = { parts: [] };
    const { blob } = await exportGLB(session);
    expect(blob.size).toBeGreaterThan(0); // GLTF header is always present
  });
});
