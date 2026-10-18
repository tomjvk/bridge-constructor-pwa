import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/physics/Vector2';
import { Node, Strut, stepSimulation } from '../../src/physics/PBD';
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

  it('causes flat road across 8m gap to collapse under 800kg vehicle, while truss bridge survives', () => {
    const terrain = { leftCliffX: 0, rightCliffX: 8.0, deckY: 2.0 };

    // 1. Setup flat road only across 8m gap (4 segments of 2m)
    const createFlatBridge = () => {
      const nodes = new Map<string, Node>([
        ['L1', { id: 'L1', pos: new Vector2(0, 2.0), prevPos: new Vector2(0, 2.0), isAnchor: true, mass: 1000 }],
        ['N1', { id: 'N1', pos: new Vector2(2.0, 2.0), prevPos: new Vector2(2.0, 2.0), isAnchor: false, mass: 15 }],
        ['N2', { id: 'N2', pos: new Vector2(4.0, 2.0), prevPos: new Vector2(4.0, 2.0), isAnchor: false, mass: 15 }],
        ['N3', { id: 'N3', pos: new Vector2(6.0, 2.0), prevPos: new Vector2(6.0, 2.0), isAnchor: false, mass: 15 }],
        ['R1', { id: 'R1', pos: new Vector2(8.0, 2.0), prevPos: new Vector2(8.0, 2.0), isAnchor: true, mass: 1000 }],
      ]);
      const struts: Strut[] = [
        { id: 'R1', nodeAId: 'L1', nodeBId: 'N1', material: 'road', restLength: 2.0, isBroken: false },
        { id: 'R2', nodeAId: 'N1', nodeBId: 'N2', material: 'road', restLength: 2.0, isBroken: false },
        { id: 'R3', nodeAId: 'N2', nodeBId: 'N3', material: 'road', restLength: 2.0, isBroken: false },
        { id: 'R4', nodeAId: 'N3', nodeBId: 'R1', material: 'road', restLength: 2.0, isBroken: false },
      ];
      return { nodes, struts };
    };

    const flat = createFlatBridge();
    const vehicleFlat = createVehicle({ x: 0.5, y: 2.25, mass: 800, targetSpeed: 1.0 });

    let flatCollapsed = false;
    for (let frame = 0; frame < 360; frame++) {
      updateVehicle(vehicleFlat, flat.struts, flat.nodes, 1 / 60, terrain);
      stepSimulation(flat.nodes, flat.struts, 15, 1 / 60);
      if (flat.struts.some(s => s.isBroken) || vehicleFlat.isFallen) {
        flatCollapsed = true;
        break;
      }
    }
    // Flat road without trusses MUST collapse under the vehicle
    expect(flatCollapsed).toBe(true);

    // 2. Setup truss bridge (flat road + wood triangles to lower anchors)
    const createTrussBridge = () => {
      const nodes = new Map<string, Node>([
        ['L1', { id: 'L1', pos: new Vector2(0, 2.0), prevPos: new Vector2(0, 2.0), isAnchor: true, mass: 1000 }],
        ['L2', { id: 'L2', pos: new Vector2(0, 0.5), prevPos: new Vector2(0, 0.5), isAnchor: true, mass: 1000 }],
        ['N1', { id: 'N1', pos: new Vector2(2.0, 2.0), prevPos: new Vector2(2.0, 2.0), isAnchor: false, mass: 15 }],
        ['W1', { id: 'W1', pos: new Vector2(2.0, 0.5), prevPos: new Vector2(2.0, 0.5), isAnchor: false, mass: 15 }],
        ['N2', { id: 'N2', pos: new Vector2(4.0, 2.0), prevPos: new Vector2(4.0, 2.0), isAnchor: false, mass: 15 }],
        ['W2', { id: 'W2', pos: new Vector2(4.0, 0.5), prevPos: new Vector2(4.0, 0.5), isAnchor: false, mass: 15 }],
        ['N3', { id: 'N3', pos: new Vector2(6.0, 2.0), prevPos: new Vector2(6.0, 2.0), isAnchor: false, mass: 15 }],
        ['W3', { id: 'W3', pos: new Vector2(6.0, 0.5), prevPos: new Vector2(6.0, 0.5), isAnchor: false, mass: 15 }],
        ['R1', { id: 'R1', pos: new Vector2(8.0, 2.0), prevPos: new Vector2(8.0, 2.0), isAnchor: true, mass: 1000 }],
        ['R2', { id: 'R2', pos: new Vector2(8.0, 0.5), prevPos: new Vector2(8.0, 0.5), isAnchor: true, mass: 1000 }],
      ]);
      const struts: Strut[] = [
        // Road deck
        { id: 'R1', nodeAId: 'L1', nodeBId: 'N1', material: 'road', restLength: 2.0, isBroken: false },
        { id: 'R2', nodeAId: 'N1', nodeBId: 'N2', material: 'road', restLength: 2.0, isBroken: false },
        { id: 'R3', nodeAId: 'N2', nodeBId: 'N3', material: 'road', restLength: 2.0, isBroken: false },
        { id: 'R4', nodeAId: 'N3', nodeBId: 'R1', material: 'road', restLength: 2.0, isBroken: false },
        // Lower chord
        { id: 'W0', nodeAId: 'L2', nodeBId: 'W1', material: 'wood', restLength: 2.0, isBroken: false },
        { id: 'W1', nodeAId: 'W1', nodeBId: 'W2', material: 'wood', restLength: 2.0, isBroken: false },
        { id: 'W2', nodeAId: 'W2', nodeBId: 'W3', material: 'wood', restLength: 2.0, isBroken: false },
        { id: 'W3', nodeAId: 'W3', nodeBId: 'R2', material: 'wood', restLength: 2.0, isBroken: false },
        // Verticals
        { id: 'V1', nodeAId: 'N1', nodeBId: 'W1', material: 'wood', restLength: 1.5, isBroken: false },
        { id: 'V2', nodeAId: 'N2', nodeBId: 'W2', material: 'wood', restLength: 1.5, isBroken: false },
        { id: 'V3', nodeAId: 'N3', nodeBId: 'W3', material: 'wood', restLength: 1.5, isBroken: false },
        // Diagonals
        { id: 'D0', nodeAId: 'L2', nodeBId: 'N1', material: 'wood', restLength: 2.5, isBroken: false },
        { id: 'D1', nodeAId: 'W1', nodeBId: 'N2', material: 'wood', restLength: 2.5, isBroken: false },
        { id: 'D2', nodeAId: 'W3', nodeBId: 'N2', material: 'wood', restLength: 2.5, isBroken: false },
        { id: 'D3', nodeAId: 'R2', nodeBId: 'N3', material: 'wood', restLength: 2.5, isBroken: false },
      ];
      return { nodes, struts };
    };

    const truss = createTrussBridge();
    const vehicleTruss = createVehicle({ x: 0.5, y: 2.25, mass: 800, targetSpeed: 1.0 });

    for (let frame = 0; frame < 180; frame++) {
      updateVehicle(vehicleTruss, truss.struts, truss.nodes, 1 / 60, terrain);
      stepSimulation(truss.nodes, truss.struts, 15, 1 / 60);
    }
    // Truss bridge must survive without snapping any struts!
    expect(truss.struts.some(s => s.isBroken)).toBe(false);
    expect(vehicleTruss.isFallen).toBe(false);
  });
});

