import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration ---
const CONFIG = {
    unitSpeed: 5.0,
    legCount: 4,
    bodyRadius: 0.8,
    legRestDistance: 1.5, // How far from center the foot wants to be
    stepHeight: 0.5,
    stepDuration: 0.25, // Seconds
    turnSpeed: 5.0
};

// --- Globals ---
let scene, camera, renderer, controls;
let raycaster, mouse;
let clock;
let groundPlane;

// State
let selectedUnit = null;
const units = [];

// --- Classes ---

class IKLeg {
    constructor(parentDetails, angleOffset) {
        this.parent = parentDetails.mesh; // The body mesh
        this.angleOffset = angleOffset;
        
        // Geometry for the leg segments
        const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.6 });
        
        // Upper leg (Thigh)
        this.upperLegLength = 1.0;
        this.upperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, this.upperLegLength, 0.2), material);
        this.upperLeg.geometry.translate(0, -this.upperLegLength / 2, 0); // Pivot at top
        this.upperLeg.castShadow = true;
        
        // Lower leg (Shin)
        this.lowerLegLength = 1.5;
        this.lowerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.15, this.lowerLegLength, 0.15), material);
        this.lowerLeg.geometry.translate(0, -this.lowerLegLength / 2, 0); // Pivot at top
        this.lowerLeg.castShadow = true;

        // Joint mesh (Knee)
        const jointGeo = new THREE.SphereGeometry(0.15);
        const jointMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        this.kneeJoint = new THREE.Mesh(jointGeo, jointMat);
        
        // Assemble hierarchy
        // Pivot point on body
        this.hipPivot = new THREE.Object3D();
        this.parent.add(this.hipPivot);
        this.hipPivot.add(this.upperLeg);
        this.upperLeg.add(this.kneeJoint);
        this.kneeJoint.position.y = -this.upperLegLength;
        this.kneeJoint.add(this.lowerLeg);

        // State for animation
        this.isStepping = false;
        this.stepProgress = 0;
        this.stepStartPos = new THREE.Vector3();
        this.stepEndPos = new THREE.Vector3();
        
        // Current foot position in world space
        this.currentFootPos = new THREE.Vector3();
        
        // Calculate initial position
        this.updateRestPosition();
        this.currentFootPos.copy(this.restPosWorld);
    }

    getRestPositionWorld() {
        // Calculate where the foot "wants" to be relative to the body
        const angle = this.parent.rotation.y + this.angleOffset;
        const x = this.parent.position.x + Math.cos(angle) * CONFIG.legRestDistance;
        const z = this.parent.position.z - Math.sin(angle) * CONFIG.legRestDistance;
        const y = 0; // Ground level
        return new THREE.Vector3(x, y, z);
    }

    updateRestPosition() {
        this.restPosWorld = this.getRestPositionWorld();
    }

    solveIK(targetPos) {
        // Simple 2-bone IK in 2D plane defined by hip and target
        // Convert target to hip-local space
        const localTarget = this.hipPivot.worldToLocal(targetPos.clone());
        
        // Distance to target
        const dist = localTarget.length();
        
        // Clamp distance to avoid stretching
        const maxReach = this.upperLegLength + this.lowerLegLength - 0.01;
        if (dist > maxReach) {
            localTarget.normalize().multiplyScalar(maxReach);
        }

        // Law of Cosines
        const a = this.upperLegLength;
        const b = this.lowerLegLength;
        const c = dist;

        // Angle at hip (alpha) between vector-to-target and upper leg
        // c^2 = a^2 + b^2 - 2ab cos(gamma) -> knee angle
        // b^2 = a^2 + c^2 - 2ac cos(alpha) -> hip angle offset
        
        let alpha = Math.acos((a*a + c*c - b*b) / (2*a*c));
        let gamma = Math.acos((a*a + b*b - c*c) / (2*a*b)); // Angle inside knee

        if (isNaN(alpha)) alpha = 0;
        if (isNaN(gamma)) gamma = Math.PI;

        // Orient hip pivot to look at target
        this.hipPivot.lookAt(targetPos);
        
        // Apply IK rotations
        // The lookAt aligns Z to target (or -Z depending on setup, Three.js usually +Z is towards camera, but LookAt points +Z). 
        // We built legs along -Y. 
        // Let's adjust.
        
        // Actually, simple analytic solution might be better if we control rotation axes directly.
        // Let's assume lookAt aligns +Z to target.
        // We rotate X axis to lift leg.
        
        // Rotate hip down by (90deg - angle to target - alpha)
        // Angle to target in vertical plane:
        const angleToTarget = Math.atan2(localTarget.y, Math.sqrt(localTarget.x*localTarget.x + localTarget.z*localTarget.z));
        
        // Upper leg rotation (local X axis)
        // Default down is -Y. 
        // We want -Y to point at target (adjusted by alpha).
        // Rotate -Y by -90deg (-PI/2) to point +Z (Forward).
        // Then subtract alpha to lift it up (rotate -X).
        // Subtract angleToTarget to pitch it to correct height.
        
        this.upperLeg.rotation.x = -Math.PI / 2 - alpha - angleToTarget;
        
        // Knee rotation
        // Bend to match gamma.
        // If gamma is PI (straight), rotation should be 0.
        // If gamma is < PI, we bend.
        // Positive rotation moves -Y (Shin) "inward/backward" relative to Thigh.
        this.lowerLeg.rotation.x = Math.PI - gamma; 
    }

    update(dt) {
        this.updateRestPosition();
        
        const distToRest = this.currentFootPos.distanceTo(this.restPosWorld);
        
        // Trigger step if too far and not already stepping
        // Add random variation or check if opposite legs are stepping to create gait
        if (!this.isStepping && distToRest > 1.2) {
             // Check if we can step (simple gait control: don't step if neighbor is stepping could be added here)
             this.startStep();
        }

        if (this.isStepping) {
            this.stepProgress += dt / CONFIG.stepDuration;
            if (this.stepProgress >= 1) {
                this.stepProgress = 1;
                this.isStepping = false;
            }

            // Interpolate position
            const t = this.stepProgress;
            // Linear XZ
            this.currentFootPos.lerpVectors(this.stepStartPos, this.restPosWorld, t);
            // Parabolic Y (Height)
            this.currentFootPos.y = Math.sin(t * Math.PI) * CONFIG.stepHeight;
        } else {
            // Keep foot grounded (account for slight body movement if we want glue logic, 
            // but currentFootPos is world space, so it stays put automatically unless we move it)
        }

        this.solveIK(this.currentFootPos);
    }

    startStep() {
        this.isStepping = true;
        this.stepProgress = 0;
        this.stepStartPos.copy(this.currentFootPos);
        
        // Overshoot target slightly based on body velocity could be added for realism
        // For now just target the ideal rest position
    }
}

