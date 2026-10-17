# Bridge Constructor PWA - MVP Design Specification

**Date:** 2026-10-17  
**Status:** Approved for Implementation  
**Project Location:** `/root/projects/bridge-constructor-pwa`  
**Target Platform:** Modern Web Browsers & Installable Progressive Web App (PWA)

---

## 1. Overview & Vision

Bridge Constructor PWA is a responsive, web-based 2.5D structural engineering puzzle game inspired by classic physics builders (*Poly Bridge*, *Bridge Builder*, *Cargo Bridge*). 

Players design bridges across gaps and chasms using limited budgets and materials, then initiate physics simulation to test whether their structure can support a moving vehicle without snapping or collapsing.

### Key Goals
- **Playable in Browser & Downloadable as PWA:** Instant load times, offline-first operation, and mobile "Add to Home Screen" support.
- **2.5D Low-Poly Aesthetic (Three.js):** Modern, charming 3D visual presentation with stylized cliffs, water, and procedural vehicles.
- **Rock-Solid, Deterministic Physics:** Fast 2D Position-Based Dynamics (PBD) solver calculating true structural tension and compression strain with real-time green-to-red stress heatmaps.

---

## 2. Technical Stack & Architecture

### Stack
- **Language & Runtime:** TypeScript (strict mode)
- **Build Tool:** Vite
- **Renderer:** Three.js (WebGL)
- **Physics Engine:** Custom 2D Position-Based Dynamics (PBD) / Verlet solver
- **Testing:** Vitest (unit testing physics constraints, stress calculations, and level definitions)
- **PWA:** `vite-plugin-pwa` with custom Service Worker configuration

### Architecture Layers

```
┌────────────────────────────────────────────────────────┐
│                        App Root                        │
│                   (UI HUD & Canvas)                    │
└───────────────────────────┬────────────────────────────┘
                            │
       ┌────────────────────┴───────────────────┐
       ▼                                        ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│        Physics Engine        │ │      Three.js Renderer       │
│        (2D Simulation)       │ │     (3D Visual Scene)        │
│ • Nodes (Points)             │ │ • Procedural Low-Poly Terrain│
│ • Struts (PBD Constraints)   │ │ • Water Shader / Surface     │
│ • Stress & Snapping Logic    │ │ • Dynamic 3D Struts & Joints │
│ • Vehicle & Wheel Collision  │ │ • Low-Poly 3D Vehicle        │
└──────────────┬───────────────┘ └──────────────┬───────────────┘
               │                                │
               └───────────────┬────────────────┘
                               ▼
               ┌───────────────────────────────┐
               │          Game State           │
               │ • Mode: Build vs Simulate     │
               │ • Tool: Road, Wood, Delete    │
               │ • Budget & Level Goals        │
               │ • LocalStorage Save Data      │
               └───────────────────────────────┘
```

---

## 3. Data Models & Coordinates

### Coordinate System
* **Physics Space (2D):** Standard Cartesian $(x, y)$ in meters. Gravity vector $\vec{g} = (0, -9.81)\text{ m/s}^2$. Ground/water baseline at $y = 0$.
* **Render Space (3D):** Three.js coordinates $(X, Y, Z)$.
  * Physics plane sits at $Z = 0$.
  * Bridge width extends symmetrically from $Z = -0.5\text{m}$ to $Z = +0.5\text{m}$ to give depth to 3D road decks and trusses.

### Core Types

```typescript
export type MaterialType = 'road' | 'wood';

export interface MaterialProperties {
  type: MaterialType;
  costPerMeter: number;     // Road: $100/m, Wood: $40/m
  maxLength: number;        // Road: 2.0m, Wood: 2.5m
  stiffness: number;        // PBD compliance/relaxation factor (0.95 - 1.0)
  maxStrain: number;        // Relative stretch/compression before snapping (e.g. 0.15 = 15%)
  massPerMeter: number;     // Road: 15 kg/m, Wood: 5 kg/m
  isDriveable: boolean;     // Only road struts support vehicle wheels
}

export interface Node {
  id: string;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  isAnchor: boolean;        // Fixed in space (cannot be moved by physics)
  mass: number;             // Total mass gathered from connected struts
}

export interface Strut {
  id: string;
  nodeAId: string;
  nodeBId: string;
  material: MaterialType;
  restLength: number;
  currentLength: number;
  stress: number;           // 0.0 (idle) to 1.0 (breaking threshold)
  isBroken: boolean;
}

export interface Vehicle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  mass: number;
  wheelBase: number;
  wheelRadius: number;
  motorTorque: number;
  frontWheelOnGround: boolean;
  rearWheelOnGround: boolean;
}
```

