import * as THREE from 'three';

export class Unit {
    constructor(scene, x, z, color = 0x00aaff) {
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z);

        // Visuals
        const geometry = new THREE.ConeGeometry(0.3, 1, 8);
        geometry.translate(0, 0.5, 0); // Pivot at bottom
        geometry.rotateX(Math.PI / 2); // Point forward (Z)
        const material = new THREE.MeshStandardMaterial({ color: color });
        this.body = new THREE.Mesh(geometry, material);
        this.body.castShadow = true;
        this.mesh.add(this.body);

        // Selection Ring
        const ringGeo = new THREE.RingGeometry(0.5, 0.6, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, transparent: true, opacity: 0.0 });
        this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
        this.selectionRing.rotation.x = -Math.PI / 2;
        this.selectionRing.position.y = 0.02;
        this.mesh.add(this.selectionRing);

        scene.add(this.mesh);

        // Physics/Movement State
        this.velocity = new THREE.Vector3();
        this.maxSpeed = 5.0;
        this.maxForce = 20.0;
        this.radius = 0.5; // Collision radius

        this.path = [];
        this.currentWaypointIndex = 0;
        this.isMoving = false;

        this.selected = false;
    }

    setSelected(isSelected) {
        this.selected = isSelected;
        this.selectionRing.material.opacity = isSelected ? 0.8 : 0.0;
    }

    setPath(path) {
        if (path && path.length > 0) {
            this.path = path;
            this.currentWaypointIndex = 1; // 0 is start (current pos roughly)
            this.isMoving = true;
        } else {
            this.isMoving = false;
        }
    }

    update(dt, neighbors) {
        // --- Steering Behaviors ---
        const acceleration = new THREE.Vector3();

        // 1. Path Following (Seek)
        if (this.isMoving && this.path.length > 0) {
            const target = this.path[this.currentWaypointIndex];

            // Distance to current waypoint
            const dist = this.mesh.position.distanceTo(target);

            // Check if reached waypoint
            if (dist < 0.5) {
                this.currentWaypointIndex++;
                if (this.currentWaypointIndex >= this.path.length) {
                    this.isMoving = false; // Arrived
                    this.path = [];
                }
            }

            if (this.isMoving) {
                // Seek logic
                const desired = new THREE.Vector3().subVectors(target, this.mesh.position).normalize().multiplyScalar(this.maxSpeed);
                const steer = new THREE.Vector3().subVectors(desired, this.velocity);
                acceleration.add(steer.multiplyScalar(2.0)); // Weight for path following
            }
        } else {
            // Slow down if no path (friction)
            const friction = this.velocity.clone().multiplyScalar(-5.0);
            acceleration.add(friction);
        }

        // 2. Separation (Avoid Crowding)
        const separation = new THREE.Vector3();
        let count = 0;

        for (let other of neighbors) {
            if (other === this) continue;

            const dist = this.mesh.position.distanceTo(other.mesh.position);

            // If too close
            if (dist < this.radius + other.radius + 0.2) { // 0.2 buffer
                const push = new THREE.Vector3().subVectors(this.mesh.position, other.mesh.position);
                push.normalize();
                push.divideScalar(dist); // Weight by distance (closer = stronger)
                separation.add(push);
                count++;
            }
        }

        if (count > 0) {
            separation.divideScalar(count);
            separation.normalize().multiplyScalar(this.maxSpeed);
            const steer = new THREE.Vector3().subVectors(separation, this.velocity);
            acceleration.add(steer.multiplyScalar(3.0)); // Strong separation
        }

        // --- Integration ---

        // Update velocity
        this.velocity.add(acceleration.multiplyScalar(dt));

        // Clamp speed
        if (this.velocity.length() > this.maxSpeed) {
            this.velocity.normalize().multiplyScalar(this.maxSpeed);
        }

        // Update position
        const move = this.velocity.clone().multiplyScalar(dt);
        // Simple ground clamp
        move.y = 0;
        this.mesh.position.add(move);

        // Rotation (Face velocity if moving)
        if (this.velocity.lengthSq() > 0.1) {
            const angle = Math.atan2(this.velocity.x, this.velocity.z);
            // Smooth rotation could be added here
            this.mesh.rotation.y = angle;
        }
    }
}
