export interface Point {
  x: number;
  y: number;
}

export interface DrawStyle {
  color: string;
  lineWidth: number;
}

export interface HandLandmarkerResult {
  landmarks: Point[][];
  worldLandmarks: Point[][];
}

export enum ToolMode {
  DRAW = 'DRAW',
  ERASER = 'ERASER',
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;     // 0.0 to 1.0
  decay: number;    // How fast it fades
  size: number;
  color: string;
}