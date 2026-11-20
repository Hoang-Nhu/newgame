export type CharacterClass =
  | 'Tank'
  | 'Archer'
  | 'SwordMaster'
  | 'Mage'
  | 'Support'
  | 'Specialist';

export type CameraMode = '3D' | '2D';

export interface Vec2 {
  x: number;
  z: number;
}

export interface Obstacle {
  id: string;
  type: 'tree' | 'rock' | 'wall';
  x: number;
  z: number;
  radius: number; // for circular collision & raycast
  halfW?: number; // for rectangular walls
  halfD?: number;
  height: number;
}

export interface BushZone {
  id: string;
  x: number;
  z: number;
  radius: number;
  rustleTimer: number;
  rustleIntensity: number;
}

export type SkillSlot = 'basic' | 'skill1' | 'skill2' | 'ultimate';

export interface SkillDefinition {
  slot: SkillSlot;
  name: string;
  cooldown: number;
  range: number;
  windup: number; // telegraph warning duration before activation
  color: number;
  description: string;
}

export interface CharacterConfig {
  id: CharacterClass;
  displayName: string;
  title: string;
  icon: string;
  comboHit3Label: string;
  maxHp: number;
  moveSpeed: number;
  visionRadius: number;
  attackRange: number;
  preferredRange: number;
  radius: number;
  primaryColor: number;
  accentColor: number;
  cssColor: string;
  basicDamage: number;
  skills: Record<SkillSlot, SkillDefinition>;
}

export interface StatusEffects {
  slowTimer: number;
  slowFactor: number; // e.g. 0.45 means 45% slower
  rootTimer: number; // immobilized
  speedTimer: number;
  speedBonus: number; // e.g. 0.5 means +50% speed
  shieldTimer: number; // Tank 50% damage reduction
  invisibleTimer: number; // Specialist 4s invisibility
  titanTimer: number; // Tank giant form
  revealedTimer: number; // Temporarily revealed in bush
  stunTimer: number; // Stunned (cannot move or cast)
  knockupTimer: number; // Airborne knockup
}

export interface AIMemory {
  targetId: string | null;
  lastKnownPos: Vec2 | null;
  lostSightTimer: number; // counts up to 5.0s when LOS lost
  roamTarget: Vec2 | null;
  roamTimer: number;
  strafeDir: number;
  strafeTimer: number;
  state: 'roam' | 'chase' | 'investigate' | 'combat' | 'retreat';
}

export interface DamageEvent {
  id: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  amount: number;
  kind: 'damage' | 'heal' | 'crit' | 'status' | 'shield';
  label?: string;
  createdAt: number;
}

export interface CharacterHUDInfo {
  id: string;
  charClass: CharacterClass;
  displayName: string;
  cssColor: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  kills: number;
  damageDealt: number;
  inBush: boolean;
  isInvisible: boolean;
  isRevealed: boolean;
  isTitan: boolean;
  hasShield: boolean;
  isRooted: boolean;
  isSlowed: boolean;
  isSpedUp: boolean;
  isStunned: boolean;
  isKnockedUp: boolean;
  comboStep: number;
  comboResetTimer: number;
  isPlayer: boolean;
  aiState: AIMemory['state'];
  cooldowns: {
    basic: number;
    skill1: number;
    skill2: number;
    ultimate: number;
  };
  maxCooldowns: {
    basic: number;
    skill1: number;
    skill2: number;
    ultimate: number;
  };
  x: number;
  z: number;
  isClone: boolean;
}

export interface ProjectedHeroOverlay {
  id: string;
  displayName: string;
  charClass: CharacterClass;
  cssColor: string;
  screenX: number;
  screenY: number;
  visible: boolean;
  showBarAndName: boolean; // hidden when in bush & not revealed!
  hp: number;
  maxHp: number;
  hasShield: boolean;
  isTitan: boolean;
  isRooted: boolean;
  isSlowed: boolean;
  isSpedUp: boolean;
  isStunned: boolean;
  isKnockedUp: boolean;
  isInvisible: boolean;
  inBush: boolean;
  isClone: boolean;
  isPlayer: boolean;
  comboStep: number;
  skill1Ready: boolean;
  skill2Ready: boolean;
  ultReady: boolean;
}

export interface ProjectedDamageItem {
  id: number;
  screenX: number;
  screenY: number;
  text: string;
  kind: DamageEvent['kind'];
  age: number;
}

export interface MinimapSnapshot {
  arenaHalfSize: number;
  obstacles: Array<{ x: number; z: number; radius: number; type: Obstacle['type']; halfW?: number; halfD?: number }>;
  bushes: Array<{ x: number; z: number; radius: number; rustling: boolean }>;
  lavaZones: Array<{ x: number; z: number; dirX: number; dirZ: number; length: number; width: number }>;
  heroes: Array<{
    id: string;
    x: number;
    z: number;
    cssColor: string;
    alive: boolean;
    hidden: boolean;
    isClone: boolean;
    isFollowed: boolean;
  }>;
  cameraCenter: Vec2;
  cameraViewSpan: number;
}

export interface MatchSnapshot {
  elapsedTime: number;
  aliveCount: number;
  winner: CharacterHUDInfo | null;
  cameraMode: CameraMode;
  zoomLevel: number;
  timeScale: number;
  paused: boolean;
  muted: boolean;
  playerClass: CharacterClass;
  playerHero: CharacterHUDInfo | null;
  nearestEnemy: CharacterHUDInfo | null;
  followedHeroId: string | null;
  revealFogForSpectator: boolean;
  heroes: CharacterHUDInfo[];
  killFeed: Array<{ id: number; killer: string; victim: string; skillName: string; time: number; killerColor: string }>;
}
