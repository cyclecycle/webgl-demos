import * as THREE from 'three';

// A generic grid-based A* Pathfinder with String Pulling (Funnel Algorithm)
export class Pathfinder {
    constructor(width, height, scale = 1) {
        this.width = width;
        this.height = height;
        this.scale = scale;
        this.grid = new Uint8Array(width * height); // 0 = empty, 1 = obstacle
    }

    // Set a cell as obstacle
    setObstacle(x, z, isObstacle) {
        const gx = Math.floor(x / this.scale + this.width / 2);
        const gz = Math.floor(z / this.scale + this.height / 2);
        if (gx >= 0 && gx < this.width && gz >= 0 && gz < this.height) {
            this.grid[gz * this.width + gx] = isObstacle ? 1 : 0;
        }
    }

    // Check if world position is walkable
    isWalkableAt(x, z) {
        const gx = Math.floor(x / this.scale + this.width / 2);
        const gz = Math.floor(z / this.scale + this.height / 2);
        if (gx < 0 || gx >= this.width || gz < 0 || gz >= this.height) return false;
        return this.grid[gz * this.width + gx] === 0;
    }

    // A* Search
    findPath(startX, startZ, endX, endZ) {
        const startNode = {
            x: Math.floor(startX / this.scale + this.width / 2),
            y: Math.floor(startZ / this.scale + this.height / 2),
            g: 0, h: 0, f: 0, parent: null
        };
        const endNode = {
            x: Math.floor(endX / this.scale + this.width / 2),
            y: Math.floor(endZ / this.scale + this.height / 2)
        };

        // Validate start/end
        if (!this.isValid(startNode.x, startNode.y) || !this.isValid(endNode.x, endNode.y)) return [];

        // If start is blocked, find nearest valid neighbor (simple approach)
        // If end is blocked, find nearest valid neighbor
        if (this.isBlocked(endNode.x, endNode.y)) {
            // Search outward spiral for nearest walkable
            // For now, just return empty path if target is invalid
            return [];
        }

        const openList = [startNode];
        const closedList = new Set(); // Use string key "x,y"

        // 8 Directions (including diagonals)
        const neighbors = [
            { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
            { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }
        ];

        while (openList.length > 0) {
            // Get lowest F cost
            let lowestIndex = 0;
            for (let i = 1; i < openList.length; i++) {
                if (openList[i].f < openList[lowestIndex].f) lowestIndex = i;
            }
            const current = openList[lowestIndex];

            // Reached destination?
            if (current.x === endNode.x && current.y === endNode.y) {
                // Reconstruct path
                let path = [];
                let curr = current;
                while (curr) {
                    path.push(new THREE.Vector3(
                        (curr.x - this.width / 2) * this.scale + this.scale / 2,
                        0,
                        (curr.y - this.height / 2) * this.scale + this.scale / 2
                    ));
                    curr = curr.parent;
                }
                return this.smoothPath(path.reverse());
            }

            // Move current from open to closed
            openList.splice(lowestIndex, 1);
            closedList.add(`${current.x},${current.y}`);

            // Check neighbors
            for (let offset of neighbors) {
                const nx = current.x + offset.x;
                const ny = current.y + offset.y;

                if (!this.isValid(nx, ny) || this.isBlocked(nx, ny) || closedList.has(`${nx},${ny}`)) {
                    continue;
                }

                // Diagonal Check: Don't cut corners through walls
                if (Math.abs(offset.x) === 1 && Math.abs(offset.y) === 1) {
                    // Check if adjacent orthogonal cells are blocked
                    if (this.isBlocked(current.x + offset.x, current.y) || this.isBlocked(current.x, current.y + offset.y)) {
                        continue;
                    }
                }

                const gScore = current.g + ((offset.x === 0 || offset.y === 0) ? 1 : 1.414);
                let neighbor = openList.find(n => n.x === nx && n.y === ny);

                if (!neighbor) {
                    neighbor = { x: nx, y: ny, parent: current, g: gScore, h: 0, f: 0 };
                    neighbor.h = Math.sqrt(Math.pow(neighbor.x - endNode.x, 2) + Math.pow(neighbor.y - endNode.y, 2));
                    neighbor.f = neighbor.g + neighbor.h;
                    openList.push(neighbor);
                } else if (gScore < neighbor.g) {
                    neighbor.g = gScore;
                    neighbor.parent = current;
                    neighbor.f = neighbor.g + neighbor.h;
                }
            }
        }

        return []; // No path found
    }

    isValid(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    isBlocked(x, y) {
        return this.grid[y * this.width + x] === 1;
    }

    // String Pulling / Raycasting Smoothing
    smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothPath = [path[0]];
        let currentIdx = 0;

        while (currentIdx < path.length - 1) {
            // Check visibility to subsequent nodes, starting from furthest
            let nextIdx = currentIdx + 1;

            // Look ahead as far as possible
            for (let i = path.length - 1; i > currentIdx + 1; i--) {
                if (this.hasLineOfSight(path[currentIdx], path[i])) {
                    nextIdx = i;
                    break;
                }
            }

            smoothPath.push(path[nextIdx]);
            currentIdx = nextIdx;
        }

        return smoothPath;
    }

    hasLineOfSight(start, end) {
        // Bresenham's Line Algorithm / Raycast on grid
        let x0 = Math.floor(start.x / this.scale + this.width / 2);
        let y0 = Math.floor(start.z / this.scale + this.height / 2);
        let x1 = Math.floor(end.x / this.scale + this.width / 2);
        let y1 = Math.floor(end.z / this.scale + this.height / 2);

        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = (x0 < x1) ? 1 : -1;
        let sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (this.isBlocked(x0, y0)) return false;

            if (x0 === x1 && y0 === y1) break;

            let e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
        return true;
    }
}
