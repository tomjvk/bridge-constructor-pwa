import { Node, Strut } from '../physics/PBD';
import { Vector2 } from '../physics/Vector2';
import { MaterialType, MATERIALS } from '../physics/Materials';
import { LevelDef } from './LevelData';

export type UndoAction =
  | { type: 'add_strut'; strut: Strut; createdNode?: Node }
  | { type: 'delete_strut'; strut: Strut; removedNodes: Node[] };

export class BuildManager {
  public level: LevelDef;
  public nodes: Map<string, Node> = new Map();
  public struts: Strut[] = [];
  public undoStack: UndoAction[] = [];

  constructor(level: LevelDef) {
    this.level = level;
    this.loadLevel(level);
  }

  public loadLevel(level: LevelDef): void {
    this.level = level;
    this.nodes.clear();
    this.struts = [];
    this.undoStack = [];

    // Load anchors as permanent anchor nodes
    for (const a of level.anchors) {
      this.nodes.set(a.id, {
        id: a.id,
        pos: a.pos.clone(),
        prevPos: a.pos.clone(),
        isAnchor: a.isAnchor,
        mass: a.mass,
      });
    }
  }

  public getSpentBudget(): number {
    let cost = 0;
    for (const s of this.struts) {
      const mat = MATERIALS[s.material];
      cost += s.restLength * mat.costPerMeter;
    }
    return Math.round(cost);
  }

  public getRemainingBudget(): number {
    return Math.max(0, this.level.budget - this.getSpentBudget());
  }

  public findNodeNear(pos: { x: number; y: number }, radius = 0.3): Node | null {
    const target = new Vector2(pos.x, pos.y);
    let closest: Node | null = null;
    let minDist = radius;

    for (const node of this.nodes.values()) {
      const dist = node.pos.distanceTo(target);
      if (dist < minDist) {
        minDist = dist;
        closest = node;
      }
    }
    return closest;
  }

  public createStrut(
    startNodeId: string,
    targetPos: { x: number; y: number },
    material: MaterialType
  ): boolean {
    const nodeA = this.nodes.get(startNodeId);
    if (!nodeA) return false;

    let nodeB = this.findNodeNear(targetPos, 0.3);
    let createdNewNode: Node | undefined;

    const matProps = MATERIALS[material];
    const targetVec = nodeB ? nodeB.pos : new Vector2(targetPos.x, targetPos.y);
    const length = nodeA.pos.distanceTo(targetVec);

    if (length > matProps.maxLength || length < 0.2) {
      return false;
    }

    const cost = length * matProps.costPerMeter;
    if (this.getSpentBudget() + cost > this.level.budget) {
      return false; // Exceeds budget
    }

    if (!nodeB) {
      const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      nodeB = {
        id: newId,
        pos: targetVec.clone(),
        prevPos: targetVec.clone(),
        isAnchor: false,
        mass: 15,
      };
      this.nodes.set(newId, nodeB);
      createdNewNode = nodeB;
    } else if (nodeB.id === nodeA.id) {
      return false;
    }

    // Check if strut already exists
    const exists = this.struts.some(
      s => (s.nodeAId === nodeA.id && s.nodeBId === nodeB!.id) ||
           (s.nodeAId === nodeB!.id && s.nodeBId === nodeA.id)
    );
    if (exists) {
      if (createdNewNode) {
        this.nodes.delete(createdNewNode.id);
      }
      return false;
    }

    const strut: Strut = {
      id: `strut_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nodeAId: nodeA.id,
      nodeBId: nodeB.id,
      material,
      restLength: length,
      currentLength: length,
      stress: 0,
      isBroken: false,
    };

    this.struts.push(strut);
    this.undoStack.push({
      type: 'add_strut',
      strut,
      createdNode: createdNewNode,
    });

    return true;
  }

  public deleteStrut(strutId: string): boolean {
    const idx = this.struts.findIndex(s => s.id === strutId);
    if (idx === -1) return false;

    const [deletedStrut] = this.struts.splice(idx, 1);
    const removedNodes: Node[] = [];

    // Clean up orphan free nodes (nodes that have 0 struts left and are not anchors)
    for (const nodeId of [deletedStrut.nodeAId, deletedStrut.nodeBId]) {
      const node = this.nodes.get(nodeId);
      if (node && !node.isAnchor) {
        const hasOtherStruts = this.struts.some(
          s => s.nodeAId === nodeId || s.nodeBId === nodeId
        );
        if (!hasOtherStruts) {
          this.nodes.delete(nodeId);
          removedNodes.push(node);
        }
      }
    }

    this.undoStack.push({
      type: 'delete_strut',
      strut: deletedStrut,
      removedNodes,
    });

    return true;
  }

  public undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;

    if (action.type === 'add_strut') {
      // Remove added strut
      const idx = this.struts.findIndex(s => s.id === action.strut.id);
      if (idx !== -1) {
        this.struts.splice(idx, 1);
      }
      // Remove created node if it was new
      if (action.createdNode) {
        this.nodes.delete(action.createdNode.id);
      }
      return true;
    } else if (action.type === 'delete_strut') {
      // Restore deleted strut
      this.struts.push(action.strut);
      // Restore any removed orphan nodes
      for (const node of action.removedNodes) {
        this.nodes.set(node.id, node);
      }
      return true;
    }

    return false;
  }
}
