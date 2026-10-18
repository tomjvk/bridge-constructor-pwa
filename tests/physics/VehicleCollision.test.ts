import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/physics/Vector2';
import { Node, Strut } from '../../src/physics/PBD';
import { createVehicle, updateVehicle } from '../../src/physics/Vehicle';

describe('Vehicle Simulation', () => {
  it('accelerates vehicle forward when rear wheel contacts road', () => {
    const nodeA: Node = { id: 'A', pos: new Vector2(0, 0), prevPos: new Vector2(0, 0), isAnchor: true, mass: 10 };
    const nodeB: Node = { id: 'B', pos: new Vector2(5, 0), prevPos: new Vector2(5, 0), isAnchor: true, mass: 10 };
    const road: Strut = { id: 'R1', nodeAId: 'A', nodeBId: 'B', material: 'road', restLength: 5, isBroken: false };

    const vehicle = createVehicle({ x: 1.0, y: 0.3, mass: 800 });
    const nodes = new Map([['A', nodeA], ['B', nodeB]]);

    updateVehicle(vehicle, [road], nodes, 1 / 60);

    expect(vehicle.vx).toBeGreaterThan(0); // Driven forward along the road
    expect(vehicle.y).toBeGreaterThanOrEqual(0.2); // Kept above road level
  });
});
