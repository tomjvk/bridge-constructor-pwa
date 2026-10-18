import { SceneView } from './render/SceneView';
import { MaterialType } from './physics/Materials';
import { GameStatus } from './game/GameLoop';

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
  const btnToggle = document.getElementById('btn-toggle-sim') as HTMLButtonElement | null;
  const statusEl = document.getElementById('sim-status');
  const strutsEl = document.getElementById('stat-struts');
  const costEl = document.getElementById('stat-cost');

  const btnRoad = document.getElementById('btn-road') as HTMLButtonElement | null;
  const btnWood = document.getElementById('btn-wood') as HTMLButtonElement | null;

  const winOverlay = document.getElementById('win-overlay');
  const lossOverlay = document.getElementById('loss-overlay');
  const btnWinReplay = document.getElementById('btn-win-replay');
  const btnLossRetry = document.getElementById('btn-loss-retry');

  if (!container) {
    console.error('Canvas container element not found!');
    return;
  }

  const updateStatusUI = (status: GameStatus) => {
    if (!statusEl) return;
    switch (status) {
      case 'building':
        statusEl.textContent = 'Build Mode';
        statusEl.style.color = '#22c55e';
        if (btnToggle) {
          btnToggle.textContent = '▶ Test Bridge';
          btnToggle.className = 'btn btn-success';
        }
        if (winOverlay) winOverlay.style.display = 'none';
        if (lossOverlay) lossOverlay.style.display = 'none';
        break;
      case 'simulating':
        statusEl.textContent = 'Vehicle Driving...';
        statusEl.style.color = '#eab308';
        if (btnToggle) {
          btnToggle.textContent = '⏹ Reset Simulation';
          btnToggle.className = 'btn btn-warning';
        }
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
  };

  const sceneView = new SceneView({
    container,
    onStatusChange: (status) => updateStatusUI(status),
    onStatsChange: (stats) => {
      if (strutsEl) strutsEl.textContent = stats.strutCount.toString();
      if (costEl) costEl.textContent = `$${stats.cost.toLocaleString()}`;
    },
  });

  const selectMaterial = (mat: MaterialType) => {
    sceneView.setMaterial(mat);
    if (mat === 'road') {
      btnRoad?.classList.add('active');
      btnWood?.classList.remove('active');
    } else {
      btnWood?.classList.add('active');
      btnRoad?.classList.remove('active');
    }
  };

  btnRoad?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectMaterial('road');
  });

  btnWood?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectMaterial('wood');
  });

  if (btnToggle) {
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sceneView.toggleSimulation();
    });
  }

  btnWinReplay?.addEventListener('click', (e) => {
    e.stopPropagation();
    sceneView.resetSimulation();
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
