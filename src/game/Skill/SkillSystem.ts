import * as THREE from 'three';
import { ArenaMap } from '../Map/ArenaMap';
import { CharacterEntity } from '../Character/CharacterEntity';
import { CombatSystem } from '../Combat/CombatSystem';
import { EffectsManager } from '../Effects/EffectsManager';
import { SoundSystem } from '../Audio/SoundSystem';
import { SkillSlot, Vec2 } from '../types';

interface Projectile {
  id: number;
  owner: CharacterEntity;
  skillName: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  radius: number;
  damage: number;
  maxDist: number;
  traveled: number;
  piercing: boolean;
  hitIds: Set<string>;
  color: number;
  slowDuration?: number;
  slowFactor?: number;
  explodeRadius?: number;
  explodeDamage?: number;
  isDecoy?: boolean;
  mesh: THREE.Group;
  dispose: () => void;
}

interface PendingSkill {
  caster: CharacterEntity;
  slot: SkillSlot;
  timer: number;
  targetX: number;
  targetZ: number;
  dirX: number;
  dirZ: number;
}

export interface LavaZone {
  id: number;
  owner: CharacterEntity;
  startX: number;
  startZ: number;
  dirX: number;
  dirZ: number;
  length: number;
  width: number;
  remaining: number;
  tickAccum: number;
}

export class SkillSystem {
  public readonly group = new THREE.Group();
  private projectiles: Projectile[] = [];
  private pendingSkills: PendingSkill[] = [];
  public lavaZones: LavaZone[] = [];
  private nextProjId = 1;
  private nextLavaId = 1;

  constructor(
    private arenaMap: ArenaMap,
    private combat: CombatSystem,
    private effects: EffectsManager,
    private sound: SoundSystem
  ) {}

  public castSkill(
    caster: CharacterEntity,
    slot: SkillSlot,
    targetPos: Vec2,
    allCharacters: CharacterEntity[],
    elapsedTime: number,
    spawnCloneCallback: (owner: CharacterEntity, x: number, z: number) => void
  ): boolean {
    if (
      !caster.alive ||
      caster.cooldowns[slot] > 0 ||
      caster.castLockTimer > 0 ||
      caster.isIncapacitated()
    ) {
      return false;
    }

    const def = caster.config.skills[slot];
    caster.cooldowns[slot] = def.cooldown;

    // Direction toward targetPos
    let dx = targetPos.x - caster.x;
    let dz = targetPos.z - caster.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
      caster.facingAngle = Math.atan2(dx, dz);
    } else {
      dx = Math.sin(caster.facingAngle);
      dz = Math.cos(caster.facingAngle);
    }

    // Using skills/attacks in a bush reveals the character (except Specialist Shadow Veil)
    if (!(caster.charClass === 'Specialist' && slot === 'skill2')) {
      caster.markRevealed(1.6);
    }

    // Immediate cast skills vs telegraphed windup skills
    if (def.windup <= 0.12) {
      this.executeSkill(caster, slot, targetPos.x, targetPos.z, dx, dz, allCharacters, elapsedTime, spawnCloneCallback);
      return true;
    }

    // Spawn clear ground warning telegraph before activation!
    caster.castLockTimer = def.windup * 0.72;
    caster.attackAnimTimer = 0.25;
    this.spawnTelegraphForSkill(caster, slot, targetPos.x, targetPos.z, dx, dz, def.windup, def.color);

    this.pendingSkills.push({
      caster,
      slot,
      timer: def.windup,
      targetX: targetPos.x,
      targetZ: targetPos.z,
      dirX: dx,
      dirZ: dz,
    });

