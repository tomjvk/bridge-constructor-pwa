import * as THREE from 'three';
import { MaterialType } from '../physics/Materials';
import { Strut } from '../physics/PBD';

const COLOR_LOW_STRESS = new THREE.Color(0x22c55e);    // Green #22c55e
const COLOR_MED_STRESS = new THREE.Color(0xeab308);    // Yellow #eab308
const COLOR_HIGH_STRESS = new THREE.Color(0xef4444);   // Red #ef4444

export function getStressColor(stressRatio: number): THREE.Color {
  const color = new THREE.Color();
  const clamped = Math.max(0, Math.min(stressRatio, 1.0));

  if (clamped < 0.4) {
    const t = clamped / 0.4;
    color.copy(COLOR_LOW_STRESS).lerp(COLOR_MED_STRESS, t * 0.5);
  } else if (clamped < 0.75) {
    const t = (clamped - 0.4) / 0.35;
    color.copy(COLOR_MED_STRESS).lerp(COLOR_HIGH_STRESS, t);
  } else {
    color.copy(COLOR_HIGH_STRESS);
  }

  return color;
}

export function updateStrutColor(mesh: THREE.Mesh, stressRatio: number): void {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (!mat) return;
  mat.color.copy(getStressColor(stressRatio));
}

export function createStrutMesh(strut: Strut): THREE.Mesh {
  const isRoad = strut.material === 'road';
  const radius = isRoad ? 0.07 : 0.045;
  const geom = new THREE.CylinderGeometry(radius, radius, 1, isRoad ? 8 : 6);
  
  const defaultColor = isRoad ? 0x475569 : 0xca8a04;
  const mat = new THREE.MeshStandardMaterial({
    color: defaultColor,
    roughness: isRoad ? 0.8 : 0.6,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawnSplinters(origin: THREE.Vector3, count = 12, material: MaterialType = 'wood'): void {
    const isWood = material === 'wood';
    const color = isWood ? 0xd97706 : 0x64748b;
    const geom = new THREE.BoxGeometry(0.04, 0.12, 0.04);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        transparent: true,
        opacity: 1.0,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(origin);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 2
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        life: 0,
        maxLife: 1.0 + Math.random() * 0.5,
      });
    }
  }

  public update(dt: number): void {
    const gravity = new THREE.Vector3(0, -9.81, 0);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }

      p.vel.addScaledVector(gravity, dt);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.vel.y * dt * 2;
      p.mesh.rotation.z += p.vel.x * dt * 2;

      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 1 - p.life / p.maxLife;
    }
  }

  public clear(): void {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
  }
}
