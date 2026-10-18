import { Vector2 } from './Vector2';
import { Node, Strut } from './PBD';

export interface VehicleConfig {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  angle?: number;
  mass?: number;
  wheelBase?: number;
  wheelRadius?: number;
  motorTorque?: number;
  goalX?: number;
}

export interface VehicleState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  mass: number;
  wheelBase: number;
  wheelRadius: number;
  motorTorque: number;
  goalX: number;
  frontWheelOnGround: boolean;
  rearWheelOnGround: boolean;
  isCrossed: boolean;
  isFallen: boolean;
}

export function createVehicle(config: VehicleConfig = {}): VehicleState {
  return {
    x: config.x ?? 0.5,
    y: config.y ?? 2.3,
    vx: config.vx ?? 0,
    vy: config.vy ?? 0,
    angle: config.angle ?? 0,
    angularVelocity: 0,
    mass: config.mass ?? 800,
    wheelBase: config.wheelBase ?? 1.2,
    wheelRadius: config.wheelRadius ?? 0.2,
    motorTorque: config.motorTorque ?? 1500,
    goalX: config.goalX ?? 7.0,
    frontWheelOnGround: false,
    rearWheelOnGround: false,
    isCrossed: false,
    isFallen: false,
  };
}

interface WheelContact {
  dist: number;
  normal: Vector2;
  tangent: Vector2;
  nodeA: Node;
  nodeB: Node;
  t: number;
}

function checkWheelCollision(
  wheelPos: Vector2,
  wheelRadius: number,
  roadStruts: Strut[],
  nodes: Map<string, Node>
): WheelContact | null {
  let closestContact: WheelContact | null = null;
  const maxContactDistance = wheelRadius + 0.15; // Wheel radius + suspension travel
  let minDistance = maxContactDistance;

  for (const strut of roadStruts) {
    if (strut.isBroken || strut.material !== 'road') continue;
    const nodeA = nodes.get(strut.nodeAId);
    const nodeB = nodes.get(strut.nodeBId);
    if (!nodeA || !nodeB) continue;

    // Segment from A to B
    const abX = nodeB.pos.x - nodeA.pos.x;
    const abY = nodeB.pos.y - nodeA.pos.y;
    const abLenSq = abX * abX + abY * abY;
    if (abLenSq === 0) continue;

    const abLen = Math.sqrt(abLenSq);

    // Project wheel onto segment
    const apX = wheelPos.x - nodeA.pos.x;
    const apY = wheelPos.y - nodeA.pos.y;
    const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / abLenSq));

    const projX = nodeA.pos.x + t * abX;
    const projY = nodeA.pos.y + t * abY;

    // Distance vector from projection to wheel
    const diffX = wheelPos.x - projX;
    const diffY = wheelPos.y - projY;
    const dist = Math.sqrt(diffX * diffX + diffY * diffY);

    if (dist < minDistance) {
      minDistance = dist;
      
      // Normal points upwards relative to road segment
      let nx = -abY / abLen;
      let ny = abX / abLen;
      if (ny < 0) {
        nx = -nx;
        ny = -ny;
      }

      // Tangent points in direction of travel (+X)
      let tx = abX / abLen;
      let ty = abY / abLen;
      if (tx < 0) {
        tx = -tx;
        ty = -ty;
      }

      closestContact = {
        dist,
        normal: new Vector2(nx, ny),
        tangent: new Vector2(tx, ty),
        nodeA,
        nodeB,
        t,
      };
    }
  }

  return closestContact;
}

