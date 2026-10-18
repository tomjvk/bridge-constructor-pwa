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
  targetSpeed?: number;
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
  targetSpeed: number;
  goalX: number;
  frontWheelOnGround: boolean;
  rearWheelOnGround: boolean;
  isCrossed: boolean;
  isFallen: boolean;
}

export interface TerrainGround {
  leftCliffX: number;
  rightCliffX: number;
  deckY: number;
}

export function createVehicle(config: VehicleConfig = {}): VehicleState {
  return {
    x: config.x ?? 0.5,
    y: config.y ?? 2.25,
    vx: config.vx ?? 0.3,
    vy: config.vy ?? 0,
    angle: config.angle ?? 0,
    angularVelocity: 0,
    mass: config.mass ?? 800,
    wheelBase: config.wheelBase ?? 1.2,
    wheelRadius: config.wheelRadius ?? 0.2,
    motorTorque: config.motorTorque ?? 800,
    targetSpeed: config.targetSpeed ?? 1.0,
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
  nodeA?: Node;
  nodeB?: Node;
  t?: number;
  isGround?: boolean;
}

function checkWheelCollision(
  wheelPos: Vector2,
  wheelRadius: number,
  roadStruts: Strut[],
  nodes: Map<string, Node>,
  ground?: TerrainGround
): WheelContact | null {
  let closestContact: WheelContact | null = null;
  const maxContactDistance = wheelRadius + 0.15; // Wheel radius + suspension travel
  let minDistance = maxContactDistance;

  // 1. Check solid cliff approach/exit ground if provided
  if (ground) {
    const onLeftCliff = wheelPos.x <= ground.leftCliffX + 0.05;
    const onRightCliff = wheelPos.x >= ground.rightCliffX - 0.05;

    if (onLeftCliff || onRightCliff) {
      const dist = wheelPos.y - ground.deckY;
      // Wheel must be above deck and within contact range
      if (dist >= -0.2 && dist < minDistance) {
        minDistance = dist;
        closestContact = {
          dist,
          normal: new Vector2(0, 1),
          tangent: new Vector2(1, 0),
          isGround: true,
        };
      }
    }
  }

  // 2. Check road struts
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

    // Ignore wheels that have fallen significantly below the road deck
    if (diffY < -0.15) continue;

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
        isGround: false,
      };
    }
  }

  return closestContact;
}

export function updateVehicle(
  vehicle: VehicleState,
  roadStruts: Strut[],
  nodes: Map<string, Node>,
  dt: number,
  ground?: TerrainGround
): void {
  const gravity = -9.81;
  const damping = 0.02;

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

  // 2. Wheel Collisions (checks ground terrain and road struts)
  const rearContact = checkWheelCollision(rearWheel, vehicle.wheelRadius, roadStruts, nodes, ground);
  const frontContact = checkWheelCollision(frontWheel, vehicle.wheelRadius, roadStruts, nodes, ground);

  vehicle.rearWheelOnGround = !!rearContact;
  vehicle.frontWheelOnGround = !!frontContact;

  let totalCorrectionY = 0;
  let totalCorrectionX = 0;

  const contacts = [rearContact, frontContact].filter((c): c is WheelContact => !!c);

  for (const contact of contacts) {
    const pen = vehicle.wheelRadius - contact.dist;
    if (pen > 0) {
      totalCorrectionX += contact.normal.x * pen * 0.5;
      totalCorrectionY += contact.normal.y * pen * 0.5;
    }

    // Cancel velocity going into surface to prevent falling through or accumulating downward vy
    const vDotN = vehicle.vx * contact.normal.x + vehicle.vy * contact.normal.y;
    if (vDotN < 0) {
      vehicle.vx -= vDotN * contact.normal.x;
      vehicle.vy -= vDotN * contact.normal.y;
    }

    // Transfer load onto dynamic road nodes
    if (!contact.isGround && contact.nodeA && contact.nodeB) {
      const wheelMass = vehicle.mass * 0.5;
      const t = contact.t ?? 0.5;
      const loadDispA = ((wheelMass * (1 - t) * -gravity) / contact.nodeA.mass) * dt * dt;
      const loadDispB = ((wheelMass * t * -gravity) / contact.nodeB.mass) * dt * dt;

      if (!contact.nodeA.isAnchor) {
        contact.nodeA.pos.y -= loadDispA;
      }
      if (!contact.nodeB.isAnchor) {
        contact.nodeB.pos.y -= loadDispB;
      }
    }
  }

  // Drive forward along surface tangent towards targetSpeed (applied once from driven wheel)
  const driveContact = rearContact || frontContact;
  if (driveContact) {
    const currentSpeed = vehicle.vx * driveContact.tangent.x + vehicle.vy * driveContact.tangent.y;
    if (currentSpeed < vehicle.targetSpeed) {
      const motorAcc = Math.min((vehicle.motorTorque / vehicle.mass), 1.0);
      vehicle.vx += driveContact.tangent.x * motorAcc * dt;
      vehicle.vy += driveContact.tangent.y * motorAcc * dt;
    }
  }

  // Speed governor: gentle braking if moving faster than targetSpeed
  if (vehicle.vx > vehicle.targetSpeed) {
    vehicle.vx = Math.max(vehicle.targetSpeed, vehicle.vx - 1.5 * dt);
  }
  if (vehicle.vx > vehicle.targetSpeed * 1.1) {
    vehicle.vx = vehicle.targetSpeed * 1.1;
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