class StalkerUnit {
    constructor(scene, x, z) {
        this.scene = scene;
        
        // Group for the whole unit
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 1.8, z); // Initial height
        this.scene.add(this.mesh);

        // Body
        const bodyGeo = new THREE.SphereGeometry(CONFIG.bodyRadius, 16, 16);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 }); // Gold
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.castShadow = true;
        this.mesh.add(this.body);

        // Selection Ring
        const ringGeo = new THREE.RingGeometry(1.2, 1.4, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.0 });
        this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
        this.selectionRing.rotation.x = -Math.PI / 2;
        this.selectionRing.position.y = -1.7; // On ground relative to body center? No, body moves. 
        // Actually ring should probably be separate or updating position. 
        // Let's put it inside mesh but offset down.
        // Wait, mesh moves up and down? Ideally body bobs, but hip height stays roughly constant for simple IK.
        this.mesh.add(this.selectionRing);

        // Legs
        this.legs = [];
        for (let i = 0; i < CONFIG.legCount; i++) {
            const angle = (i / CONFIG.legCount) * Math.PI * 2 + (Math.PI/4);
            const leg = new IKLeg({ mesh: this.mesh }, angle);
            this.legs.push(leg);
        }

        // Movement State
        this.targetPosition = new THREE.Vector3(x, 1.8, z);
        this.isMoving = false;
        this.velocity = new THREE.Vector3();
    }

    setSelected(isSelected) {
        this.selectionRing.material.opacity = isSelected ? 0.8 : 0.0;
    }

    setTarget(point) {
        this.targetPosition.copy(point);
        this.targetPosition.y = this.mesh.position.y; // Keep height
        this.isMoving = true;
    }

    update(dt) {
        // Movement Logic
        if (this.isMoving) {
            const direction = new THREE.Vector3().subVectors(this.targetPosition, this.mesh.position);
            direction.y = 0;
            const dist = direction.length();

            if (dist < 0.1) {
                this.isMoving = false;
                this.velocity.set(0, 0, 0);
            } else {
                direction.normalize();
                
                // Rotation
                const targetRotation = Math.atan2(direction.x, direction.z); // +Z is south in Three.js default? 
                // Math.atan2(x, z) gives 0 at (0, 1) usually... 
                // Let's rotate body to face movement
                const currentRotation = this.mesh.rotation.y;
                // Simple lerp rotation
                let rotDiff = targetRotation - currentRotation;
                // Normalize angle to -PI to PI
                while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
                
                this.mesh.rotation.y += rotDiff * CONFIG.turnSpeed * dt;

                // Position
                const moveStep = direction.multiplyScalar(CONFIG.unitSpeed * dt);
                this.mesh.position.add(moveStep);
                
                // Bobbing effect
                this.mesh.position.y = 1.8 + Math.sin(Date.now() * 0.01) * 0.1;
            }
        }

        // Update Legs
        // We need to coordinate legs so they don't all lift at once
        // Simple heuristic: if a leg wants to step, check if its opposite is grounded
        this.legs.forEach(leg => leg.update(dt));
    }
}

