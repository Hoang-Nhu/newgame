import * as THREE from 'three';
import {
  AIMemory,
  CharacterClass,
  CharacterConfig,
  SkillSlot,
  StatusEffects,
} from '../types';
import { CHARACTER_CONFIGS } from './CharacterConfig';
import { createHeroModel, HeroModelRig } from './HeroModels';

export class CharacterEntity {
  public readonly id: string;
  public readonly charClass: CharacterClass;
  public readonly config: CharacterConfig;
  public readonly isClone: boolean;
  public readonly ownerId: string | null;
  public isPlayer: boolean;

  public x: number;
  public z: number;
  public facingAngle = 0;
  public vx = 0;
  public vz = 0;

  public hp: number;
  public maxHp: number;
  public alive = true;
  public kills = 0;
  public damageDealt = 0;

  public inBush = false;
  public currentBushId: string | null = null;
  public cloneLifetime = 0;

  public cooldowns: Record<SkillSlot, number> = {
    basic: 0,
    skill1: 0,
    skill2: 0,
    ultimate: 0,
  };

  // 3-Hit Combo Attack State (2.0s window to chain; resets to Hit 1 if > 2.0s)
  public comboStep: 0 | 1 | 2 | 3 = 0;
  public comboResetTimer = 0;
  public activeComboAnim: 1 | 2 | 3 = 1;
  public attackAnimDuration = 0.28;

  public castLockTimer = 0;
  public attackAnimTimer = 0;
  public spinTimer = 0;
  public spinDamageAccumulator = 0;
  public knockupTotalDuration = 0.75;

  public status: StatusEffects = {
    slowTimer: 0,
    slowFactor: 0,
    rootTimer: 0,
    speedTimer: 0,
    speedBonus: 0,
    shieldTimer: 0,
    invisibleTimer: 0,
    titanTimer: 0,
    revealedTimer: 0,
    stunTimer: 0,
    knockupTimer: 0,
  };

  public aiMemory: AIMemory = {
    targetId: null,
    lastKnownPos: null,
    lostSightTimer: 0,
    roamTarget: null,
    roamTimer: 0,
    strafeDir: Math.random() > 0.5 ? 1 : -1,
    strafeTimer: 1.5,
    state: 'roam',
  };

  public readonly rig: HeroModelRig;
  private walkPhase = 0;
  private currentScale = 1.0;

  constructor(
    id: string,
    charClass: CharacterClass,
    x: number,
    z: number,
    isClone = false,
    ownerId: string | null = null,
    isPlayer = false
  ) {
    this.id = id;
    this.charClass = charClass;
    this.config = CHARACTER_CONFIGS[charClass];
    this.isClone = isClone;
    this.ownerId = ownerId;
    this.isPlayer = isPlayer;
    this.x = x;
    this.z = z;
    this.maxHp = isClone ? 180 : this.config.maxHp;
    this.hp = this.maxHp;
    this.cloneLifetime = isClone ? 8.5 : 0;

    this.cooldowns.basic = isPlayer ? 0 : Math.random() * 0.25;
    this.rig = createHeroModel(charClass, isClone);
    this.rig.root.position.set(x, 0, z);
  }

  public advanceComboHit(): 1 | 2 | 3 {
    const next: 1 | 2 | 3 =
      this.comboResetTimer > 0 && this.comboStep === 1
        ? 2
        : this.comboResetTimer > 0 && this.comboStep === 2
        ? 3
        : 1;

    this.comboStep = next;
    // 2-second combo window; if Hit 3 finishes, next attack within 2s loops cleanly back to Hit 1
    this.comboResetTimer = next === 3 ? 0 : 2.0;
    this.activeComboAnim = next;
    this.attackAnimDuration = next === 3 ? 0.42 : next === 2 ? 0.3 : 0.26;
    this.attackAnimTimer = this.attackAnimDuration;
    return next;
  }

  public isIncapacitated(): boolean {
    return this.status.stunTimer > 0 || this.status.knockupTimer > 0;
  }

  public getEffectiveMoveSpeed(): number {
    if (this.status.rootTimer > 0 || this.isIncapacitated()) return 0;
    let speed = this.config.moveSpeed;
    if (this.status.speedTimer > 0) {
      speed *= 1 + this.status.speedBonus;
    }
    if (this.status.slowTimer > 0) {
      speed *= 1 - this.status.slowFactor;
    }
    return speed;
  }

  public getCollisionRadius(): number {
    return this.status.titanTimer > 0 ? this.config.radius * 1.45 : this.config.radius;
  }

