import { BushZone, Obstacle, Vec2 } from '../types';

export class ArenaMap {
  public readonly halfSize = 28; // 56 x 56 playable arena
  public readonly obstacles: Obstacle[] = [];
  public readonly bushes: BushZone[] = [];

  constructor() {
    this.buildLayout();
  }

  private buildLayout(): void {
    // Gothic stone ruin walls forming tactical lanes & sightline breakers
    const wallSpecs: Array<{ x: number; z: number; halfW: number; halfD: number; height: number }> = [
      // Central broken sanctuary pillars/walls (leave center open for brawls, block diagonal LOS)
      { x: -7.5, z: -7.5, halfW: 2.3, halfD: 0.9, height: 3.4 },
      { x: 7.5, z: 7.5, halfW: 2.3, halfD: 0.9, height: 3.4 },
      { x: 7.5, z: -7.5, halfW: 0.9, halfD: 2.3, height: 3.4 },
      { x: -7.5, z: 7.5, halfW: 0.9, halfD: 2.3, height: 3.4 },
      // Outer ruin bastions
      { x: 0, z: -17.5, halfW: 3.4, halfD: 1.0, height: 3.6 },
      { x: 0, z: 17.5, halfW: 3.4, halfD: 1.0, height: 3.6 },
      { x: -17.5, z: 0, halfW: 1.0, halfD: 3.4, height: 3.6 },
      { x: 17.5, z: 0, halfW: 1.0, halfD: 3.4, height: 3.6 },
    ];

    wallSpecs.forEach((w, idx) => {
      this.obstacles.push({
        id: `wall_${idx}`,
        type: 'wall',
        x: w.x,
        z: w.z,
        halfW: w.halfW,
        halfD: w.halfD,
        radius: Math.hypot(w.halfW, w.halfD),
        height: w.height,
      });
    });

    // Large ancient trees (sightline blockers & movement obstacles)
    const treeSpecs: Array<{ x: number; z: number; radius: number; height: number }> = [
      { x: -14, z: -14, radius: 1.45, height: 6.4 },
      { x: 14, z: -14, radius: 1.45, height: 6.2 },
      { x: -14, z: 14, radius: 1.45, height: 6.5 },
      { x: 14, z: 14, radius: 1.45, height: 6.1 },
      { x: -21.5, z: -10, radius: 1.35, height: 5.9 },
      { x: 21.5, z: 10, radius: 1.35, height: 5.9 },
      { x: 10, z: -21.5, radius: 1.35, height: 6.0 },
      { x: -10, z: 21.5, radius: 1.35, height: 6.0 },
    ];

    treeSpecs.forEach((t, idx) => {
      this.obstacles.push({
        id: `tree_${idx}`,
        type: 'tree',
        x: t.x,
        z: t.z,
        radius: t.radius,
        height: t.height,
      });
    });

    // Craggy mossy boulders
    const rockSpecs: Array<{ x: number; z: number; radius: number; height: number }> = [
      { x: -12.5, z: -2.2, radius: 1.4, height: 2.4 },
      { x: 12.5, z: 2.2, radius: 1.4, height: 2.4 },
      { x: 2.2, z: -12.5, radius: 1.35, height: 2.3 },
      { x: -2.2, z: 12.5, radius: 1.35, height: 2.3 },
      { x: -20, z: 18, radius: 1.6, height: 2.7 },
      { x: 20, z: -18, radius: 1.6, height: 2.7 },
      { x: -18, z: -20, radius: 1.5, height: 2.5 },
      { x: 18, z: 20, radius: 1.5, height: 2.5 },
    ];

    rockSpecs.forEach((r, idx) => {
      this.obstacles.push({
        id: `rock_${idx}`,
        type: 'rock',
        x: r.x,
        z: r.z,
        radius: r.radius,
        height: r.height,
      });
    });

    // Stealth bush clusters (ambush pockets near lanes & center approaches)
    const bushSpecs: Array<{ x: number; z: number; radius: number }> = [
      { x: -3.5, z: -3.5, radius: 2.15 },
      { x: 3.5, z: 3.5, radius: 2.15 },
      { x: -11.5, z: 5.5, radius: 2.3 },
      { x: 11.5, z: -5.5, radius: 2.3 },
      { x: -5.5, z: -12.5, radius: 2.2 },
      { x: 5.5, z: 12.5, radius: 2.2 },
      { x: -19.5, z: -4.5, radius: 2.3 },
      { x: 19.5, z: 4.5, radius: 2.3 },
      { x: 4.5, z: -19.5, radius: 2.3 },
      { x: -4.5, z: 19.5, radius: 2.3 },
    ];

    bushSpecs.forEach((b, idx) => {
      this.bushes.push({
        id: `bush_${idx}`,
        x: b.x,
        z: b.z,
        radius: b.radius,
        rustleTimer: 0,
        rustleIntensity: 0,
      });
    });
  }

  public getSpawnPoints(): Vec2[] {
    const r = 21.5;
    const pts: Vec2[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const candidate = {
        x: Math.cos(angle) * r,
        z: Math.sin(angle) * r,
      };
      this.resolveMovementCollision(candidate, 0.9);
      pts.push(candidate);
    }
    return pts;
  }

  public getBushAt(x: number, z: number): BushZone | null {
    for (let i = 0; i < this.bushes.length; i++) {
      const b = this.bushes[i];
      const dx = x - b.x;
      const dz = z - b.z;
      if (dx * dx + dz * dz <= b.radius * b.radius) {
        return b;
      }
    }
    return null;
  }

