# Bridge Constructor PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable 2.5D Bridge Constructor browser puzzle game downloadable as an offline-first PWA, using a custom 2D PBD physics solver, Three.js rendering, and 3 progression levels.

**Architecture:** 2D Position-Based Dynamics (PBD) simulation loop decoupled from a 3D Three.js presentation layer via $(x, y) \to (X, Y, Z)$ coordinate synchronization. Screen-to-plane raycasting handles user interaction on a $z=0$ construction plane.

**Tech Stack:** TypeScript, Vite, Three.js, Vitest, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-10-17-bridge-constructor-pwa-design.md`

## Global Constraints

- Platform: Modern web browsers (Chrome, Safari, Firefox, Edge) & installable PWA.
- Orientation: Landscape-first responsive layout (mobile, tablet, desktop).
- Physics timestep: Fixed $\Delta t = 1/60\text{s}$, $N = 15$ relaxation iterations per tick.
- Gravity: $\vec{g} = (0, -9.81)\text{ m/s}^2$.
- Material costs & limits: Road is $\$100/\text{m}$ (max length $2.0\text{m}$); Wood is $\$40/\text{m}$ (max length $2.5\text{m}$).
- Breaking threshold: $\text{stress} = \frac{\text{strain}}{\epsilon_{\text{break}}} \ge 1.0 \implies$ strut snaps immediately.

## Review Focus

1. **Strut Overextension:** User attempts to draw a strut longer than material `maxLength` — must clamp or turn red and block placement.
2. **Budget Overflow:** User draws a strut exceeding available level budget — must block placement and visually alert on HUD.
3. **Coincident Nodes:** User drops a node within snapping distance ($0.3\text{m}$) of an existing node — must merge into the existing node rather than duplicate.
4. **Extreme Bridge Disconnect:** Strut snaps leaving an isolated free node with zero connections — must fall under gravity and be cleaned up if falling below water level.
5. **Vehicle Tumbling Off-Screen:** Vehicle flips or plunges below $Y < -1.0\text{m}$ — must cleanly trigger failure state without physics numerical explosions (`NaN`/`Infinity`).

---

### Task 1: Project Scaffolding & Slice 1 (The Walking Skeleton)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/physics/Vector2.ts`
- Create: `src/physics/PBD.ts`
- Create: `src/render/SceneView.ts`
- Test: `tests/physics/PBD.test.ts`

**Interfaces:**
- Produces:
  - `Vector2(x: number, y: number)` with methods `add`, `sub`, `length`, `normalize`, `scale`.
  - `Node { id: string; pos: Vector2; prevPos: Vector2; isAnchor: boolean; mass: number }`.
  - `Strut { id: string; nodeAId: string; nodeBId: string; restLength: number; isBroken: boolean }`.
  - `solveDistanceConstraint(nodeA: Node, nodeB: Node, restLength: number, stiffness: number): void`.
  - `SceneView.init(container: HTMLElement): void`, `SceneView.render(): void`.

- [ ] **Step 1: Write the failing test for 2D PBD distance constraint relaxation**

Create `tests/physics/PBD.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` or `npx vitest run tests/physics/PBD.test.ts`  
Expected: FAIL (modules not found)

- [ ] **Step 3: Setup Vite project and implement `Vector2.ts` and `PBD.ts`**

Configure `package.json` with `three`, `vite`, `typescript`, `vitest`.
Implement `Vector2` operations and `solveDistanceConstraint` adhering to the exact PBD formula.

- [ ] **Step 4: Implement Slice 1 Three.js Canvas Scene (`SceneView.ts` and `main.ts`)**

- Setup Three.js OrthographicCamera, directional light, low-poly left and right cliff anchor boxes.
- Implement raycaster on mouse/touch down and up to draw a single test road strut.
- Add `[Test / Reset]` button in `index.html` to toggle simulation. When `Test` is clicked, integrate gravity on free nodes.

- [ ] **Step 5: Run tests and verify build**

Run: `npx vitest run`  
Run: `npx vite build`  
Expected: All tests PASS, build succeeds without error.