export function updateVehicle(
  vehicle: VehicleState,
  roadStruts: Strut[],
  nodes: Map<string, Node>,
  dt: number
): void {
  const gravity = -9.81;
  const damping = 0.01;

  // 1. Integrate Gravity & Velocity
  vehicle.vy += gravity * dt;
  vehicle.vx *= 1 - damping;
  vehicle.vy *= 1 - damping;

  vehicle.x += vehicle.vx * dt;
  vehicle.y += vehicle.vy * dt;

  // Calculate Wheel Positions based on chassis center and angle
  const halfBase = vehicle.wheelBase * 0.5;
  const cosA = Math.cos(vehicle.angle);
  const sinA = Math.sin(vehicle.angle);

  const rearWheel = new Vector2(
    vehicle.x - halfBase * cosA,
    vehicle.y - halfBase * sinA
  );
  const frontWheel = new Vector2(
    vehicle.x + halfBase * cosA,
    vehicle.y + halfBase * sinA
  );

  // 2. Wheel Collisions
  const rearContact = checkWheelCollision(rearWheel, vehicle.wheelRadius, roadStruts, nodes);
  const frontContact = checkWheelCollision(frontWheel, vehicle.wheelRadius, roadStruts, nodes);

  vehicle.rearWheelOnGround = !!rearContact;
  vehicle.frontWheelOnGround = !!frontContact;

  let totalCorrectionY = 0;
  let totalCorrectionX = 0;

  if (rearContact) {
    const pen = vehicle.wheelRadius - rearContact.dist;
    totalCorrectionX += rearContact.normal.x * pen * 0.5;
    totalCorrectionY += rearContact.normal.y * pen * 0.5;

    // Motor acceleration applied along road surface
    const motorAcc = (vehicle.motorTorque / vehicle.mass) * 1.5;
    vehicle.vx += rearContact.tangent.x * motorAcc * dt;
    vehicle.vy += rearContact.tangent.y * motorAcc * dt;

    // Transfer load onto road nodes
    const loadForce = (vehicle.mass * 0.5 * -gravity) / (rearContact.nodeA.mass + rearContact.nodeB.mass);
    if (!rearContact.nodeA.isAnchor) {
      rearContact.nodeA.pos.y -= loadForce * (1 - rearContact.t) * dt * dt * 5;
    }
    if (!rearContact.nodeB.isAnchor) {
      rearContact.nodeB.pos.y -= loadForce * rearContact.t * dt * dt * 5;
    }
  }

  if (frontContact) {
    const pen = vehicle.wheelRadius - frontContact.dist;
    totalCorrectionX += frontContact.normal.x * pen * 0.5;
    totalCorrectionY += frontContact.normal.y * pen * 0.5;

    // Transfer load onto road nodes
    const loadForce = (vehicle.mass * 0.5 * -gravity) / (frontContact.nodeA.mass + frontContact.nodeB.mass);
    if (!frontContact.nodeA.isAnchor) {
      frontContact.nodeA.pos.y -= loadForce * (1 - frontContact.t) * dt * dt * 5;
    }
    if (!frontContact.nodeB.isAnchor) {
      frontContact.nodeB.pos.y -= loadForce * frontContact.t * dt * dt * 5;
    }
  }

  // Apply collision repulsion
  vehicle.x += totalCorrectionX;
  vehicle.y += totalCorrectionY;

  // Align chassis pitch angle to wheels contact or terrain
  if (rearContact && frontContact) {
    const dx = frontWheel.x - rearWheel.x;
    const dy = frontWheel.y - rearWheel.y;
    vehicle.angle = Math.atan2(dy, dx);
    vehicle.angularVelocity = 0;
  } else if (rearContact) {
    vehicle.angularVelocity -= 1.5 * dt;
    vehicle.angle += vehicle.angularVelocity * dt;
  } else if (frontContact) {
    vehicle.angularVelocity += 1.5 * dt;
    vehicle.angle += vehicle.angularVelocity * dt;
  } else {
    // In air tumble
    vehicle.angle += vehicle.angularVelocity * dt;
  }

  // 3. Status checks: Win / Loss
  if (vehicle.x >= vehicle.goalX) {
    vehicle.isCrossed = true;
  }
  if (vehicle.y < -1.0) {
    vehicle.isFallen = true;
  }
}
