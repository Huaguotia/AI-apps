export const PINCH_THRESHOLD = 0.05; // Distance between thumb and index to trigger draw
export const SMOOTHING_FACTOR = 0.25; // Lower = smoother but more lag (0 to 1)

export const DEFAULT_BRUSH_SIZE = 8;
export const DEFAULT_COLOR = '#3b82f6'; // Blue-500

// Particle System Constants
export const PARTICLE_MAX_LIFE = 1.0;
export const PARTICLE_DECAY_RATE = 0.0; // 0 = Persistent (do not fade automatically)
export const PARTICLE_SPAWN_RATE = 10; // Increased density
export const PARTICLE_FRICTION = 0.92; // Slows particles down to stabilize the drawing

// Audio Reactivity Constants
export const AUDIO_WIND_THRESHOLD = 30; // Volume level (0-255) to trigger wind
export const WIND_FORCE = 3.0; // Stronger force to scatter stationary particles
export const WIND_ACTION_DECAY = 0.03; // How fast particles fade when blown

export const COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#ffffff', // White
  '#000000', // Black
];

export const BRUSH_SIZES = [4, 8, 12, 16, 24];