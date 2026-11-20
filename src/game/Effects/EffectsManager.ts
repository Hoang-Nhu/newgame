import * as THREE from 'three';

interface ActiveVFX {
  mesh: THREE.Object3D;
  age: number;
  lifetime: number;
  update: (dt: number, progress: number) => void;
  dispose: () => void;
}

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
  gravity: number;
  startScale: number;
  endScale: number;
  mat: THREE.MeshBasicMaterial;
}

export class EffectsManager {
  public readonly group = new THREE.Group();
  private vfxList: ActiveVFX[] = [];
  private particles: Particle[] = [];
  public cameraShake = 0;

  // Shared particle geometries
  private sphereGeo = new THREE.SphereGeometry(0.18, 6, 6);
  private boxGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
  private leafGeo = new THREE.BoxGeometry(0.22, 0.05, 0.14);

  public addShake(amount: number): void {
    this.cameraShake = Math.min(1.6, Math.max(this.cameraShake, amount));
  }

  /**
   * Bold circular ground warning telegraph before skill activation.
   */
  public spawnCircleTelegraph(
    x: number,
    z: number,
    radius: number,
    color: number,
    duration: number
  ): void {
    const container = new THREE.Group();
    container.position.set(x, 0.04, z);

    const outerGeo = new THREE.RingGeometry(radius * 0.92, radius, 40);
    outerGeo.rotateX(-Math.PI / 2);
    const outerMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outer = new THREE.Mesh(outerGeo, outerMat);

    const fillGeo = new THREE.CircleGeometry(radius * 0.94, 40);
    fillGeo.rotateX(-Math.PI / 2);
    const fillMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.scale.setScalar(0.05);

    container.add(outer, fill);
    this.group.add(container);

    this.vfxList.push({
      mesh: container,
      age: 0,
      lifetime: duration,
      update: (_dt, p) => {
        fill.scale.setScalar(0.05 + p * 0.95);
        outerMat.opacity = 0.75 + Math.sin(p * Math.PI * 6) * 0.25;
        fillMat.opacity = 0.18 + p * 0.28;
      },
      dispose: () => {
        outerGeo.dispose();
        outerMat.dispose();
        fillGeo.dispose();
        fillMat.dispose();
      },
    });
  }

  /**
   * Bold rectangular line/corridor ground warning telegraph before dash/cleave/piercing shot.
   */
  public spawnLineTelegraph(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    length: number,
    width: number,
    color: number,
    duration: number
  ): void {
    const container = new THREE.Group();
    container.position.set(x, 0.045, z);
    container.rotation.y = Math.atan2(dirX, dirZ);

    const bgGeo = new THREE.PlaneGeometry(width, length);
    bgGeo.rotateX(-Math.PI / 2);
    bgGeo.translate(0, 0, length / 2);
    const bgMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const bg = new THREE.Mesh(bgGeo, bgMat);

    const fillGeo = new THREE.PlaneGeometry(width * 0.92, length);
    fillGeo.rotateX(-Math.PI / 2);
    fillGeo.translate(0, 0.005, length / 2);
    const fillMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.scale.set(1, 1, 0.05);

    // Crisp side edge rails
    const railGeo = new THREE.PlaneGeometry(0.14, length);
    railGeo.rotateX(-Math.PI / 2);
    railGeo.translate(0, 0.01, length / 2);
    const railMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.x = -width / 2;
    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.x = width / 2;

    container.add(bg, fill, leftRail, rightRail);
    this.group.add(container);

    this.vfxList.push({
      mesh: container,
      age: 0,
      lifetime: duration,
      update: (_dt, p) => {
        fill.scale.set(1, 1, Math.max(0.05, p));
      },
      dispose: () => {
        bgGeo.dispose();
        bgMat.dispose();
        fillGeo.dispose();
        fillMat.dispose();
        railGeo.dispose();
        railMat.dispose();
      },
    });
  }

  /**
   * Expanding HDR shockwave ring on the ground.
   */
  public spawnShockwave(
    x: number,
    z: number,
    maxRadius: number,
    color: number,
    duration = 0.45,
    thickness = 0.28
  ): void {
    const geo = new THREE.RingGeometry(1 - thickness, 1, 36);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.08, z);
    mesh.scale.setScalar(0.2);
    this.group.add(mesh);

