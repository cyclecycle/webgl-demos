import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Pathfinder } from './pathfinding.js';
import { Unit } from './unit.js';

// --- Globals ---
let scene, camera, renderer, controls;
let raycaster, mouse;
let clock;
let pathfinder;
let units = [];
let obstacles = [];

// Selection State
let isSelecting = false;
let selectionStart = new THREE.Vector2();
let selectionBoxElement;

// Camera Panning State
const PAN_SPEED = 20.0;
const PAN_BORDER = 20; // Pixels from edge
let mouseX = 0, mouseY = 0;
let panUp = false, panDown = false, panLeft = false, panRight = false;

// Map Config
const MAP_SIZE = 50;
const GRID_SCALE = 1;

// --- Init ---

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 40, 20);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    // Configure for RTS
    controls.mouseButtons = {
        LEFT: null, // Custom Selection
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: null // Custom Move
    };
    controls.enablePan = false; // We handle panning
    controls.minDistance = 10;
    controls.maxDistance = 60;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 50, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    scene.add(dirLight);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(MAP_SIZE, MAP_SIZE, 0x555555, 0x444444);
    scene.add(gridHelper);

    // Pathfinder
    pathfinder = new Pathfinder(MAP_SIZE, MAP_SIZE, GRID_SCALE);

    // Generate Obstacles
    generateMap();

    // Units
    for (let i = 0; i < 10; i++) {
        const x = (Math.random() - 0.5) * 10 - 15;
        const z = (Math.random() - 0.5) * 10 - 15;
        // Ensure not inside obstacle
        if (pathfinder.isWalkableAt(x, z)) {
            const unit = new Unit(scene, x, z);
            units.push(unit);
        }
    }

    // UI & Events
    selectionBoxElement = document.getElementById('selection-box');
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Keyboard Pan
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') resetScene();
        switch (e.code) {
            case 'ArrowUp': case 'KeyW': panUp = true; break;
            case 'ArrowDown': case 'KeyS': panDown = true; break;
            case 'ArrowLeft': case 'KeyA': panLeft = true; break;
            case 'ArrowRight': case 'KeyD': panRight = true; break;
        }
    });
    window.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'ArrowUp': case 'KeyW': panUp = false; break;
            case 'ArrowDown': case 'KeyS': panDown = false; break;
            case 'ArrowLeft': case 'KeyA': panLeft = false; break;
            case 'ArrowRight': case 'KeyD': panRight = false; break;
        }
    });

    // Prevent context menu
    window.addEventListener('contextmenu', e => e.preventDefault());

    clock = new THREE.Clock();
    animate();
}

function generateMap() {
    // Clear old
    obstacles.forEach(o => scene.remove(o));
    obstacles = [];

    // Random blocks
    const obstacleGeo = new THREE.BoxGeometry(GRID_SCALE, 2, GRID_SCALE);
    const obstacleMat = new THREE.MeshStandardMaterial({ color: 0x666666 });

    for (let i = 0; i < 80; i++) {
        const x = Math.floor((Math.random() - 0.5) * MAP_SIZE);
        const z = Math.floor((Math.random() - 0.5) * MAP_SIZE);

        // Keep center somewhat clear
        if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

        // Check pathfinder
        if (pathfinder.isWalkableAt(x, z)) {
            pathfinder.setObstacle(x, z, true);

            const obs = new THREE.Mesh(obstacleGeo, obstacleMat);
            obs.position.set(x * GRID_SCALE, 1, z * GRID_SCALE); // Center
            obs.castShadow = true;
            obs.receiveShadow = true;
            scene.add(obs);
            obstacles.push(obs);
        }
    }
}

