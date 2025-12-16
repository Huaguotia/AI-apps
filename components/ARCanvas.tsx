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
  WIND_SUSTAIN_MS,
  FIST_THRESHOLD,
  PALM_OPEN_THRESHOLD,
  DOUBLE_PINCH_TIMING,
  GATHER_SPEED,
  EXPLODE_FORCE,
  EXPLODE_DECAY
} from '../constants';
import { Point, ToolMode, Particle, AppMode, ParticleState } from '../types';

interface ARCanvasProps {
  color: string;
  brushSize: number;
  toolMode: ToolMode;
  appMode: AppMode;
  onClearTrigger: number;
  onUndoTrigger: number;
}

export const ARCanvas: React.FC<ARCanvasProps> = ({
  color,
  brushSize,
  toolMode,
  appMode,
  onClearTrigger,
  onUndoTrigger,
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
  const [isWindyState, setIsWindyState] = useState(false); 
  const [debugMsg, setDebugMsg] = useState(''); 
  const [gestureFeedback, setGestureFeedback] = useState<string | null>(null);

  // Drawing state refs
  const lastPoint = useRef<Point | null>(null);
  const missingFramesRef = useRef<number>(0); 
  const requestRef = useRef<number>();
  
  // Stroke Management Refs
  const currentStrokeIdRef = useRef<number>(0);
  const wasPinchingRef = useRef<boolean>(false);

  // Gesture Recognition Refs
  const lastPinchReleaseTime = useRef<number>(0);
  const isFistRef = useRef<boolean>(false); // Track state for Fist -> Open logic
  const gatherCenterRef = useRef<Point>({ x: 0, y: 0 }); // Center for gathering

  // Wind detection refs
  const windTimerRef = useRef<number>(0); 

  // --- Shape Generators ---
  
  const spawnText = (centerX: number, centerY: number, strokeId: number) => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    const text = "MERRY CHRISTMAS!";
    const fontSize = 100; // Larger font
    // Set canvas size large enough to hold text
    tempCanvas.width = 1200;
    tempCanvas.height = 250;

    tempCtx.font = `900 ${fontSize}px sans-serif`; // Heavy bold
    tempCtx.textAlign = 'center';
    tempCtx.textBaseline = 'middle';
    
    // Draw text
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillText(text, tempCanvas.width / 2, tempCanvas.height / 2);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    // Xmas colors
    const xmasColors = ['#ef4444', '#22c55e', '#ffffff', '#eab308']; // Red, Green, White, Gold

    // Sampling step (lower = more particles)
    const step = 2; 

    for (let y = 0; y < tempCanvas.height; y += step) {
        for (let x = 0; x < tempCanvas.width; x += step) {
            const index = (y * tempCanvas.width + x) * 4;
            // If pixel is opaque enough
            if (data[index + 3] > 128) {
                const offsetX = x - tempCanvas.width / 2;
                const offsetY = y - tempCanvas.height / 2;
                
                const pX = centerX + offsetX;
                const pY = centerY + offsetY;
                
                const pColor = xmasColors[Math.floor(Math.random() * xmasColors.length)];

                // Use 0.5 radius to keep text crisp
                particlesRef.current.push(createParticle(pX, pY, pColor, 0.5, strokeId, ParticleState.ALIVE));
            }
        }
    }
  };

  // Helper: Create a new particle
  const createParticle = (
      centerX: number, 
      centerY: number, 
      color: string, 
      radius: number, 
      strokeId: number,
      state: ParticleState = ParticleState.ALIVE
    ): Particle => {
    
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
      strokeId: strokeId,
      state: state,
      originX: x,
      originY: y,
    };
  };

  const distance = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  useEffect(() => {
    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false, 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', () => setPermissionGranted(true));
        }
      } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Camera permission is required.');
      }
    };
    startMedia();
  }, []);

  useEffect(() => {
    const initModels = async () => {
      try {
        await Promise.all([initializeHandLandmarker(), initializeFaceLandmarker()]);
        setModelsLoaded(true);
        setIsLoading(false);
      } catch (error) { console.error("Failed to load MediaPipe models:", error); }
    };
    initModels();
  }, []);

  useEffect(() => { particlesRef.current = []; }, [onClearTrigger]);
  
  useEffect(() => {
    if (onUndoTrigger > 0) {
      if (particlesRef.current.length === 0) return;
      let maxStrokeId = -1;
      for (const p of particlesRef.current) {
        if (p.strokeId > maxStrokeId) maxStrokeId = p.strokeId;
      }
      if (maxStrokeId !== -1) {
        particlesRef.current = particlesRef.current.filter(p => p.strokeId !== maxStrokeId);
      }
    }
  }, [onUndoTrigger]);

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
      const chin = fl[152];
      const noseBridge = fl[6];
      const faceHeight = distance(chin, noseBridge) * 2; 

      const mouthWidth = distance(leftCorner, rightCorner);
      const mouthHeight = distance(upperLip, lowerLip);
      const mouthOpenness = mouthHeight / faceHeight; 
      const mouthRelativeWidth = mouthWidth / faceHeight; 
      const ratio = mouthHeight > 0.001 ? mouthWidth / mouthHeight : 10;
      
      const isMouthOpen = mouthOpenness > MOUTH_OPEN_THRESHOLD;
      const isPoutShape = ratio < POUT_RATIO_THRESHOLD && mouthRelativeWidth < MOUTH_WIDTH_RELATIVE_THRESHOLD;

      if (isMouthOpen && isPoutShape) isBlowingGesture = true;
    }
    
    if (isBlowingGesture) windTimerRef.current = performance.now() + WIND_SUSTAIN_MS;
    const isWindy = performance.now() < windTimerRef.current;

    // --- 2. Hand Tracking, Gestures & Drawing ---
    const handResults = handLandmarker.detectForVideo(video, startTimeMs);
    
    let handDetected = false;
    let pinchDistance = 1;
    let newPoint = { x: 0, y: 0 };
    
    const prevPoint = lastPoint.current; 

    if (handResults.landmarks && handResults.landmarks.length > 0) {
      handDetected = true;
      missingFramesRef.current = 0;

      const landmarks = handResults.landmarks[0];
      const wrist = landmarks[0];
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const middleTip = landmarks[12];
      const ringTip = landmarks[16];
      const pinkyTip = landmarks[20];

      const rawX = (1 - indexTip.x) * canvas.width;
      const rawY = indexTip.y * canvas.height;
      const wristX = (1 - wrist.x) * canvas.width;
      const wristY = wrist.y * canvas.height;

      // Pinch Calculation
      pinchDistance = Math.sqrt(
        Math.pow(indexTip.x - thumbTip.x, 2) + Math.pow(indexTip.y - thumbTip.y, 2)
      );
      const isPinching = pinchDistance < PINCH_THRESHOLD;

      // --- Gesture Recognition Logic ---
      if (appMode === AppMode.GESTURE) {
        
        // 1. Double Pinch Detection (Merry Christmas)
        if (isPinching && !wasPinchingRef.current) {
           // Pinch Start
           const now = performance.now();
           if (now - lastPinchReleaseTime.current < DOUBLE_PINCH_TIMING) {
             currentStrokeIdRef.current += 1;
             spawnText(rawX, rawY, currentStrokeIdRef.current);
             setGestureFeedback("🎄 Merry Christmas!");
             setTimeout(() => setGestureFeedback(null), 1500);
           }
        }
        if (!isPinching && wasPinchingRef.current) {
          // Pinch Release
          lastPinchReleaseTime.current = performance.now();
        }

        // 2. Fist (Grab) & Open (Explode) Logic
        // Calculate average distance of fingertips to wrist
        const tips = [indexTip, middleTip, ringTip, pinkyTip];
        let avgDistToWrist = 0;
        tips.forEach(tip => {
           avgDistToWrist += distance(tip, wrist);
        });
        avgDistToWrist /= 4;

        if (avgDistToWrist < FIST_THRESHOLD) {
           // FIST DETECTED -> Gather
           if (!isFistRef.current) {
             isFistRef.current = true;
             gatherCenterRef.current = { x: wristX, y: wristY }; // Gather to wrist
             
             // Trigger Gathering State for ALIVE particles
             particlesRef.current.forEach(p => {
               if (p.state === ParticleState.ALIVE) {
                 p.state = ParticleState.GATHERING;
                 p.gatheringTargetX = wristX;
                 p.gatheringTargetY = wristY;
               }
             });
           }
           // Update gather target continuously while holding fist
           particlesRef.current.forEach(p => {
              if (p.state === ParticleState.GATHERING) {
                  p.gatheringTargetX = wristX;
                  p.gatheringTargetY = wristY;
              }
           });
        } else if (avgDistToWrist > PALM_OPEN_THRESHOLD) {
           // PALM OPEN DETECTED -> Explode
           if (isFistRef.current) {
             isFistRef.current = false;
             
             // Trigger Explode
             particlesRef.current.forEach(p => {
               if (p.state === ParticleState.GATHERING) {
                 p.state = ParticleState.EXPLODING;
                 
                 // Random angle 360 degrees
                 const angle = Math.random() * 2 * Math.PI;

                 // High velocity for explosion
                 const speed = EXPLODE_FORCE * (0.8 + Math.random() * 0.4); 
                 p.vx = Math.cos(angle) * speed;
                 p.vy = Math.sin(angle) * speed;
               }
             });
           }
        }
      }

      // --- End Gesture Logic ---

      // Update Cursor position
      const currentX = prevPoint ? prevPoint.x + (rawX - prevPoint.x) * SMOOTHING_FACTOR : rawX;
      const currentY = prevPoint ? prevPoint.y + (rawY - prevPoint.y) * SMOOTHING_FACTOR : rawY;

      newPoint = { x: currentX, y: currentY };
      lastPoint.current = newPoint;
      
      wasPinchingRef.current = isPinching; // Update pinch history

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${currentX}px, ${currentY}px)`;
        cursorRef.current.style.opacity = '1';
        const innerCursor = cursorRef.current.firstElementChild as HTMLElement;
        
        // Visual feedback based on mode
        if (appMode === AppMode.GESTURE) {
             cursorRef.current.style.width = '40px';
             cursorRef.current.style.height = '40px';
             cursorRef.current.style.borderWidth = '2px';
             cursorRef.current.style.borderColor = '#a855f7'; // Purple for Magic
             if (innerCursor) {
                innerCursor.style.backgroundColor = 'transparent';
                innerCursor.innerText = '✨';
                innerCursor.style.fontSize = '20px';
                innerCursor.style.display = 'flex';
                innerCursor.style.alignItems = 'center';
                innerCursor.style.justifyContent = 'center';
             }
        } else {
            // Standard Draw Cursor
            if (innerCursor) innerCursor.innerText = '';
            if (isPinching) {
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
              cursorRef.current.style.borderColor = 'white';
              if (innerCursor) {
                innerCursor.style.transform = 'scale(0.5)';
                innerCursor.style.backgroundColor = color;
              }
            }
        }
      }
    } else {
      missingFramesRef.current++;
      wasPinchingRef.current = false;
      if (missingFramesRef.current > 10) { 
        if (cursorRef.current) cursorRef.current.style.opacity = '0';
        lastPoint.current = null;
      }
    }

    // --- 4. Particle Spawning (FREE DRAW MODE ONLY) ---
    if (appMode === AppMode.FREE_DRAW && handDetected && pinchDistance < PINCH_THRESHOLD) {
      // Initialize stroke if new pinch
      if (!wasPinchingRef.current) currentStrokeIdRef.current += 1;

      const startPoint = prevPoint || newPoint;
      
      if (toolMode === ToolMode.DRAW) {
        const dist = Math.sqrt(Math.pow(newPoint.x - startPoint.x, 2) + Math.pow(newPoint.y - startPoint.y, 2));
        const stepSize = Math.max(0.5, brushSize / 2); 
        const steps = Math.max(1, Math.ceil(dist / stepSize)); 
        
        for(let s = 1; s <= steps; s++) {
           const t = s / steps;
           const spawnX = startPoint.x + (newPoint.x - startPoint.x) * t;
           const spawnY = startPoint.y + (newPoint.y - startPoint.y) * t;

           for (let i = 0; i < PARTICLE_SPAWN_RATE; i++) {
            particlesRef.current.push(
                createParticle(spawnX, spawnY, color, brushSize, currentStrokeIdRef.current)
            );
           }
        }
      } else if (toolMode === ToolMode.ERASER) {
         // Eraser Logic...
         const dist = Math.sqrt(Math.pow(newPoint.x - startPoint.x, 2) + Math.pow(newPoint.y - startPoint.y, 2));
         const steps = Math.max(1, Math.ceil(dist / brushSize));
         for(let s = 1; s <= steps; s++) {
             const t = s / steps;
             const targetX = startPoint.x + (newPoint.x - startPoint.x) * t;
             const targetY = startPoint.y + (newPoint.y - startPoint.y) * t;
             const rSq = (brushSize * 4) ** 2;
             particlesRef.current = particlesRef.current.filter(p => {
                return (p.x - targetX)**2 + (p.y - targetY)**2 > rSq;
             });
         }
      }
    }

    if (particlesRef.current.length > 80000) {
      particlesRef.current = particlesRef.current.slice(particlesRef.current.length - 80000);
    }

    // --- 5. Render & Physics ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter'; 

    for (let i = 0; i < particlesRef.current.length; i++) {
      const p = particlesRef.current[i];

      // Priority 1: Wind Blowing (Overrides everything else)
      if (isWindy && p.state === ParticleState.ALIVE) {
        p.isBlown = true;
      }

      if (p.isBlown) {
        p.vx += (Math.random() - 0.5) * WIND_FORCE;
        p.vy += (Math.random() - 0.5) * WIND_FORCE;
        p.life -= WIND_ACTION_DECAY;
        p.x += p.vx;
        p.y += p.vy;
      } 
      else if (p.state === ParticleState.GATHERING) {
        // Suck into ball but maintain some volume (not a single dot)
        const tx = p.gatheringTargetX || p.x;
        const ty = p.gatheringTargetY || p.y;
        
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // Only pull tight if outside a small radius (creating a ball, not a dot)
        if (dist > 30) {
            p.x += dx * GATHER_SPEED;
            p.y += dy * GATHER_SPEED;
        } else {
             // Orbit/Jitter when inside the "core" to look energetic
             p.x += (Math.random() - 0.5) * 4;
             p.y += (Math.random() - 0.5) * 4;
        }
      }
      else if (p.state === ParticleState.EXPLODING) {
        // Boom
        p.x += p.vx;
        p.y += p.vy;
        p.life -= EXPLODE_DECAY;
      }
      else {
        // Normal Alive State
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
        ctx.globalAlpha = p.life * (0.6 + Math.random() * 0.4);
        ctx.fill();
      }
    }
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    requestRef.current = requestAnimationFrame(detectAndDraw);
  }, [color, brushSize, toolMode, appMode]);

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

      {/* UI Feedbacks */}
      {isWindyState && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
          <p className="text-6xl font-bold text-white/20 animate-pulse tracking-widest uppercase">Blowing</p>
        </div>
      )}

      {gestureFeedback && (
        <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 animate-bounce">
          <p className="text-4xl font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">{gestureFeedback}</p>
        </div>
      )}
      
      {!isWindyState && !isLoading && !gestureFeedback && (
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
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur text-white px-6 py-3 rounded-2xl pointer-events-none z-10 text-center w-72 shadow-xl border border-white/10">
           {appMode === AppMode.FREE_DRAW ? (
             <>
               <p className="text-sm font-medium text-blue-300">🖌️ Free Draw Mode</p>
               <p className="text-xs text-slate-300 mt-1">Pinch to draw • Blow to scatter</p>
             </>
           ) : (
             <>
               <p className="text-sm font-medium text-purple-300">✨ Magic Gesture Mode</p>
               <div className="text-xs text-slate-300 mt-2 space-y-1 text-left">
                  <p>✌️ <span className="text-white">Double Pinch:</span> Merry Christmas</p>
                  <p>✊ <span className="text-white">Grab Fist:</span> Gather Particles</p>
                  <p>🖐️ <span className="text-white">Open Hand:</span> Explode!</p>
               </div>
             </>
           )}
        </div>
      )}
    </div>
  );
};