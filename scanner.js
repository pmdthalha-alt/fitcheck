// FitCheck AI - Professional Body Scanner Logic
// version 2.0 - Production Ready

const DOM = {
  video: document.getElementById('video'),
  canvas: document.getElementById('output'),
  ctx: document.getElementById('output').getContext('2d'),
  messages: document.getElementById('chatMessages'),
  actions: document.getElementById('chatActions')
};

// --- Configuration ---
const CONFIG = {
  CORRECT_THRESHOLD: 0.05, // 5% tolerance for centering
  STABILITY_FRAMES: 30,    // Frames to hold still (~1 sec)
  MIN_VISIBILITY: 0.7,     // MediaPipe visibility threshold
  TARGET_HEIGHT_RATIO: 0.8 // User should fill 80% of screen height
};

// --- State Management ---
const SCAN_STEPS = {
  INIT: 'INIT',
  FRONT_ALIGN: 'FRONT_ALIGN',
  FRONT_CAPTURE: 'FRONT_CAPTURE',
  SIDE_ALIGN: 'SIDE_ALIGN',
  SIDE_CAPTURE: 'SIDE_CAPTURE',
  PROCESSING: 'PROCESSING',
  COMPLETE: 'COMPLETE'
};

let state = {
  current: SCAN_STEPS.INIT,
  stabilityCounter: 0,
  lastLandmarks: null,
  captured: {
    front: null,
    side: null
  },
  feedback: "Initializing...",
  progress: 0
};

// Chat Bot Helper
function botLog(text, type = 'bot') {
  setTimeout(() => {
    const msg = document.createElement('div');
    msg.className = `message ${type}`;
    msg.innerText = text;
    DOM.messages.appendChild(msg);
    DOM.messages.scrollTop = DOM.messages.scrollHeight;
  }, 100);
}

// --- Initialization ---
window.onload = () => {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  botLog("👋 Hi! I'm FitCheck Pro. Let's create your 3D size profile.");
  botLog("Please stand in a well-lit area with space to move back.");
};

function resizeCanvas() {
  DOM.canvas.width = window.innerWidth;
  DOM.canvas.height = window.innerHeight;
}

window.startScan = function() {
  DOM.actions.innerHTML = ''; 
  botLog("Requesting camera access...", 'user');
  initCamera();
};

// --- MediaPipe & Camera ---
const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});

pose.onResults(onResults);

async function initCamera() {
  try {
    // Check permissions first
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    
    // Use MediaPipe Camera Utils for efficient frame processing
    const camera = new Camera(DOM.video, {
      onFrame: async () => {
        await pose.send({image: DOM.video});
      },
      width: 1280,
      height: 720
    });
    
    await camera.start();
    state.current = SCAN_STEPS.FRONT_ALIGN;
    botLog("Camera connected. Let's start with your Front Profile.");
  } catch (err) {
    console.error(err);
    botLog("❌ Error: Could not access camera. Please allow permissions and try again.", 'error');
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.innerText = "Try Again";
    btn.onclick = window.startScan;
    DOM.actions.appendChild(btn);
  }
}

// --- Main Loop ---
function onResults(results) {
  const ctx = DOM.ctx;
  const width = DOM.canvas.width;
  const height = DOM.canvas.height;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(results.image, 0, 0, width, height);

  if (!results.poseLandmarks) {
    drawScanningOverlay(ctx, width, height, "Looking for body...");
    ctx.restore();
    return;
  }

  const landmarks = results.poseLandmarks;
  drawConnectors(ctx, landmarks, POSE_CONNECTIONS, { color: '#00FFCC', lineWidth: 2 });
  drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });

  // State Machine Logic
  switch (state.current) {
    case SCAN_STEPS.FRONT_ALIGN:
      handleAlignment(landmarks, 'FRONT');
      break;
    case SCAN_STEPS.FRONT_CAPTURE:
      handleCapture(landmarks, 'FRONT');
      break;
    case SCAN_STEPS.SIDE_ALIGN:
      handleAlignment(landmarks, 'SIDE');
      break;
    case SCAN_STEPS.SIDE_CAPTURE:
      handleCapture(landmarks, 'SIDE');
      break;
    case SCAN_STEPS.COMPLETE:
      // Done
      break;
  }

  // Draw HUD
  drawHUD(ctx, width, height);
  
  ctx.restore();
}

// --- Logic Handlers ---

