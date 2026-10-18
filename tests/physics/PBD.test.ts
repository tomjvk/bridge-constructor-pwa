import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/physics/Vector2';
import { Node, solveDistanceConstraint } from '../../src/physics/PBD';

describe('PBD Distance Constraint', () => {
  it('correctly pulls two displaced nodes back towards rest length', () => {
    const nodeA: Node = { id: 'A', pos: new Vector2(0, 0), prevPos: new Vector2(0, 0), isAnchor: true, mass: 10 };
    const nodeB: Node = { id: 'B', pos: new Vector2(3, 0), prevPos: new Vector2(3, 0), isAnchor: false, mass: 10 };
    const restLength = 2.0;

    solveDistanceConstraint(nodeA, nodeB, restLength, 1.0);

    expect(nodeA.pos.x).toBe(0); // Anchor does not move
    expect(nodeB.pos.x).toBeCloseTo(2.0, 3); // Free node pulled to restLength
  });
});