---

## 4. Physics Engine & Math Mechanics

### 4.1 Position-Based Dynamics (PBD) Solver
The simulation runs at a fixed timestep $\Delta t = 1/60\text{s}$, subdivided into $N = 15$ relaxation sub-iterations per frame.

1. **Explicit Integration:**
   $$\vec{v} \leftarrow \vec{v} + \vec{g} \Delta t$$
   $$\vec{x}_{\text{prev}} \leftarrow \vec{x}$$
   $$\vec{x} \leftarrow \vec{x} + \vec{v} \Delta t$$
2. **Constraint Relaxation Loop ($15\times$ per step):**
   For each unbroken strut between $\vec{x}_A$ and $\vec{x}_B$:
   $$\vec{\Delta} = \vec{x}_B - \vec{x}_A, \quad L = \|\vec{\Delta}\|$$
   $$\text{difference} = \frac{L - L_0}{L}$$
   If Node A is free and Node B is anchor: $\vec{x}_A \leftarrow \vec{x}_A + \vec{\Delta} \cdot \text{difference} \cdot k$.  
   If both are free: each receives half the positional correction.
3. **Stress Calculation & Structural Snapping:**
   $$\text{strain} = \frac{|L - L_0|}{L_0}$$
   $$\text{stress} = \frac{\text{strain}}{\epsilon_{\text{break}}}$$
   * When $\text{stress} \ge 1.0$, the strut snaps: `isBroken = true`. The strut disconnects from the constraint list and spawns a splinter particle effect in Three.js.
4. **Velocity Update:**
   $$\vec{v} \leftarrow \frac{\vec{x} - \vec{x}_{\text{prev}}}{\Delta t} \cdot (1 - \text{damping})$$

### 4.2 Vehicle & Wheel Contact Mechanics
* The vehicle is modeled as a rigid body with two wheels (front and rear).
* Wheels perform ray/segment circle collision checks against active, unbroken **Road** struts.
* Motor torque applies a forward driving force tangential to the road segment currently beneath the rear wheel.
* If all road struts beneath the car break or tilt beyond $90^\circ$, the vehicle tumbles into the chasm.

---

## 5. Game Modes & User Interaction

### 5.1 Build Mode
* **Grid Overlay:** Displayed at $1.0\text{m}$ intervals on the $Z=0$ plane.
* **Anchor Nodes:** Immobile anchor points embedded on cliff faces.
* **Creating Struts:**
  1. Pointer down on an existing node or anchor.
  2. Drag outward: A dynamic ghost strut extends from the node.
  3. Pointer snaps to grid points or nearby existing nodes within $0.3\text{m}$.
  4. HUD displays current strut length and cost. If length $>$ max length or budget is exceeded, the strut turns red and cannot be placed.
  5. Pointer up: Instantiates node (if new) and strut.
* **Editing Tools:**
  * **Road Tool:** Draws asphalt road struts.
  * **Wood Tool:** Draws structural wooden trusses.
  * **Delete/Eraser:** Tapping any strut or unanchored node removes it and refunds its cost.
  * **Undo:** Reverts the previous build operation.
  * **Clear All:** Clears all non-anchor struts.

### 5.2 Simulation Mode
* Initiated by clicking the **[▶ Test]** button.
* Camera shifts smoothly to an action tracking view.
* Vehicle drives from the left staging ground across the bridge toward the right goal.
* Real-time stress is calculated and visual materials update continuously.
* **Victory:** Vehicle crosses the finish line flag on the right bank.
  * Stars awarded: 3 stars (under 75% budget), 2 stars (under 100% budget), 1 star (completed).
