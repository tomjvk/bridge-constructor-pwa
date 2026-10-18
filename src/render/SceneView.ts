import * as THREE from 'three';
import { Vector2 } from '../physics/Vector2';
import { MaterialType, MATERIALS } from '../physics/Materials';
import { Node, Strut, stepSimulation } from '../physics/PBD';
import { createStrutMesh, updateStrutColor, ParticleSystem } from './StrutMesh';
import { VehicleMesh } from './VehicleMesh';
import { GameLoop, GameStatus } from '../game/GameLoop';
import { BuildManager } from '../game/BuildManager';
import { LevelDef, LEVELS } from '../game/LevelData';

export type ToolMode = MaterialType | 'eraser';

export interface SceneConfig {
  container: HTMLElement;
  level?: LevelDef;
  onStatusChange?: (status: GameStatus) => void;
  onStatsChange?: (stats: { spent: number; budget: number; strutCount: number; canUndo: boolean }) => void;
}

export class SceneView {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Z = 0 plane

  // Game & Build system
  public buildManager: BuildManager;
  public gameLoop: GameLoop;
  public activeTool: ToolMode = 'road';
  private initialNodePositions: Map<string, Vector2> = new Map();
  private brokenStrutIds: Set<string> = new Set();

  // Rendering elements
  private nodeMeshes: Map<string, THREE.Mesh> = new Map();
  private strutMeshes: Map<string, THREE.Mesh> = new Map();
  private terrainMeshes: THREE.Object3D[] = [];
  private ghostStrutMesh!: THREE.Mesh;
  private particleSystem!: ParticleSystem;
  private vehicleMesh!: VehicleMesh;
  private gridHelper!: THREE.GridHelper;

  // Interaction
  private isPointerDown = false;
  private activeStartNode: Node | null = null;
  private onStatusChange?: (status: GameStatus) => void;
  private onStatsChange?: (stats: { spent: number; budget: number; strutCount: number; canUndo: boolean }) => void;

  constructor(config: SceneConfig) {
    this.container = config.container;
    this.onStatusChange = config.onStatusChange;
    this.onStatsChange = config.onStatsChange;

    const initialLevel = config.level || LEVELS[0];
    this.buildManager = new BuildManager(initialLevel);

    this.gameLoop = new GameLoop({
      onStatusChange: (status) => this.onStatusChange?.(status),
    });

    this.initScene();
    this.loadLevel(initialLevel);
    this.setupEventListeners();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  private initScene(): void {
    const width = this.container.clientWidth || window.innerWidth || 800;
    const height = this.container.clientHeight || window.innerHeight || 600;
    const aspect = width / height;

    const viewHeight = 8.0;
    const viewWidth = viewHeight * aspect;

    this.camera = new THREE.OrthographicCamera(
      -viewWidth / 2,
      viewWidth / 2,
      viewHeight / 2,
      -viewHeight / 2,
      0.1,
      1000
    );
    this.camera.position.set(4.0, 1.5, 20);
    this.camera.lookAt(4.0, 1.5, 0);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111827);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 15);
    this.scene.add(dirLight);

