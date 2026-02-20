# StarCraft 2 Style Pathfinding Specification

## Core Concepts

StarCraft 2's pathfinding system is renowned for its fluidity and ability to handle large numbers of units (swarms) efficiently. It generally relies on the following components:

1.  **Navigation Mesh (NavMesh)**:
    *   Unlike grid-based games (C&C, WC2), SC2 uses a NavMesh to represent walkable space.
    *   This allows for arbitrary angles and smooth movement around complex geometry.
    *   *Implementation Strategy*: For this PoC, we will approximate this using a high-resolution grid for path calculation, followed by **String Pulling (Funnel Algorithm)**. This converts a jagged grid path into a smooth, corner-hugging path that mimics NavMesh behavior without requiring complex polygon triangulation libraries.

2.  **Path Smoothing**:
    *   Units do not move in 45-degree increments. They take the straightest path possible.
    *   *Implementation*: The Funnel Algorithm removes unnecessary waypoints from the grid path.

3.  **Steering Behaviors (Boids/RVO)**:
    *   Units interact with each other. They do not pass through each other (mostly).
    *   "Soft" collisions: Units gently push each other apart when idle.
    *   "Hard" collisions: Moving units avoid each other to prevent stacking.
    *   *Implementation*: A simple separation force vector will be applied. If unit A is too close to unit B, add a velocity vector away from B.

4.  **Group Movement (Flocking)**:
    *   When a group is ordered to a single point, they don't all try to occupy that exact coordinate (which would cause glitching/stacking).
    *   They arrive and settle in a loose formation around the target.
    *   *Implementation*: When a command is issued to N units, we can assign target offsets or rely on the separation force to naturally spread them out at the destination. We will use a "Magic Box" approach or simply apply strong separation at zero velocity.

5.  **Acceleration/Turn Rate**:
    *   Units are not massless points; they have inertia.
    *   *Implementation*: Units will have `currentVelocity`, `maxSpeed`, `acceleration`, and `turnSpeed`.

## Technical Architecture (Three.js PoC)

### 1. The Map (`GridMap`)
*   A 2D array representing the world (0 = walkable, 1 = obstacle).
*   Visualized as a flat plane with BoxGeometries for walls.
*   Resolution: 1 world unit = 1 grid cell (or 0.5 for higher fidelity).

### 2. Pathfinding Service (`Pathfinder`)
*   **A* Algorithm**: Standard implementation with diagonals allowed.
*   **Heuristic**: Euclidean distance (since we smooth it later).
*   **String Pulling**: Iterates through the A* node list and removes nodes that are not needed (i.e., if node A has line-of-sight to node C, skip node B).

### 3. The Unit (`Unit`)
*   **State**: `position`, `velocity`, `path` (array of Vector3 points).
*   **Update Loop**:
    1.  Check distance to next waypoint.
    2.  Calculate desired velocity towards waypoint.
    3.  Calculate **Separation Force** from nearby neighbors.
    4.  Apply forces to `velocity` (with clamping for acceleration/max speed).
    5.  Move and rotate mesh.

### 4. Input Manager
*   **Selection Box**: 2D overlay drawing + Frustum culling or screen-space projection to select multiple units.
*   **Right Click**: Raycast to ground -> Compute Path for all selected units.

## Visuals
*   **Units**: Simple cones or capsules. Color changes on selection (Green circle).
*   **Path**: Use `THREE.Line` to draw the debug path for the active unit.
*   **Obstacles**: Grey blocks.
