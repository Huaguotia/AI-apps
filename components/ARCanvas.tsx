import React, { useEffect, useRef, useState, useCallback } from 'react';
import { initializeHandLandmarker, initializeFaceLandmarker } from '../services/mediaPipeService';
import { 
  PINCH_THRESHOLD, 
  SMOOTHING_FACTOR, 
  PARTICLE_DECAY_RATE, 
  PARTICLE_SPAWN_RATE,
  WIND_FORCE,
  WIND_ACTION_DECAY,
  PARTICLE_FRICTION,
  POUT_RATIO_THRESHOLD,
  MOUTH_WIDTH_RELATIVE_THRESHOLD,
  MOUTH_OPEN_THRESHOLD,
  WIND_SUSTAIN_MS
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
  
  // State for tracking status
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isWindyState, setIsWindyState] = useState(false); // For UI feedback
  const [debugMsg, setDebugMsg] = useState(''); // Debug feedback

  // Drawing state refs
  const lastPoint = useRef<Point | null>(null);
  const missingFramesRef = useRef<number>(0); 
  const requestRef = useRef<number>();

  // Wind detection refs
  const windTimerRef = useRef<number>(0); // Timestamp when wind should stop

  // Helper: Create a new particle with volumetric spread
  const createParticle = (centerX: number, centerY: number, color: string, radius: number): Particle => {
    const r = radius * Math.sqrt(Math.random()); 
    const theta = Math.random() * 2 * Math.PI;
    
    const x = centerX + r * Math.cos(theta);
    const y = centerY + r * Math.sin(theta);

    const vAngle = Math.random() * 2 * Math.PI;
    const speed = Math.random() * 0.5;

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
      color: isSparkle ? '#ffffff' : color, 
      isBlown: false,
    };
  };

  // Helper: Calculate Euclidean distance
  const distance = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  // Initialize Camera (Audio removed)
  useEffect(() => {
    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: false, // Disabled microphone
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', () => {
             setPermissionGranted(true);
          });
        }
      } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Camera permission is required.');
      }
    };

    startMedia();
  }, []);

  // Initialize MediaPipe (Hand and Face)
  useEffect(() => {
    const initModels = async () => {
      try {
        await Promise.all([
          initializeHandLandmarker(),
          initializeFaceLandmarker()
        ]);
        setModelsLoaded(true);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load MediaPipe models:", error);
      }
    };
    initModels();
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
    const handLandmarker = await initializeHandLandmarker();
    const faceLandmarker = await initializeFaceLandmarker();

    if (!video || !canvas || !handLandmarker || !faceLandmarker || video.readyState !== 4) {
      requestRef.current = requestAnimationFrame(detectAndDraw);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const startTimeMs = performance.now();

    // --- 1. Face Detection (Pout & Movement) ---
    const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
    let isBlowingGesture = false;

    if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
      const fl = faceResults.faceLandmarks[0];
      
      const upperLip = fl[13];
      const lowerLip = fl[14];
      const leftCorner = fl[61];
      const rightCorner = fl[291];
      // Face height ref (top of forehead approx to chin) - using eye to chin for scale
      const chin = fl[152];
      const noseBridge = fl[6];
      const faceHeight = distance(chin, noseBridge) * 2; // rough estimate

      const mouthWidth = distance(leftCorner, rightCorner);
      const mouthHeight = distance(upperLip, lowerLip);
      
      const mouthOpenness = mouthHeight / faceHeight; // Normalized openness
      const mouthRelativeWidth = mouthWidth / faceHeight; // Normalized width
      const ratio = mouthHeight > 0.001 ? mouthWidth / mouthHeight : 10;

      // Gesture Check:
      // 1. Mouth must be somewhat open (Openness > Threshold)
      // 2. Mouth must be narrow/round (Ratio < Threshold AND Relative Width < Threshold)
      // This combination ensures we are "Blowing/Pouting" and not just "Opening Mouth" (which would have high relative width)
      
      const isMouthOpen = mouthOpenness > MOUTH_OPEN_THRESHOLD;
      const isPoutShape = ratio < POUT_RATIO_THRESHOLD && mouthRelativeWidth < MOUTH_WIDTH_RELATIVE_THRESHOLD;

      if (isMouthOpen && isPoutShape) {
         isBlowingGesture = true;
      }
    }
    
    // --- 2. Wind Logic ---
    if (isBlowingGesture) {
      windTimerRef.current = performance.now() + WIND_SUSTAIN_MS;
    }

    const isWindy = performance.now() < windTimerRef.current;

    // UI Feedback throttling
    if (Math.random() > 0.95) {
      setIsWindyState(isWindy);
      if (isWindy) setDebugMsg('💨 Blowing Detected!');
      else setDebugMsg('');
    }

    // --- 3. Hand Tracking & Drawing ---
    const handResults = handLandmarker.detectForVideo(video, startTimeMs);
    
    let handDetected = false;
    let pinchDistance = 1;
    let newPoint = { x: 0, y: 0 };
    
    const prevPoint = lastPoint.current; 

    if (handResults.landmarks && handResults.landmarks.length > 0) {
      handDetected = true;
      missingFramesRef.current = 0;

      const landmarks = handResults.landmarks[0];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      const rawX = (1 - indexTip.x) * canvas.width;
      const rawY = indexTip.y * canvas.height;

      pinchDistance = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2)
      );

      const currentX = prevPoint 
        ? prevPoint.x + (rawX - prevPoint.x) * SMOOTHING_FACTOR
        : rawX;
      const currentY = prevPoint 
        ? prevPoint.y + (rawY - prevPoint.y) * SMOOTHING_FACTOR
        : rawY;

      newPoint = { x: currentX, y: currentY };
      lastPoint.current = newPoint;
      
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
      missingFramesRef.current++;
      if (missingFramesRef.current > 10) { 
        if (cursorRef.current) cursorRef.current.style.opacity = '0';
        lastPoint.current = null;
      }
    }

    // --- 4. Particle Spawning ---
    if (handDetected && pinchDistance < PINCH_THRESHOLD) {
      const startPoint = prevPoint || newPoint;
      
      if (toolMode === ToolMode.DRAW) {
        const dist = Math.sqrt(
            Math.pow(newPoint.x - startPoint.x, 2) + 
            Math.pow(newPoint.y - startPoint.y, 2)
        );

        const stepSize = Math.max(0.5, brushSize / 2); 
        const steps = Math.max(1, Math.ceil(dist / stepSize)); 
        
        for(let s = 1; s <= steps; s++) {
           const t = s / steps;
           const spawnX = startPoint.x + (newPoint.x - startPoint.x) * t;
           const spawnY = startPoint.y + (newPoint.y - startPoint.y) * t;

           const particlesPerStep = PARTICLE_SPAWN_RATE;

           for (let i = 0; i < particlesPerStep; i++) {
            particlesRef.current.push(
                createParticle(spawnX, spawnY, color, brushSize)
            );
           }
        }
      } else if (toolMode === ToolMode.ERASER) {
         const dist = Math.sqrt(
            Math.pow(newPoint.x - startPoint.x, 2) + 
            Math.pow(newPoint.y - startPoint.y, 2)
        );
        const steps = Math.max(1, Math.ceil(dist / (brushSize))); 

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

    // Increase limit to prevent lines from disappearing (was 8000)
    if (particlesRef.current.length > 80000) {
      particlesRef.current = particlesRef.current.slice(particlesRef.current.length - 80000);
    }

    // --- 5. Render & Physics ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter'; 

    for (let i = 0; i < particlesRef.current.length; i++) {
      const p = particlesRef.current[i];

      // If wind is active, mark particle as blown forever
      if (isWindy) {
        p.isBlown = true;
      }

      if (p.isBlown) {
        // Blown Physics: Turbulence and Fade Out
        // Random drift + slight upward/outward force simulating breath
        p.vx += (Math.random() - 0.5) * WIND_FORCE;
        p.vy += (Math.random() - 0.5) * WIND_FORCE;
        
        p.life -= WIND_ACTION_DECAY; // Controlled fade (approx 1.5-2s)
        p.x += p.vx;
        p.y += p.vy;
      } else {
        // Static Physics: Stay in place mostly
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= PARTICLE_FRICTION;
        p.vy *= PARTICLE_FRICTION;
        
        p.life -= p.decay; // Should be 0.0 so they never die automatically
      }

      if (p.life > 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
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
    if (modelsLoaded && permissionGranted) {
      requestRef.current = requestAnimationFrame(detectAndDraw);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [modelsLoaded, permissionGranted, detectAndDraw]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {isLoading && (
         <div className="absolute inset-0 flex items-center justify-center z-50 bg-slate-900 text-white flex-col gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-medium animate-pulse">Loading AI Models...</p>
         </div>
      )}

      {isWindyState && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
          <p className="text-6xl font-bold text-white/20 animate-pulse tracking-widest uppercase">Blowing</p>
        </div>
      )}
      
      {!isWindyState && !isLoading && (
        <div className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 transition-opacity duration-300">
           {debugMsg && <p className="text-sm bg-slate-800/60 backdrop-blur px-3 py-1 rounded-full text-white/90 shadow-lg">{debugMsg}</p>}
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
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur text-white px-6 py-3 rounded-full pointer-events-none animate-bounce z-10 text-center w-64">
           <p className="text-sm font-medium">👌 Pinch to draw</p>
           <p className="text-xs text-slate-300 mt-1">💨 Blow air (Pout & Open) to scatter</p>
        </div>
      )}
    </div>
  );
};