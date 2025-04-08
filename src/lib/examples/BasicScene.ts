import { PerspectiveCamera, Vector3, Color } from "three";
import { HemisphereLightAsset } from "$lib/scene/Object3D/Light/HemisphereLight/HemisphereLightAsset";
import { PlaneGeometryAsset } from "$lib/scene/Geometry/PlaneGeometry/PlaneGeometryAsset";
import { SphereGeometryAsset } from "$lib/scene/Geometry/SphereGeometry/SphereGeometryAsset";
import { MeshStandardMaterialAsset } from "$lib/scene/Material/MeshStandardMaterial/MeshStandardMaterialAsset";
import { MeshAsset } from "$lib/scene/Object3D/Mesh/MeshAsset";

// Create camera
const camera = new PerspectiveCamera(75, 2, 0.1, 1000);
camera.position.set(2, 5, 5);
camera.lookAt(new Vector3(0, 0, 0));

// Create assets
const light = new HemisphereLightAsset();
light.color.value = new Color(0xffffbb);
light.groundColor.value = new Color(0x080820);
light.intensity.value = 1;
light.position.value = new Vector3(0, 10, 0);

// Create floor plane
const planeGeometry = new PlaneGeometryAsset(10, 10);
const planeMaterial = new MeshStandardMaterialAsset();
planeMaterial.color.value = new Color("#808080");
const plane = new MeshAsset(planeGeometry, planeMaterial);
plane.setRotationFromEuler(-90, 0, 0); // -90 degrees around X axis

// Create sphere
const sphereGeometry = new SphereGeometryAsset(1, 32, 32);
const sphereMaterial = new MeshStandardMaterialAsset();
sphereMaterial.color.value = new Color("#0000ff");
const sphere = new MeshAsset(sphereGeometry, sphereMaterial);
sphere.position.value = new Vector3(0, 2, 0);

// Export everything
export const assets = [light, plane, sphere];
export const actions: any[] = []; // Empty array for now
export { camera }; 