import { Vector2 } from './Vector2';

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
  restLength: number;
  isBroken: boolean;
  material?: string;
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