- [ ] **Step 6: Register Native Static Site in Coolify & Deploy**

Configure Coolify as a Native Static Site (zero-config, no Dockerfile or Nginx needed):
1. Identify Coolify server and project UUIDs via `coolify app list`.
2. Create static site application in Coolify:
   - Base Directory: `/root/projects/bridge-constructor-pwa`
   - Build Pack: `static`
   - Publish Directory: `dist`
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Domain: `https://bridge.77.42.36.199.sslip.io`
3. Trigger initial deployment:
   `coolify deploy uuid <app_uuid>`

- [ ] **Step 7: Commit & Manual Verification Gate**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/ tests/
git commit -m "feat: complete Slice 1 walking skeleton and deploy to Coolify static site"
```
**User Inspection Gate:** Provide live URL (`https://bridge.77.42.36.199.sslip.io`) to user. Pause and wait for user's manual inspection and confirmation before proceeding to Task 2.



---

### Task 2: Slice 2 (Truss Networks, Multi-Iteration Relaxation & Stress Snapping)

**Files:**
- Create: `src/physics/Materials.ts`
- Modify: `src/physics/PBD.ts`
- Create: `src/render/StrutMesh.ts`
- Modify: `src/render/SceneView.ts`
- Test: `tests/physics/Stress.test.ts`

**Interfaces:**
- Consumes: `Node`, `Vector2`, `solveDistanceConstraint` from Task 1.
- Produces:
  - `MATERIALS`: Record with `road` and `wood` properties (`maxLength`, `stiffness`, `maxStrain`, `costPerMeter`).
  - `computeStress(strut: Strut, nodeA: Node, nodeB: Node): number` (returns strain / maxStrain ratio 0.0 to 1.0+).
  - `updateStrutColor(mesh: THREE.Mesh, stressRatio: number): void` (interpolates green -> yellow -> red).
  - `stepSimulation(nodes: Map<string, Node>, struts: Strut[], iterations: number, dt: number): void`.

- [ ] **Step 1: Write failing test for stress calculation and structural snapping**

Create `tests/physics/Stress.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { Vector2 } from '../../src/physics/Vector2';
import { Node, Strut, stepSimulation, computeStress } from '../../src/physics/PBD';
import { MATERIALS } from '../../src/physics/Materials';

describe('Stress & Breaking Mechanics', () => {
  it('computes stress ratio and breaks strut when strain exceeds maxStrain', () => {
    const nodeA: Node = { id: 'A', pos: new Vector2(0, 0), prevPos: new Vector2(0, 0), isAnchor: true, mass: 10 };
    const nodeB: Node = { id: 'B', pos: new Vector2(2.5, 0), prevPos: new Vector2(2.5, 0), isAnchor: false, mass: 10 };
    const strut: Strut = {
      id: 'S1',
      nodeAId: 'A',
      nodeBId: 'B',
      material: 'wood',
      restLength: 2.0,
      isBroken: false
    };

    // Stretched from 2.0m to 2.5m = 0.5m strain (25% strain). Wood maxStrain is 0.15 (15%).
    const stress = computeStress(strut, nodeA, nodeB);
    expect(stress).toBeGreaterThan(1.0);

    const nodes = new Map([['A', nodeA], ['B', nodeB]]);
    stepSimulation(nodes, [strut], 15, 1 / 60);
    expect(strut.isBroken).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/physics/Stress.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `Materials.ts`, 15-iteration relaxation loop, and snapping logic in `PBD.ts`**

Define `MATERIALS` configuration table for `road` and `wood`.  
Implement `stepSimulation` with 15 sub-iterations and strut snapping.

- [ ] **Step 4: Update Three.js rendering for trusses and stress heatmap**

- Implement 3D cylindrical beam rendering with spherical node joints.
- Implement vertex/material color update dynamically mapping stress:
  - Green (`#22c55e`) for 0–40% stress.
  - Yellow (`#eab308`) for 40–75% stress.
  - Red (`#ef4444`) for 75–100%+ stress.
- Add splinter particle burst when `strut.isBroken === true`.

- [ ] **Step 5: Run tests and verify visually**

