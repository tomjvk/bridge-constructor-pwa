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

  it('supports vehicle on cliff approach ground without falling', () => {
    const terrain = { leftCliffX: 0, rightCliffX: 8.0, deckY: 2.0 };
    // Spawn vehicle on left approach at x = -1.5, deck level
    const vehicle = createVehicle({ x: -1.5, y: 2.25, mass: 800, targetSpeed: 1.0 });

    // Step physics for 60 frames (1 full second)
    for (let i = 0; i < 60; i++) {
      updateVehicle(vehicle, [], new Map(), 1 / 60, terrain);
    }

    // Must still be resting on cliff ground above deck (Y >= 2.0), not fallen into chasm
    expect(vehicle.isFallen).toBe(false);
    expect(vehicle.y).toBeGreaterThanOrEqual(2.1);
    expect(vehicle.rearWheelOnGround).toBe(true);
    // Smooth forward rollout along cliff towards bridge
    expect(vehicle.x).toBeGreaterThan(-1.5);
    // Cruising speed controlled near targetSpeed (not runaway speed)
    expect(vehicle.vx).toBeLessThanOrEqual(1.2);
  });
});

