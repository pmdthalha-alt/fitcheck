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
    this.skeletonCtx = this.skeletonCanvas.getContext('2d');
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
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
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
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

    this.camera.start();

    this.skeletonCanvas.width = 1280;
    this.skeletonCanvas.height = 720;
  }

  handleResults(results) {
    this.drawSkeleton(results);

    const landmarks = results.poseLandmarks;
    if (!landmarks || !landmarks.length) {
      this.onFeedback?.({ message: 'No person detected', type: 'warning' });
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
    const isTooFar = shoulderWidth < 0.14;
    const isTooClose = shoulderWidth > 0.26;

    const feedback = [];
    if (lowLight) feedback.push('Lighting is low');
    if (isTooFar) feedback.push('Step closer to the camera');
    if (isTooClose) feedback.push('Step back a little');
    if (stability < 0.5) feedback.push('Try to hold still');

    this.onFeedback?.({
      brightness,
      lowLight,
      distanceScore: shoulderWidth,
      tooClose: isTooClose,
      tooFar: isTooFar,
      stability,
      messages: feedback,
      landmarks: smoothed
    });

    this.onPose?.(smoothed, {
      brightness,
      lowLight,
      distanceScore: shoulderWidth,
      tooClose: isTooClose,
      tooFar: isTooFar,
      stability
    });
  }

  drawSkeleton(results) {
    const ctx = this.skeletonCtx;
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
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();

    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 23, 24, 25, 26, 27, 28];
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
    ctx.closePath();
    ctx.stroke();
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
}