Run: `npx vitest run`  
Expected: All tests PASS.

- [ ] **Step 6: Commit, Redeploy to Coolify & User Gate**

```bash
git add src/physics/ src/render/ tests/
git commit -m "feat: complete Slice 2 with multi-iteration truss relaxation and stress heatmap"
coolify deploy uuid <app_uuid>
```
**User Inspection Gate:** Provide live URL (`https://bridge.77.42.36.199.sslip.io`) to user. Pause and wait for user's manual inspection and confirmation before proceeding to Task 3.

---

### Task 3: Slice 3 (Vehicle Simulation, Wheel Collision & Win/Loss Loop)

**Files:**
- Create: `src/physics/Vehicle.ts`
- Create: `src/render/VehicleMesh.ts`
- Modify: `src/physics/PBD.ts`
- Modify: `src/render/SceneView.ts`
- Create: `src/game/GameLoop.ts`
- Test: `tests/physics/VehicleCollision.test.ts`

**Interfaces:**
- Consumes: `Node`, `Strut`, `stepSimulation` from Task 2.
- Produces:
  - `VehicleState { x: number; y: number; vx: number; vy: number; angle: number; isCrossed: boolean; isFallen: boolean }`.
  - `updateVehicle(vehicle: VehicleState, roadStruts: Strut[], nodes: Map<string, Node>, dt: number): void`.
  - `GameStatus: 'building' | 'simulating' | 'won' | 'lost'`.

- [ ] **Step 1: Write failing test for vehicle-road wheel collision and driving force**

Create `tests/physics/VehicleCollision.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/physics/VehicleCollision.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `Vehicle.ts` and Wheel-to-Road Collision**

- Implement 2-axle wheeled vehicle with circle-to-line segment collision against driveable road struts.
- Apply motor acceleration when wheel is grounded; transfer vehicle weight directly onto the road segment's bounding nodes.
- Detect finish line crossing ($X > \text{goalX}$) and water plunge ($Y < -1.0\text{m}$).

- [ ] **Step 4: Implement Procedural 3D Vehicle in Three.js and Win/Loss UI Banner**

- Render a cute low-poly car chassis with rotating wheels.
- Synchronize car position and rotation $(x, y, \theta)$ with physics vehicle state each frame.
- Display "Victory! Level Complete" on win, or "Bridge Collapsed! [Retry]" on failure.

- [ ] **Step 5: Run tests and verify**

Run: `npx vitest run`  
Expected: All tests PASS.

- [ ] **Step 6: Commit, Redeploy to Coolify & User Gate**

```bash
git add src/physics/Vehicle.ts src/render/VehicleMesh.ts src/game/ tests/
git commit -m "feat: complete Slice 3 with vehicle collision, weight transfer, and win/loss states"
coolify deploy uuid <app_uuid>
```
**User Inspection Gate:** Provide live URL (`https://bridge.77.42.36.199.sslip.io`) to user. Pause and wait for user's manual inspection and confirmation before proceeding to Task 4.

---

### Task 4: Slice 4 (Build Tools, Budget System, Undo/Delete & 3 Levels)

**Files:**
- Create: `src/game/LevelData.ts`
- Create: `src/game/BuildManager.ts`
- Create: `src/ui/HUD.ts`
- Modify: `src/main.ts`
- Test: `tests/game/BuildManager.test.ts`

**Interfaces:**
- Consumes: `MATERIALS`, `Node`, `Strut`, `LevelData`.
- Produces:
  - `LevelDef { id: number; name: string; gapDistance: number; budget: number; anchors: Node[]; vehicle: VehicleConfig }`.
  - `BuildManager { addStrut(aId, bId, material): boolean; deleteStrut(id): void; undo(): void; getSpentBudget(): number }`.
  - `LEVELS: LevelDef[]` (containing Level 1: 8m gap, Level 2: 14m island, Level 3: 12m heavy truck).

- [ ] **Step 1: Write failing test for BuildManager budget tracking, delete, and undo**

