import * as THREE from 'three';
import { VehicleState } from '../physics/Vehicle';

export class VehicleMesh {
  public group: THREE.Group;
  private chassisMesh!: THREE.Mesh;
  private cabinMesh!: THREE.Mesh;
  private rearWheelMesh!: THREE.Mesh;
  private frontWheelMesh!: THREE.Mesh;
  private wheelRotation = 0;

  constructor() {
    this.group = new THREE.Group();
    this.buildCar();
  }

  private buildCar(): void {
    // 1. Lower Chassis (red sport/utility body)
    const chassisGeom = new THREE.BoxGeometry(1.4, 0.35, 0.6);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0xe11d48, // Vibrant crimson red
      roughness: 0.3,
      metalness: 0.2,
    });
    this.chassisMesh = new THREE.Mesh(chassisGeom, chassisMat);
    this.chassisMesh.position.set(0, 0.15, 0);
    this.chassisMesh.castShadow = true;
    this.group.add(this.chassisMesh);

    // 2. Cabin / Windshield
    const cabinGeom = new THREE.BoxGeometry(0.7, 0.3, 0.54);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Tinted glass
      roughness: 0.1,
      metalness: 0.8,
    });
    this.cabinMesh = new THREE.Mesh(cabinGeom, cabinMat);
    this.cabinMesh.position.set(-0.1, 0.45, 0);
    this.cabinMesh.castShadow = true;
    this.group.add(this.cabinMesh);

    // Headlights
    const lightGeom = new THREE.BoxGeometry(0.08, 0.1, 0.14);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const rightLight = new THREE.Mesh(lightGeom, lightMat);
    rightLight.position.set(0.7, 0.15, 0.18);
    const leftLight = new THREE.Mesh(lightGeom, lightMat);
    leftLight.position.set(0.7, 0.15, -0.18);
    this.group.add(rightLight);
    this.group.add(leftLight);

    // 3. Wheels (Front & Rear)
    const wheelGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16);
    wheelGeom.rotateX(Math.PI / 2); // Align cylinder axis along Z
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x18181b, // Dark rubber
      roughness: 0.9,
    });

    // Rear Wheel
    this.rearWheelMesh = new THREE.Mesh(wheelGeom, wheelMat);
    this.rearWheelMesh.position.set(-0.6, 0, 0);
    this.rearWheelMesh.castShadow = true;
    this.group.add(this.rearWheelMesh);

    // Front Wheel
    this.frontWheelMesh = new THREE.Mesh(wheelGeom, wheelMat);
    this.frontWheelMesh.position.set(0.6, 0, 0);
    this.frontWheelMesh.castShadow = true;
    this.group.add(this.frontWheelMesh);

    this.group.visible = false;
  }

  public update(vehicle: VehicleState, dt: number): void {
    this.group.position.set(vehicle.x, vehicle.y, 0);
    this.group.rotation.z = vehicle.angle;

    // Spin wheels according to forward velocity
    const wheelCircumference = 2 * Math.PI * vehicle.wheelRadius;
    const revPerSec = vehicle.vx / (wheelCircumference || 1);
    this.wheelRotation -= revPerSec * 2 * Math.PI * dt;

    this.rearWheelMesh.rotation.z = this.wheelRotation;
    this.frontWheelMesh.rotation.z = this.wheelRotation;
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}
