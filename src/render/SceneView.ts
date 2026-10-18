import * as THREE from 'three';
import { Vector2 } from '../physics/Vector2';
import { MaterialType, MATERIALS } from '../physics/Materials';
import { Node, Strut, stepSimulation } from '../physics/PBD';
import { createStrutMesh, updateStrutColor, ParticleSystem } from './StrutMesh';
import { VehicleMesh } from './VehicleMesh';
import { GameLoop, GameStatus } from '../game/GameLoop';

export interface SceneConfig {
  container: HTMLElement;
  onStatusChange?: (status: GameStatus) => void;
  onStatsChange?: (stats: { nodeCount: number; strutCount: number; cost: number }) => void;
}

export class SceneView {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Z = 0 plane

  // Physics elements
  public nodes: Map<string, Node> = new Map();
  public struts: Strut[] = [];
  private initialNodePositions: Map<string, Vector2> = new Map();
  private brokenStrutIds: Set<string> = new Set();

  // Rendering elements
  private nodeMeshes: Map<string, THREE.Mesh> = new Map();
  private strutMeshes: Map<string, THREE.Mesh> = new Map();
  private ghostStrutMesh!: THREE.Mesh;
  private particleSystem!: ParticleSystem;
  private vehicleMesh!: VehicleMesh;
  private gridHelper!: THREE.GridHelper;

  // Interaction & Game state
  public gameLoop: GameLoop;
  private isPointerDown = false;
  private activeStartNode: Node | null = null;
  public activeMaterial: MaterialType = 'road';
  private onStatusChange?: (status: GameStatus) => void;
  private onStatsChange?: (stats: { nodeCount: number; strutCount: number; cost: number }) => void;

  constructor(config: SceneConfig) {
    this.container = config.container;
    this.onStatusChange = config.onStatusChange;
    this.onStatsChange = config.onStatsChange;

    this.gameLoop = new GameLoop({
      onStatusChange: (status) => this.onStatusChange?.(status),
    });

    this.initScene();
    this.initDefaultAnchors();
    this.setupEventListeners();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
    this.emitStats();
  }

  private initScene(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;

    const viewHeight = 7;
    const viewWidth = viewHeight * aspect;

    this.camera = new THREE.OrthographicCamera(
      -viewWidth / 2,
      viewWidth / 2,
      viewHeight / 2,
      -viewHeight / 2,
      0.1,
      1000
    );
    this.camera.position.set(3.5, 1.5, 20);
    this.camera.lookAt(3.5, 1.5, 0);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181e2b);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(5, 10, 15);
    this.scene.add(dirLight);

    // 1.0m Construction Grid
    this.buildGrid();

    // Environment
    this.buildCliffsAndWater();

    // Vehicle 3D Mesh
    this.vehicleMesh = new VehicleMesh();
    this.scene.add(this.vehicleMesh.group);

    // Particle system for splinter effects
    this.particleSystem = new ParticleSystem(this.scene);

