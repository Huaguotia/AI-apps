import React, { useEffect, useRef, useState, useCallback } from 'react';
import { initializeHandLandmarker } from '../services/mediaPipeService';
import { 
  PINCH_THRESHOLD, 
  SMOOTHING_FACTOR, 
  PARTICLE_DECAY_RATE, 
  PARTICLE_SPAWN_RATE,
  AUDIO_WIND_THRESHOLD,
  WIND_FORCE,
  WIND_ACTION_DECAY,
  PARTICLE_FRICTION
} from '../constants';
import { Point, ToolMode, Particle } from '../types';

interface ARCanvasProps {
  color: string;
  brushSize: number;
  toolMode: ToolMode;
  onClearTrigger: number;
}

export const ARCanvas: React.FC<ARCanvasProps> = ({
  color,
  brushSize,
  toolMode,
  onClearTrigger,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  
  // Systems Refs
  const particlesRef = useRef<Particle[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  
  // State for tracking status
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isWindyState, setIsWindyState] = useState(false); // For UI feedback

  // Drawing state refs
  const lastPoint = useRef<Point | null>(null);
  const requestRef = useRef<number>();

  // Helper: Create a new particle
  const createParticle = (x: number, y: number, color: string, size: number): Particle => {
    const angle = Math.random() * Math.PI * 2;
    // Initial burst speed
    const speed = Math.random() * 1.5;
    return {
      x: x + (Math.random() - 0.5) * size * 0.5, // Tighter grouping
      y: y + (Math.random() - 0.5) * size * 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed, 
      life: 1.0,
      decay: PARTICLE_DECAY_RATE, // Set to 0 in constants for persistence
      size: Math.random() * size * 0.6 + 2, 
      color: color,
    };
  };

  // Initialize Camera & Audio
  useEffect(() => {
    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: true, // Request microphone
        });
        
        // Video Setup
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', () => {
             setPermissionGranted(true);
          });
        }

        // Audio Setup
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        const source = audioCtx.createMediaStreamSource(stream);
        
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
        dataArrayRef.current = dataArray;

      } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Camera and Microphone permissions are required.');
      }
    };

    startMedia();
    
    // Cleanup Audio Context
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Initialize MediaPipe
  useEffect(() => {
    const initModel = async () => {
      try {
        await initializeHandLandmarker();
        setIsModelLoaded(true);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load MediaPipe model:", error);
      }
    };
    initModel();
  }, []);

  // Handle Clear
  useEffect(() => {
    particlesRef.current = [];
  }, [onClearTrigger]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && videoRef.current) {
         canvasRef.current.width = window.innerWidth;
         canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);


  // Core Loop
  const detectAndDraw = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = await initializeHandLandmarker();

    if (!video || !canvas || !landmarker || video.readyState !== 4) {
      requestRef.current = requestAnimationFrame(detectAndDraw);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- 1. Audio Analysis (Wind Detection) ---
    let isWindy = false;
    if (analyserRef.current && dataArrayRef.current) {
      analyserRef.current.getByteFrequencyData(dataArrayRef.current);
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i];
      }
      const averageVolume = sum / dataArrayRef.current.length;
      
      if (averageVolume > AUDIO_WIND_THRESHOLD) {
        isWindy = true;
      }
      
      // Update state sparingly to avoid react render lag
      if (Math.random() > 0.9) setIsWindyState(isWindy);
    }

    // --- 2. Hand Tracking ---
    const startTimeMs = performance.now();
    const results = landmarker.detectForVideo(video, startTimeMs);
    let handDetected = false;
    let pinchDistance = 1;
    let newPoint = { x: 0, y: 0 };

    if (results.landmarks && results.landmarks.length > 0) {
      handDetected = true;
      const landmarks = results.landmarks[0];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      // Screen coords (mirrored)
      const rawX = (1 - indexTip.x) * canvas.width;
      const rawY = indexTip.y * canvas.height;

      pinchDistance = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2)
      );

      // Smooth coordinates
      const currentX = lastPoint.current 
        ? lastPoint.current.x + (rawX - lastPoint.current.x) * SMOOTHING_FACTOR
        : rawX;
      const currentY = lastPoint.current 
        ? lastPoint.current.y + (rawY - lastPoint.current.y) * SMOOTHING_FACTOR
        : rawY;

      newPoint = { x: currentX, y: currentY };
      lastPoint.current = newPoint;
      
      // Update Cursor
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${currentX}px, ${currentY}px)`;
        cursorRef.current.style.opacity = '1';
        const innerCursor = cursorRef.current.firstElementChild as HTMLElement;
        
        if (pinchDistance < PINCH_THRESHOLD) {
           cursorRef.current.style.width = '20px';
           cursorRef.current.style.height = '20px';
           cursorRef.current.style.borderWidth = '0px';
           if (innerCursor) {
             innerCursor.style.transform = 'scale(1.2)';
             innerCursor.style.backgroundColor = toolMode === ToolMode.ERASER ? '#ef4444' : color;
           }
        } else {
           cursorRef.current.style.width = '32px';
           cursorRef.current.style.height = '32px';
           cursorRef.current.style.borderWidth = '2px';
           if (innerCursor) {
             innerCursor.style.transform = 'scale(0.5)';
             innerCursor.style.backgroundColor = color;
           }
        }
      }
    } else {
      if (cursorRef.current) cursorRef.current.style.opacity = '0';
      lastPoint.current = null;
    }

    // --- 3. Particle Spawning & Interaction ---
    if (handDetected && pinchDistance < PINCH_THRESHOLD) {
      if (toolMode === ToolMode.DRAW) {
        // Spawn particles
        for (let i = 0; i < PARTICLE_SPAWN_RATE; i++) {
          particlesRef.current.push(
            createParticle(newPoint.x, newPoint.y, color, brushSize)
          );
        }
      } else if (toolMode === ToolMode.ERASER) {
        // Remove particles near cursor
        const eraserRadius = brushSize * 4;
        particlesRef.current = particlesRef.current.filter(p => {
          const dx = p.x - newPoint.x;
          const dy = p.y - newPoint.y;
          return (dx*dx + dy*dy) > (eraserRadius * eraserRadius);
        });
      }
    }

    // Limit total particles to prevent crash
    if (particlesRef.current.length > 5000) {
      particlesRef.current = particlesRef.current.slice(particlesRef.current.length - 5000);
    }

    // --- 4. Render & Update Particles ---
    // Clear the entire canvas for the next frame of animation
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Additive blending for glowing effect
    ctx.globalCompositeOperation = 'lighter'; 

    for (let i = 0; i < particlesRef.current.length; i++) {
      const p = particlesRef.current[i];

      if (isWindy) {
        // Wind Mode: Turbulence and rapid fade
        p.vx += (Math.random() - 0.5) * WIND_FORCE;
        p.vy += (Math.random() - 0.5) * WIND_FORCE;
        p.life -= WIND_ACTION_DECAY;
        
        // Apply position
        p.x += p.vx;
        p.y += p.vy;
      } else {
        // Normal Mode: Physics with Friction (Stabilize)
        p.x += p.vx;
        p.y += p.vy;
        
        // Apply Friction to stop them from drifting forever
        p.vx *= PARTICLE_FRICTION;
        p.vy *= PARTICLE_FRICTION;
        
        // Natural decay (which is 0 by default now)
        p.life -= p.decay;
      }

      // Draw
      if (p.life > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.fill();
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // Remove dead particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    requestRef.current = requestAnimationFrame(detectAndDraw);
  }, [color, brushSize, toolMode]);

  useEffect(() => {
    if (isModelLoaded && permissionGranted) {
      requestRef.current = requestAnimationFrame(detectAndDraw);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isModelLoaded, permissionGranted, detectAndDraw]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {isLoading && (
         <div className="absolute inset-0 flex items-center justify-center z-50 bg-slate-900 text-white flex-col gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-medium animate-pulse">Initializing Vision & Audio...</p>
         </div>
      )}

      {/* Wind Indicator */}
      {isWindyState && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
          <p className="text-6xl font-bold text-white/20 animate-pulse tracking-widest uppercase">Windy</p>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 opacity-80"
      />
      
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Cursor */}
      <div 
        ref={cursorRef}
        className="fixed top-0 left-0 w-8 h-8 border-2 border-white rounded-full pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75 z-40 flex items-center justify-center shadow-[0_0_10px_rgba(255,255,255,0.3)] opacity-0"
      >
        <div className="w-full h-full rounded-full transition-all duration-150" style={{ backgroundColor: color }}></div>
      </div>
      
      {!isLoading && (
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur text-white px-6 py-3 rounded-full pointer-events-none animate-bounce z-10 text-center">
           <p className="text-sm font-medium">👌 Pinch to emit particles</p>
           <p className="text-xs text-slate-300 mt-1">💨 Blow into mic to scatter them</p>
        </div>
      )}
    </div>
  );
};