function resetScene() {
    // Re-gen map
    pathfinder = new Pathfinder(MAP_SIZE, MAP_SIZE, GRID_SCALE);
    generateMap();
    // Reset units
    units.forEach(u => scene.remove(u.mesh));
    units = [];
    for (let i = 0; i < 10; i++) {
        const x = (Math.random() - 0.5) * 10 - 15;
        const z = (Math.random() - 0.5) * 10 - 15;
        if (pathfinder.isWalkableAt(x, z)) {
            const unit = new Unit(scene, x, z);
            units.push(unit);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Input Handling ---

function onMouseDown(event) {
    if (event.button === 0) { // Left Click: Select Start
        isSelecting = true;
        selectionStart.set(event.clientX, event.clientY);

        selectionBoxElement.style.display = 'block';
        selectionBoxElement.style.left = event.clientX + 'px';
        selectionBoxElement.style.top = event.clientY + 'px';
        selectionBoxElement.style.width = '0px';
        selectionBoxElement.style.height = '0px';

    } else if (event.button === 2) { // Right Click: Move
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const ground = scene.children.find(c => c.geometry instanceof THREE.PlaneGeometry);
        const intersects = raycaster.intersectObject(ground);

        if (intersects.length > 0) {
            const target = intersects[0].point;
            moveSelectedUnits(target);
        }
    }
}

function onMouseMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;

    if (isSelecting) {
        const currentX = event.clientX;
        const currentY = event.clientY;

        const width = Math.abs(currentX - selectionStart.x);
        const height = Math.abs(currentY - selectionStart.y);
        const left = Math.min(currentX, selectionStart.x);
        const top = Math.min(currentY, selectionStart.y);

        selectionBoxElement.style.width = width + 'px';
        selectionBoxElement.style.height = height + 'px';
        selectionBoxElement.style.left = left + 'px';
        selectionBoxElement.style.top = top + 'px';
    }
}

function updateCamera(dt) {
    // Edge Scrolling and Keyboard Panning
    const speed = PAN_SPEED * dt;
    let dx = 0;
    let dz = 0;

    // Check Edges
    if (mouseX < PAN_BORDER) dx -= 1;
    if (mouseX > window.innerWidth - PAN_BORDER) dx += 1;
    if (mouseY < PAN_BORDER) dz -= 1;
    if (mouseY > window.innerHeight - PAN_BORDER) dz += 1;

    // Check Keys
    if (panLeft) dx -= 1;
    if (panRight) dx += 1;
    if (panUp) dz -= 1;
    if (panDown) dz += 1;

    if (dx !== 0 || dz !== 0) {
        // Move relative to camera orientation?
        // Simple global XZ movement:
        // camera.position.x += dx * speed;
        // camera.position.z += dz * speed;

        // Better: Project camera "forward" vector onto XZ plane
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        // Right is forward x up (0,1,0)
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

        const move = new THREE.Vector3();
        move.addScaledVector(right, dx);
        move.addScaledVector(forward, -dz); // -dz because mouse Y=0 is Top (Forward)

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(speed);
            camera.position.add(move);
            controls.target.add(move);
        }
    }
}

function onMouseUp(event) {
    if (isSelecting) {
        isSelecting = false;
        selectionBoxElement.style.display = 'none';

        // Perform Selection
        const startX = Math.min(selectionStart.x, event.clientX);
        const endX = Math.max(selectionStart.x, event.clientX);
        const startY = Math.min(selectionStart.y, event.clientY);
        const endY = Math.max(selectionStart.y, event.clientY);

        // Convert to canvas coordinates if needed, but clientX is fine for simple DOM overlay check relative to viewport

        // Deselect all unless shift held (not implemented)
        units.forEach(u => u.setSelected(false));

        // Frustum / Screen Space Selection
        // Simple 2D check for now
        let count = 0;
        units.forEach(unit => {
            // Project unit position to screen
            const pos = unit.mesh.position.clone();
            pos.project(camera);

            // pos is in NDC (-1 to 1)
            const screenX = (pos.x * 0.5 + 0.5) * window.innerWidth;
            const screenY = (-(pos.y * 0.5) + 0.5) * window.innerHeight;

            if (screenX >= startX && screenX <= endX && screenY >= startY && screenY <= endY) {
                unit.setSelected(true);
                count++;
            }
        });

        // Click selection (if box is tiny)
        if (count === 0 && Math.abs(event.clientX - selectionStart.x) < 5) {
            // Raycast for single unit
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            // Check unit meshes
            // Simplified: distance check in 2D for robustness
            const intersects = raycaster.intersectObjects(scene.children, true);
            for (let hit of intersects) {
                const unit = units.find(u => {
                    let obj = hit.object;
                    while (obj) {
                        if (obj === u.mesh) return true;
                        obj = obj.parent;
                    }
                    return false;
                });
                if (unit) {
                    unit.setSelected(true);
                    break;
                }
            }
        }
    }
}

function moveSelectedUnits(target) {
    const selected = units.filter(u => u.selected);
    if (selected.length === 0) return;

    // Formation / Offset Logic
    // Just finding the same path for all causes stacking
    // But individual paths are expensive if 100 units
    // SC2 optimization: Group pathfinding or flow field

    // For PoC: Calculate path for the group center to target, then offset?
    // Or just pathfind individually but offset the TARGET slightly

    // Magic Box offset:
    // Create a spiral or grid of target points around the main target
    const spacing = 1.5;
    const cols = Math.ceil(Math.sqrt(selected.length));

    selected.forEach((unit, i) => {
        // Offset target
        const col = i % cols;
        const row = Math.floor(i / cols);
        const offsetX = (col - cols / 2) * spacing;
        const offsetZ = (row - cols / 2) * spacing;

        const unitTarget = new THREE.Vector3(target.x + offsetX, 0, target.z + offsetZ);

        // Find path
        const path = pathfinder.findPath(unit.mesh.position.x, unit.mesh.position.z, unitTarget.x, unitTarget.z);
        if (path && path.length > 0) {
            unit.setPath(path);
            if (i === 0) drawDebugPath(path);
        }
    });
}


let debugLine;
function drawDebugPath(path) {
    if (debugLine) scene.remove(debugLine);
    if (!path || path.length < 2) return;

    const points = path.map(p => new THREE.Vector3(p.x, 0.5, p.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffff00 });
    debugLine = new THREE.Line(geometry, material);
    scene.add(debugLine);
}

function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();
    controls.update();

    units.forEach(unit => unit.update(dt, units));

    renderer.render(scene, camera);
}

init();