* **Failure:** Vehicle falls below $Y < -1.0\text{m}$ (into the river) or vehicle stops moving for $> 3\text{s}$.
  * Displays "Bridge Collapsed! [Retry / Edit]".
  * Clicking [Edit] instantly restores the bridge to its pre-simulation build state.

---

## 6. Visual Presentation & Three.js

* **Low-Poly Scenic Environment:**
  * Procedurally generated low-poly rock cliff walls on the left and right sides of the chasm.
  * Water plane with vertex sinusoidal animation and subtle transparency.
  * Distant low-poly background hills and clouds.
* **Bridge Rendering:**
  * **Roads:** Extruded 3D asphalt box with yellow dividing center line and guardrail edges.
  * **Wood Struts:** Procedural 3D octagonal or square wooden beams.
  * **Stress Color Shader:** Dynamically modifies beam color:
    * Green: $0\% - 40\%$ stress
    * Yellow: $40\% - 75\%$ stress
    * Orange/Red: $75\% - 99\%$ stress
    * Red flash & snap: $\ge 100\%$
* **Controls & Camera:**
  * Orthographic camera with fixed viewing angle $(X, Y, Z)$ ensuring consistent grid alignment.
  * Screen-to-plane raycaster targeting the plane $Z = 0$ for high-precision pointer/touch interaction.
  * Desktop: Mouse drag, scroll-to-zoom.
  * Mobile: 1-finger draw, 2-finger pinch-zoom and pan.

---

## 7. Progressive Web App (PWA) & Offline Architecture

* **Web App Manifest (`manifest.webmanifest`):**
  * `name`: "Bridge Builder 3D"
  * `short_name`: "BridgeBuilder"
  * `display`: "standalone"
  * `orientation`: "landscape"
  * `theme_color`: "#1a2230"
  * `background_color`: "#0f1722"
  * High-res icons ($192\times192$ and $512\times512$).
* **Service Worker:**
  * Uses Cache-First strategy for application shell, JavaScript bundles, styles, and web workers.
  * Full offline capability: The game is 100% functional with zero internet connection once cached.
* **Storage (`localStorage`):**
  * Stores level progression status (unlocked levels 1–3).
  * Stores stars achieved and lowest budget spent per level.
  * Persists player's custom bridge layout so designs are not lost when closing the tab or app.

---

## 8. MVP Progression Levels

| Level | Name | Gap Distance | Obstacles & Terrains | Vehicle Type | Budget Limit |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **1** | **The First Crossing** | $8.0\text{m}$ | Flat gap between two even cliffs. 4 anchor nodes available (2 road anchors, 2 lower support anchors). | Compact Sedan (Mass: $800\text{kg}$) | \$3,000 |
| **2** | **Island Stepping Stone** | $14.0\text{m}$ | Wide river with a rocky island pillar in the center providing 2 mid-river anchor nodes. | Station Wagon (Mass: $1,200\text{kg}$) | \$6,500 |
| **3** | **The Heavy Haul** | $12.0\text{m}$ | Deep chasm without central anchors. Uneven cliff heights (left bank higher than right bank). Requires strong triangular trussing. | Heavy Semi-Truck (Mass: $2,500\text{kg}$) | \$9,000 |

---

## 9. Testing & Quality Assurance

* **Physics Unit Tests (Vitest):**
  * `PBD.test.ts`: Tests distance constraint resolution, verifying that a 2-node spring converges to rest length after relaxation.
  * `Stress.test.ts`: Verifies stress ratio formulas and ensures struts correctly snap when strain exceeds `maxStrain`.
  * `VehicleCollision.test.ts`: Verifies wheel collision against horizontal and angled road segments.
* **Cross-Device UI Tests:**
  * Verifies touch events properly translate to raycast grid coordinates on mobile screens.
  * Verifies landscape layout responsiveness across mobile, tablet, and desktop viewports.
* **PWA Lighthouse Audit:**
  * Verifies PWA installability criteria, service worker registration, and offline operation.