  public isHiddenFromAI(): boolean {
    if (this.status.invisibleTimer > 0) return true;
    if (this.inBush && this.status.revealedTimer <= 0) return true;
    return false;
  }

  public shouldShowOverheadBar(): boolean {
    if (!this.alive) return false;
    if (this.status.invisibleTimer > 0) return false;
    if (this.inBush && this.status.revealedTimer <= 0) return false;
    return true;
  }

  public markRevealed(duration = 1.5): void {
    this.status.revealedTimer = Math.max(this.status.revealedTimer, duration);
  }

  public updateTimers(dt: number): void {
    if (!this.alive) return;

    if (this.isClone) {
      this.cloneLifetime -= dt;
      if (this.cloneLifetime <= 0) {
        this.alive = false;
        this.rig.root.visible = false;
        return;
      }
    }

    (Object.keys(this.cooldowns) as SkillSlot[]).forEach((slot) => {
      if (this.cooldowns[slot] > 0) {
        this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
      }
    });

    // 2.0s Combo window countdown -> resets back to Hit 1 (comboStep = 0)
    if (this.comboResetTimer > 0) {
      this.comboResetTimer = Math.max(0, this.comboResetTimer - dt);
      if (this.comboResetTimer === 0) {
        this.comboStep = 0;
      }
    }

    if (this.castLockTimer > 0) this.castLockTimer = Math.max(0, this.castLockTimer - dt);
    if (this.attackAnimTimer > 0) this.attackAnimTimer = Math.max(0, this.attackAnimTimer - dt);

    const s = this.status;
    if (s.slowTimer > 0) s.slowTimer = Math.max(0, s.slowTimer - dt);
    if (s.rootTimer > 0) s.rootTimer = Math.max(0, s.rootTimer - dt);
    if (s.speedTimer > 0) s.speedTimer = Math.max(0, s.speedTimer - dt);
    if (s.shieldTimer > 0) s.shieldTimer = Math.max(0, s.shieldTimer - dt);
    if (s.invisibleTimer > 0) s.invisibleTimer = Math.max(0, s.invisibleTimer - dt);
    if (s.revealedTimer > 0) s.revealedTimer = Math.max(0, s.revealedTimer - dt);
    if (s.stunTimer > 0) s.stunTimer = Math.max(0, s.stunTimer - dt);
    if (s.knockupTimer > 0) s.knockupTimer = Math.max(0, s.knockupTimer - dt);

    if (s.titanTimer > 0) {
      s.titanTimer = Math.max(0, s.titanTimer - dt);
      if (s.titanTimer === 0) {
        const ratio = this.hp / this.maxHp;
        this.maxHp = this.config.maxHp;
        this.hp = Math.max(1, Math.round(this.maxHp * ratio));
      }
    }
  }

