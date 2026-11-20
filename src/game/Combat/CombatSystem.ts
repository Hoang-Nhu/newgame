import { CharacterEntity } from '../Character/CharacterEntity';
import { DamageEvent } from '../types';

export interface KillFeedEntry {
  id: number;
  killer: string;
  victim: string;
  skillName: string;
  time: number;
  killerColor: string;
}

export class CombatSystem {
  private nextDamageId = 1;
  private nextKillId = 1;
  public damageEvents: DamageEvent[] = [];
  public killFeed: KillFeedEntry[] = [];

  public applyDamage(
    attacker: CharacterEntity | null,
    target: CharacterEntity,
    rawAmount: number,
    skillName: string,
    elapsedTime: number,
    options?: {
      isCrit?: boolean;
      revealTarget?: boolean;
      slowDuration?: number;
      slowFactor?: number;
      rootDuration?: number;
      stunDuration?: number;
      knockupDuration?: number;
    }
  ): number {
    if (!target.alive) return 0;

    // Clones die immediately upon taking meaningful damage or lose HP fast
    let finalDamage = rawAmount;
    if (target.status.shieldTimer > 0) {
      finalDamage = Math.round(finalDamage * 0.5);
    }

    target.hp = Math.max(0, target.hp - finalDamage);

    if (attacker && !attacker.isClone) {
      attacker.damageDealt += finalDamage;
      // Attacking reveals attacker if in bush
      attacker.markRevealed(1.5);
    }

    if (options?.revealTarget) {
      target.markRevealed(2.0);
    }

    if (options?.slowDuration) {
      target.status.slowTimer = Math.max(target.status.slowTimer, options.slowDuration);
      target.status.slowFactor = Math.max(target.status.slowFactor, options.slowFactor ?? 0.42);
      this.spawnStatusText(target.x, 2.3, target.z, 'SLOWED!', elapsedTime);
    }
    if (options?.rootDuration) {
      target.status.rootTimer = Math.max(target.status.rootTimer, options.rootDuration);
      this.spawnStatusText(target.x, 2.3, target.z, 'ROOTED!', elapsedTime);
    }
    if (options?.stunDuration) {
      target.status.stunTimer = Math.max(target.status.stunTimer, options.stunDuration);
      this.spawnStatusText(target.x, 2.6, target.z, 'STUNNED!', elapsedTime);
    }
    if (options?.knockupDuration) {
      target.status.knockupTimer = Math.max(target.status.knockupTimer, options.knockupDuration);
      target.knockupTotalDuration = Math.max(target.knockupTotalDuration, options.knockupDuration);
      this.spawnStatusText(target.x, 2.7, target.z, 'KNOCKUP!', elapsedTime);
    }

    this.damageEvents.push({
      id: this.nextDamageId++,
      worldX: target.x + (Math.random() - 0.5) * 0.5,
      worldY: target.status.titanTimer > 0 ? 3.2 : 2.1,
      worldZ: target.z,
      amount: finalDamage,
      kind: target.status.shieldTimer > 0 ? 'shield' : options?.isCrit ? 'crit' : 'damage',
      label: target.status.shieldTimer > 0 ? `-${finalDamage} (50% Shield)` : `-${finalDamage}`,
      createdAt: elapsedTime,
    });

    if (target.hp <= 0) {
      target.alive = false;
      target.rig.root.visible = false;
      if (!target.isClone) {
        if (attacker && attacker.id !== target.id) {
          attacker.kills += 1;
        }
        this.killFeed.unshift({
          id: this.nextKillId++,
          killer: attacker ? attacker.config.displayName : 'Lava Fissure',
          victim: target.config.displayName,
          skillName,
          time: elapsedTime,
          killerColor: attacker ? attacker.config.cssColor : '#f97316',
        });
        if (this.killFeed.length > 5) {
          this.killFeed.pop();
        }
      }
    }

    return finalDamage;
  }

  public applyHeal(target: CharacterEntity, amount: number, elapsedTime: number): number {
    if (!target.alive) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const healed = Math.round(target.hp - before);

    this.damageEvents.push({
      id: this.nextDamageId++,
      worldX: target.x,
      worldY: target.status.titanTimer > 0 ? 3.2 : 2.2,
      worldZ: target.z,
      amount: healed > 0 ? healed : amount,
      kind: 'heal',
      label: `+${healed > 0 ? healed : amount}`,
      createdAt: elapsedTime,
    });

    return healed;
  }

  public spawnStatusText(
    x: number,
    y: number,
    z: number,
    label: string,
    elapsedTime: number
  ): void {
    this.damageEvents.push({
      id: this.nextDamageId++,
      worldX: x,
      worldY: y,
      worldZ: z,
      amount: 0,
      kind: 'status',
      label,
      createdAt: elapsedTime,
    });
  }

  public pruneDamageEvents(elapsedTime: number): void {
    // Keep events for 0.95s
    while (this.damageEvents.length > 0 && elapsedTime - this.damageEvents[0].createdAt > 0.95) {
      this.damageEvents.shift();
    }
  }

  public reset(): void {
    this.damageEvents = [];
    this.killFeed = [];
  }
}
