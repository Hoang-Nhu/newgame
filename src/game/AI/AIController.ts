import { ArenaMap } from '../Map/ArenaMap';
import { CharacterEntity } from '../Character/CharacterEntity';
import { SkillSystem } from '../Skill/SkillSystem';
import { SkillSlot, Vec2 } from '../types';

export class AIController {
  constructor(
    private arenaMap: ArenaMap,
    private skillSystem: SkillSystem
  ) {}

  public updateCharacterAI(
    actor: CharacterEntity,
    allCharacters: CharacterEntity[],
    dt: number,
    elapsedTime: number,
    spawnCloneCallback: (owner: CharacterEntity, x: number, z: number) => void
  ): void {
    if (!actor.alive || actor.isPlayer) return;

    // Clones: random chaotic movement & dummy attacks to confuse enemy AI
    if (actor.isClone) {
      this.updateCloneBehavior(actor, allCharacters, dt, elapsedTime, spawnCloneCallback);
      return;
    }

    // 1. Perception with STRICT Raycast Fog-of-War, Bush Stealth, and Invisibility!
    const visibleEnemies = this.findVisibleEnemies(actor, allCharacters);
    const mem = actor.aiMemory;

    let currentTarget: CharacterEntity | null = null;
    if (mem.targetId) {
      const remembered = visibleEnemies.find((e) => e.id === mem.targetId);
      if (remembered) {
        currentTarget = remembered;
      }
    }

    // Pick closest visible enemy if we don't have one visible
    if (!currentTarget && visibleEnemies.length > 0) {
      let bestDist = Infinity;
      for (let i = 0; i < visibleEnemies.length; i++) {
        const e = visibleEnemies[i];
        const d = Math.hypot(e.x - actor.x, e.z - actor.z);
        if (d < bestDist) {
          bestDist = d;
          currentTarget = e;
        }
      }
    }

    if (currentTarget) {
      mem.targetId = currentTarget.id;
      mem.lastKnownPos = { x: currentTarget.x, z: currentTarget.z };
      mem.lostSightTimer = 0;
    } else if (mem.targetId && mem.lastKnownPos) {
      // Lost line of sight! Remember lastKnownPos and investigate up to 5 seconds
      mem.lostSightTimer += dt;
      const distToLast = Math.hypot(mem.lastKnownPos.x - actor.x, mem.lastKnownPos.z - actor.z);
      if (mem.lostSightTimer >= 5.0 || distToLast < 1.1) {
        if (mem.lostSightTimer >= 5.0 || distToLast < 1.1) {
          // After reaching last known spot without seeing anyone or after 5s, wait briefly or clear
          if (mem.lostSightTimer >= 5.0) {
            mem.targetId = null;
            mem.lastKnownPos = null;
            mem.lostSightTimer = 0;
          }
        }
      }
    }

    // 2. Movement & Combat Decision
    if (actor.castLockTimer > 0 || actor.isIncapacitated()) {
      actor.vx = 0;
      actor.vz = 0;
      return;
    }

    // Self-preservation defensive triggers (Support Heal, Tank Shield/Ult, Specialist Stealth)
    this.handleUtilitySkills(actor, visibleEnemies.length, currentTarget, allCharacters, elapsedTime, spawnCloneCallback);

    let desiredDirX = 0;
    let desiredDirZ = 0;
    let moveSpeedMult = 1.0;

    if (currentTarget) {
      const dx = currentTarget.x - actor.x;
      const dz = currentTarget.z - actor.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const dirX = dx / dist;
      const dirZ = dz / dist;
      actor.facingAngle = Math.atan2(dirX, dirZ);

      // Try casting offensive skills strictly in priority order: Ultimate > Skill 2 > Skill 1 > Basic
      this.tryOffensivePriority(actor, currentTarget, dist, allCharacters, elapsedTime, spawnCloneCallback);

      // Role spacing: Melee closes in; Ranged kites/strafes around preferredRange
      const pref = actor.config.preferredRange;
      mem.strafeTimer -= dt;
      if (mem.strafeTimer <= 0) {
        mem.strafeTimer = 1.1 + Math.random() * 1.4;
        mem.strafeDir = Math.random() > 0.5 ? 1 : -1;
      }

      if (dist > pref + 1.2) {
        mem.state = 'chase';
        desiredDirX = dirX + -dirZ * mem.strafeDir * 0.25;
        desiredDirZ = dirZ + dirX * mem.strafeDir * 0.25;
      } else if (dist < pref - 2.0 && actor.config.attackRange > 4.0) {
        // Ranged kiting backpedal!
        mem.state = 'retreat';
        desiredDirX = -dirX * 0.85 + -dirZ * mem.strafeDir * 0.55;
        desiredDirZ = -dirZ * 0.85 + dirX * mem.strafeDir * 0.55;
      } else {
        mem.state = 'combat';
        // Circle strafe
        desiredDirX = -dirZ * mem.strafeDir * 0.85;
        desiredDirZ = dirX * mem.strafeDir * 0.85;
        moveSpeedMult = 0.72;
      }
    } else if (mem.lastKnownPos) {
      // Investigate last known enemy position!
      mem.state = 'investigate';
      const dx = mem.lastKnownPos.x - actor.x;
      const dz = mem.lastKnownPos.z - actor.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.8) {
        desiredDirX = dx / dist;
        desiredDirZ = dz / dist;
        actor.facingAngle = Math.atan2(desiredDirX, desiredDirZ);
      } else {
        // Reached last known spot — scan around while waiting up to 5s timer
        actor.facingAngle += dt * 2.5;
        moveSpeedMult = 0;
      }
    } else {
      // Roam tactically toward center/bushes to encounter enemies naturally
      mem.state = 'roam';
      mem.roamTimer -= dt;
      if (!mem.roamTarget || mem.roamTimer <= 0 || Math.hypot(mem.roamTarget.x - actor.x, mem.roamTarget.z - actor.z) < 1.8) {
        mem.roamTimer = 2.6 + Math.random() * 2.5;
        // Bias toward central arena & bushes so combat stays brisk
        const r = Math.random() * 19;
        const a = Math.random() * Math.PI * 2;
        mem.roamTarget = { x: Math.cos(a) * r, z: Math.sin(a) * r };
      }
      const dx = mem.roamTarget.x - actor.x;
      const dz = mem.roamTarget.z - actor.z;
      const dist = Math.hypot(dx, dz) || 1;
      desiredDirX = dx / dist;
      desiredDirZ = dz / dist;
      actor.facingAngle = Math.atan2(desiredDirX, desiredDirZ);
      moveSpeedMult = 0.88;
    }

