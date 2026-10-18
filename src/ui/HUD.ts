import { LevelDef, LEVELS } from '../game/LevelData';
import { MaterialType } from '../physics/Materials';

export type ToolType = MaterialType | 'eraser';

export interface HUDEvents {
  onToolSelect: (tool: ToolType) => void;
  onUndo: () => void;
  onLevelSelect: (levelId: number) => void;
  onToggleSim: () => void;
  onReset: () => void;
}

export class HUD {
  private events: HUDEvents;
  public activeTool: ToolType = 'road';

  // DOM Elements
  private levelTitleEl: HTMLElement | null = null;
  private levelDescEl: HTMLElement | null = null;
  private budgetSpentEl: HTMLElement | null = null;
  private budgetMaxEl: HTMLElement | null = null;
  private budgetBarEl: HTMLElement | null = null;
  private strutCountEl: HTMLElement | null = null;
  private btnRoad: HTMLElement | null = null;
  private btnWood: HTMLElement | null = null;
  private btnEraser: HTMLElement | null = null;
  private btnUndo: HTMLButtonElement | null = null;
  private btnToggleSim: HTMLButtonElement | null = null;
  private levelSelectEl: HTMLSelectElement | null = null;

  constructor(events: HUDEvents) {
    this.events = events;
    this.bindDOM();
  }

  private bindDOM(): void {
    this.levelTitleEl = document.getElementById('level-title');
    this.levelDescEl = document.getElementById('level-desc');
    this.budgetSpentEl = document.getElementById('budget-spent');
    this.budgetMaxEl = document.getElementById('budget-max');
    this.budgetBarEl = document.getElementById('budget-progress-fill');
    this.strutCountEl = document.getElementById('stat-struts');

    this.btnRoad = document.getElementById('btn-road');
    this.btnWood = document.getElementById('btn-wood');
    this.btnEraser = document.getElementById('btn-eraser');
    this.btnUndo = document.getElementById('btn-undo') as HTMLButtonElement | null;
    this.btnToggleSim = document.getElementById('btn-toggle-sim') as HTMLButtonElement | null;
    this.levelSelectEl = document.getElementById('level-select') as HTMLSelectElement | null;

    this.btnRoad?.addEventListener('click', () => this.setTool('road'));
    this.btnWood?.addEventListener('click', () => this.setTool('wood'));
    this.btnEraser?.addEventListener('click', () => this.setTool('eraser'));

    this.btnUndo?.addEventListener('click', () => this.events.onUndo());
    this.btnToggleSim?.addEventListener('click', () => this.events.onToggleSim());

    if (this.levelSelectEl) {
      this.levelSelectEl.innerHTML = LEVELS.map(
        l => `<option value="${l.id}">Level ${l.id}: ${l.name}</option>`
      ).join('');
      this.levelSelectEl.addEventListener('change', (e) => {
        const val = parseInt((e.target as HTMLSelectElement).value, 10);
        this.events.onLevelSelect(val);
      });
    }
  }

  public setTool(tool: ToolType): void {
    this.activeTool = tool;
    this.btnRoad?.classList.toggle('active', tool === 'road');
    this.btnWood?.classList.toggle('active', tool === 'wood');
    this.btnEraser?.classList.toggle('active', tool === 'eraser');
    this.events.onToolSelect(tool);
  }

  public updateLevelInfo(level: LevelDef): void {
    if (this.levelTitleEl) this.levelTitleEl.textContent = `Level ${level.id}: ${level.name}`;
    if (this.levelDescEl) this.levelDescEl.textContent = level.description;
    if (this.budgetMaxEl) this.budgetMaxEl.textContent = `$${level.budget.toLocaleString()}`;
    if (this.levelSelectEl) this.levelSelectEl.value = level.id.toString();
  }

  public updateStats(spent: number, total: number, strutCount: number, canUndo: boolean): void {
    if (this.budgetSpentEl) this.budgetSpentEl.textContent = `$${spent.toLocaleString()}`;
    if (this.strutCountEl) this.strutCountEl.textContent = strutCount.toString();

    if (this.btnUndo) {
      this.btnUndo.disabled = !canUndo;
      this.btnUndo.style.opacity = canUndo ? '1' : '0.5';
    }

    if (this.budgetBarEl) {
      const pct = Math.min(100, Math.round((spent / total) * 100));
      this.budgetBarEl.style.width = `${pct}%`;
      if (pct > 90) {
        this.budgetBarEl.style.background = '#ef4444'; // Red
      } else if (pct > 70) {
        this.budgetBarEl.style.background = '#eab308'; // Yellow
      } else {
        this.budgetBarEl.style.background = '#22c55e'; // Green
      }
    }
  }

  public setSimulating(isSimulating: boolean): void {
    if (!this.btnToggleSim) return;
    if (isSimulating) {
      this.btnToggleSim.textContent = '⏹ Reset Simulation';
      this.btnToggleSim.className = 'btn btn-warning';
    } else {
      this.btnToggleSim.textContent = '▶ Test Bridge';
      this.btnToggleSim.className = 'btn btn-success';
    }
  }
}