  public triggerBushRustle(bush: BushZone, intensity = 1.0): void {
    bush.rustleTimer = 0.45;
    bush.rustleIntensity = Math.max(bush.rustleIntensity, intensity);
  }

  public updateBushes(dt: number): void {
    for (let i = 0; i < this.bushes.length; i++) {
      const b = this.bushes[i];
      if (b.rustleTimer > 0) {
        b.rustleTimer = Math.max(0, b.rustleTimer - dt);
        if (b.rustleTimer === 0) {
          b.rustleIntensity = 0;
        }
      }
    }
  }

  /**
   * Raycast line-of-sight check between two 2D arena points.
   * Returns true if NO wall, rock, or tree blocks the segment.
   */
  public hasLineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    for (let i = 0; i < this.obstacles.length; i++) {
      const obs = this.obstacles[i];
      if (obs.type === 'wall' && obs.halfW !== undefined && obs.halfD !== undefined) {
        if (this.segmentIntersectsAABB(ax, az, bx, bz, obs.x, obs.z, obs.halfW, obs.halfD)) {
          return false;
        }
      } else {
        if (this.segmentIntersectsCircle(ax, az, bx, bz, obs.x, obs.z, obs.radius * 0.92)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Checks if a projectile / point hits an obstacle.
   */
  public checkPointObstacleHit(x: number, z: number, radius = 0.2): Obstacle | null {
    if (Math.abs(x) > this.halfSize - radius || Math.abs(z) > this.halfSize - radius) {
      return null;
    }
    for (let i = 0; i < this.obstacles.length; i++) {
      const obs = this.obstacles[i];
      if (obs.type === 'wall' && obs.halfW !== undefined && obs.halfD !== undefined) {
        const cx = Math.max(obs.x - obs.halfW, Math.min(x, obs.x + obs.halfW));
        const cz = Math.max(obs.z - obs.halfD, Math.min(z, obs.z + obs.halfD));
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz < radius * radius) return obs;
      } else {
        const dx = x - obs.x;
        const dz = z - obs.z;
        const sum = obs.radius + radius;
        if (dx * dx + dz * dz < sum * sum) return obs;
      }
    }
    return null;
  }

  public isOutOfBounds(x: number, z: number, margin = 0.2): boolean {
    return (
      x < -this.halfSize + margin ||
      x > this.halfSize - margin ||
      z < -this.halfSize + margin ||
      z > this.halfSize - margin
    );
  }

  public resolveMovementCollision(pos: Vec2, actorRadius: number): void {
    const limit = this.halfSize - actorRadius;
    if (pos.x < -limit) pos.x = -limit;
    if (pos.x > limit) pos.x = limit;
    if (pos.z < -limit) pos.z = -limit;
    if (pos.z > limit) pos.z = limit;

    for (let i = 0; i < this.obstacles.length; i++) {
      const obs = this.obstacles[i];
      if (obs.type === 'wall' && obs.halfW !== undefined && obs.halfD !== undefined) {
        const closestX = Math.max(obs.x - obs.halfW, Math.min(pos.x, obs.x + obs.halfW));
        const closestZ = Math.max(obs.z - obs.halfD, Math.min(pos.z, obs.z + obs.halfD));
        let dx = pos.x - closestX;
        let dz = pos.z - closestZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < actorRadius * actorRadius) {
          if (distSq < 1e-6) {
            // Inside AABB: push out along shallowest axis
            const ox = obs.halfW + actorRadius - Math.abs(pos.x - obs.x);
            const oz = obs.halfD + actorRadius - Math.abs(pos.z - obs.z);
            if (ox < oz) {
              pos.x += pos.x >= obs.x ? ox : -ox;
            } else {
              pos.z += pos.z >= obs.z ? oz : -oz;
            }
          } else {
            const dist = Math.sqrt(distSq);
            const push = actorRadius - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          }
        }
      } else {
        const dx = pos.x - obs.x;
        const dz = pos.z - obs.z;
        const minDist = obs.radius + actorRadius;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          const push = minDist - dist;
          pos.x += (dx / dist) * push;
          pos.z += (dz / dist) * push;
        }
      }
    }
  }

  private segmentIntersectsCircle(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    cx: number,
    cz: number,
    r: number
  ): boolean {
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz;
    if (lenSq < 1e-6) {
      const dx = ax - cx;
      const dz = az - cz;
      return dx * dx + dz * dz <= r * r;
    }
    let t = ((cx - ax) * abx + (cz - az) * abz) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + t * abx;
    const pz = az + t * abz;
    const dx = px - cx;
    const dz = pz - cz;
    return dx * dx + dz * dz <= r * r;
  }

  private segmentIntersectsAABB(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    cx: number,
    cz: number,
    halfW: number,
    halfD: number
  ): boolean {
    const minX = cx - halfW;
    const maxX = cx + halfW;
    const minZ = cz - halfD;
    const maxZ = cz + halfD;
    const dx = bx - ax;
    const dz = bz - az;

    let tmin = 0;
    let tmax = 1;

    if (Math.abs(dx) < 1e-8) {
      if (ax < minX || ax > maxX) return false;
    } else {
      const invD = 1 / dx;
      let t1 = (minX - ax) * invD;
      let t2 = (maxX - ax) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }

    if (Math.abs(dz) < 1e-8) {
      if (az < minZ || az > maxZ) return false;
    } else {
      const invD = 1 / dz;
      let t1 = (minZ - az) * invD;
      let t2 = (maxZ - az) * invD;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }

    return true;
  }
}
