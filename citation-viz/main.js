import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as TWEEN from 'tween';

// --- Configuration ---
const CONFIG = {
    paperWidth: 20,
    paperHeight: 28, // ~A4 aspect
    margin: 2,
    lineHeight: 0.8,
    lineWidth: 0.5, // thickness of abstract text lines
    citationColor: 0x44aaff,
    textColor: 0x555555,
    paperColor: 0xffffff,
    nodeHeight: 15, // Height of citation nodes above paper
    nodeSpread: 25, // Spread of citation nodes
};

// --- Mock Data ---
const DATA = {
    paper: {
        title: "Deep Learning for 3D Visualization",
        id: "root",
        content: [] // Populated procedurally below
    },
    references: {}
};

// Generate mock content
const refIds = [];
for (let i = 1; i <= 15; i++) {
    const id = `ref_${i}`;
    refIds.push(id);
    DATA.references[id] = {
        id: id,
        title: `Reference Paper ${i}: Advanced Techniques in ${['WebGL', 'AI', 'Vis', 'Data'][i % 4]}`,
        author: `Author ${String.fromCharCode(65 + i)} et al.`,
        year: 2020 + Math.floor(Math.random() * 5),
        citations: Math.floor(Math.random() * 100)
    };
}

// Generate paper content structure
// text segments interspersed with citations
let currentLine = 0;
for (let i = 0; i < 40; i++) {
    // Random text length
    DATA.paper.content.push({ type: 'text', length: 5 + Math.random() * 15 });

    // Occasionally add a citation
    if (Math.random() > 0.6 && refIds.length > 0) {
        const refIndex = Math.floor(Math.random() * refIds.length);
        const refId = refIds[refIndex];
        DATA.paper.content.push({ type: 'citation', refId: refId });
    }
}


// --- Globals ---
let scene, camera, renderer, controls;
let raycaster, mouse;
let tooltip;
let interactables = []; // Objects to raycast against

// Groups
let paperGroup, connectionGroup, nodesGroup;

// --- Init ---

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.FogExp2(0x050510, 0.015);

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 30, 40);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't go below ground

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(10, 20, 10);
    scene.add(pointLight);

    // Groups
    paperGroup = new THREE.Group();
    connectionGroup = new THREE.Group();
    nodesGroup = new THREE.Group();
    scene.add(paperGroup);
    scene.add(connectionGroup);
    scene.add(nodesGroup);

    // --- Build Scene ---
    buildPaper();
    buildNodesAndConnections();

    // UI
    tooltip = document.getElementById('tooltip');
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Events
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);

    animate();
}

function buildPaper() {
    // Base Paper Plane
    const geometry = new THREE.BoxGeometry(CONFIG.paperWidth, 0.1, CONFIG.paperHeight);
    const material = new THREE.MeshStandardMaterial({
        color: CONFIG.paperColor,
        roughness: 0.2,
        metalness: 0.1
    });
    const paper = new THREE.Mesh(geometry, material);
    // paper.position.y = -0.05;
    paperGroup.add(paper);

    // Layout Text and Citations
    // Start top-left
    let cursorX = -CONFIG.paperWidth / 2 + CONFIG.margin;
    let cursorZ = -CONFIG.paperHeight / 2 + CONFIG.margin;
    const endX = CONFIG.paperWidth / 2 - CONFIG.margin;

    // Geometries to merge or instance could be better, but simple meshes for PoC
    const textMat = new THREE.MeshBasicMaterial({ color: CONFIG.textColor });
    const citeMat = new THREE.MeshBasicMaterial({ color: CONFIG.citationColor });

    DATA.paper.content.forEach(item => {
        if (item.type === 'text') {
            const width = item.length;
            // Check wrap
            if (cursorX + width > endX) {
                cursorX = -CONFIG.paperWidth / 2 + CONFIG.margin;
                cursorZ += CONFIG.lineHeight;
            }

            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.15, CONFIG.lineWidth),
                textMat
            );
            mesh.position.set(cursorX + width / 2, 0.1, cursorZ);
            paperGroup.add(mesh);

            cursorX += width + 0.5; // spacing
        } else if (item.type === 'citation') {
            const width = 1.5;
            if (cursorX + width > endX) {
                cursorX = -CONFIG.paperWidth / 2 + CONFIG.margin;
                cursorZ += CONFIG.lineHeight;
            }

            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(width, 0.2, CONFIG.lineWidth),
                citeMat.clone() // Clone to allow individual highlighting
            );
            mesh.position.set(cursorX + width / 2, 0.15, cursorZ);

            // Store reference data on mesh for interaction
            mesh.userData = {
                type: 'citation',
                refId: item.refId
            };

            paperGroup.add(mesh);
            interactables.push(mesh);

            // Store position for connection
            item.worldPos = new THREE.Vector3(cursorX + width / 2, 0.15, cursorZ);

            cursorX += width + 0.5;
        }
    });
}

