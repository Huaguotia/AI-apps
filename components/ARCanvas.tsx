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
  const missingFramesRef = useRef<number>(0); // Track frames where hand is lost to bridge gaps
  const requestRef = useRef<number>();

  // Helper: Create a new particle with volumetric spread
  const createParticle = (centerX: number, centerY: number, color: string, radius: number): Particle => {
    // Random point inside circle for volumetric brush effect
    const r = radius * Math.sqrt(Math.random()); // Uniform distribution
    const theta = Math.random() * 2 * Math.PI;
    
    // Spread position based on brush size
    const x = centerX + r * Math.cos(theta);
    const y = centerY + r * Math.sin(theta);

    // Random velocity angle for slight expansion
    const vAngle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 0.5; // Reduced speed for tighter lines

    // Randomize size: mostly small dust, occasional sparkle
    // Reduce size slightly for finer look
    const isSparkle = Math.random() > 0.95; 
    const size = isSparkle ? Math.random() * 1.5 + 0.8 : Math.random() * 1.0 + 0.2;

    return {
      x,
      y,
      vx: Math.cos(vAngle) * speed,
      vy: Math.sin(vAngle) * speed, 
      life: 1.0,
      decay: PARTICLE_DECAY_RATE,
      size: size,
      color: isSparkle ? '#ffffff' : color, // Sparkles are white
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
    
    // Critical Fix: Capture the previous point BEFORE updating the ref for the current frame
    // If lastPoint is null (first frame or after loss), we handle it later
    const prevPoint = lastPoint.current; 

    if (results.landmarks && results.landmarks.length > 0) {
      handDetected = true;
      missingFramesRef.current = 0; // Hand found, reset counter

      const landmarks = results.landmarks[0];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      // Screen coords (mirrored)
      const rawX = (1 - indexTip.x) * canvas.width;
      const rawY = indexTip.y * canvas.height;

      pinchDistance = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2)
      );

      // Smooth coordinates using the captured prevPoint
      const currentX = prevPoint 
        ? prevPoint.x + (rawX - prevPoint.x) * SMOOTHING_FACTOR
        : rawX;
      const currentY = prevPoint 
        ? prevPoint.y + (rawY - prevPoint.y) * SMOOTHING_FACTOR
        : rawY;

      newPoint = { x: currentX, y: currentY };
      
      // Update the global ref to the new point for the *next* frame
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
      // Hand lost logic
      missingFramesRef.current++;
      
      // If hand is lost for only a few frames (e.g., fast motion blur), we DO NOT reset lastPoint immediately.
      // This allows the line to bridge the gap if the hand reappears within 10 frames (~160ms).
      // If it's gone for longer, we assume the stroke has ended.
      if (missingFramesRef.current > 10) { 
        if (cursorRef.current) cursorRef.current.style.opacity = '0';
        lastPoint.current = null;
      }
    }

    // --- 3. Particle Spawning & Interaction ---
    // Use prevPoint (if available) to interpolate to newPoint
    // If prevPoint is null (first frame), we just use newPoint as start (effectively drawing a dot)
    if (handDetected && pinchDistance < PINCH_THRESHOLD) {
      const startPoint = prevPoint || newPoint;
      
      if (toolMode === ToolMode.DRAW) {
        // Calculate distance for interpolation
        const dist = Math.sqrt(
            Math.pow(newPoint.x - startPoint.x, 2) + 
            Math.pow(newPoint.y - startPoint.y, 2)
        );

        // Interpolation Logic
        // Calculate how many steps we need based on brush size. 
        // Thinner brush = smaller steps needed to create continuous line.
        // We ensure at least 1 step happens (to draw at current point even if stationary).
        const stepSize = Math.max(0.5, brushSize / 2); 
        const steps = Math.max(1, Math.ceil(dist / stepSize)); 
        
        for(let s = 1; s <= steps; s++) {
           const t = s / steps;
           const spawnX = startPoint.x + (newPoint.x - startPoint.x) * t;
           const spawnY = startPoint.y + (newPoint.y - startPoint.y) * t;

           // Scale spawn rate slightly by step count to avoid explosion on long fast strokes?
           // Actually, constant density per pixel is desired. 
           // Since stepSize is roughly constant, we spawn constant amount per step.
           const particlesPerStep = PARTICLE_SPAWN_RATE;

           for (let i = 0; i < particlesPerStep; i++) {
            particlesRef.current.push(
                createParticle(spawnX, spawnY, color, brushSize)
            );
           }
        }
        
      } else if (toolMode === ToolMode.ERASER) {
        // Interpolated Eraser
        // Same logic: move the eraser along the path to ensure we don't skip particles
         const dist = Math.sqrt(
            Math.pow(newPoint.x - startPoint.x, 2) + 
            Math.pow(newPoint.y - startPoint.y, 2)
        );
        const steps = Math.max(1, Math.ceil(dist / (brushSize))); // Larger steps for eraser is fine

        for(let s = 1; s <= steps; s++) {
             const t = s / steps;
             const targetX = startPoint.x + (newPoint.x - startPoint.x) * t;
             const targetY = startPoint.y + (newPoint.y - startPoint.y) * t;
             
             const eraserRadius = brushSize * 4;
             const rSq = eraserRadius * eraserRadius;

             particlesRef.current = particlesRef.current.filter(p => {
                const dx = p.x - targetX;
                const dy = p.y - targetY;
                return (dx*dx + dy*dy) > rSq;
             });
        }
      }
    }

    // Limit total particles to prevent crash
    if (particlesRef.current.length > 8000) {
      particlesRef.current = particlesRef.current.slice(particlesRef.current.length - 8000);
    }

    // --- 4. Render & Update Particles ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Additive blending is key for the "Neon/Glow" look
    ctx.globalCompositeOperation = 'lighter'; 

    for (let i = 0; i < particlesRef.current.length; i++) {
      const p = particlesRef.current[i];

      if (isWindy) {
        p.vx += (Math.random() - 0.5) * WIND_FORCE;
        p.vy += (Math.random() - 0.5) * WIND_FORCE;
        p.life -= WIND_ACTION_DECAY;
        p.x += p.vx;
        p.y += p.vy;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= PARTICLE_FRICTION;
        p.vy *= PARTICLE_FRICTION;
        p.life -= p.decay;
      }

      if (p.life > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        // Random "twinkle" flicker
        ctx.globalAlpha = p.life * (0.6 + Math.random() * 0.4);
        ctx.fill();
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

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