import { Vector3, Color } from "three";
import { HemisphereLightAsset } from "$lib/scene/Object3D/Light/HemisphereLight/HemisphereLightAsset";
import { PlaneGeometryAsset } from "$lib/scene/Geometry/PlaneGeometry/PlaneGeometryAsset";
import { SphereGeometryAsset } from "$lib/scene/Geometry/SphereGeometry/SphereGeometryAsset";
import { MeshStandardMaterialAsset } from "$lib/scene/Material/MeshStandardMaterial/MeshStandardMaterialAsset";
import { MeshAsset } from "$lib/scene/Object3D/Mesh/MeshAsset";
import { PerspectiveCameraAsset } from "$lib/scene/Object3D/Camera/PerspectiveCamera/PerspectiveCameraAsset";

export function createColorfulSpheresScene() {
    // Create assets
    const light = new HemisphereLightAsset();
    light.color.value = new Color(0xffffbb);
    light.groundColor.value = new Color(0x080820);
    light.intensity.value = 1;
    light.position.value = new Vector3(0, 10, 0);

    // Create floor plane
    const planeGeometry = new PlaneGeometryAsset(20, 20);
    const planeMaterial = new MeshStandardMaterialAsset();
    planeMaterial.color.value = new Color("#808080");
    const plane = new MeshAsset(planeGeometry, planeMaterial);
    plane.setRotationFromEuler(-90, 0, 0);

    // Create spheres with different colors
    const sphereGeometry = new SphereGeometryAsset(1, 32, 32);
    const spheres: MeshAsset[] = [];

    // Define colors and positions for the spheres
    const sphereConfigs = [
        { color: "#ff0000", position: [-5, 1, -5] }, // Red
        { color: "#00ff00", position: [5, 1, -5] },  // Green
        { color: "#0000ff", position: [0, 1, 0] },   // Blue
        { color: "#ffff00", position: [-5, 1, 5] },  // Yellow
        { color: "#ff00ff", position: [5, 1, 5] }    // Magenta
    ];

    // Create and position the spheres
    sphereConfigs.forEach(config => {
        const material = new MeshStandardMaterialAsset();
        material.color.value = new Color(config.color);
        const sphere = new MeshAsset(sphereGeometry, material);
        sphere.position.value = new Vector3(...config.position);
        spheres.push(sphere);
    });

    return {
        createCamera: () => {
            const camera = new PerspectiveCameraAsset();
            camera.fov = 75;
            camera.near = 0.1;
            camera.far = 1000;
            camera.position.value = new Vector3(10, 10, 10);
            camera.lookAt(new Vector3(0, 0, 0));
            return camera;
        },
        assets: [light, plane, ...spheres],
        actions: [] // Empty array for now
    };
} 