    // 1.0m Construction Grid
    this.buildGrid();

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
      opacity: 0.7,
      wireframe: true,
    });
    this.ghostStrutMesh = new THREE.Mesh(ghostGeom, ghostMat);
    this.ghostStrutMesh.visible = false;
    this.scene.add(this.ghostStrutMesh);
  }

  private buildGrid(): void {
    this.gridHelper = new THREE.GridHelper(30, 30, 0x0284c7, 0x1e293b);
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.position.set(6.0, 1.5, -0.02);
    this.scene.add(this.gridHelper);
  }

  public loadLevel(level: LevelDef): void {
    this.resetSimulation();
    this.buildManager.loadLevel(level);

    // Center camera on level gap
    const midX = level.gapDistance * 0.5;
    const midY = (level.terrain.deckY || 2.0) * 0.8;
    this.camera.position.set(midX, midY, 20);
    this.camera.lookAt(midX, midY, 0);

    // Adjust camera view height for larger levels
    const aspect = (this.container.clientWidth || window.innerWidth) / (this.container.clientHeight || window.innerHeight);
    const viewHeight = Math.max(8.0, level.gapDistance * 0.65);
    const viewWidth = viewHeight * aspect;
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();

    // Clear old visual meshes
    this.clearLevelMeshes();
    this.initialNodePositions.clear();
    this.brokenStrutIds.clear();

    // Rebuild terrain for level
    this.buildTerrain(level);

    // Build anchor meshes
    for (const node of this.buildManager.nodes.values()) {
      this.createNodeMesh(node);
      this.initialNodePositions.set(node.id, node.pos.clone());
    }

    this.emitStats();
  }

  private clearLevelMeshes(): void {
    for (const m of this.terrainMeshes) {
      this.scene.remove(m);
    }
    this.terrainMeshes = [];

    for (const m of this.nodeMeshes.values()) {
      this.scene.remove(m);
    }
    this.nodeMeshes.clear();

    for (const m of this.strutMeshes.values()) {
      this.scene.remove(m);
    }
    this.strutMeshes.clear();
  }

  private buildTerrain(level: LevelDef): void {
    const cliffMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 });

    const deckY = level.terrain.deckY;
    const gap = level.gapDistance;

    // Left Cliff (X <= 0)
    const leftCliffGeom = new THREE.BoxGeometry(8, 8, 1.0);
    const leftCliff = new THREE.Mesh(leftCliffGeom, cliffMat);
    leftCliff.position.set(-4, deckY - 4, -0.6);
    this.scene.add(leftCliff);
    this.terrainMeshes.push(leftCliff);

    const leftGrassGeom = new THREE.BoxGeometry(8, 0.25, 1.1);
    const leftGrass = new THREE.Mesh(leftGrassGeom, grassMat);
    leftGrass.position.set(-4, deckY - 0.1, -0.6);
    this.scene.add(leftGrass);
    this.terrainMeshes.push(leftGrass);

    // Right Cliff (X >= gap)
    const rightCliffGeom = new THREE.BoxGeometry(8, 8, 1.0);
    const rightCliff = new THREE.Mesh(rightCliffGeom, cliffMat);
    rightCliff.position.set(gap + 4, deckY - 4, -0.6);
    this.scene.add(rightCliff);
    this.terrainMeshes.push(rightCliff);

    const rightGrassGeom = new THREE.BoxGeometry(8, 0.25, 1.1);
    const rightGrass = new THREE.Mesh(rightGrassGeom, grassMat);
    rightGrass.position.set(gap + 4, deckY - 0.1, -0.6);
    this.scene.add(rightGrass);
    this.terrainMeshes.push(rightGrass);

    // Central Island (Level 2)
    if (level.terrain.hasIsland && level.terrain.islandX !== undefined) {
      const islandX = level.terrain.islandX;
      const islandW = level.terrain.islandWidth || 2.0;

      const islandGeom = new THREE.BoxGeometry(islandW, 5, 1.0);
      const island = new THREE.Mesh(islandGeom, cliffMat);
      island.position.set(islandX, -1.0, -0.6);
      this.scene.add(island);
      this.terrainMeshes.push(island);

      const islandGrassGeom = new THREE.BoxGeometry(islandW, 0.2, 1.1);
      const islandGrass = new THREE.Mesh(islandGrassGeom, grassMat);
      islandGrass.position.set(islandX, 1.3, -0.6);
      this.scene.add(islandGrass);
      this.terrainMeshes.push(islandGrass);
    }

    // River / Water plane
    const waterGeom = new THREE.PlaneGeometry(gap + 20, 8);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.85,
    });
    const water = new THREE.Mesh(waterGeom, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(gap * 0.5, -2.0, -0.2);
    this.scene.add(water);
    this.terrainMeshes.push(water);
  }

  private createNodeMesh(node: Node): THREE.Mesh {
    const radius = node.isAnchor ? 0.18 : 0.12;
    const geom = new THREE.SphereGeometry(radius, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: node.isAnchor ? 0xf59e0b : 0xf8fafc,
      emissive: node.isAnchor ? 0xd97706 : 0x000000,
      emissiveIntensity: node.isAnchor ? 0.35 : 0,
      metalness: 0.2,
      roughness: 0.3,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(node.pos.x, node.pos.y, 0.05);
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
    const nodeA = this.buildManager.nodes.get(strut.nodeAId);
    const nodeB = this.buildManager.nodes.get(strut.nodeBId);
    const mesh = this.strutMeshes.get(strut.id);
    if (!nodeA || !nodeB || !mesh) return;

    if (strut.isBroken) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    const pA = new THREE.Vector3(nodeA.pos.x, nodeA.pos.y, 0.05);
    const pB = new THREE.Vector3(nodeB.pos.x, nodeB.pos.y, 0.05);
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

  public emitStats(): void {
    this.onStatsChange?.({
      spent: this.buildManager.getSpentBudget(),
      budget: this.buildManager.level.budget,
      strutCount: this.buildManager.struts.length,
      canUndo: this.buildManager.undoStack.length > 0,
    });
  }

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

  private findClickedStrut(worldPos: Vector2): Strut | null {
    let closestStrut: Strut | null = null;
    let minDist = 0.35;

    for (const strut of this.buildManager.struts) {
      const nodeA = this.buildManager.nodes.get(strut.nodeAId);
      const nodeB = this.buildManager.nodes.get(strut.nodeBId);
      if (!nodeA || !nodeB) continue;

      const abX = nodeB.pos.x - nodeA.pos.x;
      const abY = nodeB.pos.y - nodeA.pos.y;
      const abLenSq = abX * abX + abY * abY;
      if (abLenSq === 0) continue;

      const apX = worldPos.x - nodeA.pos.x;
      const apY = worldPos.y - nodeA.pos.y;
      const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / abLenSq));

      const projX = nodeA.pos.x + t * abX;
      const projY = nodeA.pos.y + t * abY;

      const dX = worldPos.x - projX;
      const dY = worldPos.y - projY;
      const dist = Math.sqrt(dX * dX + dY * dY);

      if (dist < minDist) {
        minDist = dist;
        closestStrut = strut;
      }
    }
    return closestStrut;
  }

  public setTool(tool: ToolMode): void {
    this.activeTool = tool;
    this.container.style.cursor = tool === 'eraser' ? 'crosshair' : 'default';
  }

  public undo(): void {
    if (this.gameLoop.status === 'simulating') return;
    const success = this.buildManager.undo();
    if (success) {
      this.syncSceneFromBuildManager();
      this.emitStats();
    }
  }

  private syncSceneFromBuildManager(): void {
    // 1. Remove node meshes that no longer exist
    for (const [id, mesh] of this.nodeMeshes) {
      if (!this.buildManager.nodes.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.nodeMeshes.delete(id);
      }
    }
    // 2. Add missing node meshes
    for (const node of this.buildManager.nodes.values()) {
      if (!this.nodeMeshes.has(node.id)) {
        this.createNodeMesh(node);
      }
    }
    // 3. Remove strut meshes that no longer exist
    const currentStrutIds = new Set(this.buildManager.struts.map(s => s.id));
    for (const [id, mesh] of this.strutMeshes) {
      if (!currentStrutIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.strutMeshes.delete(id);
      }
    }
    // 4. Add missing strut meshes
    for (const strut of this.buildManager.struts) {
      if (!this.strutMeshes.has(strut.id)) {
        this.addStrutMesh(strut);
      } else {
        this.updateSingleStrutMesh(strut);
      }
    }
  }

  private setupEventListeners(): void {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('pointerdown', (e) => {
      if (this.gameLoop.status === 'simulating') return;
      const worldPos = this.getPlaneIntersection(e);
      if (!worldPos) return;

      // Handle Eraser / Delete Tool
      if (this.activeTool === 'eraser') {
        const clickedStrut = this.findClickedStrut(worldPos);
        if (clickedStrut) {
          this.buildManager.deleteStrut(clickedStrut.id);
          this.syncSceneFromBuildManager();
          this.emitStats();
          return;
        }
        const clickedNode = this.buildManager.findNodeNear(worldPos, 0.4);
        if (clickedNode && !clickedNode.isAnchor) {
          const strutsToDelete = this.buildManager.struts.filter(
            s => s.nodeAId === clickedNode.id || s.nodeBId === clickedNode.id
          );
          for (const s of strutsToDelete) {
            this.buildManager.deleteStrut(s.id);
          }
          this.syncSceneFromBuildManager();
          this.emitStats();
          return;
        }
        return;
      }

      // Handle Strut Drawing Tool (Road or Wood)
      const nearest = this.buildManager.findNodeNear(worldPos, 0.5);
      if (nearest) {
        this.isPointerDown = true;
        this.activeStartNode = nearest;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isPointerDown || !this.activeStartNode || this.gameLoop.status === 'simulating') return;
      const rawPos = this.getPlaneIntersection(e);
      if (!rawPos) return;

      const nearestNode = this.buildManager.findNodeNear(rawPos, 0.4);
      const targetPos = nearestNode ? nearestNode.pos : this.snapToGrid(rawPos);

      const mat = this.activeTool === 'eraser' ? 'road' : this.activeTool;
      const matProps = MATERIALS[mat];

      const pA = new THREE.Vector3(this.activeStartNode.pos.x, this.activeStartNode.pos.y, 0.05);
      const pB = new THREE.Vector3(targetPos.x, targetPos.y, 0.05);
      const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(pB, pA);
      const len = dir.length();

      this.ghostStrutMesh.position.copy(mid);
      this.ghostStrutMesh.scale.set(1, Math.max(len, 0.001), 1);
      this.ghostStrutMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

      const ghostMat = this.ghostStrutMesh.material as THREE.MeshBasicMaterial;
      const cost = len * matProps.costPerMeter;
      const exceedsBudget = (this.buildManager.getSpentBudget() + cost) > this.buildManager.level.budget;

      if (len > matProps.maxLength || exceedsBudget) {
        ghostMat.color.setHex(0xef4444); // Red if too long or budget exceeded
      } else {
        ghostMat.color.setHex(mat === 'road' ? 0x38bdf8 : 0xf59e0b);
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

      const mat = this.activeTool === 'eraser' ? 'road' : this.activeTool;
      const nearestNode = this.buildManager.findNodeNear(rawPos, 0.4);
      const targetPos = nearestNode ? nearestNode.pos : this.snapToGrid(rawPos);

      const added = this.buildManager.createStrut(this.activeStartNode.id, targetPos, mat);
      if (added) {
        this.syncSceneFromBuildManager();
        this.emitStats();
      }

      this.activeStartNode = null;
    });

    window.addEventListener('resize', () => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      const aspect = width / height;
      const viewHeight = Math.max(8.0, this.buildManager.level.gapDistance * 0.65);
      const viewWidth = viewHeight * aspect;

      this.camera.left = -viewWidth / 2;
      this.camera.right = viewWidth / 2;
      this.camera.top = viewHeight / 2;
      this.camera.bottom = -viewHeight / 2;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);
    });
  }

  public toggleSimulation(): boolean {
    if (this.gameLoop.status === 'building') {
      this.brokenStrutIds.clear();
      this.initialNodePositions.clear();

      for (const [id, node] of this.buildManager.nodes) {
        this.initialNodePositions.set(id, node.pos.clone());
        node.prevPos.copy(node.pos);
      }
      for (const s of this.buildManager.struts) {
        s.isBroken = false;
        s.stress = 0;
      }

      const vCfg = this.buildManager.level.vehicle;
      const startY = (this.buildManager.level.terrain.deckY || 2.0) + 0.3;
      this.gameLoop.startSimulation({
        ...vCfg,
        x: vCfg.x ?? -1.5,
        y: vCfg.y ?? startY,
        goalX: vCfg.goalX ?? (this.buildManager.level.gapDistance + 0.5),
      });
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
      const node = this.buildManager.nodes.get(id);
      if (node) {
        node.pos.copy(initialPos);
        node.prevPos.copy(initialPos);
      }
    }

    for (const s of this.buildManager.struts) {
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
    stepSimulation(this.buildManager.nodes, this.buildManager.struts, 15, dt);

    const roadStruts = this.buildManager.struts.filter(s => s.material === 'road');
    this.gameLoop.update(roadStruts, this.buildManager.nodes, dt);

    if (this.gameLoop.vehicle) {
      this.vehicleMesh.update(this.gameLoop.vehicle, dt);
    }

    for (const strut of this.buildManager.struts) {
      if (strut.isBroken && !this.brokenStrutIds.has(strut.id)) {
        this.brokenStrutIds.add(strut.id);
        const nodeA = this.buildManager.nodes.get(strut.nodeAId);
        const nodeB = this.buildManager.nodes.get(strut.nodeBId);
        if (nodeA && nodeB) {
          const mid = new THREE.Vector3(
            (nodeA.pos.x + nodeB.pos.x) * 0.5,
            (nodeA.pos.y + nodeB.pos.y) * 0.5,
            0.05
          );
          this.particleSystem.spawnSplinters(mid, 14, strut.material);
        }
      }
    }

    this.particleSystem.update(dt);
    this.syncMeshes();
  }

  private syncMeshes(): void {
    for (const [id, node] of this.buildManager.nodes) {
      const mesh = this.nodeMeshes.get(id);
      if (mesh) {
        mesh.position.set(node.pos.x, node.pos.y, 0.05);
      }
    }
    for (const strut of this.buildManager.struts) {
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