    this.vfxList.push({
      mesh,
      age: 0,
      lifetime: duration,
      update: (_dt, p) => {
        const ease = 1 - Math.pow(1 - p, 2);
        mesh.scale.setScalar(Math.max(0.15, ease * maxRadius));
        mat.opacity = 1 - p;
      },
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /**
   * Bold melee crescent slash wave.
   */
  public spawnSlashArc(
    x: number,
    z: number,
    angle: number,
    radius: number,
    color: number,
    duration = 0.28,
    tiltZ = 0,
    arcSpan = Math.PI * 0.9
  ): void {
    const geo = new THREE.RingGeometry(radius * 0.42, radius, 26, 1, -arcSpan / 2, arcSpan);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const container = new THREE.Group();
    container.position.set(x, 0.9, z);
    container.rotation.y = angle - Math.PI / 2;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = tiltZ;
    container.add(mesh);
    this.group.add(container);

    this.vfxList.push({
      mesh: container,
      age: 0,
      lifetime: duration,
      update: (_dt, p) => {
        container.scale.setScalar(0.78 + p * 0.48);
        mat.opacity = 1 - p * p;
      },
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /**
   * Sword Master Whirlwind spinning ring.
   */
  public spawnWhirlwindVFX(ownerX: number, ownerZ: number, radius: number, duration: number): void {
    const container = new THREE.Group();
    container.position.set(ownerX, 0.75, ownerZ);

    const ringGeo = new THREE.RingGeometry(radius * 0.55, radius, 32, 1, 0, Math.PI * 1.65);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff5722,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    const groundGeo = new THREE.RingGeometry(radius * 0.88, radius * 1.0, 32);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({
      color: 0xff2e54,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.68;

    container.add(ring, ground);
    this.group.add(container);

    this.vfxList.push({
      mesh: container,
      age: 0,
      lifetime: duration,
      update: (dt, p) => {
        ring.rotation.y += dt * 16;
        ringMat.opacity = (1 - p * 0.35) * 0.9;
        groundMat.opacity = (1 - p) * 0.75;
      },
      dispose: () => {
        ringGeo.dispose();
        ringMat.dispose();
        groundGeo.dispose();
        groundMat.dispose();
      },
    });
  }

  /**
   * Sword Master Ultimate: Colossal Cross-Map Cleave Wave + 10s Glowing Lava Fissure!
   */
  public spawnCrossMapCleave(
    startX: number,
    startZ: number,
    dirX: number,
    dirZ: number,
    length: number,
    width: number
  ): void {
    const angle = Math.atan2(dirX, dirZ);

    // Sweeping giant HDR crescent energy blade traveling across the map
    const bladeGeo = new THREE.BoxGeometry(width * 1.25, 2.2, 0.75);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xff5a1f,
      emissive: new THREE.Color(0xff3b00),
      emissiveIntensity: 3.6,
      transparent: true,
      opacity: 0.95,
    });
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(startX, 1.15, startZ);
    blade.rotation.y = angle;
    this.group.add(blade);

    this.vfxList.push({
      mesh: blade,
      age: 0,
      lifetime: 0.55,
      update: (_dt, p) => {
        const dist = p * length;
        blade.position.set(startX + dirX * dist, 1.15, startZ + dirZ * dist);
        bladeMat.opacity = 1 - Math.pow(p, 3);
      },
      dispose: () => {
        bladeGeo.dispose();
        bladeMat.dispose();
      },
    });

    // Cracked Magma Fissure persisting for 10 seconds
    const fissureGroup = new THREE.Group();
    fissureGroup.position.set(startX, 0.035, startZ);
    fissureGroup.rotation.y = angle;

    const crustGeo = new THREE.PlaneGeometry(width * 1.05, length);
    crustGeo.rotateX(-Math.PI / 2);
    crustGeo.translate(0, 0, length / 2);
    const crustMat = new THREE.MeshBasicMaterial({
      color: 0x1a0805,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const crust = new THREE.Mesh(crustGeo, crustMat);

    const magmaGeo = new THREE.PlaneGeometry(width * 0.62, length * 0.96);
    magmaGeo.rotateX(-Math.PI / 2);
    magmaGeo.translate(0, 0.015, length / 2);
    const magmaMat = new THREE.MeshStandardMaterial({
      color: 0xff6a00,
      emissive: new THREE.Color(0xff3300),
      emissiveIntensity: 3.2,
      transparent: true,
      opacity: 0.95,
      roughness: 0.2,
    });
    const magma = new THREE.Mesh(magmaGeo, magmaMat);

    fissureGroup.add(crust, magma);
    this.group.add(fissureGroup);

    let emberAccum = 0;
    this.vfxList.push({
      mesh: fissureGroup,
      age: 0,
      lifetime: 10.0,
      update: (dt, p) => {
        const pulse = 2.6 + Math.sin(p * Math.PI * 22) * 0.7;
        magmaMat.emissiveIntensity = pulse;
        if (p > 0.85) {
          const fade = (1 - p) / 0.15;
          magmaMat.opacity = fade * 0.95;
          crustMat.opacity = fade * 0.88;
        }
        emberAccum += dt;
        if (emberAccum >= 0.09) {
          emberAccum = 0;
          const d = Math.random() * length;
          const side = (Math.random() - 0.5) * width * 0.7;
          const ex = startX + dirX * d - dirZ * side;
          const ez = startZ + dirZ * d + dirX * side;
          this.spawnBurst(ex, 0.15, ez, 0xff5500, 1, 1.8, 0.7, false);
        }
      },
      dispose: () => {
        crustGeo.dispose();
        crustMat.dispose();
        magmaGeo.dispose();
        magmaMat.dispose();
      },
    });

    this.addShake(0.85);
  }

  /**
   * Mage Ultimate: Meteor Descent -> Impact Shockwave, Crater, and Rising Smoke!
   */
  public spawnMeteorImpact(x: number, z: number, radius: number, fallTime: number): void {
    const meteorGeo = new THREE.DodecahedronGeometry(1.35, 1);
    const meteorMat = new THREE.MeshStandardMaterial({
      color: 0xff4500,
      emissive: new THREE.Color(0xff2200),
      emissiveIntensity: 3.5,
      roughness: 0.35,
    });
    const meteor = new THREE.Mesh(meteorGeo, meteorMat);
    meteor.position.set(x + 4, 24, z - 4);
    this.group.add(meteor);

    let impacted = false;
    this.vfxList.push({
      mesh: meteor,
      age: 0,
      lifetime: fallTime + 0.1,
      update: (dt, p) => {
        const t = Math.min(1, p);
        meteor.position.set(
          THREE.MathUtils.lerp(x + 4.5, x, t),
          THREE.MathUtils.lerp(24, 0.8, t * t),
          THREE.MathUtils.lerp(z - 4.5, z, t)
        );
        meteor.rotation.x += dt * 7;
        meteor.rotation.z += dt * 5;
        this.spawnBurst(meteor.position.x, meteor.position.y, meteor.position.z, 0xff6a00, 1, 2.2, 0.35, false);

        if (t >= 0.96 && !impacted) {
          impacted = true;
          this.spawnShockwave(x, z, radius * 1.25, 0xff3b1f, 0.65, 0.35);
          this.spawnShockwave(x, z, radius * 0.85, 0xffb300, 0.45, 0.4);
          this.spawnBurst(x, 0.4, z, 0xff4500, 22, 11.5, 0.85, true);
          this.spawnSmokePlume(x, z, radius * 0.75);
          this.spawnScorchedCrater(x, z, radius * 0.88);
          this.addShake(1.1);
        }
      },
      dispose: () => {
        meteorGeo.dispose();
        meteorMat.dispose();
      },
    });
  }

  private spawnSmokePlume(x: number, z: number, spread: number): void {
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x262930,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * spread * 0.6;
      mesh.position.set(x + Math.cos(ang) * dist, 0.3, z + Math.sin(ang) * dist);
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * 1.8,
        vy: 2.2 + Math.random() * 2.8,
        vz: Math.sin(ang) * 1.8,
        age: 0,
        lifetime: 1.4 + Math.random() * 0.6,
        gravity: -0.6, // rises upward
        startScale: 2.4,
        endScale: 5.5,
        mat,
      });
    }
  }

  private spawnScorchedCrater(x: number, z: number, radius: number): void {
    const geo = new THREE.CircleGeometry(radius, 28);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x160a06,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.03, z);
    this.group.add(mesh);

    this.vfxList.push({
      mesh,
      age: 0,
      lifetime: 3.5,
      update: (_dt, p) => {
        if (p > 0.6) {
          mat.opacity = ((1 - p) / 0.4) * 0.78;
        }
      },
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /**
   * Archer Ultimate: Sky arrows raining down across a circular arena zone.
   */
  public spawnArrowRainImpact(x: number, z: number, radius: number): void {
    this.spawnShockwave(x, z, radius, 0x00ffd5, 0.55, 0.2);
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const ax = x + Math.cos(ang) * dist;
      const az = z + Math.sin(ang) * dist;
      this.spawnFallingArrow(ax, az, 0x22d3ee, i * 0.025);
    }
  }

  private spawnFallingArrow(x: number, z: number, color: number, delay: number): void {
    const geo = new THREE.CylinderGeometry(0.05, 0.09, 1.5, 6);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 12, z);
    mesh.visible = false;
    this.group.add(mesh);

    let burstDone = false;
    this.vfxList.push({
      mesh,
      age: -delay,
      lifetime: 0.35,
      update: (_dt, p) => {
        if (p < 0) return;
        mesh.visible = true;
        mesh.position.y = THREE.MathUtils.lerp(11, 0.3, p);
        if (p > 0.85 && !burstDone) {
          burstDone = true;
          this.spawnBurst(x, 0.25, z, color, 3, 4.5, 0.3, false);
        }
      },
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /**
   * Support / Tank / Specialist vertical beam pillar & ground lotus mandala.
   */
  public spawnSanctuaryBeam(x: number, z: number, radius: number, color: number, duration = 0.9): void {
    const container = new THREE.Group();
    container.position.set(x, 0, z);

    const beamGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 0.85, 7.5, 20, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 3.75;

    const ringGeo = new THREE.RingGeometry(radius * 0.75, radius, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.06;

    container.add(beam, ring);
    this.group.add(container);

    this.vfxList.push({
      mesh: container,
      age: 0,
      lifetime: duration,
      update: (_dt, p) => {
        beam.scale.set(1 + p * 0.25, 1, 1 + p * 0.25);
        beamMat.opacity = (1 - p) * 0.45;
        ringMat.opacity = 1 - p;
        ring.scale.setScalar(0.85 + p * 0.3);
      },
      dispose: () => {
        beamGeo.dispose();
        beamMat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
      },
    });
  }

  /**
   * Specialist Blink warp ring + streak.
   */
  public spawnBlinkWarp(x1: number, z1: number, x2: number, z2: number, color: number): void {
    this.spawnShockwave(x1, z1, 1.9, color, 0.35, 0.35);
    this.spawnShockwave(x2, z2, 2.2, color, 0.4, 0.35);
    this.spawnBurst(x1, 0.9, z1, color, 8, 5, 0.4, false);
    this.spawnBurst(x2, 0.9, z2, color, 10, 6, 0.45, false);

    // Connecting void flash beam
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len > 0.2) {
      const geo = new THREE.BoxGeometry(0.32, 0.32, len);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const beam = new THREE.Mesh(geo, mat);
      beam.position.set((x1 + x2) / 2, 0.9, (z1 + z2) / 2);
      beam.rotation.y = Math.atan2(dx, dz);
      this.group.add(beam);

      this.vfxList.push({
        mesh: beam,
        age: 0,
        lifetime: 0.25,
        update: (_dt, p) => {
          mat.opacity = (1 - p) * 0.85;
          beam.scale.x = 1 - p * 0.8;
        },
        dispose: () => {
          geo.dispose();
          mat.dispose();
        },
      });
    }
  }

  /**
   * Generic burst particles for impacts, frost shatters, bush leaves, or KO bursts.
   */
  public spawnBurst(
    x: number,
    y: number,
    z: number,
    color: number,
    count = 10,
    speed = 6,
    lifetime = 0.55,
    useGravity = true,
    isLeaf = false
  ): void {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(isLeaf ? this.leafGeo : this.boxGeo, mat);
      mesh.position.set(x, y, z);
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.35 + Math.random() * 0.75) * speed;
      this.group.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: (0.4 + Math.random() * 0.9) * speed * 0.55,
        vz: Math.sin(ang) * spd,
        age: 0,
        lifetime: lifetime * (0.75 + Math.random() * 0.5),
        gravity: useGravity ? 14 : 2,
        startScale: isLeaf ? 1.15 : 1.0,
        endScale: 0.1,
        mat,
      });
    }
  }

  public update(dt: number): void {
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2.8);
    }

    for (let i = this.vfxList.length - 1; i >= 0; i--) {
      const v = this.vfxList[i];
      v.age += dt;
      const p = v.age / v.lifetime;
      if (v.age >= v.lifetime) {
        this.group.remove(v.mesh);
        v.dispose();
        this.vfxList.splice(i, 1);
      } else {
        v.update(dt, p);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.age += dt;
      if (pt.age >= pt.lifetime) {
        this.group.remove(pt.mesh);
        pt.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      const p = pt.age / pt.lifetime;
      pt.vy -= pt.gravity * dt;
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y = Math.max(0.05, pt.mesh.position.y + pt.vy * dt);
      pt.mesh.position.z += pt.vz * dt;
      pt.mesh.rotation.x += dt * 6;
      pt.mesh.rotation.y += dt * 5;
      const sc = THREE.MathUtils.lerp(pt.startScale, pt.endScale, p);
      pt.mesh.scale.setScalar(sc);
      pt.mat.opacity = 1 - p;
    }
  }

  public clear(): void {
    this.vfxList.forEach((v) => {
      this.group.remove(v.mesh);
      v.dispose();
    });
    this.vfxList = [];
    this.particles.forEach((pt) => {
      this.group.remove(pt.mesh);
      pt.mat.dispose();
    });
    this.particles = [];
    this.cameraShake = 0;
  }

  public dispose(): void {
    this.clear();
    this.sphereGeo.dispose();
    this.boxGeo.dispose();
    this.leafGeo.dispose();
  }
}
