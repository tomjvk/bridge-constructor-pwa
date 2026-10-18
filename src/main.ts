import { SceneView } from './render/SceneView';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  const btnToggle = document.getElementById('btn-toggle-sim') as HTMLButtonElement | null;
  const statusEl = document.getElementById('sim-status');

  if (!container) return;

  const sceneView = new SceneView({
    container,
    onStatusChange: (status) => {
      if (statusEl) {
        statusEl.textContent = status;
        statusEl.style.color = status === 'Simulating' ? '#eab308' : '#22c55e';
      }
    },
  });

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