    return true;
  }

  private spawnTelegraphForSkill(
    caster: CharacterEntity,
    slot: SkillSlot,
    tx: number,
    tz: number,
    dx: number,
    dz: number,
    duration: number,
    color: number
  ): void {
    const cls = caster.charClass;
    if (cls === 'Archer') {
      if (slot === 'skill1') {
        this.effects.spawnLineTelegraph(caster.x, caster.z, dx, dz, 17, 1.35, color, duration);
      } else if (slot === 'skill2') {
        for (let i = -1; i <= 1; i++) {
          const ang = Math.atan2(dx, dz) + i * 0.24;
          this.effects.spawnLineTelegraph(caster.x, caster.z, Math.sin(ang), Math.cos(ang), 13.5, 0.85, color, duration);
        }
      } else if (slot === 'ultimate') {
        this.effects.spawnCircleTelegraph(caster.x, caster.z, 13.0, color, duration);
      }
    } else if (cls === 'SwordMaster') {
      if (slot === 'skill1') {
        this.effects.spawnLineTelegraph(caster.x, caster.z, dx, dz, 9.0, 2.2, color, duration);
      } else if (slot === 'skill2') {
        this.effects.spawnCircleTelegraph(caster.x, caster.z, 4.3, color, duration);
      } else if (slot === 'ultimate') {
        // Massive map-wide warning corridor!
        this.effects.spawnLineTelegraph(caster.x, caster.z, dx, dz, 52.0, 4.4, 0xff2600, duration);
      }
    } else if (cls === 'Mage') {
      if (slot === 'skill1') {
        this.effects.spawnLineTelegraph(caster.x, caster.z, dx, dz, 14.5, 1.8, color, duration);
      } else if (slot === 'skill2') {
        this.effects.spawnCircleTelegraph(tx, tz, 4.2, color, duration);
      } else if (slot === 'ultimate') {
        // Bold Red Meteor Warning Ring!
        this.effects.spawnCircleTelegraph(tx, tz, 5.2, 0xff2222, duration);
        this.effects.spawnMeteorImpact(tx, tz, 5.2, duration);
      }
    } else if (cls === 'Tank') {
      if (slot === 'skill1') {
        this.effects.spawnCircleTelegraph(caster.x, caster.z, 4.6, color, duration);
      } else if (slot === 'ultimate') {
        this.effects.spawnCircleTelegraph(caster.x, caster.z, 3.6, color, duration);
      }
    } else if (cls === 'Support') {
      if (slot === 'skill1') {
        this.effects.spawnCircleTelegraph(caster.x, caster.z, 2.4, color, duration);
      } else if (slot === 'ultimate') {
        this.effects.spawnCircleTelegraph(caster.x, caster.z, 11.5, color, duration);
      }
    } else if (cls === 'Specialist') {
      if (slot === 'ultimate') {
        this.effects.spawnCircleTelegraph(caster.x, caster.z, 4.2, color, duration);
      }
    }
  }

  private executeSkill(
    caster: CharacterEntity,
    slot: SkillSlot,
    tx: number,
    tz: number,
    dx: number,
    dz: number,
    allCharacters: CharacterEntity[],
    elapsedTime: number,
    spawnCloneCallback: (owner: CharacterEntity, x: number, z: number) => void
  ): void {
    if (!caster.alive) return;
    const cls = caster.charClass;
    const def = caster.config.skills[slot];

    if (slot === 'basic') {
      this.executeBasicCombo(caster, dx, dz, allCharacters, elapsedTime);
      return;
    }

    caster.attackAnimTimer = 0.25;

    if (cls === 'Archer') {
      if (slot === 'skill1') {
        // Straight high-damage piercing energy arrow (200 dmg)
        this.spawnProjectile(caster, def.name, caster.x, caster.z, dx, dz, 28, 0.72, 200, 18.0, true, def.color);
        this.effects.spawnShockwave(caster.x, caster.z, 1.8, def.color, 0.28);
      } else if (slot === 'skill2') {
        // 3 fan arrows (100 dmg each)
        const baseAng = Math.atan2(dx, dz);
        for (let i = -1; i <= 1; i++) {
          const ang = baseAng + i * 0.24;
          this.spawnProjectile(caster, def.name, caster.x, caster.z, Math.sin(ang), Math.cos(ang), 23, 0.44, 100, 14.5, false, def.color);
        }
      } else if (slot === 'ultimate') {
        // 360 degree Arrow Rain: 25 arrows, 80 dmg each!
        this.effects.spawnArrowRainImpact(caster.x, caster.z, 12.5);
        for (let i = 0; i < 25; i++) {
          const ang = (i / 25) * Math.PI * 2;
          this.spawnProjectile(caster, def.name, caster.x, caster.z, Math.sin(ang), Math.cos(ang), 20, 0.48, 80, 14.0, false, def.color);
        }
      }
      return;
    }

    if (cls === 'SwordMaster') {
      if (slot === 'skill1') {
        // Dash Slash (250 dmg)
        const steps = 10;
        const dashDist = 8.5;
        const hitSet = new Set<string>();
        for (let s = 1; s <= steps; s++) {
          const stepPos: Vec2 = {
            x: caster.x + dx * (dashDist / steps),
            z: caster.z + dz * (dashDist / steps),
          };
          this.arenaMap.resolveMovementCollision(stepPos, caster.getCollisionRadius());
          caster.x = stepPos.x;
          caster.z = stepPos.z;
          if (s % 2 === 0) {
            this.effects.spawnBurst(caster.x, 0.8, caster.z, def.color, 3, 3.5, 0.35, false);
          }
          allCharacters.forEach((other) => {
            if (!other.alive || other.id === caster.id || hitSet.has(other.id)) return;
            if (Math.hypot(other.x - caster.x, other.z - caster.z) <= 2.2 + other.getCollisionRadius()) {
              hitSet.add(other.id);
              this.combat.applyDamage(caster, other, 250, def.name, elapsedTime, { isCrit: true, revealTarget: true });
              this.effects.spawnBurst(other.x, 1.0, other.z, 0xff2e54, 10, 7, 0.45);
            }
          });
        }
        this.effects.spawnSlashArc(caster.x, caster.z, Math.atan2(dx, dz), 3.4, def.color, 0.35);
      } else if (slot === 'skill2') {
        // Blade Spin: 300 total dmg over 1.25s (handled in update loop)
        caster.spinTimer = 1.25;
        caster.spinDamageAccumulator = 0;
        this.effects.spawnWhirlwindVFX(caster.x, caster.z, 4.3, 1.25);
      } else if (slot === 'ultimate') {
        // Cross-map Great Sword Cleave: 500 dmg + 10s Lava!
        const length = 52.0;
        const width = 4.4;
        this.effects.spawnCrossMapCleave(caster.x, caster.z, dx, dz, length, width);
        allCharacters.forEach((other) => {
          if (!other.alive || other.id === caster.id) return;
          if (this.pointInOrientedRect(other.x, other.z, caster.x, caster.z, dx, dz, length, width * 0.5 + other.getCollisionRadius())) {
            this.combat.applyDamage(caster, other, 500, def.name, elapsedTime, { isCrit: true, revealTarget: true });
            this.effects.spawnBurst(other.x, 1.0, other.z, 0xff4500, 14, 8, 0.6);
          }
        });
        this.lavaZones.push({
          id: this.nextLavaId++,
          owner: caster,
          startX: caster.x,
          startZ: caster.z,
          dirX: dx,
          dirZ: dz,
          length,
          width,
          remaining: 10.0,
          tickAccum: 0,
        });
      }
      return;
    }

    if (cls === 'Mage') {
      if (slot === 'skill1') {
        // Ice Orb: 180 dmg + Slow
        this.spawnProjectile(caster, def.name, caster.x, caster.z, dx, dz, 16, 0.95, 180, 15.0, false, def.color, {
          slowDuration: 3.0,
          slowFactor: 0.45,
        });
        this.effects.spawnShockwave(caster.x, caster.z, 2.0, def.color, 0.3);
      } else if (slot === 'skill2') {
        // Immobilize Zone: Locks targets for 2 seconds + reveals
        const zoneRadius = 4.2;
        this.effects.spawnSanctuaryBeam(tx, tz, zoneRadius, def.color, 1.2);
        this.effects.spawnShockwave(tx, tz, zoneRadius, def.color, 0.55);
        allCharacters.forEach((other) => {
          if (!other.alive || other.id === caster.id) return;
          if (Math.hypot(other.x - tx, other.z - tz) <= zoneRadius + other.getCollisionRadius()) {
            this.combat.applyDamage(caster, other, 40, def.name, elapsedTime, {
              revealTarget: true,
              rootDuration: 2.0,
            });
            this.effects.spawnBurst(other.x, 1.0, other.z, 0xc084fc, 8, 5, 0.5);
          }
        });
      } else if (slot === 'ultimate') {
        // Meteor: 450 dmg
        const radius = 5.2;
        allCharacters.forEach((other) => {
          if (!other.alive || other.id === caster.id) return;
          if (Math.hypot(other.x - tx, other.z - tz) <= radius + other.getCollisionRadius()) {
            this.combat.applyDamage(caster, other, 450, def.name, elapsedTime, {
              isCrit: true,
              revealTarget: true,
            });
          }
        });
      }
      return;
    }

    if (cls === 'Tank') {
      if (slot === 'skill1') {
        // Ground Slam: 200 dmg AoE
        const radius = 4.6;
        this.effects.spawnShockwave(caster.x, caster.z, radius, def.color, 0.5, 0.35);
        this.effects.spawnBurst(caster.x, 0.3, caster.z, 0xff8c1a, 18, 9, 0.65);
        this.effects.addShake(0.45);
        allCharacters.forEach((other) => {
          if (!other.alive || other.id === caster.id) return;
          const dist = Math.hypot(other.x - caster.x, other.z - caster.z);
          if (dist <= radius + other.getCollisionRadius()) {
            this.combat.applyDamage(caster, other, 200, def.name, elapsedTime, {
              isCrit: true,
              revealTarget: true,
              slowDuration: 1.5,
              slowFactor: 0.35,
            });
          }
        });
      } else if (slot === 'skill2') {
        // Shield: 50% damage reduction for 4s
        caster.status.shieldTimer = 4.0;
        this.effects.spawnShockwave(caster.x, caster.z, 2.6, def.color, 0.4);
        this.combat.spawnStatusText(caster.x, 2.4, caster.z, 'SHIELD 50%', elapsedTime);
      } else if (slot === 'ultimate') {
        // Giant Form: Double HP!
        caster.status.titanTimer = 10.0;
        caster.maxHp = caster.config.maxHp * 2;
        caster.hp = Math.min(caster.maxHp, caster.hp * 2);
        this.effects.spawnSanctuaryBeam(caster.x, caster.z, 3.6, def.color, 1.0);
        this.effects.spawnShockwave(caster.x, caster.z, 5.2, def.color, 0.6);
        this.effects.addShake(0.5);
        this.combat.spawnStatusText(caster.x, 3.0, caster.z, 'COLOSSUS 2x HP!', elapsedTime);
      }
      return;
    }

    if (cls === 'Support') {
      if (slot === 'skill1') {
        // Heal 150 HP
        this.combat.applyHeal(caster, 150, elapsedTime);
        this.effects.spawnSanctuaryBeam(caster.x, caster.z, 2.4, def.color, 0.75);
      } else if (slot === 'skill2') {
        // Speed Boost
        caster.status.speedTimer = 3.5;
        caster.status.speedBonus = 0.55;
        this.effects.spawnShockwave(caster.x, caster.z, 2.6, def.color, 0.4);
        this.combat.spawnStatusText(caster.x, 2.3, caster.z, '+55% SPEED', elapsedTime);
      } else if (slot === 'ultimate') {
        // Team Heal: Heal self + allies (and cleanse slows/roots + reveal nearby stealthed foes)
        allCharacters.forEach((unit) => {
          if (!unit.alive || unit.isClone) return;
          if (unit.id === caster.id) {
            this.combat.applyHeal(unit, 420, elapsedTime);
            unit.status.slowTimer = 0;
            unit.status.rootTimer = 0;
            unit.status.speedTimer = Math.max(unit.status.speedTimer, 3.0);
            unit.status.speedBonus = Math.max(unit.status.speedBonus, 0.35);
          } else if (Math.hypot(unit.x - caster.x, unit.z - caster.z) <= 11.5) {
            // Radiant hymn reveals foes in sanctuary radius!
            unit.markRevealed(2.5);
          }
        });
        this.effects.spawnSanctuaryBeam(caster.x, caster.z, 11.5, def.color, 1.15);
        this.effects.spawnShockwave(caster.x, caster.z, 11.5, def.color, 0.7);
      }
      return;
    }

    if (cls === 'Specialist') {
      if (slot === 'skill1') {
        // Phase Blink + 50% speed boost
        const ox = caster.x;
        const oz = caster.z;
        const blinkPos: Vec2 = {
          x: caster.x + dx * 7.8,
          z: caster.z + dz * 7.8,
        };
        this.arenaMap.resolveMovementCollision(blinkPos, caster.getCollisionRadius());
        caster.x = blinkPos.x;
        caster.z = blinkPos.z;
        caster.status.speedTimer = Math.max(caster.status.speedTimer, 3.0);
        caster.status.speedBonus = Math.max(caster.status.speedBonus, 0.5);
        this.effects.spawnBlinkWarp(ox, oz, caster.x, caster.z, def.color);
        this.combat.spawnStatusText(caster.x, 2.3, caster.z, 'BLINK +50% SPD', elapsedTime);
      } else if (slot === 'skill2') {
        // 4s Invisibility (AI cannot detect!)
        caster.status.invisibleTimer = 4.0;
        caster.status.revealedTimer = 0;
        this.effects.spawnShockwave(caster.x, caster.z, 2.4, def.color, 0.45);
        this.effects.spawnBurst(caster.x, 0.9, caster.z, 0x9333ea, 12, 5.5, 0.5, false);
        this.combat.spawnStatusText(caster.x, 2.3, caster.z, 'INVISIBLE 4s', elapsedTime);
      } else if (slot === 'ultimate') {
        // Storm of Illusions: 5 autonomous clones!
        this.effects.spawnShockwave(caster.x, caster.z, 4.5, def.color, 0.5);
        this.combat.spawnStatusText(caster.x, 2.5, caster.z, '5 ILLUSIONS!', elapsedTime);
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          const pos: Vec2 = {
            x: caster.x + Math.cos(ang) * 2.4,
            z: caster.z + Math.sin(ang) * 2.4,
          };
          this.arenaMap.resolveMovementCollision(pos, caster.getCollisionRadius());
          this.effects.spawnBurst(pos.x, 0.9, pos.z, def.color, 8, 4.5, 0.45, false);
          spawnCloneCallback(caster, pos.x, pos.z);
        }
      }
    }
  }

  private executeBasicCombo(
    caster: CharacterEntity,
    dx: number,
    dz: number,
    allCharacters: CharacterEntity[],
    elapsedTime: number
  ): void {
    const comboHit = caster.advanceComboHit();
    if (!caster.isClone) {
      this.sound.playComboAttack(caster.charClass, comboHit);
    }

    const cls = caster.charClass;
    const def = caster.config.skills.basic;
    const faceAng = Math.atan2(dx, dz);

    if (cls === 'SwordMaster') {
      if (comboHit === 1) {
        // Hit 1: Crisp right-to-left diagonal slash
        this.meleeArcAttack(caster, `${def.name} I`, dx, dz, 3.0, Math.PI * 0.68, 120, 0xfb7185, allCharacters, elapsedTime, {
          tiltZ: -0.45,
        });
      } else if (comboHit === 2) {
        // Hit 2: Wider reverse cross cleave
        this.meleeArcAttack(caster, `${def.name} II`, dx, dz, 3.45, Math.PI * 0.98, 120, 0xf97316, allCharacters, elapsedTime, {
          tiltZ: 0.45,
        });
      } else {
        // Hit 3: Rising Dragon Uppercut Cleave -> KNOCKUP (Hất tung)
        this.effects.spawnShockwave(caster.x + dx * 1.4, caster.z + dz * 1.4, 3.4, 0xffd166, 0.4);
        this.meleeArcAttack(caster, `${def.name} III`, dx, dz, 3.9, Math.PI * 0.85, 145, 0xff2e54, allCharacters, elapsedTime, {
          tiltZ: 1.35,
          isCrit: true,
          knockupDuration: 0.78,
        });
      }
      return;
    }

    if (cls === 'Tank') {
      if (comboHit === 1) {
        // Hit 1: Focused front warhammer bash
        this.meleeArcAttack(caster, `${def.name} I`, dx, dz, 2.8, Math.PI * 0.62, 80, 0xfbbf24, allCharacters, elapsedTime, {
          tiltZ: -0.35,
        });
      } else if (comboHit === 2) {
        // Hit 2: Sweeping shield-arm backhand cleave
        this.meleeArcAttack(caster, `${def.name} II`, dx, dz, 3.25, Math.PI * 0.95, 80, 0xf59e0b, allCharacters, elapsedTime, {
          tiltZ: 0.35,
        });
      } else {
        // Hit 3: 360° Seismic Overhead Crush -> STUN (Choáng 1.0s)
        const radius = 3.65;
        this.effects.spawnShockwave(caster.x, caster.z, radius, 0xfacc15, 0.48, 0.35);
        this.effects.spawnBurst(caster.x, 0.3, caster.z, 0xfbbf24, 14, 7.5, 0.5);
        this.effects.addShake(0.35);
        this.meleeArcAttack(caster, `${def.name} III`, dx, dz, radius, Math.PI * 2, 105, 0xfde047, allCharacters, elapsedTime, {
          tiltZ: 0,
          isCrit: true,
          stunDuration: 1.0,
        });
      }
      return;
    }

    if (cls === 'Archer') {
      if (comboHit === 1) {
        // Hit 1: Fast crisp single emerald arrow
        this.spawnProjectile(caster, `${def.name} I`, caster.x, caster.z, dx, dz, 24, 0.36, caster.isClone ? 0 : 100, 14.5, false, 0x34d399, { isDecoy: caster.isClone });
      } else if (comboHit === 2) {
        // Hit 2: Twin-split volley covering wider lane
        for (const offset of [-0.11, 0.11]) {
          const ang = faceAng + offset;
          this.spawnProjectile(caster, `${def.name} II`, caster.x, caster.z, Math.sin(ang), Math.cos(ang), 25, 0.34, caster.isClone ? 0 : 55, 14.5, false, 0x6ee7b7, { isDecoy: caster.isClone });
        }
      } else {
        // Hit 3: Piercing Frost-Gale Arrow -> SLOW (Làm chậm)
        this.effects.spawnShockwave(caster.x, caster.z, 1.5, 0x38bdf8, 0.25);
        this.spawnProjectile(caster, `${def.name} III`, caster.x, caster.z, dx, dz, 27, 0.68, caster.isClone ? 0 : 120, 16.0, true, 0x38bdf8, {
          slowDuration: 2.0,
          slowFactor: 0.45,
          isDecoy: caster.isClone,
        });
      }
      return;
    }

    if (cls === 'Mage') {
      if (comboHit === 1) {
        // Hit 1: Crisp arcane bolt
        this.spawnProjectile(caster, `${def.name} I`, caster.x, caster.z, dx, dz, 20, 0.4, 90, 13.5, false, 0x818cf8);
      } else if (comboHit === 2) {
        // Hit 2: Twin arcane orbs
        for (const offset of [-0.13, 0.13]) {
          const ang = faceAng + offset;
          this.spawnProjectile(caster, `${def.name} II`, caster.x, caster.z, Math.sin(ang), Math.cos(ang), 21, 0.36, 50, 13.5, false, 0xa78bfa);
        }
      } else {
        // Hit 3: Runic Detonation Orb -> DETONATE (Kích nổ AoE 3.4m)
        this.effects.spawnShockwave(caster.x, caster.z, 1.5, 0xf472b6, 0.25);
        this.spawnProjectile(caster, `${def.name} III`, caster.x, caster.z, dx, dz, 19, 0.66, 95, 14.0, false, 0xf472b6, {
          explodeRadius: 3.4,
          explodeDamage: 65,
        });
      }
      return;
    }

    if (cls === 'Support') {
      if (comboHit === 1) {
        // Hit 1: Solar light spark
        this.spawnProjectile(caster, `${def.name} I`, caster.x, caster.z, dx, dz, 19, 0.38, 70, 12.0, false, 0xfef08a);
      } else if (comboHit === 2) {
        // Hit 2: Wide piercing radiant wave
        this.spawnProjectile(caster, `${def.name} II`, caster.x, caster.z, dx, dz, 21, 0.62, 75, 12.5, true, 0x2dd4bf);
      } else {
        // Hit 3: Luminous Sanctuary Pulse -> HEAL (Hồi máu +65 HP)
        this.combat.applyHeal(caster, 65, elapsedTime);
        this.effects.spawnSanctuaryBeam(caster.x, caster.z, 2.2, 0x4ade80, 0.55);
        this.effects.spawnShockwave(caster.x, caster.z, 2.8, 0x4ade80, 0.4);
        this.spawnProjectile(caster, `${def.name} III`, caster.x, caster.z, dx, dz, 22, 0.52, 85, 13.0, false, 0x4ade80);
      }
      return;
    }

    // Specialist
    if (comboHit === 1) {
      // Hit 1: Single void kunai
      this.spawnProjectile(caster, `${def.name} I`, caster.x, caster.z, dx, dz, 25, 0.34, caster.isClone ? 0 : 80, 10.5, false, 0xd946ef, { isDecoy: caster.isClone });
    } else if (comboHit === 2) {
      // Hit 2: Twin fan void kunai
      for (const offset of [-0.15, 0.15]) {
        const ang = faceAng + offset;
        this.spawnProjectile(caster, `${def.name} II`, caster.x, caster.z, Math.sin(ang), Math.cos(ang), 25, 0.32, caster.isClone ? 0 : 45, 10.5, false, 0xe879f9, { isDecoy: caster.isClone });
      }
    } else {
      // Hit 3: Shadow Step Strike -> TELEPORT (Dịch chuyển) + 360° slash burst
      const ox = caster.x;
      const oz = caster.z;
      const stepDist = caster.isClone ? 2.4 : 4.2;
      const dest: Vec2 = { x: caster.x + dx * stepDist, z: caster.z + dz * stepDist };
      this.arenaMap.resolveMovementCollision(dest, caster.getCollisionRadius());
      caster.x = dest.x;
      caster.z = dest.z;
      this.effects.spawnBlinkWarp(ox, oz, caster.x, caster.z, 0xc084fc);
      if (!caster.isClone) {
        this.combat.spawnStatusText(caster.x, 2.2, caster.z, 'SHADOW STEP', elapsedTime);
        this.meleeArcAttack(caster, `${def.name} III`, dx, dz, 3.1, Math.PI * 2, 95, 0xe879f9, allCharacters, elapsedTime, {
          isCrit: true,
        });
      }
    }
  }

  private meleeArcAttack(
    caster: CharacterEntity,
    skillName: string,
    dx: number,
    dz: number,
    range: number,
    arcAngle: number,
    damage: number,
    color: number,
    allCharacters: CharacterEntity[],
    elapsedTime: number,
    extra?: {
      tiltZ?: number;
      isCrit?: boolean;
      stunDuration?: number;
      knockupDuration?: number;
    }
  ): void {
    const faceAng = Math.atan2(dx, dz);
    this.effects.spawnSlashArc(
      caster.x,
      caster.z,
      faceAng,
      range,
      color,
      0.28,
      extra?.tiltZ ?? 0,
      arcAngle
    );

    allCharacters.forEach((other) => {
      if (!other.alive || other.id === caster.id) return;
      if (other.ownerId === caster.id || caster.ownerId === other.id) return;
      const ox = other.x - caster.x;
      const oz = other.z - caster.z;
      const dist = Math.hypot(ox, oz);
      if (dist > range + other.getCollisionRadius()) return;

      const dot = dist > 0.01 ? (ox / dist) * dx + (oz / dist) * dz : 1;
      if (arcAngle >= Math.PI * 1.9 || dot >= Math.cos(arcAngle * 0.6)) {
        this.combat.applyDamage(caster, other, damage, skillName, elapsedTime, {
          revealTarget: true,
          isCrit: extra?.isCrit,
          stunDuration: extra?.stunDuration,
          knockupDuration: extra?.knockupDuration,
        });
        this.effects.spawnBurst(other.x, 0.9, other.z, color, 6, 5, 0.35);
      }
    });
  }

  private spawnProjectile(
    owner: CharacterEntity,
    skillName: string,
    x: number,
    z: number,
    dx: number,
    dz: number,
    speed: number,
    radius: number,
    damage: number,
    maxDist: number,
    piercing: boolean,
    color: number,
    extra?: {
      slowDuration?: number;
      slowFactor?: number;
      explodeRadius?: number;
      explodeDamage?: number;
      isDecoy?: boolean;
    }
  ): void {
    const projGroup = new THREE.Group();
    projGroup.position.set(x, 0.95, z);
    projGroup.rotation.y = Math.atan2(dx, dz);

    // Glowing HDR core head
    const headGeo =
      radius > 0.65
        ? new THREE.IcosahedronGeometry(radius * 0.55, 1)
        : new THREE.ConeGeometry(radius * 0.48, radius * 2.2, 6);
    if (radius <= 0.65) headGeo.rotateX(Math.PI / 2);

    const headMat = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(color),
      emissiveIntensity: 3.2,
      roughness: 0.15,
    });
    const head = new THREE.Mesh(headGeo, headMat);

    // Bold luminous ribbon trail behind projectile!
    const trailLen = radius > 0.65 ? 2.6 : 3.2;
    const trailGeo = new THREE.BoxGeometry(radius * 0.5, radius * 0.35, trailLen);
    trailGeo.translate(0, 0, -trailLen / 2 - 0.15);
    const trailMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trail = new THREE.Mesh(trailGeo, trailMat);

    projGroup.add(head, trail);
    this.group.add(projGroup);

    this.projectiles.push({
      id: this.nextProjId++,
      owner,
      skillName,
      x,
      z,
      vx: dx * speed,
      vz: dz * speed,
      speed,
      radius,
      damage,
      maxDist,
      traveled: 0,
      piercing,
      hitIds: new Set<string>(),
      color,
      slowDuration: extra?.slowDuration,
      slowFactor: extra?.slowFactor,
      explodeRadius: extra?.explodeRadius,
      explodeDamage: extra?.explodeDamage,
      isDecoy: extra?.isDecoy,
      mesh: projGroup,
      dispose: () => {
        headGeo.dispose();
        headMat.dispose();
        trailGeo.dispose();
        trailMat.dispose();
      },
    });
  }

  public update(
    dt: number,
    allCharacters: CharacterEntity[],
    elapsedTime: number,
    spawnCloneCallback: (owner: CharacterEntity, x: number, z: number) => void
  ): void {
    // 1. Update Pending Telegraphed Skills
    for (let i = this.pendingSkills.length - 1; i >= 0; i--) {
      const p = this.pendingSkills[i];
      p.timer -= dt;
      if (p.timer <= 0) {
        this.pendingSkills.splice(i, 1);
        this.executeSkill(
          p.caster,
          p.slot,
          p.targetX,
          p.targetZ,
          p.dirX,
          p.dirZ,
          allCharacters,
          elapsedTime,
          spawnCloneCallback
        );
      }
    }

    // 2. Sword Master Whirlwind active damage ticks (300 total over 1.25s = 5 ticks x 60 dmg)
    for (let i = 0; i < allCharacters.length; i++) {
      const c = allCharacters[i];
      if (!c.alive || c.spinTimer <= 0) continue;
      c.spinTimer = Math.max(0, c.spinTimer - dt);
      c.spinDamageAccumulator += dt;
      if (c.spinDamageAccumulator >= 0.25) {
        c.spinDamageAccumulator -= 0.25;
        allCharacters.forEach((other) => {
          if (!other.alive || other.id === c.id) return;
          if (Math.hypot(other.x - c.x, other.z - c.z) <= 4.3 + other.getCollisionRadius()) {
            this.combat.applyDamage(c, other, 60, 'Whirlwind Fury', elapsedTime, { revealTarget: true });
            this.effects.spawnBurst(other.x, 0.9, other.z, 0xf97316, 4, 4, 0.3);
          }
        });
      }
    }

    // 3. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const stepDist = pr.speed * dt;
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;
      pr.traveled += stepDist;
      pr.mesh.position.set(pr.x, 0.95, pr.z);

      // Check obstacle or boundary hit
      if (
        pr.traveled >= pr.maxDist ||
        this.arenaMap.isOutOfBounds(pr.x, pr.z, 0.2) ||
        this.arenaMap.checkPointObstacleHit(pr.x, pr.z, pr.radius * 0.45)
      ) {
        this.effects.spawnBurst(pr.x, 0.9, pr.z, pr.color, 6, 4.5, 0.35, false);
        this.removeProjectile(i);
        continue;
      }

      // Check character hit
      let destroyed = false;
      for (let j = 0; j < allCharacters.length; j++) {
        const target = allCharacters[j];
        if (!target.alive || target.id === pr.owner.id || pr.hitIds.has(target.id)) continue;
        // Don't let owner hit own clones or vice versa
        if (target.ownerId === pr.owner.id || pr.owner.ownerId === target.id) continue;

        const dist = Math.hypot(target.x - pr.x, target.z - pr.z);
        if (dist <= pr.radius + target.getCollisionRadius()) {
          pr.hitIds.add(target.id);
          if (!pr.isDecoy && pr.damage > 0) {
            this.combat.applyDamage(pr.owner, target, pr.damage, pr.skillName, elapsedTime, {
              isCrit: pr.damage >= 180 || Boolean(pr.explodeRadius),
              revealTarget: true,
              slowDuration: pr.slowDuration,
              slowFactor: pr.slowFactor,
            });
          }
          this.effects.spawnBurst(pr.x, 0.95, pr.z, pr.color, 9, 5.5, 0.4);
          if (pr.slowDuration) {
            this.effects.spawnShockwave(pr.x, pr.z, 2.5, 0x38bdf8, 0.35);
          }
          if (pr.explodeRadius && pr.explodeDamage) {
            // Mage Hit 3 AoE Detonation!
            this.effects.spawnShockwave(pr.x, pr.z, pr.explodeRadius, 0xf472b6, 0.45, 0.35);
            this.effects.spawnBurst(pr.x, 0.8, pr.z, 0xfbbf24, 14, 8, 0.55);
            this.combat.spawnStatusText(pr.x, 2.3, pr.z, 'DETONATE!', elapsedTime);
            for (let k = 0; k < allCharacters.length; k++) {
              const splash = allCharacters[k];
              if (!splash.alive || splash.id === pr.owner.id || splash.id === target.id) continue;
              if (Math.hypot(splash.x - pr.x, splash.z - pr.z) <= pr.explodeRadius + splash.getCollisionRadius()) {
                this.combat.applyDamage(pr.owner, splash, pr.explodeDamage, pr.skillName, elapsedTime, {
                  revealTarget: true,
                });
              }
            }
          }

          if (!pr.piercing) {
            destroyed = true;
            break;
          }
        }
      }

      if (destroyed) {
        this.removeProjectile(i);
      }
    }

    // 4. Update Lava Fissures (10s duration, ticks every 0.5s for 35 dmg)
    for (let i = this.lavaZones.length - 1; i >= 0; i--) {
      const lz = this.lavaZones[i];
      lz.remaining -= dt;
      if (lz.remaining <= 0) {
        this.lavaZones.splice(i, 1);
        continue;
      }
      lz.tickAccum += dt;
      if (lz.tickAccum >= 0.5) {
        lz.tickAccum -= 0.5;
        allCharacters.forEach((target) => {
          if (!target.alive || target.id === lz.owner.id) return;
          if (
            this.pointInOrientedRect(
              target.x,
              target.z,
              lz.startX,
              lz.startZ,
              lz.dirX,
              lz.dirZ,
              lz.length,
              lz.width * 0.5 + target.getCollisionRadius() * 0.5
            )
          ) {
            this.combat.applyDamage(lz.owner, target, 35, 'Molten Fissure', elapsedTime, {
              revealTarget: true,
            });
            this.effects.spawnBurst(target.x, 0.4, target.z, 0xff5500, 4, 3.5, 0.35, false);
          }
        });
      }
    }
  }

  private removeProjectile(index: number): void {
    const pr = this.projectiles[index];
    this.group.remove(pr.mesh);
    pr.dispose();
    this.projectiles.splice(index, 1);
  }

  private pointInOrientedRect(
    px: number,
    pz: number,
    ox: number,
    oz: number,
    dirX: number,
    dirZ: number,
    length: number,
    halfWidth: number
  ): boolean {
    const rx = px - ox;
    const rz = pz - oz;
    const forward = rx * dirX + rz * dirZ;
    const side = Math.abs(-rx * dirZ + rz * dirX);
    return forward >= 0 && forward <= length && side <= halfWidth;
  }

  public clear(): void {
    this.pendingSkills = [];
    this.lavaZones = [];
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.removeProjectile(i);
    }
  }
}
