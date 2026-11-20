import * as THREE from 'three';
import { ArenaMap } from './ArenaMap';
import { BushZone, Obstacle } from '../types';

export interface BuiltMapVisuals {
  group: THREE.Group;
  bushMeshes: Map<string, THREE.Group>;
  dispose: () => void;
}

function createArenaFloorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base dark gothic moss-slate stone (V Rising / Battlerite palette)
  ctx.fillStyle = '#181e27';
  ctx.fillRect(0, 0, size, size);

  // Subtle tile flagstones
  const tiles = 16;
  const tileSize = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const frac = seed - Math.floor(seed);
      const shade = Math.floor(22 + frac * 14);
      const mossTint = frac > 0.72 ? 6 : 0;
      ctx.fillStyle = `rgb(${shade}, ${shade + 4 + mossTint}, ${shade + 11})`;
      ctx.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);

      // Bevel highlight on top/left edge
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x * tileSize + 3, y * tileSize + 3, tileSize - 6, tileSize - 6);
    }
  }

  // Noise & weathered moss speckles
  for (let i = 0; i < 3500; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const r = 1 + Math.random() * 3.2;
    ctx.fillStyle =
      Math.random() > 0.65 ? 'rgba(34, 68, 52, 0.16)' : 'rgba(10, 14, 20, 0.25)';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Central Crucible Rune Mandala
  const cx = size / 2;
  const cy = size / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(180, 145, 85, 0.22)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.19, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(92, 165, 195, 0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.145, 0, Math.PI * 2);
  ctx.stroke();

  // Geometric star lines
  ctx.strokeStyle = 'rgba(180, 145, 85, 0.14)';
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * size * 0.06, cy + Math.sin(ang) * size * 0.06);
    ctx.lineTo(cx + Math.cos(ang) * size * 0.19, cy + Math.sin(ang) * size * 0.19);
    ctx.stroke();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStoneBumpTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2400; i++) {
    const v = 90 + Math.floor(Math.random() * 80);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 3 + Math.random() * 5, 3 + Math.random() * 5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

export function buildArenaVisuals(
  arenaMap: ArenaMap,
  maxAnisotropy: number
): BuiltMapVisuals {
  const group = new THREE.Group();
  const bushMeshes = new Map<string, THREE.Group>();
  const disposables: Array<{ dispose: () => void }> = [];

  const floorTex = createArenaFloorTexture();
  floorTex.anisotropy = maxAnisotropy;
  disposables.push(floorTex);

  const stoneBump = createStoneBumpTexture();
  stoneBump.anisotropy = maxAnisotropy;
  disposables.push(stoneBump);

  const arenaSpan = arenaMap.halfSize * 2;

  // 1. Main Playable Arena Courtyard Floor
  const floorGeo = new THREE.PlaneGeometry(arenaSpan, arenaSpan);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    bumpMap: stoneBump,
    bumpScale: 0.04,
    roughness: 0.85,
    metalness: 0.08,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = true;
  group.add(floorMesh);
  disposables.push(floorGeo, floorMat);

  // 2. Outer Forest / Abyss Cliff Terrain Skirt (prevents floating box in void)
  const skirtGeo = new THREE.RingGeometry(arenaSpan * 0.65, 115, 32);
  skirtGeo.rotateX(-Math.PI / 2);
  const skirtGeoFull = new THREE.PlaneGeometry(240, 240);
  skirtGeoFull.rotateX(-Math.PI / 2);
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x0d131a,
    roughness: 0.95,
    metalness: 0.02,
  });
  const skirtMesh = new THREE.Mesh(skirtGeoFull, skirtMat);
  skirtMesh.position.y = -0.35;
  skirtMesh.receiveShadow = true;
  group.add(skirtMesh);
  disposables.push(skirtGeo, skirtGeoFull, skirtMat);

  // 3. Perimeter Gothic Stone Curb + Natural Outer Cliff/Tree Framing
  const stoneWallMat = new THREE.MeshStandardMaterial({
    color: 0x38414e,
    roughness: 0.82,
    metalness: 0.12,
    bumpMap: stoneBump,
    bumpScale: 0.06,
  });
  const stoneTrimMat = new THREE.MeshStandardMaterial({
    color: 0x566170,
    roughness: 0.55,
    metalness: 0.28,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xffaa44,
    emissive: new THREE.Color(0xff6a1a),
    emissiveIntensity: 2.2,
    roughness: 0.3,
  });
  disposables.push(stoneWallMat, stoneTrimMat, emberMat);

  const borderOffset = arenaMap.halfSize + 0.75;
  const sideLen = arenaSpan + 2.5;
  const borderConfigs = [
    { x: 0, z: -borderOffset, w: sideLen, d: 1.5 },
    { x: 0, z: borderOffset, w: sideLen, d: 1.5 },
    { x: -borderOffset, z: 0, w: 1.5, d: sideLen },
    { x: borderOffset, z: 0, w: 1.5, d: sideLen },
  ];

  borderConfigs.forEach((b) => {
    const geo = new THREE.BoxGeometry(b.w, 1.3, b.d);
    const mesh = new THREE.Mesh(geo, stoneWallMat);
    mesh.position.set(b.x, 0.35, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(geo);
  });

  // Corner glowing Gothic Braziers along perimeter
  const cornerCoords = [
    [-borderOffset, -borderOffset],
    [borderOffset, -borderOffset],
    [-borderOffset, borderOffset],
    [borderOffset, borderOffset],
    [0, -borderOffset],
    [0, borderOffset],
    [-borderOffset, 0],
    [borderOffset, 0],
  ];
  const pillarGeo = new THREE.BoxGeometry(2.1, 2.5, 2.1);
  const capGeo = new THREE.BoxGeometry(2.4, 0.35, 2.4);
  const flameGeo = new THREE.OctahedronGeometry(0.45, 0);
  disposables.push(pillarGeo, capGeo, flameGeo);

  cornerCoords.forEach(([cx, cz]) => {
    const brazier = new THREE.Group();
    const pillar = new THREE.Mesh(pillarGeo, stoneWallMat);
    pillar.position.y = 1.25;
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    const cap = new THREE.Mesh(capGeo, stoneTrimMat);
    cap.position.y = 2.55;
    cap.castShadow = true;
    const flame = new THREE.Mesh(flameGeo, emberMat);
    flame.position.y = 3.1;
    brazier.add(pillar, cap, flame);
    brazier.position.set(cx, 0, cz);
    group.add(brazier);
  });

  // Outer ambient pine grove & rocks beyond the arena perimeter (InstancedMesh for crisp depth)
  const outerBarkMat = new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: 0.92 });
  const outerLeafMat = new THREE.MeshStandardMaterial({ color: 0x162d26, roughness: 0.85 });
  const outerTrunkGeo = new THREE.CylinderGeometry(0.4, 0.7, 3.2, 6);
  const outerCrownGeo = new THREE.ConeGeometry(2.5, 6.2, 7);
  disposables.push(outerBarkMat, outerLeafMat, outerTrunkGeo, outerCrownGeo);

  const outerCount = 44;
  const outerTrunks = new THREE.InstancedMesh(outerTrunkGeo, outerBarkMat, outerCount);
  const outerCrowns = new THREE.InstancedMesh(outerCrownGeo, outerLeafMat, outerCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < outerCount; i++) {
    const ang = (i / outerCount) * Math.PI * 2 + (i % 2) * 0.08;
    const dist = arenaMap.halfSize + 6.5 + (i % 5) * 3.4;
    const px = Math.cos(ang) * dist;
    const pz = Math.sin(ang) * dist;
    const sc = 0.85 + (i % 4) * 0.18;

    dummy.position.set(px, 1.4 * sc, pz);
    dummy.scale.set(sc, sc, sc);
    dummy.rotation.y = i * 1.1;
    dummy.updateMatrix();
    outerTrunks.setMatrixAt(i, dummy.matrix);

    dummy.position.set(px, 4.4 * sc, pz);
    dummy.updateMatrix();
    outerCrowns.setMatrixAt(i, dummy.matrix);
  }
  outerTrunks.computeBoundingSphere();
  outerCrowns.computeBoundingSphere();
  group.add(outerTrunks, outerCrowns);

  // 4. Arena Obstacles (Composite 4-7 part models)
  const treeBarkMat = new THREE.MeshStandardMaterial({
    color: 0x452f24,
    roughness: 0.9,
    metalness: 0.04,
  });
  const treeLeafDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1b4535,
    roughness: 0.82,
    metalness: 0.04,
  });
  const treeLeafTopMat = new THREE.MeshStandardMaterial({
    color: 0x265e46,
    roughness: 0.72,
    metalness: 0.06,
  });
  const rockMainMat = new THREE.MeshStandardMaterial({
    color: 0x4a5564,
    roughness: 0.86,
    metalness: 0.1,
    flatShading: true,
  });
  const rockMossMat = new THREE.MeshStandardMaterial({
    color: 0x2e503c,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  });
  disposables.push(treeBarkMat, treeLeafDarkMat, treeLeafTopMat, rockMainMat, rockMossMat);

  arenaMap.obstacles.forEach((obs: Obstacle) => {
    if (obs.type === 'tree') {
      const tree = buildCompositeTree(obs, treeBarkMat, treeLeafDarkMat, treeLeafTopMat, disposables);
      group.add(tree);
    } else if (obs.type === 'rock') {
      const rock = buildCompositeRock(obs, rockMainMat, rockMossMat, disposables);
      group.add(rock);
    } else if (obs.type === 'wall') {
      const wall = buildCompositeWall(obs, stoneWallMat, stoneTrimMat, disposables);
      group.add(wall);
    }
  });

  // 5. Interactive Stealth Bushes
  const bushBaseMat = new THREE.MeshStandardMaterial({
    color: 0x1d4d32,
    roughness: 0.85,
    metalness: 0.03,
  });
  const bushTipMat = new THREE.MeshStandardMaterial({
    color: 0x2c6e45,
    roughness: 0.76,
    metalness: 0.05,
  });
  const bushHighlightMat = new THREE.MeshStandardMaterial({
    color: 0x3b8a57,
    emissive: new THREE.Color(0x0d2b18),
    emissiveIntensity: 0.5,
    roughness: 0.7,
  });
  disposables.push(bushBaseMat, bushTipMat, bushHighlightMat);

  arenaMap.bushes.forEach((bush: BushZone) => {
    const bushGroup = buildCompositeBush(bush, bushBaseMat, bushTipMat, bushHighlightMat, disposables);
    bushMeshes.set(bush.id, bushGroup);
    group.add(bushGroup);
  });

  return {
    group,
    bushMeshes,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function buildCompositeTree(
  obs: Obstacle,
  barkMat: THREE.Material,
  leafDarkMat: THREE.Material,
  leafTopMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const tree = new THREE.Group();
  tree.position.set(obs.x, 0, obs.z);

  const r = obs.radius;
  const h = obs.height;

  // Root flare
  const rootGeo = new THREE.CylinderGeometry(r * 0.42, r * 0.78, 0.9, 7);
  const roots = new THREE.Mesh(rootGeo, barkMat);
  roots.position.y = 0.45;
  roots.castShadow = true;
  roots.receiveShadow = true;
  tree.add(roots);

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(r * 0.28, r * 0.44, h * 0.55, 7);
  const trunk = new THREE.Mesh(trunkGeo, barkMat);
  trunk.position.y = h * 0.28;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  // 3-tier stylized canopy
  const tier1Geo = new THREE.DodecahedronGeometry(r * 1.45, 1);
  const tier1 = new THREE.Mesh(tier1Geo, leafDarkMat);
  tier1.position.set(0, h * 0.56, 0);
  tier1.scale.set(1.15, 0.75, 1.15);
  tier1.castShadow = true;
  tier1.receiveShadow = true;
  tree.add(tier1);

  const tier2Geo = new THREE.DodecahedronGeometry(r * 1.15, 1);
  const tier2 = new THREE.Mesh(tier2Geo, leafTopMat);
  tier2.position.set(0.2, h * 0.76, -0.15);
  tier2.scale.set(1.05, 0.8, 1.05);
  tier2.castShadow = true;
  tier2.receiveShadow = true;
  tree.add(tier2);

  const tier3Geo = new THREE.DodecahedronGeometry(r * 0.75, 1);
  const tier3 = new THREE.Mesh(tier3Geo, leafTopMat);
  tier3.position.set(-0.1, h * 0.92, 0.1);
  tier3.castShadow = true;
  tree.add(tier3);

  disposables.push(rootGeo, trunkGeo, tier1Geo, tier2Geo, tier3Geo);
  return tree;
}

function buildCompositeRock(
  obs: Obstacle,
  rockMat: THREE.Material,
  mossMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const rock = new THREE.Group();
  rock.position.set(obs.x, 0, obs.z);
  const r = obs.radius;

  const mainGeo = new THREE.DodecahedronGeometry(r * 0.95, 0);
  const main = new THREE.Mesh(mainGeo, rockMat);
  main.position.y = obs.height * 0.42;
  main.scale.set(1.05, 0.9, 1.0);
  main.rotation.set(0.2, 0.7, 0.1);
  main.castShadow = true;
  main.receiveShadow = true;
  rock.add(main);

  const subGeo1 = new THREE.DodecahedronGeometry(r * 0.62, 0);
  const sub1 = new THREE.Mesh(subGeo1, rockMat);
  sub1.position.set(r * 0.52, obs.height * 0.25, r * 0.22);
  sub1.rotation.set(0.5, 1.1, 0);
  sub1.castShadow = true;
  sub1.receiveShadow = true;
  rock.add(sub1);

  const mossGeo = new THREE.DodecahedronGeometry(r * 0.56, 0);
  const moss = new THREE.Mesh(mossGeo, mossMat);
  moss.position.set(-r * 0.3, obs.height * 0.36, -r * 0.25);
  moss.scale.set(1.1, 0.65, 1.0);
  moss.castShadow = true;
  moss.receiveShadow = true;
  rock.add(moss);

  disposables.push(mainGeo, subGeo1, mossGeo);
  return rock;
}

function buildCompositeWall(
  obs: Obstacle,
  wallMat: THREE.Material,
  trimMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const wall = new THREE.Group();
  wall.position.set(obs.x, 0, obs.z);

  const w = (obs.halfW ?? 1) * 2;
  const d = (obs.halfD ?? 1) * 2;
  const h = obs.height;

  // Plinth base
  const plinthGeo = new THREE.BoxGeometry(w + 0.22, 0.45, d + 0.22);
  const plinth = new THREE.Mesh(plinthGeo, trimMat);
  plinth.position.y = 0.225;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  wall.add(plinth);

  // Main wall block
  const bodyGeo = new THREE.BoxGeometry(w, h - 0.6, d);
  const body = new THREE.Mesh(bodyGeo, wallMat);
  body.position.y = 0.45 + (h - 0.6) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  wall.add(body);

  // Battlement cap
  const capGeo = new THREE.BoxGeometry(w + 0.16, 0.3, d + 0.16);
  const cap = new THREE.Mesh(capGeo, trimMat);
  cap.position.y = h - 0.05;
  cap.castShadow = true;
  cap.receiveShadow = true;
  wall.add(cap);

  // End columns
  const colSize = Math.min(w, d) * 0.72;
  const colGeo = new THREE.BoxGeometry(colSize, h + 0.35, colSize);
  const isHoriz = w >= d;
  const offset = (isHoriz ? w : d) * 0.42;
  const col1 = new THREE.Mesh(colGeo, trimMat);
  col1.position.set(isHoriz ? -offset : 0, (h + 0.35) / 2, isHoriz ? 0 : -offset);
  col1.castShadow = true;
  const col2 = new THREE.Mesh(colGeo, trimMat);
  col2.position.set(isHoriz ? offset : 0, (h + 0.35) / 2, isHoriz ? 0 : offset);
  col2.castShadow = true;
  wall.add(col1, col2);

  disposables.push(plinthGeo, bodyGeo, capGeo, colGeo);
  return wall;
}

function buildCompositeBush(
  bush: BushZone,
  baseMat: THREE.Material,
  tipMat: THREE.Material,
  highlightMat: THREE.Material,
  disposables: Array<{ dispose: () => void }>
): THREE.Group {
  const bushGroup = new THREE.Group();
  bushGroup.position.set(bush.x, 0, bush.z);

  const r = bush.radius;

  // Soft ground boundary indicator ring for clarity
  const ringGeo = new THREE.RingGeometry(r * 0.9, r * 1.0, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x3da86b,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = 0.03;
  bushGroup.add(ringMesh);
  disposables.push(ringGeo, ringMat);

  // Cluster of 7 stylized foliage tufts pivoted at bottom
  const tuftGeo = new THREE.DodecahedronGeometry(r * 0.44, 0);
  disposables.push(tuftGeo);

  for (let i = 0; i < 7; i++) {
    const isCenter = i === 0;
    const ang = (i / 6) * Math.PI * 2;
    const dist = isCenter ? 0 : r * 0.52;
    const mat = isCenter ? highlightMat : i % 2 === 0 ? tipMat : baseMat;
    const tuft = new THREE.Mesh(tuftGeo, mat);
    tuft.position.set(Math.cos(ang) * dist, isCenter ? 0.52 : 0.38, Math.sin(ang) * dist);
    const sc = isCenter ? 1.18 : 0.86 + (i % 3) * 0.08;
    tuft.scale.set(sc, sc * 0.85, sc);
    tuft.rotation.y = ang;
    tuft.castShadow = true;
    tuft.receiveShadow = true;
    bushGroup.add(tuft);
  }

  return bushGroup;
}