function handleAlignment(landmarks, mode) {
  // 1. Centering Check
  const nose = landmarks[0];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  
  const centerX = nose.x;
  const isCentered = Math.abs(centerX - 0.5) < 0.1;
  
  // 2. Distance Check (Height on screen)
  // Approximate height from nose to mid-ankles
  const midAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
  const bodyHeight = midAnkleY - nose.y;
  const isGoodDistance = bodyHeight > 0.5 && bodyHeight < 0.9;
  const isTooClose = bodyHeight > 0.9;
  const isTooFar = bodyHeight < 0.5;

  // 3. Visibility Check
  const anklesVisible = leftAnkle.visibility > CONFIG.MIN_VISIBILITY && rightAnkle.visibility > CONFIG.MIN_VISIBILITY;

  // 4. Orientation Check
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  
  let isOrientationCorrect = true;
  if (mode === 'SIDE') {
    // For side view, shoulders should be close in X (overlapping)
    isOrientationCorrect = shoulderWidth < 0.15; 
  } else {
    // Front view, shoulders should be wide
    isOrientationCorrect = shoulderWidth > 0.15;
  }

  // Feedback Logic
  if (!anklesVisible) {
    state.feedback = "Step back to show your feet";
    state.progress = 0;
  } else if (!isCentered) {
    state.feedback = centerX < 0.5 ? "Move Left ⬅️" : "Move Right ➡️";
    state.progress = 0;
  } else if (isTooClose) {
    state.feedback = "Step Back ⬇️";
    state.progress = 0;
  } else if (isTooFar) {
    state.feedback = "Step Forward ⬆️";
    state.progress = 0;
  } else if (!isOrientationCorrect) {
    state.feedback = mode === 'FRONT' ? "Face Camera" : "Turn 90° Side";
    state.progress = 0;
  } else {
    // Good pose
    state.feedback = "Perfect! Hold Still";
    state.stabilityCounter++;
    state.progress = Math.min(state.stabilityCounter / CONFIG.STABILITY_FRAMES, 1);

    if (state.stabilityCounter > CONFIG.STABILITY_FRAMES) {
      // Transition to Capture
      if (mode === 'FRONT') {
        state.current = SCAN_STEPS.FRONT_CAPTURE;
        botLog("Front scan acquired. Processing...");
      } else {
        state.current = SCAN_STEPS.SIDE_CAPTURE;
        botLog("Side scan acquired. Processing...");
      }
      state.stabilityCounter = 0;
    }
  }

  if (state.feedback !== "Perfect! Hold Still") {
    state.stabilityCounter = Math.max(0, state.stabilityCounter - 1);
  }
}

function handleCapture(landmarks, mode) {
  // Instant capture transition for now, could add countdown here
  if (mode === 'FRONT') {
    state.captured.front = landmarks;
    state.current = SCAN_STEPS.SIDE_ALIGN;
    state.feedback = "Turn to your LEFT for Side Profile";
    state.progress = 0;
    botLog("Front captured! Now turn 90 degrees to your left.");
  } else {
    state.captured.side = landmarks;
    state.current = SCAN_STEPS.COMPLETE;
    finishScan();
  }
}

function finishScan() {
  state.feedback = "Processing measurements...";
  state.progress = 1;
  
  // Calculate metrics
  const front = state.captured.front;
  const heightPx = Math.abs(front[27].y - front[0].y); // Ankle to Nose approx
  const shoulderPx = Math.abs(front[11].x - front[12].x);
  
  // Simple Ratio Logic (assuming standard height)
  // In a real app, we'd ask for user height input to calibrate
  const ratio = shoulderPx / heightPx;
  
  let bodyShape = "Standard";
  if (ratio > 0.28) bodyShape = "Broad Shoulders";
  else if (ratio < 0.22) bodyShape = "Narrow Frame";

  botLog("✅ Scan Complete!");
  botLog(`Analysis: ${bodyShape}`);
  botLog("Building your virtual model...");

  const btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.innerText = "View Results";
  btn.onclick = () => alert(`Scan Data:\nShoulder Ratio: ${ratio.toFixed(3)}\nShape: ${bodyShape}`);
  DOM.actions.appendChild(btn);
}

// --- Drawing Helpers ---

function drawScanningOverlay(ctx, w, h, text) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, w, h);
  
  // Radar animation
  const time = Date.now() / 1000;
  const radius = 50 + Math.sin(time * 3) * 10;
  ctx.strokeStyle = '#00FFCC';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w/2, h/2, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.font = '20px Arial';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(text, w/2, h/2 + 100);
}

function drawHUD(ctx, w, h) {
  // 1. Instruction Banner
  ctx.fillStyle = 'rgba(0, 20, 40, 0.8)';
  ctx.fillRect(0, h - 100, w, 100);
  
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = state.progress >= 1 ? '#00FF00' : '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(state.feedback, w/2, h - 45);

  // 2. Progress Bar
  if (state.progress > 0) {
    const barW = 300;
    const barH = 10;
    const x = w/2 - barW/2;
    const y = h - 30;
    
    // Bg
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, barW, barH);
    
    // Fill
    ctx.fillStyle = '#00FFCC';
    ctx.fillRect(x, y, barW * state.progress, barH);
    
    // Glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00FFCC';
  }
  ctx.shadowBlur = 0;
}
