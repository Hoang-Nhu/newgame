import * as THREE from 'three';
import { CharacterClass } from '../types';
import { CHARACTER_CONFIGS } from './CharacterConfig';

export interface HeroModelRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  weaponArm: THREE.Group;
  groundRing: THREE.Mesh;
  shieldDome: THREE.Mesh;
  rootCage: THREE.Group;
  titanAura: THREE.Mesh;
  speedRing: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

export function createHeroModel(charClass: CharacterClass, isClone = false): HeroModelRig {
  const cfg = CHARACTER_CONFIGS[charClass];
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const weaponArm = new THREE.Group();
  root.add(bodyGroup);
  bodyGroup.add(weaponArm);

  const disposables: Array<{ dispose: () => void }> = [];
  const materials: THREE.MeshStandardMaterial[] = [];

  const regMat = (opts: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({
      ...opts,
      transparent: isClone || Boolean(opts.transparent),
      opacity: isClone ? 0.88 : opts.opacity ?? 1.0,
    });
    materials.push(m);
    disposables.push(m);
    return m;
  };

  const regGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };

  const primaryMat = regMat({
    color: cfg.primaryColor,
    roughness: 0.42,
    metalness: 0.35,
  });
  const darkArmorMat = regMat({
    color: 0x1e2430,
    roughness: 0.55,
    metalness: 0.58,
  });
  const metalTrimMat = regMat({
    color: 0xcbd5e1,
    roughness: 0.25,
    metalness: 0.85,
  });
  const skinMat = regMat({
    color: 0xd9b89c,
    roughness: 0.72,
    metalness: 0.05,
  });
  const glowMat = regMat({
    color: cfg.accentColor,
    emissive: new THREE.Color(cfg.accentColor),
    emissiveIntensity: 2.4,
    roughness: 0.2,
    metalness: 0.1,
  });

  // Contact shadow disc
  const shadowGeo = regGeo(new THREE.CircleGeometry(cfg.radius * 1.15, 24));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  disposables.push(shadowMat);
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.015;
  root.add(contactShadow);

  // Ground selection/team ring
  const ringGeo = regGeo(new THREE.RingGeometry(cfg.radius * 1.05, cfg.radius * 1.28, 32));
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: cfg.accentColor,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposables.push(ringMat);
  const groundRing = new THREE.Mesh(ringGeo, ringMat);
  groundRing.position.y = 0.035;
  root.add(groundRing);

  // Shared Boots / Legs (grounded at y=0)
  const bootGeo = regGeo(new THREE.BoxGeometry(0.24, 0.42, 0.3));
  const leftBoot = new THREE.Mesh(bootGeo, darkArmorMat);
  leftBoot.position.set(-0.2, 0.21, 0);
  leftBoot.castShadow = true;
  const rightBoot = new THREE.Mesh(bootGeo, darkArmorMat);
  rightBoot.position.set(0.2, 0.21, 0);
  rightBoot.castShadow = true;
  bodyGroup.add(leftBoot, rightBoot);

  if (charClass === 'Tank') {
    // Heavy armored torso
    const torso = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.92, 0.92, 0.62)), darkArmorMat);
    torso.position.y = 0.88;
    torso.castShadow = true;
    const chestPlate = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.84, 0.56, 0.68)), primaryMat);
    chestPlate.position.y = 0.96;
    chestPlate.castShadow = true;

    // Giant Pauldrons
    const pauldronGeo = regGeo(new THREE.DodecahedronGeometry(0.36, 0));
    const pL = new THREE.Mesh(pauldronGeo, primaryMat);
    pL.position.set(-0.62, 1.22, 0);
    pL.castShadow = true;
    const pR = new THREE.Mesh(pauldronGeo, primaryMat);
    pR.position.set(0.62, 1.22, 0);
    pR.castShadow = true;

    // Horned Helm
    const helm = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.27, 0.3, 0.46, 8)), metalTrimMat);
    helm.position.y = 1.56;
    helm.castShadow = true;
    const visor = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.36, 0.1, 0.14)), glowMat);
    visor.position.set(0, 1.56, 0.25);

    const hornGeo = regGeo(new THREE.ConeGeometry(0.08, 0.36, 6));
    const hornL = new THREE.Mesh(hornGeo, metalTrimMat);
    hornL.position.set(-0.28, 1.78, 0);
    hornL.rotation.z = 0.5;
    const hornR = new THREE.Mesh(hornGeo, metalTrimMat);
    hornR.position.set(0.28, 1.78, 0);
    hornR.rotation.z = -0.5;

    // Tower Shield on Left Arm
    const shield = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.16, 1.15, 0.78)), primaryMat);
    shield.position.set(-0.68, 0.92, 0.28);
    shield.rotation.y = 0.3;
    shield.castShadow = true;
    const shieldCore = new THREE.Mesh(regGeo(new THREE.OctahedronGeometry(0.16, 0)), glowMat);
    shieldCore.position.set(-0.76, 0.95, 0.3);

    // Warhammer on Right Weapon Arm
    weaponArm.position.set(0.62, 1.05, 0);
    const haft = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8)), darkArmorMat);
    haft.rotation.x = Math.PI / 2;
    haft.position.set(0, -0.05, 0.45);
    const hammerHead = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.46, 0.34, 0.34)), metalTrimMat);
    hammerHead.position.set(0, -0.05, 0.98);
    hammerHead.castShadow = true;
    const hammerCore = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.5, 0.14, 0.14)), glowMat);
    hammerCore.position.set(0, -0.05, 0.98);
    weaponArm.add(haft, hammerHead, hammerCore);

    bodyGroup.add(torso, chestPlate, pL, pR, helm, visor, hornL, hornR, shield, shieldCore);
  } else if (charClass === 'Archer') {
    // Sleek Ranger Tunic & Cloak
    const torso = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.28, 0.36, 0.85, 8)), primaryMat);
    torso.position.y = 0.84;
    torso.castShadow = true;
    const cloak = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.56, 0.88, 0.14)), darkArmorMat);
    cloak.position.set(0, 0.86, -0.26);
    cloak.rotation.x = 0.14;
    cloak.castShadow = true;

    // Quiver
    const quiver = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.1, 0.08, 0.62, 7)), darkArmorMat);
    quiver.position.set(-0.22, 1.05, -0.32);
    quiver.rotation.z = -0.35;

    // Hooded Head
    const head = new THREE.Mesh(regGeo(new THREE.SphereGeometry(0.23, 12, 10)), skinMat);
    head.position.y = 1.46;
    const hood = new THREE.Mesh(regGeo(new THREE.ConeGeometry(0.32, 0.48, 8)), primaryMat);
    hood.position.set(0, 1.58, -0.04);
    hood.rotation.x = -0.22;
    hood.castShadow = true;
    const eyes = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.22, 0.06, 0.1)), glowMat);
    eyes.position.set(0, 1.46, 0.2);

    // Recurve Longbow on Weapon Arm
    weaponArm.position.set(0.35, 1.0, 0.15);
    const bowCurve = new THREE.Mesh(
      regGeo(new THREE.TorusGeometry(0.56, 0.045, 8, 18, Math.PI * 1.15)),
      glowMat
    );
    bowCurve.rotation.y = Math.PI / 2;
    bowCurve.rotation.z = -Math.PI * 0.57;
    bowCurve.position.set(0.05, 0.05, 0.3);
    bowCurve.castShadow = true;
    const grip = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 6)), metalTrimMat);
    grip.position.set(0.05, 0.05, 0.48);
    weaponArm.add(bowCurve, grip);

    bodyGroup.add(torso, cloak, quiver, head, hood, eyes);
  } else if (charClass === 'SwordMaster') {
    // Crimson Samurai / Ronin Armor
    const torso = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.68, 0.84, 0.46)), darkArmorMat);
    torso.position.y = 0.84;
    torso.castShadow = true;
    const sash = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.72, 0.24, 0.5)), primaryMat);
    sash.position.y = 0.65;

    // Layered Blade Pauldrons
    const pGeo = regGeo(new THREE.BoxGeometry(0.34, 0.18, 0.46));
    const pL = new THREE.Mesh(pGeo, primaryMat);
    pL.position.set(-0.48, 1.18, 0);
    pL.rotation.z = 0.25;
    const pR = new THREE.Mesh(pGeo, primaryMat);
    pR.position.set(0.48, 1.18, 0);
    pR.rotation.z = -0.25;

    // Flowing scarf
    const scarf = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.32, 0.16, 0.65)), primaryMat);
    scarf.position.set(0, 1.24, -0.38);
    scarf.rotation.x = -0.25;

    // Kabuto Helm + Glowing V-Crest
    const helm = new THREE.Mesh(regGeo(new THREE.SphereGeometry(0.27, 10, 8)), darkArmorMat);
    helm.position.y = 1.48;
    helm.castShadow = true;
    const crest = new THREE.Mesh(regGeo(new THREE.OctahedronGeometry(0.16, 0)), glowMat);
    crest.position.set(0, 1.72, 0.18);
    crest.scale.set(1.6, 0.8, 0.4);

    // Oversized Rune Greatsword on Weapon Arm
    weaponArm.position.set(0.48, 0.96, 0.1);
    const hilt = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 6)), metalTrimMat);
    hilt.rotation.x = Math.PI / 2;
    hilt.position.set(0, 0, 0.2);
    const guard = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.34, 0.08, 0.09)), metalTrimMat);
    guard.position.set(0, 0, 0.42);
    const blade = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.14, 0.04, 1.45)), glowMat);
    blade.position.set(0, 0, 1.16);
    blade.castShadow = true;
    weaponArm.add(hilt, guard, blade);

    bodyGroup.add(torso, sash, pL, pR, scarf, helm, crest);
  } else if (charClass === 'Mage') {
    // Arcane Robes
    const robe = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.28, 0.52, 1.05, 10)), primaryMat);
    robe.position.y = 0.65;
    robe.castShadow = true;
    const collar = new THREE.Mesh(regGeo(new THREE.TorusGeometry(0.32, 0.08, 8, 16)), metalTrimMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.2;

    // Floating shoulder runes
    const runeGeo = regGeo(new THREE.OctahedronGeometry(0.14, 0));
    const rL = new THREE.Mesh(runeGeo, glowMat);
    rL.position.set(-0.5, 1.32, 0);
    const rR = new THREE.Mesh(runeGeo, glowMat);
    rR.position.set(0.5, 1.32, 0);

    // Head & Wizard Crown/Hat
    const head = new THREE.Mesh(regGeo(new THREE.SphereGeometry(0.22, 12, 10)), skinMat);
    head.position.y = 1.44;
    const brim = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 14)), darkArmorMat);
    brim.position.y = 1.62;
    const hat = new THREE.Mesh(regGeo(new THREE.ConeGeometry(0.28, 0.62, 10)), primaryMat);
    hat.position.y = 1.92;
    hat.castShadow = true;

    // Arcane Orb Staff
    weaponArm.position.set(0.46, 0.95, 0.12);
    const staff = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.04, 0.035, 1.55, 8)), darkArmorMat);
    staff.position.set(0, 0.1, 0.25);
    staff.rotation.x = 0.25;
    const orb = new THREE.Mesh(regGeo(new THREE.IcosahedronGeometry(0.2, 1)), glowMat);
    orb.position.set(0, 0.9, 0.46);
    weaponArm.add(staff, orb);

    bodyGroup.add(robe, collar, rL, rR, head, brim, hat);
  } else if (charClass === 'Support') {
    // Seraphic Vestments
    const robe = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.28, 0.48, 1.0, 10)), primaryMat);
    robe.position.y = 0.68;
    robe.castShadow = true;
    const stole = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.32, 0.85, 0.42)), metalTrimMat);
    stole.position.y = 0.85;

    // Winged Pauldrons
    const wingGeo = regGeo(new THREE.BoxGeometry(0.42, 0.14, 0.28));
    const wL = new THREE.Mesh(wingGeo, glowMat);
    wL.position.set(-0.52, 1.25, -0.1);
    wL.rotation.z = -0.35;
    const wR = new THREE.Mesh(wingGeo, glowMat);
    wR.position.set(0.52, 1.25, -0.1);
    wR.rotation.z = 0.35;

    // Head + Radiant Halo
    const head = new THREE.Mesh(regGeo(new THREE.SphereGeometry(0.22, 12, 10)), skinMat);
    head.position.y = 1.44;
    const halo = new THREE.Mesh(regGeo(new THREE.TorusGeometry(0.32, 0.04, 8, 24)), glowMat);
    halo.position.set(0, 1.65, -0.12);
    halo.rotation.x = 0.35;

    // Lotus Lantern Staff
    weaponArm.position.set(0.45, 0.95, 0.15);
    const staff = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.04, 0.035, 1.45, 8)), metalTrimMat);
    staff.position.set(0, 0.08, 0.25);
    staff.rotation.x = 0.22;
    const lotus = new THREE.Mesh(regGeo(new THREE.OctahedronGeometry(0.22, 0)), glowMat);
    lotus.position.set(0, 0.82, 0.44);
    weaponArm.add(staff, lotus);

    bodyGroup.add(robe, stole, wL, wR, head, halo);
  } else {
    // Specialist: Shadow Assassin / Phantom
    const torso = new THREE.Mesh(regGeo(new THREE.CylinderGeometry(0.25, 0.32, 0.82, 8)), darkArmorMat);
    torso.position.y = 0.82;
    torso.castShadow = true;
    const vest = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.54, 0.48, 0.38)), primaryMat);
    vest.position.y = 0.96;

    // Twin Shoulder Blades
    const spikeGeo = regGeo(new THREE.ConeGeometry(0.12, 0.4, 5));
    const sL = new THREE.Mesh(spikeGeo, primaryMat);
    sL.position.set(-0.38, 1.24, 0);
    sL.rotation.z = 0.7;
    const sR = new THREE.Mesh(spikeGeo, primaryMat);
    sR.position.set(0.38, 1.24, 0);
    sR.rotation.z = -0.7;

    // Cowl & Glowing Mask
    const head = new THREE.Mesh(regGeo(new THREE.SphereGeometry(0.22, 10, 8)), darkArmorMat);
    head.position.y = 1.44;
    const mask = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.24, 0.08, 0.1)), glowMat);
    mask.position.set(0, 1.44, 0.19);
    const tail = new THREE.Mesh(regGeo(new THREE.BoxGeometry(0.22, 0.1, 0.72)), primaryMat);
    tail.position.set(0, 1.22, -0.4);
    tail.rotation.x = -0.25;

    // Twin Void Daggers
    weaponArm.position.set(0.4, 0.92, 0.15);
    const daggerR = new THREE.Mesh(regGeo(new THREE.ConeGeometry(0.08, 0.65, 4)), glowMat);
    daggerR.rotation.x = Math.PI / 2;
    daggerR.position.set(0, 0, 0.35);
    weaponArm.add(daggerR);

    const daggerL = new THREE.Mesh(regGeo(new THREE.ConeGeometry(0.08, 0.65, 4)), glowMat);
    daggerL.rotation.x = Math.PI / 2;
    daggerL.position.set(-0.42, 0.92, 0.45);
    bodyGroup.add(torso, vest, sL, sR, head, mask, tail, daggerL);
  }

  // Status attachment: Tank Shield Energy Dome
  const shieldDomeGeo = regGeo(new THREE.SphereGeometry(1.35, 16, 12));
  const shieldDomeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.32,
    wireframe: true,
    depthWrite: false,
  });
  disposables.push(shieldDomeMat);
  const shieldDome = new THREE.Mesh(shieldDomeGeo, shieldDomeMat);
  shieldDome.position.y = 0.95;
  shieldDome.visible = false;
  root.add(shieldDome);

  // Status attachment: Mage Root Crystal Cage
  const rootCage = new THREE.Group();
  const cageMat = new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: new THREE.Color(0xa855f7),
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.78,
  });
  const shardGeo = regGeo(new THREE.ConeGeometry(0.14, 1.15, 5));
  disposables.push(cageMat);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const shard = new THREE.Mesh(shardGeo, cageMat);
    shard.position.set(Math.cos(a) * 0.75, 0.55, Math.sin(a) * 0.75);
    shard.rotation.z = Math.cos(a) * 0.25;
    shard.rotation.x = -Math.sin(a) * 0.25;
    rootCage.add(shard);
  }
  rootCage.visible = false;
  root.add(rootCage);

  // Status attachment: Titan Aura Ring
  const titanGeo = regGeo(new THREE.RingGeometry(1.15, 1.48, 32));
  titanGeo.rotateX(-Math.PI / 2);
  const titanMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  disposables.push(titanMat);
  const titanAura = new THREE.Mesh(titanGeo, titanMat);
  titanAura.position.y = 0.06;
  titanAura.visible = false;
  root.add(titanAura);

  // Status attachment: Speed Wind Ring
  const speedGeo = regGeo(new THREE.TorusGeometry(0.82, 0.045, 6, 24));
  speedGeo.rotateX(Math.PI / 2);
  const speedMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  disposables.push(speedMat);
  const speedRing = new THREE.Mesh(speedGeo, speedMat);
  speedRing.position.y = 0.45;
  speedRing.visible = false;
  root.add(speedRing);

  return {
    root,
    bodyGroup,
    weaponArm,
    groundRing,
    shieldDome,
    rootCage,
    titanAura,
    speedRing,
    materials,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
