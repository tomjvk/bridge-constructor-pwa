import { VehicleConfig, VehicleState, TerrainGround, createVehicle, updateVehicle } from '../physics/Vehicle';
import { Node, Strut } from '../physics/PBD';

export type GameStatus = 'building' | 'simulating' | 'won' | 'lost';

export interface GameLoopEvents {
  onStatusChange?: (status: GameStatus) => void;
  onVehicleUpdate?: (vehicle: VehicleState) => void;
}

export class GameLoop {
  public status: GameStatus = 'building';
  public vehicle: VehicleState | null = null;
  private events: GameLoopEvents;

  constructor(events: GameLoopEvents = {}) {
    this.events = events;
  }

  public startSimulation(startXOrConfig: number | VehicleConfig = -1.0, startY = 2.3, goalX = 7.5): VehicleState {
    const config: VehicleConfig = typeof startXOrConfig === 'object'
      ? { vx: 0.3, ...startXOrConfig }
      : { x: startXOrConfig, y: startY, goalX, vx: 0.3 };
    this.vehicle = createVehicle(config);
    this.status = 'simulating';
    this.events.onStatusChange?.(this.status);
    return this.vehicle;
  }

  public reset(): void {
    this.status = 'building';
    this.vehicle = null;
    this.events.onStatusChange?.(this.status);
  }

  public update(roadStruts: Strut[], nodes: Map<string, Node>, dt: number, ground?: TerrainGround): void {
    if (this.status !== 'simulating' || !this.vehicle) return;

    updateVehicle(this.vehicle, roadStruts, nodes, dt, ground);
    this.events.onVehicleUpdate?.(this.vehicle);

    if (this.vehicle.isCrossed) {
      this.status = 'won';
      this.events.onStatusChange?.(this.status);
    } else if (this.vehicle.isFallen) {
      this.status = 'lost';
      this.events.onStatusChange?.(this.status);
    }
  }
}