Create `tests/game/BuildManager.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { BuildManager } from '../../src/game/BuildManager';
import { LEVELS } from '../../src/game/LevelData';

describe('BuildManager', () => {
  it('tracks spent budget and refunds on undo or delete', () => {
    const mgr = new BuildManager(LEVELS[0]); // Budget $3,000
    expect(mgr.getSpentBudget()).toBe(0);

    const added = mgr.createStrut('anchor_left', { x: 2, y: 0 }, 'road');
    expect(added).toBe(true);
    expect(mgr.getSpentBudget()).toBeGreaterThan(0);

    mgr.undo();
    expect(mgr.getSpentBudget()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/game/BuildManager.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement `LevelData.ts`, `BuildManager.ts`, and `HUD.ts`**

- Define the 3 handcrafted levels with anchors, obstacle meshes, and vehicle specifications.
- Implement `BuildManager` with full undo stack, delete tool, node merging within $0.3\text{m}$, and budget limit enforcement.
- Build clean HUD overlay:
  - Top: Level title, budget counter (spent / max), star goals.
  - Bottom-left: Tool selector (`[Road ($100)]`, `[Wood ($40)]`, `[Eraser]`, `[Undo]`).
  - Bottom-right: Level selector dropdown / modal.

- [ ] **Step 4: Run tests and verify**

Run: `npx vitest run`  
Expected: All tests PASS.

- [ ] **Step 5: Commit, Redeploy to Coolify & User Gate**

```bash
git add src/game/ src/ui/ tests/
git commit -m "feat: complete Slice 4 with build tools, budget limits, undo stack, and 3 levels"
coolify deploy uuid <app_uuid>
```
**User Inspection Gate:** Provide live URL (`https://bridge.77.42.36.199.sslip.io`) to user. Pause and wait for user's manual inspection and confirmation before proceeding to Task 5.

---

### Task 5: Slice 5 (PWA Offline Support, Mobile Touch Gestures & Polish)

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `src/pwa/registerServiceWorker.ts`
- Create: `src/audio/SoundEffects.ts`
- Modify: `src/render/SceneView.ts`
- Modify: `vite.config.ts`
- Modify: `index.html`
- Test: `tests/pwa/PWAConfig.test.ts`

**Interfaces:**
- Consumes: Entire application from Tasks 1–4.
- Produces:
  - `SoundEffects { playCreak(), playSnap(), playEngine(), playWin() }` via Web Audio API oscillators/noise.
  - Multi-touch gesture handler in `SceneView` (1-finger draw, 2-finger pan & pinch-zoom).
  - Offline-ready PWA installation prompt and service worker caching.

- [ ] **Step 1: Write test to verify PWA manifest and service worker configuration**

Create `tests/pwa/PWAConfig.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import manifest from '../../public/manifest.webmanifest';

describe('PWA Configuration', () => {
  it('defines valid standalone PWA manifest metadata', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Implement `vite-plugin-pwa`, `manifest.webmanifest`, and Service Worker registration**

Configure `vite-plugin-pwa` in `vite.config.ts` with Cache-First strategy for static assets and offline fallbacks.  
Provide generated app icons.

- [ ] **Step 3: Implement Mobile Touch Gestures and Audio Polish**

- Add pinch-to-zoom and two-finger pan handling to Three.js canvas.
- Implement procedural Web Audio sound synthesizer (no external MP3 asset downloads required):
  - Wood tension creak.
  - Structural snap explosion.
  - Vehicle motor hum.
  - Victory fanfare.
- Add subtle water vertex wave animation in Three.js river plane.

- [ ] **Step 4: Run test suite, production build, and preview**

Run: `npx vitest run`  
Run: `npx vite build`  
Expected: All tests pass, production bundle is under 200 KB gzipped.

- [ ] **Step 5: Commit, Final Redeploy to Coolify & Final Review Gate**

```bash
git add public/ src/pwa/ src/audio/ vite.config.ts tests/
git commit -m "feat: complete Slice 5 with PWA service worker, mobile touch controls, and audio polish"
coolify deploy uuid <app_uuid>
```
**Final User Review Gate:** Provide live URL (`https://bridge.77.42.36.199.sslip.io`) for final full PWA test, offline audit, and final user sign-off.



