import { Vector2 } from './Vector2';
import { MaterialType, MATERIALS } from './Materials';

export interface Node {
  id: string;
  pos: Vector2;
  prevPos: Vector2;
  isAnchor: boolean;
  mass: number;
}

export interface Strut {
  id: string;
  nodeAId: string;
  nodeBId: string;
  material: MaterialType;
  restLength: number;
  currentLength?: number;
  stress?: number;
  isBroken: boolean;
}

export function solveDistanceConstraint(
  nodeA: Node,
  nodeB: Node,
  restLength: number,
  stiffness = 1.0
): void {
  const deltaX = nodeB.pos.x - nodeA.pos.x;
  const deltaY = nodeB.pos.y - nodeA.pos.y;
  const currentDist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (currentDist === 0) return;

  const diff = ((currentDist - restLength) / currentDist) * stiffness;
  const corrX = deltaX * diff;
  const corrY = deltaY * diff;

  const wA = nodeA.isAnchor ? 0 : 1 / (nodeA.mass > 0 ? nodeA.mass : 1);
  const wB = nodeB.isAnchor ? 0 : 1 / (nodeB.mass > 0 ? nodeB.mass : 1);
  const wSum = wA + wB;

  if (wSum === 0) return;

  const factorA = wA / wSum;
  const factorB = wB / wSum;

  nodeA.pos.x += corrX * factorA;
  nodeA.pos.y += corrY * factorA;

  nodeB.pos.x -= corrX * factorB;
  nodeB.pos.y -= corrY * factorB;
}

export function computeStress(strut: Strut, nodeA: Node, nodeB: Node): number {
  const currentDist = nodeA.pos.distanceTo(nodeB.pos);
  const strain = Math.abs(currentDist - strut.restLength) / (strut.restLength || 1e-4);
  const mat = MATERIALS[strut.material] || MATERIALS.wood;
  return strain / mat.maxStrain;
}

export function stepSimulation(
  nodes: Map<string, Node>,
  struts: Strut[],
  iterations = 15,
  dt = 1 / 60
): void {
  const gravity = new Vector2(0, -9.81);
  const damping = 0.02;

  // 1. Explicit Verlet Integration
  for (const node of nodes.values()) {
    if (node.isAnchor) continue;

    const vx = (node.pos.x - node.prevPos.x) * (1 - damping);
    const vy = (node.pos.y - node.prevPos.y) * (1 - damping);

    node.prevPos.copy(node.pos);

    node.pos.x += vx + gravity.x * dt * dt;
    node.pos.y += vy + gravity.y * dt * dt;
  }

  // 2. Constraint Relaxation (PBD iterative projection)
  for (let iter = 0; iter < iterations; iter++) {
    for (const strut of struts) {
      if (strut.isBroken) continue;
      const nodeA = nodes.get(strut.nodeAId);
      const nodeB = nodes.get(strut.nodeBId);
      if (!nodeA || !nodeB) continue;

      const mat = MATERIALS[strut.material] || MATERIALS.wood;
      solveDistanceConstraint(nodeA, nodeB, strut.restLength, mat.stiffness);
    }
  }

  // 3. Post-relaxation stress calculation and structural snapping
  for (const strut of struts) {
    if (strut.isBroken) continue;
    const nodeA = nodes.get(strut.nodeAId);
    const nodeB = nodes.get(strut.nodeBId);
    if (!nodeA || !nodeB) continue;

    const stress = computeStress(strut, nodeA, nodeB);
    strut.stress = stress;
    strut.currentLength = nodeA.pos.distanceTo(nodeB.pos);

    if (stress >= 1.0) {
      strut.isBroken = true;
    }
  }
}
