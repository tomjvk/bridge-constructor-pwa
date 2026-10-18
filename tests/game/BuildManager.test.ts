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

  it('prevents building if cost exceeds level budget', () => {
    const smallBudgetLevel = { ...LEVELS[0], budget: 50 };
    const mgr = new BuildManager(smallBudgetLevel);

    // 2m road at $100/m = $200 > $50
    const added = mgr.createStrut('anchor_left', { x: 2, y: 0 }, 'road');
    expect(added).toBe(false);
    expect(mgr.struts.length).toBe(0);
  });

  it('deletes strut, cleans orphan node, and allows undo', () => {
    const mgr = new BuildManager(LEVELS[0]);
    const added = mgr.createStrut('anchor_left', { x: 1.5, y: 0 }, 'wood');
    expect(added).toBe(true);
    expect(mgr.struts.length).toBe(1);

    const strutId = mgr.struts[0].id;
    const initialNodeCount = mgr.nodes.size;

    // Delete strut
    const deleted = mgr.deleteStrut(strutId);
    expect(deleted).toBe(true);
    expect(mgr.struts.length).toBe(0);
    expect(mgr.nodes.size).toBe(initialNodeCount - 1); // Orphan free node cleaned up

    // Undo delete
    const undone = mgr.undo();
    expect(undone).toBe(true);
    expect(mgr.struts.length).toBe(1);
    expect(mgr.nodes.size).toBe(initialNodeCount);
  });

  it('loads level definitions properly with anchors and resets state', () => {
    const mgr = new BuildManager(LEVELS[0]);
    mgr.createStrut('anchor_left', { x: 1.5, y: 0 }, 'wood');

    mgr.loadLevel(LEVELS[1]); // The Central Island
    expect(mgr.level.id).toBe(2);
    expect(mgr.struts.length).toBe(0);
    expect(mgr.undoStack.length).toBe(0);
    expect(mgr.nodes.has('anchor_M1')).toBe(true);
  });
});
