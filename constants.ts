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
export const AUDIO_WIND_THRESHOLD = 15; // Lowered for better sensitivity (was 35)
export const WIND_FORCE = 4.0; // Strong scatter force
export const WIND_ACTION_DECAY = 0.05; // Fade fast when blowing

// Facial Expression Constants
// Width of mouth divided by Height of mouth.
// Normal mouth is wide (Ratio > 1.5). Pouting/Blowing is round (Ratio < 1.0 - 1.2).
export const POUT_RATIO_THRESHOLD = 1.8; // Relaxed threshold (was 1.25) to catch more blowing shapes
export const MOUTH_OPEN_THRESHOLD = 0.05; // Minimum openness relative to face height to be considered "Open"
export const MOUTH_CLOSING_SENSITIVITY = 0.005; // How much it needs to close to register movement

// Wind Physics
export const WIND_SUSTAIN_MS = 500; // How long wind continues after detection stops (smooths flickering)

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