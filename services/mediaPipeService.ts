import { FilesetResolver, HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";

let handLandmarker: HandLandmarker | null = null;
let faceLandmarker: FaceLandmarker | null = null;

const createVisionTasks = async () => {
  return await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
  );
};

export const initializeHandLandmarker = async (): Promise<HandLandmarker> => {
  if (handLandmarker) return handLandmarker;

  const vision = await createVisionTasks();

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return handLandmarker;
};

export const initializeFaceLandmarker = async (): Promise<FaceLandmarker> => {
  if (faceLandmarker) return faceLandmarker;

  const vision = await createVisionTasks();

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return faceLandmarker;
};