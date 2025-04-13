import { Vector3, Color } from "three";
import { HemisphereLightAsset } from "$lib/scene/Object3D/Light/HemisphereLight/HemisphereLightAsset";
import { PlaneGeometryAsset } from "$lib/scene/Geometry/PlaneGeometry/PlaneGeometryAsset";
import { SphereGeometryAsset } from "$lib/scene/Geometry/SphereGeometry/SphereGeometryAsset";
import { MeshStandardMaterialAsset } from "$lib/scene/Material/MeshStandardMaterial/MeshStandardMaterialAsset";
import { MeshAsset } from "$lib/scene/Object3D/Mesh/MeshAsset";
import { PerspectiveCameraAsset } from "$lib/scene/Object3D/Camera/PerspectiveCamera/PerspectiveCameraAsset";
import type { AnimationData } from "$lib/animation/AnimationData";
import { sceneStore } from "$lib/stores/scene";

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
        { color: "#ff0000", position: [-5, 1, -5], name: "redSphere" },    // Red
        { color: "#00ff00", position: [5, 1, -5], name: "greenSphere" },   // Green
        { color: "#0000ff", position: [0, 1, 0], name: "blueSphere" },     // Blue
        { color: "#ffff00", position: [-5, 1, 5], name: "yellowSphere" },  // Yellow
        { color: "#ff00ff", position: [5, 1, 5], name: "magentaSphere" }   // Magenta
    ];

    // Create and position the spheres
    sphereConfigs.forEach(config => {
        const material = new MeshStandardMaterialAsset();
        material.color.value = new Color(config.color);
        const sphere = new MeshAsset(sphereGeometry, material, config.name);
        sphere.position.value = new Vector3(...config.position);
        spheres.push(sphere);
    });

    // Define animations for each sphere
    const animations: AnimationData[] = [
        {
            target: "redSphere",
            property: ".position[y]",
            keyframes: [
                { time: 0, value: 1 },
                { time: 2, value: 3 },
                { time: 4, value: 1 }
            ],
            duration: 4,
            startTime: 1,
            loopMode: 'once'
        },
        {
            target: "greenSphere",
            property: ".position[y]",
            keyframes: [
                { time: 0, value: 1 },
                { time: 2, value: 3 },
                { time: 4, value: 1 }
            ],
            duration: 4,
            startTime: 4,
            loopMode: 'once'
        },
        {
            target: "blueSphere",
            property: ".position[y]",
            keyframes: [
                { time: 0, value: 1 },
                { time: 2, value: 3 },
                { time: 4, value: 1 }
            ],
            duration: 4,
            startTime: 7,
            loopMode: 'once'
        },
        {
            target: "yellowSphere",
            property: ".position[y]",
            keyframes: [
                { time: 0, value: 1 },
                { time: 2, value: 3 },
                { time: 4, value: 1 }
            ],
            duration: 4,
            startTime: 10,
            loopMode: 'once'
        },
        {
            target: "magentaSphere",
            property: ".position[y]",
            keyframes: [
                { time: 0, value: 1 },
                { time: 2, value: 3 },
                { time: 4, value: 1 }
            ],
            duration: 4,
            startTime: 13,
            loopMode: 'once'
        }
    ];

    const camera = new PerspectiveCameraAsset();
    camera.fov = 75;
    camera.near = 0.1;
    camera.far = 1000;
    camera.position.value = new Vector3(10, 10, 10);
    camera.lookAt(new Vector3(0, 0, 0));

    // Load the scene with animations
    sceneStore.loadScene(camera, [light, plane, ...spheres], animations);

    return {
        createCamera: () => camera,
        assets: [light, plane, ...spheres],
        actions: animations
    };
} 