  public updateVisuals(
    dt: number,
    elapsed: number,
    revealFogForSpectator: boolean,
    hiddenFromPlayer = false
  ): void {
    if (!this.alive || (hiddenFromPlayer && !this.isPlayer && !revealFogForSpectator)) {
      this.rig.root.visible = false;
      return;
    }
    this.rig.root.visible = true;
    this.rig.root.position.set(this.x, 0, this.z);

    // Titan smooth scale interpolation
    const targetScale = this.status.titanTimer > 0 ? 1.62 : 1.0;
    this.currentScale = THREE.MathUtils.damp(this.currentScale, targetScale, 8, dt);
    this.rig.root.scale.setScalar(this.currentScale);

    // Facing & Spin / Stun wobble
    if (this.spinTimer > 0) {
      this.rig.bodyGroup.rotation.y += dt * 18;
    } else if (this.status.stunTimer > 0) {
      this.rig.bodyGroup.rotation.y = this.facingAngle + Math.sin(elapsed * 26) * 0.16;
    } else {
      let diff = this.facingAngle - this.rig.bodyGroup.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.rig.bodyGroup.rotation.y += diff * Math.min(1, dt * 14);
    }

    // Airborne Knockup arc overrides walk bob
    let baseY = 0;
    if (this.status.knockupTimer > 0) {
      const kp = 1 - this.status.knockupTimer / Math.max(0.01, this.knockupTotalDuration);
      baseY = Math.sin(kp * Math.PI) * 2.55;
      this.rig.bodyGroup.rotation.x = Math.sin(kp * Math.PI) * -0.45;
    } else {
      const speedMag = Math.hypot(this.vx, this.vz);
      if (speedMag > 0.25 && this.status.rootTimer <= 0 && !this.isIncapacitated()) {
        this.walkPhase += dt * speedMag * 1.9;
        baseY = Math.abs(Math.sin(this.walkPhase)) * 0.11;
      }
      this.rig.bodyGroup.rotation.x = THREE.MathUtils.damp(this.rig.bodyGroup.rotation.x, 0, 12, dt);
    }

    // 3 Distinct Combo Attack Animations!
    if (this.attackAnimTimer > 0) {
      const p = 1 - this.attackAnimTimer / Math.max(0.01, this.attackAnimDuration);
      const swing = Math.sin(p * Math.PI);

      if (this.activeComboAnim === 1) {
        // Hit 1: Crisp right-to-left diagonal slash / quick forward snap
        this.rig.weaponArm.rotation.x = -swing * 1.05;
        this.rig.weaponArm.rotation.y = THREE.MathUtils.lerp(0.65, -0.75, p);
        this.rig.weaponArm.rotation.z = -0.35 * swing;
        this.rig.bodyGroup.rotation.z = THREE.MathUtils.damp(this.rig.bodyGroup.rotation.z, -0.1 * swing, 16, dt);
      } else if (this.activeComboAnim === 2) {
        // Hit 2: Fluid reverse left-to-right cross cleave / twin recoil
        this.rig.weaponArm.rotation.x = -0.75 * swing;
        this.rig.weaponArm.rotation.y = THREE.MathUtils.lerp(-0.85, 0.95, p);
        this.rig.weaponArm.rotation.z = 0.55 * swing;
        this.rig.bodyGroup.rotation.z = THREE.MathUtils.damp(this.rig.bodyGroup.rotation.z, 0.14 * swing, 16, dt);
      } else {
        // Hit 3: Heavy finisher! Leap-hop + overhead crush / spinning uppercut
        if (this.status.knockupTimer <= 0) {
          baseY += Math.sin(p * Math.PI) * 0.52;
        }
        this.rig.weaponArm.rotation.x = THREE.MathUtils.lerp(-2.2, 0.85, Math.min(1, p * 1.35));
        this.rig.weaponArm.rotation.y = Math.sin(p * Math.PI * 2) * 0.45;
        this.rig.weaponArm.rotation.z = 0;
        this.rig.bodyGroup.rotation.x = swing * 0.28;
        this.rig.bodyGroup.rotation.z = 0;
      }
    } else {
      this.rig.weaponArm.rotation.x = THREE.MathUtils.damp(this.rig.weaponArm.rotation.x, 0, 12, dt);
      this.rig.weaponArm.rotation.y = THREE.MathUtils.damp(this.rig.weaponArm.rotation.y, 0, 12, dt);
      this.rig.weaponArm.rotation.z = THREE.MathUtils.damp(this.rig.weaponArm.rotation.z, 0, 12, dt);
      this.rig.bodyGroup.rotation.z = THREE.MathUtils.damp(this.rig.bodyGroup.rotation.z, 0, 12, dt);
    }

    this.rig.bodyGroup.position.y = THREE.MathUtils.damp(this.rig.bodyGroup.position.y, baseY, 18, dt);

    // Status attachment visibility
    this.rig.shieldDome.visible = this.status.shieldTimer > 0;
    if (this.rig.shieldDome.visible) {
      this.rig.shieldDome.rotation.y = elapsed * 1.4;
    }
    this.rig.rootCage.visible = this.status.rootTimer > 0;
    this.rig.titanAura.visible = this.status.titanTimer > 0;
    this.rig.speedRing.visible = this.status.speedTimer > 0;
    if (this.rig.speedRing.visible) {
      this.rig.speedRing.rotation.z = elapsed * 5.0;
    }

    // Stealth / Bush transparency feedback for spectator
    let targetOpacity = 1.0;
    if (this.isClone) {
      targetOpacity = 0.72;
    } else if (this.status.invisibleTimer > 0) {
      targetOpacity = revealFogForSpectator ? 0.28 : 0.16;
    } else if (this.inBush && this.status.revealedTimer <= 0) {
      targetOpacity = 0.48;
    }

    const needTransparent = targetOpacity < 0.99;
    for (let i = 0; i < this.rig.materials.length; i++) {
      const mat = this.rig.materials[i];
      if (mat.transparent !== needTransparent) {
        mat.transparent = needTransparent;
        mat.needsUpdate = true;
      }
      mat.opacity = targetOpacity;
    }
  }

  public dispose(): void {
    this.rig.dispose();
  }
}
