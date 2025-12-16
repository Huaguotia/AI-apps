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

export enum AppMode {
  FREE_DRAW = 'FREE_DRAW',
  GESTURE = 'GESTURE',
}

export enum ParticleState {
  ALIVE = 'ALIVE',
  GATHERING = 'GATHERING', // Being sucked into a ball
  EXPLODING = 'EXPLODING', // Blown away
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
  isBlown?: boolean; // Tracks if the particle has been hit by wind
  strokeId: number;  // Identifies the stroke this particle belongs to
  
  // New properties for Shape/Gesture logic
  state: ParticleState;
  originX?: number;  // For shape reconstruction if needed, or gathering target
  originY?: number;
  gatheringTargetX?: number;
  gatheringTargetY?: number;
}