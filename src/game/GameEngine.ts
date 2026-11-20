import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { ArenaMap } from './Map/ArenaMap';
import { buildArenaVisuals, BuiltMapVisuals } from './Map/MapMeshes';
import { CHARACTER_ORDER } from './Character/CharacterConfig';
import { CharacterEntity } from './Character/CharacterEntity';
import { CombatSystem } from './Combat/CombatSystem';
import { EffectsManager } from './Effects/EffectsManager';
import { SoundSystem } from './Audio/SoundSystem';
import { SkillSystem } from './Skill/SkillSystem';
import { AIController } from './AI/AIController';
import {
  CameraMode,
  CharacterClass,
  CharacterHUDInfo,
  MatchSnapshot,
  MinimapSnapshot,
  ProjectedDamageItem,
  ProjectedHeroOverlay,
  SkillSlot,
} from './types';

export interface EngineCallbacks {
  onMatchSnapshot: (snapshot: MatchSnapshot) => void;
  onOverlayFrame: (
    heroes: ProjectedHeroOverlay[],
    damages: ProjectedDamageItem[],
    minimap: MinimapSnapshot
  ) => void;
  onWebGLContextLost?: () => void;
}

// Reusable math objects (zero GC in render loop)
const _projVec = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _mouseNdc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _aimHit = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class GameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private perspCamera!: THREE.PerspectiveCamera;
  private orthoCamera!: THREE.OrthographicCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private renderPass: RenderPass | null = null;

  private arenaMap: ArenaMap;
  private mapVisuals!: BuiltMapVisuals;
  private combat: CombatSystem;
  private effects: EffectsManager;
  private sound: SoundSystem;
  private skills: SkillSystem;
  private ai: AIController;

  private characters: CharacterEntity[] = [];
  private cloneCounter = 1;
  private playerClass: CharacterClass = 'SwordMaster';

  private cameraMode: CameraMode = '3D';
  private zoomLevel = 0.92; // crisp ARPG framing
  private orbitYaw = 0;
  private orbitPitch = 0.78;
  private cameraTarget = new THREE.Vector3(0, 0, 0);
  private desiredTarget = new THREE.Vector3(0, 0, 0);
  private followedHeroId: string | null = null;
  private revealFogForSpectator = false;

  private timeScale = 1.0;
  private paused = false;
  private elapsedTime = 0;
  private winner: CharacterHUDInfo | null = null;

  private clock = new THREE.Clock();
  private frameId = 0;
  private destroyed = false;
  private hudSyncAccum = 0;

  // Player Input, Virtual Joystick & Aiming State
  private keysPressed = new Set<string>();
  private joystickInput = { dx: 0, dz: 0, active: false };
  private isLeftMouseDown = false;
  private isPanning = false;
  private isOrbitDragging = false;
  private rmbStartX = 0;
  private rmbStartY = 0;
  private rmbMoved = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private pointerClientX = 0;
  private pointerClientY = 0;
  private mouseAimFresh = false;
  private aimWorld = new THREE.Vector3(0, 0, 0);
  private aimReticle!: THREE.Group;

  // Hold-to-Preview 3D Skill Telegraph
  private skillPreview = {
    active: false,
    slot: 'basic' as SkillSlot,
    yaw: 0,
    aoeDist: 8,
    group: new THREE.Group(),
    rangeRing: null as THREE.Mesh | null,
    arrowGroup: null as THREE.Group | null,
    coneMesh: null as THREE.Mesh | null,
    aoeMarker: null as THREE.Mesh | null,
  };

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.arenaMap = new ArenaMap();
    this.combat = new CombatSystem();
    this.effects = new EffectsManager();
    this.sound = new SoundSystem();
    this.skills = new SkillSystem(this.arenaMap, this.combat, this.effects, this.sound);
    this.ai = new AIController(this.arenaMap, this.skills);

    this.initThree();
    this.spawnMatch();
    this.bindEvents();
    this.startLoop();
  }

  private initThree(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.FogExp2(0x0b0e14, 0.0095);

    // Studio IBL Environment Map via RoomEnvironment (all devices)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 3D Perspective Camera (LoL / Battlerite / V Rising 2.5D angle)
    this.perspCamera = new THREE.PerspectiveCamera(44, aspect, 0.5, 220);
    this.perspCamera.position.set(0, 34, 30);
    this.perspCamera.lookAt(0, 0, 0);

    // 2D Orthographic Top-Down Camera (90° overhead)
    const frustum = 46;
    this.orthoCamera = new THREE.OrthographicCamera(
      (-frustum * aspect) / 2,
      (frustum * aspect) / 2,
      frustum / 2,
      -frustum / 2,
      0.5,
      160
    );
    this.orthoCamera.position.set(0, 62, 0.01);
    this.orthoCamera.lookAt(0, 0, 0);

    // Warm Key Directional Light + Cool Moonlit Hemisphere Fill
    const hemi = new THREE.HemisphereLight(0x8bb8e8, 0x1a222d, 0.85);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe6c2, 1.85);
    keyLight.position.set(24, 44, 22);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 110;
    const d = 34;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    // Subtle cool rim backlight for silhouette separation
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.65);
    rimLight.position.set(-28, 22, -26);
    this.scene.add(rimLight);

    // Build Arena Visuals
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.mapVisuals = buildArenaVisuals(this.arenaMap, maxAniso);
    this.scene.add(this.mapVisuals.group);
    this.scene.add(this.effects.group);
    this.scene.add(this.skills.group);

    // Build Aim Reticle & 3D Skill Telegraph on ground
    this.aimReticle = this.createAimReticle();
    this.scene.add(this.aimReticle);
    this.initSkillTelegraph();

    // Subtle HDR Bloom Post-Processing on GPU devices
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(this.scene, this.getActiveCamera());
      this.composer.addPass(this.renderPass);

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.48, // subtle clean bloom strength
        0.38, // radius
        0.92 // high threshold so only HDR emissives glow
      );
      this.composer.addPass(this.bloomPass);

      // Pre-warm shaders
      this.renderer.compile(this.scene, this.getActiveCamera());
    }
  }

  private initSkillTelegraph(): void {
    const grp = this.skillPreview.group;
    grp.visible = false;

    const rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.0, 56),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    rangeRing.rotation.x = -Math.PI / 2;
    rangeRing.position.y = 0.08;
    grp.add(rangeRing);
    this.skillPreview.rangeRing = rangeRing;

    const arrowGroup = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.0),
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      })
    );
    shaft.rotation.x = -Math.PI / 2;
    shaft.position.set(0, 0.09, 0.5);
    arrowGroup.add(shaft);

    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 1.5, 3),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.11, 1.25);
    arrowGroup.add(head);
    grp.add(arrowGroup);
    this.skillPreview.arrowGroup = arrowGroup;

    const coneMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28, -0.58, 1.16),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      })
    );
    coneMesh.rotation.x = -Math.PI / 2;
    coneMesh.position.y = 0.09;
    grp.add(coneMesh);
    this.skillPreview.coneMesh = coneMesh;

    const aoeMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 1.0, 36),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })
    );
    aoeMarker.rotation.x = -Math.PI / 2;
    aoeMarker.position.y = 0.1;
    grp.add(aoeMarker);
    this.skillPreview.aoeMarker = aoeMarker;

    this.scene.add(grp);
  }

  private getTelegraphSpec(player: CharacterEntity, slot: SkillSlot): {
    type: 'line' | 'cone' | 'circle' | 'aoe';
    range: number;
    width: number;
    aoeRadius: number;
    color: number;
  } {
    const def = player.config.skills[slot];
    const cls = player.charClass;
    if (slot === 'basic') {
      const isMelee = cls === 'Tank' || cls === 'SwordMaster';
      return {
        type: isMelee ? 'cone' : 'line',
        range: Math.max(3.0, def.range),
        width: 1.1,
        aoeRadius: 2.0,
        color: def.color,
      };
    }
    if (slot === 'skill1') {
      if (cls === 'Tank') {
        return { type: 'circle', range: def.range, width: 1.5, aoeRadius: def.range, color: def.color };
      }
      return { type: 'line', range: def.range, width: cls === 'SwordMaster' ? 1.8 : 1.25, aoeRadius: 2.5, color: def.color };
    }
    if (slot === 'skill2') {
      if (cls === 'Archer') {
        return { type: 'cone', range: def.range, width: 1.4, aoeRadius: 2.5, color: def.color };
      }
      if (cls === 'Mage') {
        return { type: 'aoe', range: def.range, width: 1.0, aoeRadius: 3.6, color: def.color };
      }
      return { type: 'circle', range: Math.max(3.2, def.range), width: 1.4, aoeRadius: 3.2, color: def.color };
    }
    // ultimate
    if (cls === 'Mage') {
      return { type: 'aoe', range: def.range, width: 1.1, aoeRadius: 5.0, color: def.color };
    }
    if (cls === 'SwordMaster') {
      return { type: 'line', range: def.range, width: 3.2, aoeRadius: 3.2, color: def.color };
    }
    return { type: 'circle', range: Math.max(4.5, def.range), width: 1.5, aoeRadius: Math.max(4.5, def.range), color: def.color };
  }

  private getCameraGroundBasis(): { fwdX: number; fwdZ: number; rightX: number; rightZ: number } {
    if (this.cameraMode === '2D') {
      return { fwdX: 0, fwdZ: -1, rightX: 1, rightZ: 0 };
    }
    const fwdX = -Math.sin(this.orbitYaw);
    const fwdZ = -Math.cos(this.orbitYaw);
    const rightX = Math.cos(this.orbitYaw);
    const rightZ = -Math.sin(this.orbitYaw);
    return { fwdX, fwdZ, rightX, rightZ };
  }

  private screenDeltaToWorldYaw(dx: number, dy: number, fallbackYaw: number): number {
    if (Math.hypot(dx, dy) <= 10) return fallbackYaw;
    const { fwdX, fwdZ, rightX, rightZ } = this.getCameraGroundBasis();
    const worldDirX = rightX * dx - fwdX * dy;
    const worldDirZ = rightZ * dx - fwdZ * dy;
    if (Math.hypot(worldDirX, worldDirZ) <= 0.0001) return fallbackYaw;
    return Math.atan2(worldDirX, worldDirZ);
  }

  private findNearestVisibleEnemy(player: CharacterEntity | null): CharacterEntity | null {
    if (!player || !player.alive) return null;
    let best: CharacterEntity | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      if (!c.alive || c.isPlayer || c.isClone) continue;
      if (this.isHiddenFromPlayer(c, player)) continue;
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  private createAimReticle(): THREE.Group {
    const g = new THREE.Group();
    const ringGeo = new THREE.RingGeometry(0.46, 0.58, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const dotGeo = new THREE.CircleGeometry(0.14, 16);
    dotGeo.rotateX(-Math.PI / 2);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    g.add(new THREE.Mesh(ringGeo, ringMat), new THREE.Mesh(dotGeo, dotMat));
    g.position.y = 0.05;
    return g;
  }

  private getActiveCamera(): THREE.Camera {
    return this.cameraMode === '3D' ? this.perspCamera : this.orthoCamera;
  }

  private getPlayerHero(): CharacterEntity | null {
    return this.characters.find((c) => c.isPlayer && !c.isClone) ?? null;
  }

  public setPlayerClass(cls: CharacterClass): void {
    this.playerClass = cls;
    this.spawnMatch();
  }

  public setJoystickInput(dx: number, dz: number, active: boolean): void {
    this.joystickInput.dx = dx;
    this.joystickInput.dz = dz;
    this.joystickInput.active = active;
  }

  public startSkillPreview(slot: SkillSlot): void {
    this.sound.unlock();
    const player = this.getPlayerHero();
    if (!player || !player.alive || this.paused || this.winner) return;

    const spec = this.getTelegraphSpec(player, slot);
    const nearest = this.findNearestVisibleEnemy(player);
    let initialYaw = player.facingAngle;
    let initialDist = Math.min(10, spec.range * 0.65);

    if (nearest) {
      const dist = Math.hypot(nearest.x - player.x, nearest.z - player.z);
      if (dist <= spec.range + 4.5) {
        initialYaw = Math.atan2(nearest.x - player.x, nearest.z - player.z);
        initialDist = THREE.MathUtils.clamp(dist, 2.5, spec.range);
      }
    } else if (this.mouseAimFresh) {
      const dx = this.aimWorld.x - player.x;
      const dz = this.aimWorld.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.2) {
        initialYaw = Math.atan2(dx, dz);
        initialDist = THREE.MathUtils.clamp(dist, 2.5, spec.range);
      }
    }

    this.skillPreview.active = true;
    this.skillPreview.slot = slot;
    this.skillPreview.yaw = initialYaw;
    this.skillPreview.aoeDist = initialDist;
    this.updateSkillTelegraphVisual();
  }

  public updateSkillPreview(dragDx: number, dragDy: number): void {
    if (!this.skillPreview.active) return;
    const player = this.getPlayerHero();
    if (!player) return;
    const spec = this.getTelegraphSpec(player, this.skillPreview.slot);
    if (Math.hypot(dragDx, dragDy) > 10) {
      this.skillPreview.yaw = this.screenDeltaToWorldYaw(dragDx, dragDy, this.skillPreview.yaw);
      if (spec.type === 'aoe') {
        this.skillPreview.aoeDist = THREE.MathUtils.clamp(
          Math.hypot(dragDx, dragDy) * 0.14,
          2.5,
          spec.range
        );
      }
    }
    this.updateSkillTelegraphVisual();
  }

  public commitSkillPreview(): void {
    if (!this.skillPreview.active) return;
    const slot = this.skillPreview.slot;
    const yaw = this.skillPreview.yaw;
    const aoeDist = this.skillPreview.aoeDist;
    this.skillPreview.active = false;
    this.skillPreview.group.visible = false;

    const player = this.getPlayerHero();
    if (!player || !player.alive || this.paused || this.winner) return;

    const spec = this.getTelegraphSpec(player, slot);
    const castDist = spec.type === 'aoe' ? aoeDist : Math.max(4.0, spec.range * 0.85);
    const targetPos = {
      x: player.x + Math.sin(yaw) * castDist,
      z: player.z + Math.cos(yaw) * castDist,
    };

    this.skills.castSkill(player, slot, targetPos, this.characters, this.elapsedTime, this.spawnClone);
  }

  public cancelSkillPreview(): void {
    this.skillPreview.active = false;
    this.skillPreview.group.visible = false;
  }

  private updateSkillTelegraphVisual(): void {
    const player = this.getPlayerHero();
    if (!this.skillPreview.active || !player || !player.alive || this.winner) {
      this.skillPreview.group.visible = false;
      return;
    }

    const spec = this.getTelegraphSpec(player, this.skillPreview.slot);
    const grp = this.skillPreview.group;
    grp.visible = true;
    grp.position.set(player.x, 0, player.z);

    if (this.skillPreview.rangeRing) {
      this.skillPreview.rangeRing.scale.setScalar(spec.range);
      (this.skillPreview.rangeRing.material as THREE.MeshBasicMaterial).color.setHex(spec.color);
    }

    if (this.skillPreview.arrowGroup) {
      this.skillPreview.arrowGroup.visible = spec.type === 'line' || spec.type === 'aoe';
      this.skillPreview.arrowGroup.rotation.y = this.skillPreview.yaw;
      const shaft = this.skillPreview.arrowGroup.children[0] as THREE.Mesh;
      const head = this.skillPreview.arrowGroup.children[1] as THREE.Mesh;
      const len = spec.type === 'aoe' ? Math.max(1.5, this.skillPreview.aoeDist - 0.8) : Math.max(2, spec.range - 1.2);
      shaft.scale.set(spec.width, len, 1);
      shaft.position.set(0, 0.09, len * 0.5);
      (shaft.material as THREE.MeshBasicMaterial).color.setHex(spec.color);
      head.position.set(0, 0.11, len + 0.45);
      (head.material as THREE.MeshBasicMaterial).color.setHex(spec.color);
    }

    if (this.skillPreview.coneMesh) {
      this.skillPreview.coneMesh.visible = spec.type === 'cone';
      this.skillPreview.coneMesh.rotation.z = -this.skillPreview.yaw + Math.PI * 0.5;
      this.skillPreview.coneMesh.scale.setScalar(spec.range);
      (this.skillPreview.coneMesh.material as THREE.MeshBasicMaterial).color.setHex(spec.color);
    }

    if (this.skillPreview.aoeMarker) {
      this.skillPreview.aoeMarker.visible = spec.type === 'aoe';
      if (spec.type === 'aoe') {
        const dist = THREE.MathUtils.clamp(this.skillPreview.aoeDist, 2.5, spec.range);
        this.skillPreview.aoeMarker.position.set(
          Math.sin(this.skillPreview.yaw) * dist,
          0.1,
          Math.cos(this.skillPreview.yaw) * dist
        );
        this.skillPreview.aoeMarker.scale.setScalar(spec.aoeRadius);
        (this.skillPreview.aoeMarker.material as THREE.MeshBasicMaterial).color.setHex(spec.color);
      }
    }
  }

  public triggerPlayerSkill(slot: SkillSlot, preferSmartTarget = false): void {
    this.sound.unlock();
    const player = this.getPlayerHero();
    if (!player || !player.alive || this.paused || this.winner) return;

    let targetPos = { x: this.aimWorld.x, z: this.aimWorld.z };
    if (preferSmartTarget || !this.mouseAimFresh) {
      const spec = this.getTelegraphSpec(player, slot);
      const nearest = this.findNearestVisibleEnemy(player);
      if (nearest && Math.hypot(nearest.x - player.x, nearest.z - player.z) <= spec.range + 4) {
        targetPos = { x: nearest.x, z: nearest.z };
      } else {
        targetPos = {
          x: player.x + Math.sin(player.facingAngle) * Math.max(4, spec.range * 0.7),
          z: player.z + Math.cos(player.facingAngle) * Math.max(4, spec.range * 0.7),
        };
      }
    }

    this.skills.castSkill(
      player,
      slot,
      targetPos,
      this.characters,
      this.elapsedTime,
      this.spawnClone
    );
  }

  public spawnMatch(): void {
    // Clear existing entities and effects
    this.characters.forEach((c) => {
      this.scene.remove(c.rig.root);
      c.dispose();
    });
    this.characters = [];
    this.skills.clear();
    this.effects.clear();
    this.combat.reset();

    this.elapsedTime = 0;
    this.winner = null;

    const spawns = this.arenaMap.getSpawnPoints();
    CHARACTER_ORDER.forEach((charClass, idx) => {
      const sp = spawns[idx];
      const isPlayer = charClass === this.playerClass;
      const entity = new CharacterEntity(
        `hero_${charClass}`,
        charClass,
        sp.x,
        sp.z,
        false,
        null,
        isPlayer
      );
      entity.facingAngle = Math.atan2(-sp.x, -sp.z);
      if (isPlayer) {
        this.followedHeroId = entity.id;
        this.cameraTarget.set(sp.x, 0, sp.z);
        this.desiredTarget.set(sp.x, 0, sp.z);
        this.aimWorld.set(0, 0, 0);
        // Highlight player ground ring in bright gold
        (entity.rig.groundRing.material as THREE.MeshBasicMaterial).color.setHex(0xfacc15);
        entity.rig.groundRing.scale.setScalar(1.18);
      }
      this.characters.push(entity);
      this.scene.add(entity.rig.root);
    });

    this.emitMatchSnapshot();
  }

  private spawnClone = (owner: CharacterEntity, x: number, z: number): void => {
    const clone = new CharacterEntity(
      `clone_${owner.id}_${this.cloneCounter++}`,
      owner.charClass,
      x,
      z,
      true,
      owner.id
    );
    clone.facingAngle = owner.facingAngle;
    this.characters.push(clone);
    this.scene.add(clone.rig.root);
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    const dom = this.renderer.domElement;
    dom.addEventListener('wheel', this.handleWheel, { passive: false });
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onWebGLContextLost?.();
  };

  private handleResize = (): void => {
    if (this.destroyed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;

    this.perspCamera.aspect = aspect;
    this.perspCamera.updateProjectionMatrix();

    this.updateOrthoFrustum(aspect);

    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
  };

  private updateOrthoFrustum(aspect: number): void {
    const frustum = 46 * this.zoomLevel;
    this.orthoCamera.left = (-frustum * aspect) / 2;
    this.orthoCamera.right = (frustum * aspect) / 2;
    this.orthoCamera.top = frustum / 2;
    this.orthoCamera.bottom = -frustum / 2;
    this.orthoCamera.updateProjectionMatrix();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.sound.unlock();
    const code = e.code;

    if (e.key === 'Tab') {
      e.preventDefault();
      this.toggleCameraMode();
      return;
    }

    if (code === 'KeyP') {
      e.preventDefault();
      this.togglePause();
      return;
    }

    this.keysPressed.add(code);

    if (code === 'KeyQ' || code === 'Digit1') {
      this.triggerPlayerSkill('skill1');
    } else if (code === 'KeyE' || code === 'Digit2') {
      this.triggerPlayerSkill('skill2');
    } else if (code === 'KeyR' || code === 'Digit3') {
      this.triggerPlayerSkill('ultimate');
    } else if (code === 'KeyJ') {
      this.triggerPlayerSkill('basic');
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysPressed.delete(e.code);
  };

  private handleWindowBlur = (): void => {
    this.keysPressed.clear();
    this.isLeftMouseDown = false;
    this.isPanning = false;
    this.isOrbitDragging = false;
    this.joystickInput.active = false;
    this.joystickInput.dx = 0;
    this.joystickInput.dz = 0;
    this.cancelSkillPreview();
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.08 : -0.08;
    this.setZoom(this.zoomLevel + delta);
  };

  private updateAimFromPointer(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    _mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_mouseNdc, this.getActiveCamera());
    if (_raycaster.ray.intersectPlane(_groundPlane, _aimHit)) {
      this.aimWorld.copy(_aimHit);
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    this.sound.unlock();
    this.pointerClientX = e.clientX;
    this.pointerClientY = e.clientY;
    this.mouseAimFresh = e.pointerType === 'mouse';
    this.updateAimFromPointer(e.clientX, e.clientY);

    if (e.button === 0) {
      const player = this.getPlayerHero();
      if (player && player.alive && !this.paused && !this.winner) {
        this.isLeftMouseDown = true;
        this.triggerPlayerSkill('basic', e.pointerType !== 'mouse');
      } else {
        this.isPanning = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
      }
    } else if (e.button === 2) {
      // Hold + drag RMB rotates 3D orbit camera; quick RMB click casts Skill 1
      this.isOrbitDragging = true;
      this.rmbStartX = e.clientX;
      this.rmbStartY = e.clientY;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.rmbMoved = false;
    } else if (e.button === 1) {
      this.isPanning = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    this.pointerClientX = e.clientX;
    this.pointerClientY = e.clientY;
    if (e.pointerType === 'mouse') {
      this.mouseAimFresh = true;
      this.updateAimFromPointer(e.clientX, e.clientY);
    }

    if (this.isOrbitDragging) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      if (Math.hypot(e.clientX - this.rmbStartX, e.clientY - this.rmbStartY) > 5) {
        this.rmbMoved = true;
      }
      if (this.cameraMode === '3D' && this.rmbMoved) {
        this.orbitYaw -= dx * 0.0075;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.0055, 0.36, 1.26);
      }
      return;
    }

    if (!this.isPanning) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      this.followedHeroId = null;
      const panScale = 0.048 * this.zoomLevel;
      this.desiredTarget.x = THREE.MathUtils.clamp(this.desiredTarget.x - dx * panScale, -24, 24);
      this.desiredTarget.z = THREE.MathUtils.clamp(this.desiredTarget.z - dy * panScale, -24, 24);
    }
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.isLeftMouseDown = false;
    }
    if (e.button === 2) {
      if (this.isOrbitDragging && !this.rmbMoved) {
        this.triggerPlayerSkill('skill1', false);
      }
      this.isOrbitDragging = false;
    }
    this.isPanning = false;
  };

  public toggleCameraMode(): void {
    this.setCameraMode(this.cameraMode === '3D' ? '2D' : '3D');
  }

  public setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    if (this.renderPass) {
      this.renderPass.camera = this.getActiveCamera();
    }
    this.emitMatchSnapshot();
  }

  public setZoom(zoom: number): void {
    this.zoomLevel = THREE.MathUtils.clamp(zoom, 0.5, 1.85);
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.updateOrthoFrustum(width / height);
    this.emitMatchSnapshot();
  }

  public setTimeScale(scale: number): void {
    this.timeScale = scale;
    this.emitMatchSnapshot();
  }

  public togglePause(): void {
    this.paused = !this.paused;
    this.emitMatchSnapshot();
  }

  public followHero(heroId: string | null): void {
    this.followedHeroId = this.followedHeroId === heroId ? null : heroId;
    if (!this.followedHeroId) {
      this.desiredTarget.set(0, 0, 0);
    }
    this.emitMatchSnapshot();
  }

  public panTo(x: number, z: number): void {
    this.followedHeroId = null;
    this.desiredTarget.set(
      THREE.MathUtils.clamp(x, -24, 24),
      0,
      THREE.MathUtils.clamp(z, -24, 24)
    );
  }

  public toggleRevealFog(): void {
    this.revealFogForSpectator = !this.revealFogForSpectator;
    this.emitMatchSnapshot();
  }

  public toggleMute(): void {
    this.sound.setMuted(!this.sound.muted);
    if (!this.sound.muted) {
      this.sound.unlock();
    }
    this.emitMatchSnapshot();
  }

  private startLoop(): void {
    const tick = () => {
      if (this.destroyed) return;
      const rawDt = Math.min(0.05, this.clock.getDelta());
      this.step(rawDt);
      this.renderFrame();

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.destroyed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private step(rawDt: number): void {
    const simDt = this.paused || this.winner ? 0 : rawDt * this.timeScale;

    if (simDt > 0) {
      this.elapsedTime += simDt;

      // Remove expired dead clones cleanly
      for (let i = this.characters.length - 1; i >= 0; i--) {
        const c = this.characters[i];
        if (c.isClone && !c.alive) {
          this.scene.remove(c.rig.root);
          c.dispose();
          this.characters.splice(i, 1);
        }
      }

      // 1. Update timers & bush status
      for (let i = 0; i < this.characters.length; i++) {
        const c = this.characters[i];
        if (!c.alive) continue;
        c.updateTimers(simDt);

        const bush = this.arenaMap.getBushAt(c.x, c.z);
        c.inBush = bush !== null;
        c.currentBushId = bush ? bush.id : null;
      }

      // 2. Player Movement + AI Decisions & Movement
      this.updatePlayerInput(simDt);

      for (let i = 0; i < this.characters.length; i++) {
        const c = this.characters[i];
        if (!c.alive) continue;
        this.ai.updateCharacterAI(c, this.characters, simDt, this.elapsedTime, this.spawnClone);

        // Trigger bush rustle when moving inside a bush!
        if (c.currentBushId && Math.hypot(c.vx, c.vz) > 0.45) {
          const bush = this.arenaMap.bushes.find((b) => b.id === c.currentBushId);
          if (bush) {
            const wasQuiet = bush.rustleTimer <= 0.1;
            this.arenaMap.triggerBushRustle(bush, 1.0);
            if (wasQuiet) {
              this.effects.spawnBurst(bush.x, 0.75, bush.z, 0x3da86b, 4, 2.5, 0.45, true, true);
            }
          }
        }
      }

      // 3. Soft separation between overlapping characters
      this.resolveCharacterSeparations();

      // 4. Skills, Projectiles, Lava zones
      this.skills.update(simDt, this.characters, this.elapsedTime, this.spawnClone);

      // 5. Bush shake animation & VFX
      this.arenaMap.updateBushes(simDt);
      this.effects.update(simDt);
      this.combat.pruneDamageEvents(this.elapsedTime);

      // 6. Check victory condition (last real survivor wins!)
      const aliveReal = this.characters.filter((c) => !c.isClone && c.alive);
      if (aliveReal.length <= 1 && !this.winner) {
        const survivor = aliveReal[0] ?? this.characters.find((c) => !c.isClone);
        if (survivor) {
          this.winner = this.toHUDInfo(survivor);
          this.emitMatchSnapshot();
        }
      }
    }

    // Update Hero 3D visual rigs & player stealth fog-of-war visibility
    const player = this.getPlayerHero();
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      const hiddenFromPlayer = this.isHiddenFromPlayer(c, player);
      c.updateVisuals(rawDt, this.elapsedTime, this.revealFogForSpectator, hiddenFromPlayer);
    }

    // Update Aim Reticle & Skill Telegraph position
    if (player && player.alive && !this.winner && !this.skillPreview.active && this.mouseAimFresh) {
      this.aimReticle.visible = true;
      this.aimReticle.position.set(this.aimWorld.x, 0.05, this.aimWorld.z);
      this.aimReticle.rotation.y += rawDt * 1.8;
    } else {
      this.aimReticle.visible = false;
    }
    this.updateSkillTelegraphVisual();

    // Update Bush rustle shake visuals
    for (let i = 0; i < this.arenaMap.bushes.length; i++) {
      const b = this.arenaMap.bushes[i];
      const mesh = this.mapVisuals.bushMeshes.get(b.id);
      if (mesh) {
        if (b.rustleTimer > 0) {
          const wobble = Math.sin(this.elapsedTime * 32) * 0.08 * b.rustleIntensity;
          mesh.rotation.z = wobble;
          mesh.rotation.x = wobble * 0.6;
        } else {
          mesh.rotation.z = THREE.MathUtils.damp(mesh.rotation.z, 0, 10, rawDt);
          mesh.rotation.x = THREE.MathUtils.damp(mesh.rotation.x, 0, 10, rawDt);
        }
      }
    }

    // Smooth camera tracking & shake
    this.updateCamera(rawDt);

    // Emit HUD & overlay projections
    this.emitOverlayFrame();
    this.hudSyncAccum += rawDt;
    if (this.hudSyncAccum >= 0.08) {
      this.hudSyncAccum = 0;
      this.emitMatchSnapshot();
    }
  }

  private resolveCharacterSeparations(): void {
    for (let i = 0; i < this.characters.length; i++) {
      const a = this.characters[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.characters.length; j++) {
        const b = this.characters[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const minDist = a.getCollisionRadius() + b.getCollisionRadius();
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist && distSq > 1e-5) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.4;
          const nx = dx / dist;
          const nz = dz / dist;
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.z += nz * overlap;
        }
      }
    }
  }

  private isHiddenFromPlayer(target: CharacterEntity, player: CharacterEntity | null): boolean {
    if (target.isPlayer || target.ownerId === player?.id) return false;
    if (target.status.invisibleTimer > 0) return true;
    if (target.inBush && target.status.revealedTimer <= 0) {
      if (player && player.alive && player.currentBushId === target.currentBushId) {
        return false; // Same bush reveals!
      }
      return true;
    }
    return false;
  }

  private updatePlayerInput(dt: number): void {
    const player = this.getPlayerHero();
    if (!player || !player.alive) return;

    if (this.mouseAimFresh) {
      this.updateAimFromPointer(this.pointerClientX, this.pointerClientY);
    }

    // Continuous Left-Click hold fires basic combo when off CD
    if (this.isLeftMouseDown && player.cooldowns.basic <= 0 && !this.skillPreview.active) {
      this.triggerPlayerSkill('basic', !this.mouseAimFresh);
    }

    if (player.castLockTimer > 0 || player.isIncapacitated()) {
      player.vx = 0;
      player.vz = 0;
      return;
    }

    const { fwdX, fwdZ, rightX, rightZ } = this.getCameraGroundBasis();

    let localForward = 0;
    let localRight = 0;
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) localForward += 1;
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) localForward -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) localRight += 1;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) localRight -= 1;

    if (localForward === 0 && localRight === 0 && this.joystickInput.active) {
      localRight = this.joystickInput.dx;
      localForward = -this.joystickInput.dz;
    }

    const moveX = rightX * localRight + fwdX * localForward;
    const moveZ = rightZ * localRight + fwdZ * localForward;
    const len = Math.hypot(moveX, moveZ);
    const speed = player.getEffectiveMoveSpeed();

    if (len > 0.02 && speed > 0) {
      const nx = moveX / len;
      const nz = moveZ / len;
      player.vx = nx * speed;
      player.vz = nz * speed;

      const nextPos = { x: player.x + player.vx * dt, z: player.z + player.vz * dt };
      this.arenaMap.resolveMovementCollision(nextPos, player.getCollisionRadius());
      player.x = nextPos.x;
      player.z = nextPos.z;

      // Face movement direction when using joystick/WASD without active cursor aim
      if (!this.mouseAimFresh && !this.skillPreview.active) {
        player.facingAngle = Math.atan2(nx, nz);
      }
    } else {
      player.vx = 0;
      player.vz = 0;
    }

    if (this.skillPreview.active) {
      player.facingAngle = this.skillPreview.yaw;
    } else if (this.mouseAimFresh) {
      const aimDx = this.aimWorld.x - player.x;
      const aimDz = this.aimWorld.z - player.z;
      if (Math.hypot(aimDx, aimDz) > 0.15) {
        player.facingAngle = Math.atan2(aimDx, aimDz);
      }
    }
  }

  private updateCamera(dt: number): void {
    if (this.followedHeroId) {
      const hero = this.characters.find((c) => c.id === this.followedHeroId && c.alive);
      if (hero) {
        if (hero.isPlayer && this.mouseAimFresh) {
          const lookDx = THREE.MathUtils.clamp((this.aimWorld.x - hero.x) * 0.12, -2.6, 2.6);
          const lookDz = THREE.MathUtils.clamp((this.aimWorld.z - hero.z) * 0.12, -2.6, 2.6);
          this.desiredTarget.set(hero.x + lookDx, 0, hero.z + lookDz);
        } else {
          this.desiredTarget.set(hero.x, 0, hero.z);
        }
      }
    }

    this.cameraTarget.x = THREE.MathUtils.damp(this.cameraTarget.x, this.desiredTarget.x, 8, dt);
    this.cameraTarget.z = THREE.MathUtils.damp(this.cameraTarget.z, this.desiredTarget.z, 8, dt);

    const shakeX = this.effects.cameraShake > 0 ? (Math.random() - 0.5) * this.effects.cameraShake : 0;
    const shakeZ = this.effects.cameraShake > 0 ? (Math.random() - 0.5) * this.effects.cameraShake : 0;

    if (this.cameraMode === '3D') {
      const dist = 42 * this.zoomLevel;
      const horiz = Math.cos(this.orbitPitch) * dist;
      const camY = Math.sin(this.orbitPitch) * dist;
      this.perspCamera.position.set(
        this.cameraTarget.x + Math.sin(this.orbitYaw) * horiz + shakeX,
        camY,
        this.cameraTarget.z + Math.cos(this.orbitYaw) * horiz + shakeZ
      );
      this.perspCamera.lookAt(this.cameraTarget.x + shakeX, 0, this.cameraTarget.z + shakeZ);
    } else {
      this.orthoCamera.position.set(
        this.cameraTarget.x + shakeX,
        62,
        this.cameraTarget.z + 0.01 + shakeZ
      );
      this.orthoCamera.lookAt(this.cameraTarget.x + shakeX, 0, this.cameraTarget.z + shakeZ);
    }
  }

  private renderFrame(): void {
    if (!this.isSoftwareGl && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.getActiveCamera());
    }
  }

  private emitOverlayFrame(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    const cam = this.getActiveCamera();
    const heroOverlays: ProjectedHeroOverlay[] = [];

    const player = this.getPlayerHero();

    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i];
      if (!c.alive) continue;

      const hiddenFromPlayer = this.isHiddenFromPlayer(c, player);
      if (hiddenFromPlayer && !this.revealFogForSpectator) continue;

      const yOffset = c.status.titanTimer > 0 ? 3.55 : 2.35;
      _projVec.set(c.x, yOffset, c.z).project(cam);

      const sx = (_projVec.x * 0.5 + 0.5) * width;
      const sy = (-_projVec.y * 0.5 + 0.5) * height;
      const inView = _projVec.z < 1 && sx > -80 && sx < width + 80 && sy > -80 && sy < height + 80;

      const showBarAndName = c.isClone || c.isPlayer
        ? true
        : c.shouldShowOverheadBar() || this.revealFogForSpectator;

      heroOverlays.push({
        id: c.id,
        displayName: c.isClone ? `${c.config.displayName} (Illusion)` : c.config.displayName,
        charClass: c.charClass,
        cssColor: c.config.cssColor,
        screenX: sx,
        screenY: sy,
        visible: inView,
        showBarAndName,
        hp: c.hp,
        maxHp: c.maxHp,
        hasShield: c.status.shieldTimer > 0,
        isTitan: c.status.titanTimer > 0,
        isRooted: c.status.rootTimer > 0,
        isSlowed: c.status.slowTimer > 0,
        isSpedUp: c.status.speedTimer > 0,
        isStunned: c.status.stunTimer > 0,
        isKnockedUp: c.status.knockupTimer > 0,
        isInvisible: c.status.invisibleTimer > 0,
        inBush: c.inBush,
        isClone: c.isClone,
        isPlayer: c.isPlayer,
        comboStep: c.comboResetTimer > 0 || c.attackAnimTimer > 0 ? c.comboStep : 0,
        skill1Ready: c.cooldowns.skill1 <= 0,
        skill2Ready: c.cooldowns.skill2 <= 0,
        ultReady: c.cooldowns.ultimate <= 0,
      });
    }

    const dmgOverlays: ProjectedDamageItem[] = [];
    for (let i = 0; i < this.combat.damageEvents.length; i++) {
      const d = this.combat.damageEvents[i];
      _projVec.set(d.worldX, d.worldY, d.worldZ).project(cam);
      const sx = (_projVec.x * 0.5 + 0.5) * width;
      const sy = (-_projVec.y * 0.5 + 0.5) * height;
      dmgOverlays.push({
        id: d.id,
        screenX: sx,
        screenY: sy,
        text: d.label ?? `${d.amount}`,
        kind: d.kind,
        age: this.elapsedTime - d.createdAt,
      });
    }

    const minimap: MinimapSnapshot = {
      arenaHalfSize: this.arenaMap.halfSize,
      obstacles: this.arenaMap.obstacles.map((o) => ({
        x: o.x,
        z: o.z,
        radius: o.radius,
        type: o.type,
        halfW: o.halfW,
        halfD: o.halfD,
      })),
      bushes: this.arenaMap.bushes.map((b) => ({
        x: b.x,
        z: b.z,
        radius: b.radius,
        rustling: b.rustleTimer > 0,
      })),
      lavaZones: this.skills.lavaZones.map((l) => ({
        x: l.startX,
        z: l.startZ,
        dirX: l.dirX,
        dirZ: l.dirZ,
        length: l.length,
        width: l.width,
      })),
      heroes: this.characters.map((c) => ({
        id: c.id,
        x: c.x,
        z: c.z,
        cssColor: c.config.cssColor,
        alive: c.alive,
        hidden: this.isHiddenFromPlayer(c, player) && !this.revealFogForSpectator,
        isClone: c.isClone,
        isFollowed: c.id === this.followedHeroId,
      })),
      cameraCenter: { x: this.cameraTarget.x, z: this.cameraTarget.z },
      cameraViewSpan: 34 * this.zoomLevel,
    };

    this.callbacks.onOverlayFrame(heroOverlays, dmgOverlays, minimap);
  }

  private toHUDInfo(c: CharacterEntity): CharacterHUDInfo {
    return {
      id: c.id,
      charClass: c.charClass,
      displayName: c.config.displayName,
      cssColor: c.config.cssColor,
      hp: Math.round(c.hp),
      maxHp: Math.round(c.maxHp),
      alive: c.alive,
      kills: c.kills,
      damageDealt: Math.round(c.damageDealt),
      inBush: c.inBush,
      isInvisible: c.status.invisibleTimer > 0,
      isRevealed: c.status.revealedTimer > 0,
      isTitan: c.status.titanTimer > 0,
      hasShield: c.status.shieldTimer > 0,
      isRooted: c.status.rootTimer > 0,
      isSlowed: c.status.slowTimer > 0,
      isSpedUp: c.status.speedTimer > 0,
      isStunned: c.status.stunTimer > 0,
      isKnockedUp: c.status.knockupTimer > 0,
      comboStep: c.comboResetTimer > 0 || c.attackAnimTimer > 0 ? c.comboStep : 0,
      comboResetTimer: c.comboResetTimer,
      isPlayer: c.isPlayer,
      aiState: c.aiMemory.state,
      cooldowns: { ...c.cooldowns },
      maxCooldowns: {
        basic: c.config.skills.basic.cooldown,
        skill1: c.config.skills.skill1.cooldown,
        skill2: c.config.skills.skill2.cooldown,
        ultimate: c.config.skills.ultimate.cooldown,
      },
      x: c.x,
      z: c.z,
      isClone: c.isClone,
    };
  }

  private emitMatchSnapshot(): void {
    const realHeroes = this.characters.filter((c) => !c.isClone).map((c) => this.toHUDInfo(c));
    const playerEntity = this.getPlayerHero();
    const nearestEnemyEntity = this.findNearestVisibleEnemy(playerEntity);
    this.callbacks.onMatchSnapshot({
      elapsedTime: this.elapsedTime,
      aliveCount: realHeroes.filter((h) => h.alive).length,
      winner: this.winner,
      cameraMode: this.cameraMode,
      zoomLevel: this.zoomLevel,
      timeScale: this.timeScale,
      paused: this.paused,
      muted: this.sound.muted,
      playerClass: this.playerClass,
      playerHero: playerEntity ? this.toHUDInfo(playerEntity) : null,
      nearestEnemy: nearestEnemyEntity ? this.toHUDInfo(nearestEnemyEntity) : null,
      followedHeroId: this.followedHeroId,
      revealFogForSpectator: this.revealFogForSpectator,
      heroes: realHeroes,
      killFeed: [...this.combat.killFeed],
    });
  }

  public dispose(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);

    const dom = this.renderer.domElement;
    dom.removeEventListener('wheel', this.handleWheel);
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('contextmenu', this.handleContextMenu);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);

    this.aimReticle.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.skillPreview.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });

    this.characters.forEach((c) => c.dispose());
    this.mapVisuals.dispose();
    this.effects.dispose();
    this.skills.clear();
    this.sound.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
