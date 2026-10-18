import { Node } from '../physics/PBD';
import { Vector2 } from '../physics/Vector2';
import { VehicleConfig } from '../physics/Vehicle';

export interface TerrainConfig {
  leftCliffX: number;
  rightCliffX: number;
  deckY: number;
  hasIsland?: boolean;
  islandX?: number;
  islandWidth?: number;
}

export interface LevelDef {
  id: number;
  name: string;
  description: string;
  gapDistance: number;
  budget: number;
  anchors: Node[];
  vehicle: VehicleConfig;
  terrain: TerrainConfig;
}

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'The River Crossing',
    description: 'Bridge an 8m gap over the river with road and wood trusses.',
    gapDistance: 8.0,
    budget: 3000,
    terrain: { leftCliffX: 0, rightCliffX: 8.0, deckY: 2.0 },
    anchors: [
      { id: 'anchor_left', pos: new Vector2(0, 0), prevPos: new Vector2(0, 0), isAnchor: true, mass: 1000 },
      { id: 'anchor_L1', pos: new Vector2(0, 2.0), prevPos: new Vector2(0, 2.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_L2', pos: new Vector2(0, 0.5), prevPos: new Vector2(0, 0.5), isAnchor: true, mass: 1000 },
      { id: 'anchor_R1', pos: new Vector2(8.0, 2.0), prevPos: new Vector2(8.0, 2.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_R2', pos: new Vector2(8.0, 0.5), prevPos: new Vector2(8.0, 0.5), isAnchor: true, mass: 1000 },
    ],
    vehicle: { x: -1.5, y: 2.3, mass: 800, motorTorque: 1600, goalX: 8.5 },
  },
  {
    id: 2,
    name: 'The Central Island',
    description: 'A 14m wide river with a sturdy natural rock pillar in the middle.',
    gapDistance: 14.0,
    budget: 5500,
    terrain: { leftCliffX: 0, rightCliffX: 14.0, deckY: 2.0, hasIsland: true, islandX: 7.0, islandWidth: 2.0 },
    anchors: [
      { id: 'anchor_L1', pos: new Vector2(0, 2.0), prevPos: new Vector2(0, 2.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_L2', pos: new Vector2(0, 0.5), prevPos: new Vector2(0, 0.5), isAnchor: true, mass: 1000 },
      { id: 'anchor_M1', pos: new Vector2(7.0, 1.2), prevPos: new Vector2(7.0, 1.2), isAnchor: true, mass: 1000 },
      { id: 'anchor_M2', pos: new Vector2(7.0, 0.0), prevPos: new Vector2(7.0, 0.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_R1', pos: new Vector2(14.0, 2.0), prevPos: new Vector2(14.0, 2.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_R2', pos: new Vector2(14.0, 0.5), prevPos: new Vector2(14.0, 0.5), isAnchor: true, mass: 1000 },
    ],
    vehicle: { x: -1.5, y: 2.3, mass: 1000, motorTorque: 1800, goalX: 14.5 },
  },
  {
    id: 3,
    name: 'Heavy Haul Canyon',
    description: 'A deep 12m canyon requiring reinforced trusses to support a 2.2-ton truck.',
    gapDistance: 12.0,
    budget: 7000,
    terrain: { leftCliffX: 0, rightCliffX: 12.0, deckY: 3.0 },
    anchors: [
      { id: 'anchor_L1', pos: new Vector2(0, 3.0), prevPos: new Vector2(0, 3.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_L2', pos: new Vector2(0, 1.5), prevPos: new Vector2(0, 1.5), isAnchor: true, mass: 1000 },
      { id: 'anchor_L3', pos: new Vector2(0, 0.0), prevPos: new Vector2(0, 0.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_R1', pos: new Vector2(12.0, 3.0), prevPos: new Vector2(12.0, 3.0), isAnchor: true, mass: 1000 },
      { id: 'anchor_R2', pos: new Vector2(12.0, 1.5), prevPos: new Vector2(12.0, 1.5), isAnchor: true, mass: 1000 },
      { id: 'anchor_R3', pos: new Vector2(12.0, 0.0), prevPos: new Vector2(12.0, 0.0), isAnchor: true, mass: 1000 },
    ],
    vehicle: { x: -1.5, y: 3.3, mass: 2200, wheelBase: 1.6, motorTorque: 2800, goalX: 12.5 },
  },
];
