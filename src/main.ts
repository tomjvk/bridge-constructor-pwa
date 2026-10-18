import { SceneView } from './render/SceneView';
import { MaterialType } from './physics/Materials';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  const btnToggle = document.getElementById('btn-toggle-sim') as HTMLButtonElement | null;
  const statusEl = document.getElementById('sim-status');
  const strutsEl = document.getElementById('stat-struts');
  const costEl = document.getElementById('stat-cost');

  const btnRoad = document.getElementById('btn-road') as HTMLButtonElement | null;
  const btnWood = document.getElementById('btn-wood') as HTMLButtonElement | null;

  if (!container) return;

  const sceneView = new SceneView({
    container,
    onStatusChange: (status) => {
      if (statusEl) {
        statusEl.textContent = status;
        statusEl.style.color = status === 'Simulating' ? '#eab308' : '#22c55e';
      }
    },
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

  btnRoad?.addEventListener('click', () => selectMaterial('road'));
  btnWood?.addEventListener('click', () => selectMaterial('wood'));

  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      const isSimulating = sceneView.toggleSimulation();
      if (isSimulating) {
        btnToggle.textContent = '⏹ Reset Simulation';
        btnToggle.className = 'btn btn-warning';
      } else {
        btnToggle.textContent = '▶ Test Bridge';
        btnToggle.className = 'btn btn-success';
      }
    });
  }
});
