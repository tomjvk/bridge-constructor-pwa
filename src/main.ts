import { SceneView } from './render/SceneView';
import { GameStatus } from './game/GameLoop';
import { HUD, ToolType } from './ui/HUD';
import { LEVELS } from './game/LevelData';
import { registerPWA } from './pwa/registerServiceWorker';

registerPWA();

// Global error handler to catch and display any unexpected runtime errors
window.addEventListener('error', (event) => {
  console.error('BridgeConstructor Error:', event.error);
  const errBox = document.getElementById('debug-error-box');
  if (errBox) {
    errBox.style.display = 'block';
    errBox.textContent = `JS Error: ${event.message} at ${event.filename}:${event.lineno}`;
  }
});

function initApp(): void {
  const container = document.getElementById('canvas-container');
  if (!container) {
    console.error('Canvas container element not found!');
    return;
  }

  const winOverlay = document.getElementById('win-overlay');
  const lossOverlay = document.getElementById('loss-overlay');
  const btnWinReplay = document.getElementById('btn-win-replay');
  const btnWinNext = document.getElementById('btn-win-next');
  const btnLossRetry = document.getElementById('btn-loss-retry');
  const statusEl = document.getElementById('sim-status');

  let currentLevelIdx = 0;
  let sceneView: SceneView;

  const hud = new HUD({
    onToolSelect: (tool: ToolType) => {
      sceneView?.setTool(tool);
    },
    onUndo: () => {
      sceneView?.undo();
    },
    onLevelSelect: (levelId: number) => {
      const idx = LEVELS.findIndex((l) => l.id === levelId);
      if (idx !== -1) {
        currentLevelIdx = idx;
        const level = LEVELS[idx];
        sceneView?.loadLevel(level);
        hud.updateLevelInfo(level);
      }
    },
    onToggleSim: () => {
      sceneView?.toggleSimulation();
    },
    onReset: () => {
      sceneView?.resetSimulation();
    },
  });

  const updateStatusUI = (status: GameStatus) => {
    if (statusEl) {
      switch (status) {
        case 'building':
          statusEl.textContent = 'Build Mode';
          statusEl.style.color = '#22c55e';
          hud.setSimulating(false);
          if (winOverlay) winOverlay.style.display = 'none';
          if (lossOverlay) lossOverlay.style.display = 'none';
          break;
        case 'simulating':
          statusEl.textContent = 'Vehicle Driving...';
          statusEl.style.color = '#eab308';
          hud.setSimulating(true);
          if (winOverlay) winOverlay.style.display = 'none';
          if (lossOverlay) lossOverlay.style.display = 'none';
          break;
        case 'won':
          statusEl.textContent = 'Victory!';
          statusEl.style.color = '#4ade80';
          if (winOverlay) winOverlay.style.display = 'flex';
          break;
        case 'lost':
          statusEl.textContent = 'Bridge Collapsed!';
          statusEl.style.color = '#f87171';
          if (lossOverlay) lossOverlay.style.display = 'flex';
          break;
      }
    }
  };

  sceneView = new SceneView({
    container,
    level: LEVELS[0],
    onStatusChange: (status) => updateStatusUI(status),
    onStatsChange: (stats) => {
      hud.updateStats(stats.spent, stats.budget, stats.strutCount, stats.canUndo);
    },
  });

  hud.updateLevelInfo(LEVELS[0]);

  btnWinReplay?.addEventListener('click', (e) => {
    e.stopPropagation();
    sceneView.resetSimulation();
  });

  btnWinNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    currentLevelIdx = (currentLevelIdx + 1) % LEVELS.length;
    const nextLevel = LEVELS[currentLevelIdx];
    sceneView.loadLevel(nextLevel);
    hud.updateLevelInfo(nextLevel);
  });

  btnLossRetry?.addEventListener('click', (e) => {
    e.stopPropagation();
    sceneView.resetSimulation();
  });
}

// Ensure execution whether DOM is already loaded or still loading
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
