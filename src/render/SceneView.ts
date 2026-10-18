import * as THREE from 'three';
import { Vector2 } from '../physics/Vector2';
import { Node, Strut, solveDistanceConstraint } from '../physics/PBD';

export interface SceneConfig {
  container: HTMLElement;
  onStatusChange?: (status: string) => void;
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

  // Rendering elements
  private nodeMeshes: Map<string, THREE.Mesh> = new Map();
  private strutMeshes: Map<string, THREE.Mesh> = new Map();
  private ghostStrutMesh!: THREE.Mesh;

  // Interaction state
  private isPointerDown = false;
  private activeStartNode: Node | null = null;
  public isSimulating = false;
  private onStatusChange?: (status: string) => void;

  constructor(config: SceneConfig) {
    this.container = config.container;
    this.onStatusChange = config.onStatusChange;
    this.initScene();
    this.initDefaultAnchors();
    this.setupEventListeners();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  private initScene(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const aspect = width / height;

    // Center around X=3.5, Y=1.5 with view height of ~6 meters
    const viewHeight = 6;
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

    // Environment: Cliffs & Water
    this.buildCliffsAndWater();

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

  private buildCliffsAndWater(): void {
    // Left Cliff (X <= 0)
    const leftCliffGeom = new THREE.BoxGeometry(6, 6, 2);
    const cliffMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.8,
    });
    const leftCliff = new THREE.Mesh(leftCliffGeom, cliffMat);
    leftCliff.position.set(-3, 0, 0);
    this.scene.add(leftCliff);

    // Left Grass Top
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.6,
    });
    const leftGrassGeom = new THREE.BoxGeometry(6, 0.3, 2.2);
    const leftGrass = new THREE.Mesh(leftGrassGeom, grassMat);
    leftGrass.position.set(-3, 2.15, 0);
    this.scene.add(leftGrass);

    // Right Cliff (X >= 7)
    const rightCliffGeom = new THREE.BoxGeometry(6, 6, 2);
    const rightCliff = new THREE.Mesh(rightCliffGeom, cliffMat);
    rightCliff.position.set(10, 0, 0);
    this.scene.add(rightCliff);

    // Right Grass Top
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
      { id: 'anchor_L1', pos: new Vector2(0, 2.0), prevPos: new Vector2(0, 2.0), isAnchor: true, mass: 100 },
      { id: 'anchor_L2', pos: new Vector2(0, 0.5), prevPos: new Vector2(0, 0.5), isAnchor: true, mass: 100 },
      { id: 'anchor_R1', pos: new Vector2(7, 2.0), prevPos: new Vector2(7, 2.0), isAnchor: true, mass: 100 },
      { id: 'anchor_R2', pos: new Vector2(7, 0.5), prevPos: new Vector2(7, 0.5), isAnchor: true, mass: 100 },
    ];

    for (const a of anchors) {
      this.nodes.set(a.id, a);
      this.initialNodePositions.set(a.id, a.pos.clone());
      this.createNodeMesh(a);
    }
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

  private createStrutMesh(strut: Strut): THREE.Mesh {
    const geom = new THREE.CylinderGeometry(0.07, 0.07, 1, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Dark slate road
      roughness: 0.7,
    });
    const mesh = new THREE.Mesh(geom, mat);
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

    const pA = new THREE.Vector3(nodeA.pos.x, nodeA.pos.y, 0);
    const pB = new THREE.Vector3(nodeB.pos.x, nodeB.pos.y, 0);
    const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(pB, pA);
    const len = dir.length();

    mesh.position.copy(mid);
    mesh.scale.set(1, len, 1);

    // Point cylinder towards direction
    const up = new THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize());
  }

  public addStrut(nodeA: Node, nodeB: Node): Strut | null {
    // Check if strut already exists
    const exists = this.struts.some(
      s => (s.nodeAId === nodeA.id && s.nodeBId === nodeB.id) ||
           (s.nodeAId === nodeB.id && s.nodeBId === nodeA.id)
    );
    if (exists) return null;

    const dx = nodeB.pos.x - nodeA.pos.x;
    const dy = nodeB.pos.y - nodeA.pos.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    const strut: Strut = {
      id: `strut_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nodeAId: nodeA.id,
      nodeBId: nodeB.id,
      restLength: length,
      isBroken: false,
    };

    this.struts.push(strut);
    this.createStrutMesh(strut);
    return strut;
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
      if (this.isSimulating) return;
      const worldPos = this.getPlaneIntersection(e);
      if (!worldPos) return;

      const nearest = this.findNearestNode(worldPos, 0.5);
      if (nearest) {
        this.isPointerDown = true;
        this.activeStartNode = nearest;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isPointerDown || !this.activeStartNode || this.isSimulating) return;
      const worldPos = this.getPlaneIntersection(e);
      if (!worldPos) return;

      // Update ghost strut
      const pA = new THREE.Vector3(this.activeStartNode.pos.x, this.activeStartNode.pos.y, 0);
      const pB = new THREE.Vector3(worldPos.x, worldPos.y, 0);
      const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(pB, pA);
      const len = dir.length();

      this.ghostStrutMesh.position.copy(mid);
      this.ghostStrutMesh.scale.set(1, Math.max(len, 0.001), 1);
      this.ghostStrutMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      this.ghostStrutMesh.visible = true;
    });

    window.addEventListener('pointerup', (e) => {
      if (!this.isPointerDown || !this.activeStartNode || this.isSimulating) {
        this.isPointerDown = false;
        this.activeStartNode = null;
        this.ghostStrutMesh.visible = false;
        return;
      }

      this.isPointerDown = false;
      this.ghostStrutMesh.visible = false;

      const worldPos = this.getPlaneIntersection(e);
      if (!worldPos) {
        this.activeStartNode = null;
        return;
      }

      let endNode = this.findNearestNode(worldPos, 0.4);

      if (!endNode) {
        // Enforce max length of 2.0m for road strut
        const dist = this.activeStartNode.pos.distanceTo(worldPos);
        if (dist > 0.3 && dist <= 2.2) {
          const newNodeId = `node_${Date.now()}`;
          endNode = {
            id: newNodeId,
            pos: worldPos.clone(),
            prevPos: worldPos.clone(),
            isAnchor: false,
            mass: 10,
          };
          this.nodes.set(endNode.id, endNode);
          this.initialNodePositions.set(endNode.id, endNode.pos.clone());
          this.createNodeMesh(endNode);
        }
      }

      if (endNode && endNode.id !== this.activeStartNode.id) {
        this.addStrut(this.activeStartNode, endNode);
      }

      this.activeStartNode = null;
    });

    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const aspect = width / height;
      const viewHeight = 6;
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
    this.isSimulating = !this.isSimulating;

    if (this.isSimulating) {
      // Save current positions for reset
      for (const [id, node] of this.nodes) {
        this.initialNodePositions.set(id, node.pos.clone());
        node.prevPos.copy(node.pos);
      }
      this.onStatusChange?.('Simulating');
    } else {
      // Reset positions
      for (const [id, initialPos] of this.initialNodePositions) {
        const node = this.nodes.get(id);
        if (node) {
          node.pos.copy(initialPos);
          node.prevPos.copy(initialPos);
        }
      }
      this.syncMeshes();
      this.onStatusChange?.('Build Mode');
    }

    return this.isSimulating;
  }

  private stepPhysics(dt: number): void {
    const gravity = new Vector2(0, -9.81);
    const damping = 0.02;

    // 1. Explicit Integration (Verlet)
    for (const node of this.nodes.values()) {
      if (node.isAnchor) continue;

      const vx = (node.pos.x - node.prevPos.x) * (1 - damping);
      const vy = (node.pos.y - node.prevPos.y) * (1 - damping);

      node.prevPos.copy(node.pos);

      node.pos.x += vx + gravity.x * dt * dt;
      node.pos.y += vy + gravity.y * dt * dt;
    }

    // 2. Constraint Relaxation (15 iterations)
    for (let iter = 0; iter < 15; iter++) {
      for (const strut of this.struts) {
        if (strut.isBroken) continue;
        const nodeA = this.nodes.get(strut.nodeAId);
        const nodeB = this.nodes.get(strut.nodeBId);
        if (nodeA && nodeB) {
          solveDistanceConstraint(nodeA, nodeB, strut.restLength, 1.0);
        }
      }
    }

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
    if (this.isSimulating) {
      this.stepPhysics(1 / 60);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
