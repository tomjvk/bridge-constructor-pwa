import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/physics/Vector2';
import { Node, Strut, stepSimulation, computeStress } from '../../src/physics/PBD';
import { MATERIALS } from '../../src/physics/Materials';

describe('Stress & Breaking Mechanics', () => {
  it('computes stress ratio and breaks strut when strain exceeds maxStrain', () => {
    const nodeA: Node = { id: 'A', pos: new Vector2(0, 0), prevPos: new Vector2(0, 0), isAnchor: true, mass: 10 };
    const nodeB: Node = { id: 'B', pos: new Vector2(2.5, 0), prevPos: new Vector2(2.5, 0), isAnchor: true, mass: 10 };
    const strut: Strut = {
      id: 'S1',
      nodeAId: 'A',
      nodeBId: 'B',
      material: 'wood',
      restLength: 2.0,
      isBroken: false
    };

    // Stretched from 2.0m to 2.5m = 0.5m strain (25% strain). Wood maxStrain is 0.18 (18%).
    expect(MATERIALS.wood.maxStrain).toBe(0.18);
    const stress = computeStress(strut, nodeA, nodeB);
    expect(stress).toBeGreaterThan(1.0);

    const nodes = new Map([['A', nodeA], ['B', nodeB]]);
    stepSimulation(nodes, [strut], 15, 1 / 60);
    expect(strut.isBroken).toBe(true);
  });
});