    // Apply obstacle-avoidance steering whiskers
    const speed = actor.getEffectiveMoveSpeed() * moveSpeedMult;
    if (speed > 0 && (Math.abs(desiredDirX) > 0.01 || Math.abs(desiredDirZ) > 0.01)) {
      const steered = this.steerAroundObstacles(actor, desiredDirX, desiredDirZ);
      actor.vx = steered.x * speed;
      actor.vz = steered.z * speed;

      const nextPos: Vec2 = {
        x: actor.x + actor.vx * dt,
        z: actor.z + actor.vz * dt,
      };
      this.arenaMap.resolveMovementCollision(nextPos, actor.getCollisionRadius());
      actor.x = nextPos.x;
      actor.z = nextPos.z;
    } else {
      actor.vx = 0;
      actor.vz = 0;
    }
  }

  private findVisibleEnemies(actor: CharacterEntity, allCharacters: CharacterEntity[]): CharacterEntity[] {
    const visible: CharacterEntity[] = [];
    const maxR = actor.config.visionRadius;

    for (let i = 0; i < allCharacters.length; i++) {
      const other = allCharacters[i];
      if (!other.alive || other.id === actor.id) continue;
      // Specialist does not target own clones
      if (other.ownerId === actor.id) continue;

      // Invisible or hidden in bush (unless revealed)
      if (other.isHiddenFromAI()) continue;

      const dist = Math.hypot(other.x - actor.x, other.z - actor.z);
      if (dist > maxR) continue;

      // Raycast check against trees, rocks, walls
      if (!this.arenaMap.hasLineOfSight(actor.x, actor.z, other.x, other.z)) continue;

      visible.push(other);
    }

    return visible;
  }

  private handleUtilitySkills(
    actor: CharacterEntity,
    visibleEnemyCount: number,
    target: CharacterEntity | null,
    allCharacters: CharacterEntity[],
    elapsedTime: number,
    spawnCloneCallback: (owner: CharacterEntity, x: number, z: number) => void
  ): void {
    const hpRatio = actor.hp / actor.maxHp;
    const facePos: Vec2 = target
      ? { x: target.x, z: target.z }
      : { x: actor.x + Math.sin(actor.facingAngle), z: actor.z + Math.cos(actor.facingAngle) };

    if (actor.charClass === 'Support') {
      // Priority: Ultimate > Skill 2 > Skill 1
      if (actor.cooldowns.ultimate <= 0 && (hpRatio < 0.72 || visibleEnemyCount >= 2)) {
        this.skillSystem.castSkill(actor, 'ultimate', facePos, allCharacters, elapsedTime, spawnCloneCallback);
        return;
      }
      if (actor.cooldowns.skill2 <= 0 && visibleEnemyCount > 0) {
        this.skillSystem.castSkill(actor, 'skill2', facePos, allCharacters, elapsedTime, spawnCloneCallback);
        return;
      }
      if (actor.cooldowns.skill1 <= 0 && hpRatio < 0.85) {
        this.skillSystem.castSkill(actor, 'skill1', facePos, allCharacters, elapsedTime, spawnCloneCallback);
        return;
      }
    }

    if (actor.charClass === 'Tank' && visibleEnemyCount > 0) {
      if (actor.cooldowns.ultimate <= 0 && hpRatio < 0.78) {
        this.skillSystem.castSkill(actor, 'ultimate', facePos, allCharacters, elapsedTime, spawnCloneCallback);
        return;
      }
      if (actor.cooldowns.skill2 <= 0) {
        this.skillSystem.castSkill(actor, 'skill2', facePos, allCharacters, elapsedTime, spawnCloneCallback);
        return;
      }
    }

    if (actor.charClass === 'Specialist' && visibleEnemyCount > 0) {
      if (actor.cooldowns.ultimate <= 0) {
        this.skillSystem.castSkill(actor, 'ultimate', facePos, allCharacters, elapsedTime, spawnCloneCallback);
        return;
      }
      if (actor.cooldowns.skill2 <= 0 && hpRatio < 0.88) {
        this.skillSystem.castSkill(actor, 'skill2', facePos, allCharacters, elapsedTime, spawnCloneCallback);
        return;
      }
    }
  }

  /**
   * Strict priority order: Ultimate > Skill 2 > Skill 1 > Basic Attack
   */
  private tryOffensivePriority(
    actor: CharacterEntity,
    target: CharacterEntity,
    dist: number,
    allCharacters: CharacterEntity[],
    elapsedTime: number,
    spawnCloneCallback: (owner: CharacterEntity, x: number, z: number) => void
  ): void {
    const order: SkillSlot[] = ['ultimate', 'skill2', 'skill1', 'basic'];
    const targetPos: Vec2 = { x: target.x, z: target.z };

    for (let i = 0; i < order.length; i++) {
      const slot = order[i];
      if (actor.cooldowns[slot] > 0) continue;

      const def = actor.config.skills[slot];
      // Support Skill 1/2 are self buffs handled in utility, Tank S2/Ult are self buffs
      if (actor.charClass === 'Support' && slot !== 'basic' && slot !== 'ultimate') continue;
      if (actor.charClass === 'Tank' && (slot === 'skill2' || slot === 'ultimate')) continue;
      if (actor.charClass === 'Specialist' && (slot === 'skill2' || slot === 'ultimate')) continue;

      if (def.range > 0 && dist > def.range) continue;

      // Specialist Blink flanks or dashes toward/sideways around target
      if (actor.charClass === 'Specialist' && slot === 'skill1') {
        const perpX = -(target.z - actor.z) / (dist || 1);
        const perpZ = (target.x - actor.x) / (dist || 1);
        const blinkTarget = {
          x: actor.x + (target.x - actor.x) * 0.6 + perpX * 3.5,
          z: actor.z + (target.z - actor.z) * 0.6 + perpZ * 3.5,
        };
        if (this.skillSystem.castSkill(actor, slot, blinkTarget, allCharacters, elapsedTime, spawnCloneCallback)) {
          return;
        }
        continue;
      }

      if (this.skillSystem.castSkill(actor, slot, targetPos, allCharacters, elapsedTime, spawnCloneCallback)) {
        return;
      }
    }
  }

  private updateCloneBehavior(
    clone: CharacterEntity,
    allCharacters: CharacterEntity[],
    dt: number,
    elapsedTime: number,
    spawnCloneCallback: (owner: CharacterEntity, x: number, z: number) => void
  ): void {
    const mem = clone.aiMemory;
    mem.roamTimer -= dt;
    if (!mem.roamTarget || mem.roamTimer <= 0) {
      mem.roamTimer = 1.0 + Math.random() * 1.2;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 16;
      mem.roamTarget = { x: Math.cos(a) * r, z: Math.sin(a) * r };
    }

    const dx = mem.roamTarget.x - clone.x;
    const dz = mem.roamTarget.z - clone.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = clone.getEffectiveMoveSpeed();
    clone.vx = (dx / dist) * speed;
    clone.vz = (dz / dist) * speed;
    clone.facingAngle = Math.atan2(clone.vx, clone.vz);

    const nextPos: Vec2 = { x: clone.x + clone.vx * dt, z: clone.z + clone.vz * dt };
    this.arenaMap.resolveMovementCollision(nextPos, clone.getCollisionRadius());
    clone.x = nextPos.x;
    clone.z = nextPos.z;

    // Occasionally throw decoy kunai at random nearby real character
    if (clone.cooldowns.basic <= 0) {
      const enemies = this.findVisibleEnemies(clone, allCharacters).filter((e) => !e.isClone && e.id !== clone.ownerId);
      if (enemies.length > 0) {
        const t = enemies[0];
        this.skillSystem.castSkill(clone, 'basic', { x: t.x, z: t.z }, allCharacters, elapsedTime, spawnCloneCallback);
      }
    }
  }

  private steerAroundObstacles(actor: CharacterEntity, dirX: number, dirZ: number): Vec2 {
    const len = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / len;
    const nz = dirZ / len;
    const probe = 2.4;

    if (!this.arenaMap.checkPointObstacleHit(actor.x + nx * probe, actor.z + nz * probe, actor.getCollisionRadius())) {
      return { x: nx, z: nz };
    }

    // Try angled steering whiskers
    const baseAngle = Math.atan2(nx, nz);
    const offsets = [0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
    for (let i = 0; i < offsets.length; i++) {
      const a = baseAngle + offsets[i];
      const tx = Math.sin(a);
      const tz = Math.cos(a);
      if (!this.arenaMap.checkPointObstacleHit(actor.x + tx * probe, actor.z + tz * probe, actor.getCollisionRadius())) {
        return { x: tx, z: tz };
      }
    }

    return { x: nx, z: nz };
  }
}
