export const PINCH_THRESHOLD = 0.05; // Distance between thumb and index to trigger draw
export const SMOOTHING_FACTOR = 0.2; // Slightly smoother (was 0.25)

export const DEFAULT_BRUSH_SIZE = 6; // Much thinner default (was 24)
export const DEFAULT_COLOR = '#3b82f6'; // Blue-500

// Particle System Constants
export const PARTICLE_MAX_LIFE = 1.0;
export const PARTICLE_DECAY_RATE = 0.0; // Persistent
export const PARTICLE_SPAWN_RATE = 15; // Adjusted for thinner brushes
export const PARTICLE_FRICTION = 0.90; // Stop quickly to hold shape in air

// Audio Reactivity Constants
export const AUDIO_WIND_THRESHOLD = 30; // Volume level (0-255) to trigger wind
export const WIND_FORCE = 4.0; // Strong scatter force
export const WIND_ACTION_DECAY = 0.05; // Fade fast when blowing

export const COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#ffffff', // White
  '#00ffff', // Cyan (Neon)
];

// Finer brush sizes range
export const BRUSH_SIZES = [2, 4, 8, 12, 16];