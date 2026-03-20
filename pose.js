/*
 * FitVision - Pose engine using MediaPipe
 */

import { PoseSmoother, getPoseStability } from './utils.js';

export class PoseEngine {
  constructor({ onPose, onError, onFeedback }) {
    this.onPose = onPose;
    this.onError = onError;
    this.onFeedback = onFeedback;
    this.camera = null;
    this.pose = null;
    this.video = document.getElementById('video');
    this.skeletonCanvas = document.getElementById('skeleton');
    this.skeletonCtx = this.skeletonCanvas?.getContext('2d');
    this.frameBuffer = [];
    this.maxBuffer = 50;
    this.lastStableLandmarks = null;
    this.analyzeCanvas = document.createElement('canvas');
    this.analyzeCanvas.width = 120;
    this.analyzeCanvas.height = 80;
    this.analyzeCtx = this.analyzeCanvas.getContext('2d');
    this.smoother = new PoseSmoother(30);
  }

  async start() {
    try {
      if (!this.video || !this.skeletonCanvas || !this.skeletonCtx) {
        throw new Error('Missing required camera elements.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      this.video.srcObject = stream;
      await new Promise((resolve) => (this.video.onloadeddata = resolve));
      await this.initPose();
    } catch (error) {
      this.onError?.(error);
    }
  }

  async initPose() {
    this.pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635987980/${file}`
    });

    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.48,
      minTrackingConfidence: 0.48
    });

    this.pose.onResults((results) => this.handleResults(results));

    this.camera = new Camera(this.video, {
      onFrame: async () => {
        if (!this.pose) return;
        await this.pose.send({ image: this.video });
      },
      width: 1280,
      height: 720
    });

    await this.camera.start();

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  handleResults(results) {
    this.drawSkeleton(results);

    const landmarks = results.poseLandmarks;
    if (!landmarks || !landmarks.length) {
      this.lastStableLandmarks = null;
      this.onFeedback?.({ message: 'No person detected', messages: ['No person detected'], type: 'warning' });
      return;
    }

    // Add to smoothing buffer
    this.smoother.add(landmarks);
    const smoothed = this.smoother.getSmoothed();
    if (!smoothed) return;

    // Track stability
    const stability = this.lastStableLandmarks
      ? getPoseStability(smoothed, this.lastStableLandmarks, 0.04)
      : 0;
    this.lastStableLandmarks = smoothed;

    // Lighting analysis
    const brightness = this.estimateBrightness();
    const lowLight = brightness < 45;

    // Distance analysis (based on shoulder width)
    const shoulderWidth = Math.hypot(
      smoothed[11].x - smoothed[12].x,
      smoothed[11].y - smoothed[12].y
    );
    const isTooFar = shoulderWidth < 0.11;
    const isTooClose = shoulderWidth > 0.31;

    const feedback = [];
    if (lowLight) feedback.push('Lighting is low');
    if (isTooFar) feedback.push('Step closer to the camera');
    if (isTooClose) feedback.push('Step back a little');
    if (stability < 0.5) feedback.push('Try to hold still');
    const aspectRatio = (this.video?.videoWidth && this.video?.videoHeight)
      ? this.video.videoWidth / this.video.videoHeight
      : 16 / 9;

    this.onFeedback?.({
      brightness,
      lowLight,
      distanceScore: shoulderWidth,
      tooClose: isTooClose,
      tooFar: isTooFar,
      stability,
      aspectRatio,
      messages: feedback,
      landmarks: smoothed
    });

    this.onPose?.(smoothed, {
      brightness,
      lowLight,
      distanceScore: shoulderWidth,
      tooClose: isTooClose,
      tooFar: isTooFar,
      stability,
      aspectRatio
    });
  }

  drawSkeleton(results) {
    const ctx = this.skeletonCtx;
    if (!ctx || !this.skeletonCanvas) return;
    ctx.save();
    ctx.clearRect(0, 0, this.skeletonCanvas.width, this.skeletonCanvas.height);

    if (results.image) {
      ctx.globalAlpha = 0.2;
      ctx.drawImage(results.image, 0, 0, this.skeletonCanvas.width, this.skeletonCanvas.height);
      ctx.globalAlpha = 1;
    }

    if (results.poseLandmarks) {
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: '#00ffcc',
        lineWidth: 2
      });
      drawLandmarks(ctx, results.poseLandmarks, {
        color: '#ff0066',
        lineWidth: 2
      });

      this.drawSilhouette(results.poseLandmarks);
    }

    ctx.restore();
  }

  drawSilhouette(landmarks) {
    const ctx = this.skeletonCtx;
    if (!ctx || !this.skeletonCanvas) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();

    const indices = [0, 11, 23, 25, 27];
    let started = false;
    for (const i of indices) {
      const p = landmarks[i];
      if (!p) continue;
      const x = p.x * this.skeletonCanvas.width;
      const y = p.y * this.skeletonCanvas.height;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  estimateBrightness() {
    if (!this.video || !this.analyzeCtx) return 0;

    try {
      this.analyzeCtx.drawImage(this.video, 0, 0, this.analyzeCanvas.width, this.analyzeCanvas.height);
      const imageData = this.analyzeCtx.getImageData(0, 0, this.analyzeCanvas.width, this.analyzeCanvas.height);
      let total = 0;
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // luminance formula
        total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      const avg = total / (data.length / 4);
      return avg;
    } catch (e) {
      return 0;
    }
  }

  resizeCanvas() {
    if (!this.skeletonCanvas) return;

    const width = this.video?.videoWidth || 1280;
    const height = this.video?.videoHeight || 720;
    this.skeletonCanvas.width = width;
    this.skeletonCanvas.height = height;
  }
}