    // Ghost strut for dragging preview
    const ghostGeom = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      wireframe: true,
    });
    this.ghostStrutMesh = new THREE.Mesh(ghostGeom, ghostMat);
    this.ghostStrutMesh.visible = false;
    this.scene.add(this.ghostStrutMesh);
  }

  private buildGrid(): void {
    // 20m x 10m grid with 1.0m spacing on Z = -0.05 (just behind bridge plane)
    this.gridHelper = new THREE.GridHelper(20, 20, 0x38bdf8, 0x1e293b);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.position.set(3.5, 1.5, -0.05);
    this.scene.add(this.gridHelper);
  }

  private buildCliffsAndWater(): void {
    const cliffMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
    });
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.6,
    });

    // Left Cliff (X <= 0)
    const leftCliffGeom = new THREE.BoxGeometry(6, 6, 2);
    const leftCliff = new THREE.Mesh(leftCliffGeom, cliffMat);
    leftCliff.position.set(-3, 0, 0);
    this.scene.add(leftCliff);

    const leftGrassGeom = new THREE.BoxGeometry(6, 0.3, 2.2);
    const leftGrass = new THREE.Mesh(leftGrassGeom, grassMat);
    leftGrass.position.set(-3, 2.15, 0);
    this.scene.add(leftGrass);

    // Right Cliff (X >= 7)
    const rightCliffGeom = new THREE.BoxGeometry(6, 6, 2);
    const rightCliff = new THREE.Mesh(rightCliffGeom, cliffMat);
    rightCliff.position.set(10, 0, 0);
    this.scene.add(rightCliff);

    const rightGrassGeom = new THREE.BoxGeometry(6, 0.3, 2.2);
    const rightGrass = new THREE.Mesh(rightGrassGeom, grassMat);
    rightGrass.position.set(10, 2.15, 0);
    this.scene.add(rightGrass);

    // River / Water plane
    const waterGeom = new THREE.PlaneGeometry(30, 8);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.8,
    });
    const water = new THREE.Mesh(waterGeom, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(3.5, -1.5, 0);
    this.scene.add(water);
  }

  private initDefaultAnchors(): void {
    const anchors: Node[] = [
      // Approach road node on left cliff
      { id: 'anchor_approach_L', pos: new Vector2(-2.5, 2.0), prevPos: new Vector2(-2.5, 2.0), isAnchor: true, mass: 1000 },
      // Left cliff edge anchors
      { id: 'anchor_L1', pos: new Vector2(0, 2.0), prevPos: new Vector2(0, 2.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_L2', pos: new Vector2(0, 0.5), prevPos: new Vector2(0, 0.5), isAnchor: true, mass: 1000 },
      // Right cliff edge anchors
      { id: 'anchor_R1', pos: new Vector2(7, 2.0), prevPos: new Vector2(7, 2.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_R2', pos: new Vector2(7, 0.5), prevPos: new Vector2(7, 0.5), isAnchor: true, mass: 1000 },
      // Landing road node on right cliff
      { id: 'anchor_landing_R', pos: new Vector2(9.5, 2.0), prevPos: new Vector2(9.5, 2.0), isAnchor: true, mass: 1000 },
    ];

    for (const a of anchors) {
      this.nodes.set(a.id, a);
      this.initialNodePositions.set(a.id, a.pos.clone());
      this.createNodeMesh(a);
    }

    // Connect approach road on left cliff and landing on right cliff
    this.addStrut(this.nodes.get('anchor_approach_L')!, this.nodes.get('anchor_L1')!, 'road');
    this.addStrut(this.nodes.get('anchor_R1')!, this.nodes.get('anchor_landing_R')!, 'road');
  }

  private createNodeMesh(node: Node): THREE.Mesh {
    const geom = new THREE.SphereGeometry(node.isAnchor ? 0.14 : 0.1, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: node.isAnchor ? 0xf59e0b : 0xe2e8f0,
      metalness: 0.3,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(node.pos.x, node.pos.y, 0);
    this.scene.add(mesh);
    this.nodeMeshes.set(node.id, mesh);
    return mesh;
  }

  private addStrutMesh(strut: Strut): THREE.Mesh {
    const mesh = createStrutMesh(strut);
    this.scene.add(mesh);
    this.strutMeshes.set(strut.id, mesh);
    this.updateSingleStrutMesh(strut);
    return mesh;
  }

  private updateSingleStrutMesh(strut: Strut): void {
    const nodeA = this.nodes.get(strut.nodeAId);
    const nodeB = this.nodes.get(strut.nodeBId);
    const mesh = this.strutMeshes.get(strut.id);
    if (!nodeA || !nodeB || !mesh) return;

    if (strut.isBroken) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    const pA = new THREE.Vector3(nodeA.pos.x, nodeA.pos.y, 0);
    const pB = new THREE.Vector3(nodeB.pos.x, nodeB.pos.y, 0);
    const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(pB, pA);
    const len = dir.length();

    mesh.position.copy(mid);
    mesh.scale.set(1, Math.max(len, 0.001), 1);

    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());

    if (this.gameLoop.status === 'simulating' && strut.stress !== undefined) {
      updateStrutColor(mesh, strut.stress);
    }
  }

  public addStrut(nodeA: Node, nodeB: Node, material: MaterialType = this.activeMaterial): Strut | null {
    const exists = this.struts.some(
      s => (s.nodeAId === nodeA.id && s.nodeBId === nodeB.id) ||
           (s.nodeAId === nodeB.id && s.nodeBId === nodeA.id)
    );
    if (exists) return null;

    const length = nodeA.pos.distanceTo(nodeB.pos);
    const matProps = MATERIALS[material];

    if (length > matProps.maxLength) {
      return null;
    }

    const strut: Strut = {
      id: `strut_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nodeAId: nodeA.id,
      nodeBId: nodeB.id,
      material,
      restLength: length,
      currentLength: length,
      stress: 0,
      isBroken: false,
    };

    this.struts.push(strut);
    this.addStrutMesh(strut);
    this.emitStats();
    return strut;
  }

  public calculateTotalCost(): number {
    let cost = 0;
    for (const s of this.struts) {
      // Don't charge for fixed approach roads
      if (s.nodeAId.includes('approach') || s.nodeBId.includes('landing')) continue;
      const mat = MATERIALS[s.material];
      cost += s.restLength * mat.costPerMeter;
    }
    return Math.round(cost);
  }

  private emitStats(): void {
    const userStruts = this.struts.filter(s => !s.nodeAId.includes('approach') && !s.nodeBId.includes('landing'));
    this.onStatsChange?.({
      nodeCount: this.nodes.size,
      strutCount: userStruts.filter(s => !s.isBroken).length,
      cost: this.calculateTotalCost(),
    });
  }

  private findNearestNode(worldPos: Vector2, maxRadius = 0.4): Node | null {
    let nearest: Node | null = null;
    let minDist = maxRadius;

    for (const node of this.nodes.values()) {
      const dist = node.pos.distanceTo(worldPos);
      if (dist < minDist) {
        minDist = dist;
        nearest = node;
      }
    }
    return nearest;
  }

  // Snaps to 0.5m grid
  private snapToGrid(pos: Vector2): Vector2 {
    return new Vector2(
      Math.round(pos.x * 2) / 2,
      Math.round(pos.y * 2) / 2
    );
  }

  private getPlaneIntersection(event: PointerEvent): Vector2 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
    if (hit) {
      return new Vector2(hit.x, hit.y);
    }
    return null;
  }

  private setupEventListeners(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('pointerdown', (e) => {
      if (this.gameLoop.status === 'simulating') return;
      const worldPos = this.getPlaneIntersection(e);
      if (!worldPos) return;

      const nearest = this.findNearestNode(worldPos, 0.5);
      if (nearest) {
        this.isPointerDown = true;
        this.activeStartNode = nearest;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isPointerDown || !this.activeStartNode || this.gameLoop.status === 'simulating') return;
      const rawPos = this.getPlaneIntersection(e);
      if (!rawPos) return;

      // Snap preview to existing node if nearby, otherwise snap to 0.5m grid
      const nearestNode = this.findNearestNode(rawPos, 0.4);
      const targetPos = nearestNode ? nearestNode.pos : this.snapToGrid(rawPos);

      const matProps = MATERIALS[this.activeMaterial];
      const pA = new THREE.Vector3(this.activeStartNode.pos.x, this.activeStartNode.pos.y, 0);
      const pB = new THREE.Vector3(targetPos.x, targetPos.y, 0);
      const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(pB, pA);
      const len = dir.length();

      this.ghostStrutMesh.position.copy(mid);
      this.ghostStrutMesh.scale.set(1, Math.max(len, 0.001), 1);
      this.ghostStrutMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

      const ghostMat = this.ghostStrutMesh.material as THREE.MeshBasicMaterial;
      if (len > matProps.maxLength) {
        ghostMat.color.setHex(0xef4444);
      } else {
        ghostMat.color.setHex(this.activeMaterial === 'road' ? 0x38bdf8 : 0xf59e0b);
      }

      this.ghostStrutMesh.visible = true;
    });

    window.addEventListener('pointerup', (e) => {
      if (!this.isPointerDown || !this.activeStartNode || this.gameLoop.status === 'simulating') {
        this.isPointerDown = false;
        this.activeStartNode = null;
        this.ghostStrutMesh.visible = false;
        return;
      }

      this.isPointerDown = false;
      this.ghostStrutMesh.visible = false;

      const rawPos = this.getPlaneIntersection(e);
      if (!rawPos) {
        this.activeStartNode = null;
        return;
      }

      let endNode = this.findNearestNode(rawPos, 0.4);
      const matProps = MATERIALS[this.activeMaterial];

      if (!endNode) {
        const snappedPos = this.snapToGrid(rawPos);
        const dist = this.activeStartNode.pos.distanceTo(snappedPos);
        if (dist > 0.3 && dist <= matProps.maxLength) {
          const newNodeId = `node_${Date.now()}`;
          endNode = {
            id: newNodeId,
            pos: snappedPos.clone(),
            prevPos: snappedPos.clone(),
            isAnchor: false,
            mass: 15,
          };
          this.nodes.set(endNode.id, endNode);
          this.initialNodePositions.set(endNode.id, endNode.pos.clone());
          this.createNodeMesh(endNode);
        }
      }

      if (endNode && endNode.id !== this.activeStartNode.id) {
        this.addStrut(this.activeStartNode, endNode, this.activeMaterial);
      }

      this.activeStartNode = null;
    });

    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const aspect = width / height;
      const viewHeight = 7;
      const viewWidth = viewHeight * aspect;

      this.camera.left = -viewWidth / 2;
      this.camera.right = viewWidth / 2;
      this.camera.top = viewHeight / 2;
      this.camera.bottom = -viewHeight / 2;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);
    });
  }

  public setMaterial(material: MaterialType): void {
    this.activeMaterial = material;
  }

  public toggleSimulation(): boolean {
    if (this.gameLoop.status === 'building') {
      this.brokenStrutIds.clear();
      for (const [id, node] of this.nodes) {
        this.initialNodePositions.set(id, node.pos.clone());
        node.prevPos.copy(node.pos);
      }
      for (const s of this.struts) {
        s.isBroken = false;
        s.stress = 0;
      }
      this.gameLoop.startSimulation(-1.5, 2.3, 7.5);
      this.vehicleMesh.setVisible(true);
      return true;
    } else {
      this.resetSimulation();
      return false;
    }
  }

  public resetSimulation(): void {
    this.gameLoop.reset();
    this.vehicleMesh.setVisible(false);
    this.particleSystem.clear();

    for (const [id, initialPos] of this.initialNodePositions) {
      const node = this.nodes.get(id);
      if (node) {
        node.pos.copy(initialPos);
        node.prevPos.copy(initialPos);
      }
    }

    for (const s of this.struts) {
      s.isBroken = false;
      s.stress = 0;
      const mesh = this.strutMeshes.get(s.id);
      if (mesh) {
        mesh.visible = true;
        const isRoad = s.material === 'road';
        (mesh.material as THREE.MeshStandardMaterial).color.setHex(isRoad ? 0x475569 : 0xca8a04);
      }
    }

    this.syncMeshes();
  }

  private stepPhysics(dt: number): void {
    stepSimulation(this.nodes, this.struts, 15, dt);

    // Update vehicle simulation and wheel interactions
    const roadStruts = this.struts.filter(s => s.material === 'road');
    this.gameLoop.update(roadStruts, this.nodes, dt);

    if (this.gameLoop.vehicle) {
      this.vehicleMesh.update(this.gameLoop.vehicle, dt);
    }

    // Check for newly broken struts to trigger splinter particles
    for (const strut of this.struts) {
      if (strut.isBroken && !this.brokenStrutIds.has(strut.id)) {
        this.brokenStrutIds.add(strut.id);
        const nodeA = this.nodes.get(strut.nodeAId);
        const nodeB = this.nodes.get(strut.nodeBId);
        if (nodeA && nodeB) {
          const mid = new THREE.Vector3(
            (nodeA.pos.x + nodeB.pos.x) * 0.5,
            (nodeA.pos.y + nodeB.pos.y) * 0.5,
            0
          );
          this.particleSystem.spawnSplinters(mid, 14, strut.material);
        }
      }
    }

    this.particleSystem.update(dt);
    this.syncMeshes();
  }

  private syncMeshes(): void {
    for (const [id, node] of this.nodes) {
      const mesh = this.nodeMeshes.get(id);
      if (mesh) {
        mesh.position.set(node.pos.x, node.pos.y, 0);
      }
    }
    for (const strut of this.struts) {
      this.updateSingleStrutMesh(strut);
    }
  }

  private animate(): void {
    requestAnimationFrame(this.animate);
    if (this.gameLoop.status === 'simulating') {
      this.stepPhysics(1 / 60);
    } else {
      this.particleSystem.update(1 / 60);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
