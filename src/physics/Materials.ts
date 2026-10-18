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

export const MATERIALS: Record<MaterialType, MaterialProperties> = {
  road: {
    type: 'road',
    costPerMeter: 100,
    maxLength: 2.0,
    stiffness: 1.0,
    maxStrain: 0.10, // 10%
    massPerMeter: 15,
    isDriveable: true,
  },
  wood: {
    type: 'wood',
    costPerMeter: 40,
    maxLength: 2.5,
    stiffness: 0.95,
    maxStrain: 0.15, // 15%
    massPerMeter: 5,
    isDriveable: false,
  },
};