function buildNodesAndConnections() {
    const nodeGeometry = new THREE.SphereGeometry(0.8, 32, 32);
    const nodeMaterial = new THREE.MeshStandardMaterial({
        color: 0xff44aa,
        emissive: 0x441133,
        roughness: 0.1,
        metalness: 0.5
    });

    const refNodes = {};

    // Create Nodes for each reference
    Object.values(DATA.references).forEach((ref, index) => {
        // Random position above paper
        // Use a spiral or random spread
        const angle = index * 137.5 * (Math.PI / 180); // Golden angle
        const radius = 5 + Math.sqrt(index) * 4;

        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = CONFIG.nodeHeight + (Math.random() - 0.5) * 5;

        const mesh = new THREE.Mesh(nodeGeometry, nodeMaterial.clone());
        mesh.position.set(x, y, z);
        mesh.userData = { type: 'node', data: ref };

        nodesGroup.add(mesh);
        interactables.push(mesh);
        refNodes[ref.id] = mesh;

        // Add label sprite? maybe too cluttered. Tooltip is better.
    });

    // Create Connections
    // Find all citations in paper content and connect to corresponding node
    DATA.paper.content.forEach(item => {
        if (item.type === 'citation' && item.worldPos && refNodes[item.refId]) {
            const start = item.worldPos;
            const end = refNodes[item.refId].position;

            // Curved line
            // Control points
            const midY = (start.y + end.y) / 2;
            const control1 = new THREE.Vector3(start.x, midY, start.z);
            const control2 = new THREE.Vector3(end.x, midY, end.z);

            const curve = new THREE.CubicBezierCurve3(start, control1, control2, end);
            const points = curve.getPoints(50);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);

            const material = new THREE.LineBasicMaterial({
                color: 0x44aaff,
                transparent: true,
                opacity: 0.2,
                linewidth: 1
            });

            const line = new THREE.Line(geometry, material);
            connectionGroup.add(line);

            // Store link in node and citation mesh for highlighting
            const citationMesh = paperGroup.children.find(c => c.userData.refId === item.refId && c.position.equals(item.worldPos));

            if (citationMesh) {
                if (!citationMesh.userData.links) citationMesh.userData.links = [];
                citationMesh.userData.links.push(line);

                const nodeMesh = refNodes[item.refId];
                if (!nodeMesh.userData.links) nodeMesh.userData.links = [];
                nodeMesh.userData.links.push(line);

                // Also link citation to node so we can highlight node from citation
                citationMesh.userData.targetNode = nodeMesh;
                // And node to citations
                if (!nodeMesh.userData.sourceCitations) nodeMesh.userData.sourceCitations = [];
                nodeMesh.userData.sourceCitations.push(citationMesh);
            }
        }
    });
}

// --- Interaction ---
let hoveredObject = null;

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactables);

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (hoveredObject !== obj) {
            if (hoveredObject) unhighlight(hoveredObject);
            hoveredObject = obj;
            highlight(hoveredObject, event.clientX, event.clientY);
        } else {
            // Update tooltip pos
            updateTooltipPos(event.clientX, event.clientY);
        }
        document.body.style.cursor = 'pointer';
    } else {
        if (hoveredObject) {
            unhighlight(hoveredObject);
            hoveredObject = null;
        }
        document.body.style.cursor = 'default';
    }
}

function highlight(obj, x, y) {
    // Show Tooltip
    tooltip.style.display = 'block';
    updateTooltipPos(x, y);

    if (obj.userData.type === 'citation') {
        const refId = obj.userData.refId;
        const refData = DATA.references[refId];
        tooltip.innerHTML = `<h3>${refData.title}</h3><p>${refData.author} (${refData.year})</p>`;

        // Visual Highlight
        obj.material.color.setHex(0xffffff);

        // Highlight Links
        if (obj.userData.links) {
            obj.userData.links.forEach(l => {
                l.material.opacity = 1.0;
                l.material.color.setHex(0xffffff);
            });
        }

        // Highlight Target Node
        if (obj.userData.targetNode) {
            obj.userData.targetNode.scale.setScalar(1.5);
            obj.userData.targetNode.material.emissiveIntensity = 2;
        }

    } else if (obj.userData.type === 'node') {
        const data = obj.userData.data;
        tooltip.innerHTML = `<h3>${data.title}</h3><p>${data.author} (${data.year})</p><p>Citations: ${data.citations}</p>`;

        obj.scale.setScalar(1.5);
        obj.material.emissiveIntensity = 2;

        // Highlight all incoming links
        if (obj.userData.links) {
            obj.userData.links.forEach(l => {
                l.material.opacity = 0.8;
                l.material.color.setHex(0xffaa44);
            });
        }

        // Highlight source citations on paper
        if (obj.userData.sourceCitations) {
            obj.userData.sourceCitations.forEach(c => c.material.color.setHex(0xffaa44));
        }
    }
}

function unhighlight(obj) {
    tooltip.style.display = 'none';

    if (obj.userData.type === 'citation') {
        obj.material.color.setHex(CONFIG.citationColor);

        if (obj.userData.links) {
            obj.userData.links.forEach(l => {
                l.material.opacity = 0.2;
                l.material.color.setHex(0x44aaff);
            });
        }

        if (obj.userData.targetNode) {
            new TWEEN.Tween(obj.userData.targetNode.scale)
                .to({ x: 1, y: 1, z: 1 }, 200)
                .start();
            obj.userData.targetNode.material.emissiveIntensity = 1;
        }

    } else if (obj.userData.type === 'node') {
        new TWEEN.Tween(obj.scale)
            .to({ x: 1, y: 1, z: 1 }, 200)
            .start();
        obj.material.emissiveIntensity = 1;

        if (obj.userData.links) {
            obj.userData.links.forEach(l => {
                l.material.opacity = 0.2;
                l.material.color.setHex(0x44aaff);
            });
        }

        if (obj.userData.sourceCitations) {
            obj.userData.sourceCitations.forEach(c => c.material.color.setHex(CONFIG.citationColor));
        }
    }
}

function updateTooltipPos(x, y) {
    tooltip.style.left = x + 15 + 'px';
    tooltip.style.top = y + 15 + 'px';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
    controls.update();
    renderer.render(scene, camera);
}

init();