// --- Init & Loop ---

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    scene.fog = new THREE.Fog(0x222222, 10, 50);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ 
        color: 0x333333, 
        roughness: 0.8,
        side: THREE.DoubleSide
    });
    groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(100, 50, 0x555555, 0x444444);
    scene.add(gridHelper);

    // Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Create Unit
    const stalker = new StalkerUnit(scene, 0, 0);
    units.push(stalker);
    // Select it by default for demo
    selectedUnit = stalker;
    stalker.setSelected(true);

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Clock
    clock = new THREE.Clock();

    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseDown(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    if (event.button === 0) { // Left Click: Select
        const intersects = raycaster.intersectObjects(scene.children, true);
        
        let hitUnit = null;
        for (let hit of intersects) {
            // Check if hit object belongs to a unit
            const unit = units.find(u => {
                let obj = hit.object;
                while(obj) {
                    if (obj === u.mesh) return true;
                    obj = obj.parent;
                }
                return false;
            });
            if (unit) {
                hitUnit = unit;
                break;
            }
        }

        if (hitUnit) {
            if (selectedUnit) selectedUnit.setSelected(false);
            selectedUnit = hitUnit;
            selectedUnit.setSelected(true);
        } else {
            // Deselect if clicked empty space? 
            // Often in RTS clicking ground deselects, but let's keep it simple.
            // If strictly ground, deselect.
            const groundHit = intersects.find(hit => hit.object === groundPlane);
            if (groundHit && intersects[0] === groundHit) {
                if (selectedUnit) selectedUnit.setSelected(false);
                selectedUnit = null;
            }
        }
    } else if (event.button === 2) { // Right Click: Move
        if (selectedUnit) {
            const intersects = raycaster.intersectObject(groundPlane);
            if (intersects.length > 0) {
                selectedUnit.setTarget(intersects[0].point);
            }
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    const dt = clock.getDelta();

    controls.update();

    units.forEach(unit => unit.update(dt));

    renderer.render(scene, camera);
}

init();
