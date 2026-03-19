/*
 * FitVision - Scan workflow + body model generation
 */

import { getVisibilityScore, getPoseStability, distance, euclideanDistance, angle } from './utils.js';
import { predictBodyType, recommendSize, computeConfidence } from './ai.js';

const SCAN_STEPS = [
  {
    key: 'front',
    label: 'Front scan',
    instruction: 'Stand straight and look at the camera.',
    check: (landmarks) => {
      const visibility = getVisibilityScore(landmarks);
      const centered = isCentered(landmarks);
      const zDiff = landmarks[11].z - landmarks[12].z;
      const frontScore = 1 - Math.min(1, Math.abs(zDiff) / 0.08);
      const progress = clamp01((visibility * 0.5) + (centered ? 0.2 : 0) + (frontScore * 0.3));
      const passed = visibility > 0.65 && centered && Math.abs(zDiff) < 0.06;
      const message = !visibility
        ? 'Make sure your full body is visible and well-lit.'
        : !centered
          ? 'Place your body centered inside the circle.'
          : Math.abs(zDiff) >= 0.06
            ? 'Rotate to face the camera directly.'
            : 'Hold steadily; scanning front view.';
      return { passed, progress, message };
    }
  },
  {
    key: 'turnRight',
    label: 'Turn right',
    instruction: 'Rotate so your right shoulder is closer to the camera.',
    check: (landmarks) => {
      const visibility = getVisibilityScore(landmarks);
      const zDiff = landmarks[11].z - landmarks[12].z;
      const progress = clamp01((zDiff + 0.1) / 0.2);
      const passed = visibility > 0.65 && zDiff > 0.06;
      const message = !visibility
        ? 'Make sure your full body is visible and well-lit.'
        : zDiff < 0.06
          ? 'Turn your right shoulder toward the camera.'
          : 'Hold this pose for a moment.';
      return { passed, progress, message };
    }
  },
  {
    key: 'side',
    label: 'Side scan',
    instruction: 'Turn your body so you are in profile.',
    check: (landmarks) => {
      const visibility = getVisibilityScore(landmarks);
      const zDiff = landmarks[11].z - landmarks[12].z;
      const progress = clamp01(Math.abs(zDiff) / 0.18);
      const passed = visibility > 0.65 && Math.abs(zDiff) > 0.12;
      const message = !visibility
        ? 'Make sure your full body is visible and well-lit.'
        : Math.abs(zDiff) < 0.12
          ? 'Turn your body further to the side.'
          : 'Hold this side profile steady.';
      return { passed, progress, message };
    }
  },
  {
    key: 'turnLeft',
    label: 'Turn left',
    instruction: 'Turn your left shoulder closer to the camera.',
    check: (landmarks) => {
      const visibility = getVisibilityScore(landmarks);
      const zDiff = landmarks[11].z - landmarks[12].z;
      const progress = clamp01((Math.abs(zDiff + 0.1)) / 0.2);
      const passed = visibility > 0.65 && zDiff < -0.06;
      const message = !visibility
        ? 'Make sure your full body is visible and well-lit.'
        : zDiff > -0.06
          ? 'Turn your left shoulder toward the camera.'
          : 'Hold this pose for a moment.';
      return { passed, progress, message };
    }
  }
];

export class ScanManager {
  constructor({ ui, storage, tryOn }) {
    this.ui = ui;
    this.storage = storage;
    this.tryOn = tryOn;

    this.calibratedHeight = parseInt(localStorage.getItem('fitvision_height_cm'), 10) || 170;
    this.analytics = this.loadAnalytics();

    this.lastStepKey = null;
    this.lastAligned = false;

    this.reset();

    this.ui.on('start', () => this.startScan());
    this.ui.on('retry', () => this.reset());
    this.ui.on('export', () => this.exportScan());
    this.ui.on('import', (data) => this.importScan(data));
    this.ui.on('loadHistory', (id) => this.loadHistoryItem(id));
    this.ui.on('clearHistory', () => this.clearHistory());
    this.ui.on('heightChange', (height) => {
      this.calibratedHeight = height;
      this.ui.showFeedback(`Height set to ${height}cm`, 'info');
    });
    this.ui.on('restartStep', () => this.restartStep());
  }

  reset() {
    this.state = 'idle';
    this.stepIndex = 0;
    this.stableSince = null;
    this.stableStart = null;
    this.countdownStart = null;
    this.scanStart = null;
    this.collected = [];
    this.lastPose = null;
    this.lastStepKey = null;
    this.lastAligned = false;
    this.history = this.storage.getAll();
    this.ui.setHistory(this.history);
    this.ui.setState('idle');
    this.ui.setStep(0, SCAN_STEPS.length);
    this.ui.setProgress(0);
    this.ui.setScanEnabled(false);
    this.ui.setZoneHighlights({ shoulders: false, arms: false, legs: false });
    this.ui.setScanBeam(false);
    this.ui.setScanWave(false);
    this.ui.hideSuccess();
    this.tryOn.clear();
  }

  loadAnalytics() {
    try {
      const raw = localStorage.getItem('fitvision_analytics_v1');
      if (!raw) return { attempts: 0, successes: 0, failures: 0, totalTimeMs: 0 };
      const parsed = JSON.parse(raw);
      return { attempts: 0, successes: 0, failures: 0, totalTimeMs: 0, ...parsed };
    } catch {
      return { attempts: 0, successes: 0, failures: 0, totalTimeMs: 0 };
    }
  }

  saveAnalytics() {
    try {
      localStorage.setItem('fitvision_analytics_v1', JSON.stringify(this.analytics));
    } catch {
      // ignore
    }
  }

  updatePose(landmarks, meta = {}) {
    const visibility = getVisibilityScore(landmarks);
    const centered = this.isCentered(landmarks);
    const stability = this.lastPose ? getPoseStability(landmarks, this.lastPose, 0.03) : 0;
    this.lastPose = landmarks;

    const { lowLight, tooClose, tooFar } = meta;

    // Directional guidance (distance + centering + stability)
    const torsoCenterX = ((landmarks[11].x + landmarks[12].x) / 2 + (landmarks[23].x + landmarks[24].x) / 2) / 2;
    const torsoOffsetX = torsoCenterX - 0.5;
    const inCenter = Math.abs(torsoOffsetX) < 0.08;
    const positionScore = 1 - Math.min(1, Math.abs(torsoOffsetX) / 0.08);
    const distanceScore = tooClose || tooFar ? 0 : 1;
    const stabilityScore = Math.min(1, Math.max(0, (stability - 0.3) / 0.55));

    const alignmentScore = clamp01(positionScore * 0.5 + distanceScore * 0.2 + stabilityScore * 0.3);
    const confidenceScore = clamp01(visibility * 0.45 + stability * 0.45 + alignmentScore * 0.1);

    this.ui.setAlignmentProgress(alignmentScore);
    this.ui.setAlignmentScore(alignmentScore);
    this.ui.setConfidence(confidenceScore);

    const aligned = inCenter && !tooClose && !tooFar && stability > 0.82;

    const shouldersAligned = this.areShouldersLevel(landmarks) && positionScore > 0.85 && stability > 0.7;
    const armsAligned = this.areArmsStraight(landmarks) && this.areWristsInCircle(landmarks);
    const legsAligned = this.areLegsStraight(landmarks) && this.areAnklesInCircle(landmarks);

    this.ui.setZoneHighlights({
      shoulders: shouldersAligned,
      arms: armsAligned,
      legs: legsAligned
    });

    const scanBeamActive = this.state === 'scanning' && aligned;
    this.ui.setScanBeam(scanBeamActive);
    this.ui.setScanWave(this.state === 'scanning' && aligned);

    let directionSymbol = null;
    let directionType = null;

    if (tooClose) {
      directionSymbol = '⬇';
      directionType = 'warning';
    } else if (tooFar) {
      directionSymbol = '⬆';
      directionType = 'warning';
    } else if (!inCenter) {
      directionSymbol = torsoOffsetX > 0 ? '⬅' : '➡';
      directionType = 'warning';
    } else if (stability < 0.5) {
      directionSymbol = '✋';
      directionType = 'warning';
    } else if (aligned) {
      directionSymbol = '✅';
      directionType = 'good';
    }

    this.ui.showDirection(directionSymbol, directionType);
    this.ui.setGlow(aligned);
    this.ui.setCircleReady(aligned);
    this.ui.setAlignmentScore(alignmentScore);

    if (aligned && !this.lastAligned) {
      this.ui.speak('Perfect alignment, hold still.');
    }
    this.lastAligned = aligned;

    if (this.state === 'idle' || this.state === 'detecting') {
      this.state = 'detecting';
      this.ui.setState('detecting');

      const warnings = [];
      if (lowLight) warnings.push('Lighting is low');
      if (tooClose) warnings.push('Move back slightly');
      if (tooFar) warnings.push('Move closer to the camera');

      if (visibility > 0.6 && centered && stability > 0.7 && !lowLight) {
        // ready to scan
        if (!this.stableStart) this.stableStart = performance.now();
        if (performance.now() - this.stableStart > 2000) {
          this.ui.setState('ready');
          this.ui.setScanEnabled(true);
          this.ui.setCircleReady(true);
          this.ui.playBeep();
          // auto start
          this.startScan(true);
        } else {
          const remaining = Math.max(0, 2 - (performance.now() - this.stableStart) / 1000);
          this.ui.setInstruction(`Hold still for ${remaining.toFixed(1)}s to auto-start`);
          this.ui.setScanEnabled(false);
        }
      } else {
        this.stableStart = null;
        this.ui.setCircleReady(false);
        this.ui.setScanEnabled(false);

        if (warnings.length) {
          this.ui.setInstruction(warnings.join(' • '));
        } else if (visibility < 0.6) {
          this.ui.setInstruction('Move closer so your whole body is visible.');
        } else if (!centered) {
          this.ui.setInstruction('Center your body in the circle.');
        } else {
          this.ui.setInstruction('Hold still to stabilize.');
        }
      }
      return;
    }

    if (this.state === 'scanning') {
      const step = SCAN_STEPS[this.stepIndex];
      const result = step.check(landmarks);
      const progress = (this.stepIndex + result.progress) / SCAN_STEPS.length;

      if (this.lastStepKey !== step.key) {
        this.lastStepKey = step.key;
        this.ui.speak(step.instruction);
      }

      this.ui.setState('scanning');
      this.ui.setStep(this.stepIndex + 1, SCAN_STEPS.length);
      this.ui.setProgress(progress);

      let instruction = result.message;
      if (stability < 0.45) {
        instruction += ' (Try to stay still for better quality.)';
        directionSymbol = '✋';
        directionType = 'warning';
      }

      if (lowLight) {
        instruction = 'Lighting is low. Increase room light for better results.';
        directionSymbol = null;
      } else if (tooClose) {
        instruction = 'You are too close. Step back a little.';
        directionSymbol = '⬇';
        directionType = 'warning';
      } else if (tooFar) {
        instruction = 'You are too far. Move closer.';
        directionSymbol = '⬆';
        directionType = 'warning';
      } else if (aligned) {
        instruction = `Perfect! Hold still to capture (step ${this.stepIndex + 1}/${SCAN_STEPS.length}).`;
        directionSymbol = '✅';
        directionType = 'good';
      } else {
        // guide turn direction based on current step
        if (step.key === 'turnRight') {
          directionSymbol = '➡';
          directionType = 'warning';
        }
        if (step.key === 'turnLeft') {
          directionSymbol = '⬅';
          directionType = 'warning';
        }
        if (step.key === 'side') {
          directionSymbol = '↔';
          directionType = 'warning';
        }
        if (step.key === 'front') {
          directionSymbol = '🧍';
          directionType = 'warning';
        }
      }

      this.ui.showDirection(directionSymbol, directionType);
      this.ui.setGlow(aligned);
      this.ui.setCircleReady(aligned);
      this.ui.setInstruction(instruction);

      // countdown capture when perfectly aligned
      if (aligned && result.passed) {
        if (!this.countdownStart) {
          this.countdownStart = performance.now();
          this.ui.showCountdown(3);
        }

        const elapsed = performance.now() - this.countdownStart;
        const remaining = 3 - Math.floor(elapsed / 1000);
        this.ui.showCountdown(Math.max(1, remaining));

        if (elapsed > 3000) {
          this.captureStep(step, landmarks);
        }
      } else {
        this.countdownStart = null;
        this.ui.showCountdown(null);
      }

      if (!aligned) {
        this.stableSince = null;
      }
    }
  }

  isPointInCircle(point, center = { x: 0.5, y: 0.5 }, radius = 0.48) {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return false;
    return Math.hypot(point.x - center.x, point.y - center.y) < radius;
  }

  areShouldersLevel(landmarks) {
    if (!landmarks) return false;
    const left = landmarks[11];
    const right = landmarks[12];
    if (!left || !right) return false;

    const dy = right.y - left.y;
    const dx = right.x - left.x;
    const angleDeg = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

    // Shoulders should be roughly horizontal (within ~10°)
    return angleDeg < 10;
  }

  areArmsStraight(landmarks) {
    if (!landmarks) return false;
    const leftAngle = angle(landmarks[11], landmarks[13], landmarks[15]);
    const rightAngle = angle(landmarks[12], landmarks[14], landmarks[16]);
    return leftAngle > 155 && rightAngle > 155;
  }

  areWristsInCircle(landmarks) {
    if (!landmarks) return false;
    return this.isPointInCircle(landmarks[15]) && this.isPointInCircle(landmarks[16]);
  }

  areLegsStraight(landmarks) {
    if (!landmarks) return false;
    const leftKneeAngle = angle(landmarks[23], landmarks[25], landmarks[27]);
    const rightKneeAngle = angle(landmarks[24], landmarks[26], landmarks[28]);
    return leftKneeAngle > 150 && rightKneeAngle > 150;
  }

  areAnklesInCircle(landmarks) {
    if (!landmarks) return false;
    return this.isPointInCircle(landmarks[27]) && this.isPointInCircle(landmarks[28]);
  }

  captureStep(step, landmarks) {
    this.collected.push({ step: step.key, landmarks });
    this.stepIndex += 1;
    this.stableSince = null;
    this.countdownStart = null;
    this.ui.showCountdown(null);
    this.ui.setStepTracker(this.stepIndex, SCAN_STEPS.length);
    this.ui.playBeep();

    if (this.stepIndex >= SCAN_STEPS.length) {
      this.finishScan(landmarks);
    } else {
      const nextStep = SCAN_STEPS[this.stepIndex];
      this.ui.speak(nextStep.instruction);
    }
  }

  restartStep() {
    this.stableSince = null;
    this.countdownStart = null;
    this.ui.showCountdown(null);
    this.ui.showFeedback('Step restarted. Hold still to continue.', 'info');
  }

  startScan(auto = false) {
    if (this.state === 'scanning') return;
    this.state = 'scanning';
    this.stepIndex = 0;
    this.collected = [];
    this.stableSince = null;
    this.scanStart = performance.now();
    this.analytics.attempts += 1;
    this.saveAnalytics();

    this.ui.setState('scanning');
    this.ui.setStep(1, SCAN_STEPS.length);
    this.ui.setStepTracker(0, SCAN_STEPS.length);
    this.ui.setProgress(0);
    this.ui.setScanEnabled(false);

    if (auto) {
      this.ui.setInstruction('Auto-starting scan...');
      this.ui.speak('Auto starting scan. Hold still.');
    } else {
      this.ui.setInstruction(SCAN_STEPS[0].instruction);
      this.ui.speak(SCAN_STEPS[0].instruction);
    }

    this.lastStepKey = SCAN_STEPS[0].key;
  }

  finishScan(finalLandmarks) {
    this.state = 'processing';
    this.ui.setState('processing');
    this.ui.setProgress(1);
    this.ui.setScanEnabled(false);

    const averagedLandmarks = this.averageLandmarks() || finalLandmarks;
    const bodyModel = this.computeBodyModel(averagedLandmarks);
    const quality = this.computeQualityScore();
    const confidence = computeConfidence(bodyModel, quality);
    const sizeRecommendation = recommendSize(bodyModel);
    const bodyType = predictBodyType(bodyModel);

    const scanRecord = {
      id: `${Date.now()}`,
      timestamp: Date.now(),
      bodyModel: {
        ...bodyModel,
        bodyType,
        size: sizeRecommendation,
        confidence: Math.round(confidence * 100) / 100
      },
      quality,
      landmarks: averagedLandmarks
    };

    this.storage.add(scanRecord);
    this.history = this.storage.getAll();
    this.ui.setHistory(this.history);

    const durationMs = performance.now() - (this.scanStart || performance.now());
    this.analytics.successes += 1;
    this.analytics.totalTimeMs += durationMs;
    this.saveAnalytics();

    window.setTimeout(() => {
      this.ui.showSuccess(scanRecord);
      this.tryOn.update(scanRecord.bodyModel, averagedLandmarks);
      this.ui.showFeedback(`Scan complete (${(durationMs / 1000).toFixed(1)}s)`, 'info');
      this.ui.speak('Scan complete. You can review or retry.');
    }, 600);
  }

  computeBodyModel(landmarks) {
    const metrics = getBodyMetrics(landmarks);

    const shoulderCenter = {
      x: (landmarks[11].x + landmarks[12].x) / 2,
      y: (landmarks[11].y + landmarks[12].y) / 2
    };
    const hipCenter = {
      x: (landmarks[23].x + landmarks[24].x) / 2,
      y: (landmarks[23].y + landmarks[24].y) / 2
    };

    const heightNormalized = Math.abs(landmarks[0].y - ((landmarks[27].y + landmarks[28].y) / 2));
    const shoulderWidthNormalized = euclideanDistance(landmarks[11], landmarks[12]);

    const rawHeightCm = clamp01(heightNormalized) * 220 + 120;
    const rawShoulderCm = clamp01(shoulderWidthNormalized) * 90 + 30;

    // Use user-provided height as a calibration reference for scaling measurements
    const heightCm = this.calibratedHeight || rawHeightCm;
    const scale = rawHeightCm > 0 ? heightCm / rawHeightCm : 1;
    const shoulderCm = Math.round(rawShoulderCm * scale);

    const shoulderToHipRatio = shoulderWidthNormalized / (euclideanDistance(landmarks[23], landmarks[24]) || 1);

    const bodyType = (shoulderToHipRatio > 1.08)
      ? 'Inverted triangle'
      : shoulderToHipRatio < 0.92
        ? 'Triangle'
        : 'Rectangle';

    const proportions = {
      shoulderToHeight: shoulderWidthNormalized / (heightNormalized || 1),
      torsoToHeight: distance(landmarks[11], landmarks[23]) / (heightNormalized || 1),
      armLength: distance(landmarks[12], landmarks[16]) / (heightNormalized || 1),
      legLength: distance(landmarks[24], landmarks[28]) / (heightNormalized || 1)
    };

    return {
      height: `${Math.round(heightCm)} cm (approx)`,
      shoulderWidth: `${Math.round(shoulderCm)} cm (approx)`,
      calibratedHeight: this.calibratedHeight,
      bodyType,
      recommendedSize: recommendSize({ height: `${Math.round(heightCm)} cm`, shoulderWidth: `${Math.round(shoulderCm)} cm` }),
      proportions,
      raw: {
        heightNormalized,
        shoulderWidthNormalized,
        shouldertoHipRatio: shoulderToHipRatio
      },
      metrics,
      timestamp: Date.now()
    };
  }

  computeQualityScore() {
    const visibility = this.collected
      .map((entry) => getVisibilityScore(entry.landmarks))
      .reduce((sum, v) => sum + v, 0) / (this.collected.length || 1);

    const stabilityAvg = this.collected
      .map((entry, index) => {
        if (index === 0) return 1;
        return getPoseStability(entry.landmarks, this.collected[index - 1].landmarks, 0.04);
      })
      .reduce((sum, v) => sum + v, 0) / (this.collected.length || 1);

    const base = 0.4 * visibility + 0.4 * stabilityAvg + 0.2 * (this.collected.length / SCAN_STEPS.length);
    return clamp01(base) * 100;
  }

  averageLandmarks() {
    if (!this.collected.length) return null;
    const count = this.collected.length;
    const base = this.collected[0].landmarks;
    const average = base.map(() => ({ x: 0, y: 0, z: 0, visibility: 0 }));

    this.collected.forEach((entry) => {
      entry.landmarks.forEach((lm, idx) => {
        const target = average[idx];
        target.x += lm.x;
        target.y += lm.y;
        target.z += lm.z;
        if (lm.visibility != null) target.visibility += lm.visibility;
      });
    });

    return average.map((lm) => ({
      x: lm.x / count,
      y: lm.y / count,
      z: lm.z / count,
      visibility: lm.visibility / count
    }));
  }

  isCentered(landmarks) {
    const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2;
    const hipMidX = (landmarks[23].x + landmarks[24].x) / 2;
    const torsoCenterX = (shoulderMidX + hipMidX) / 2;

    const headY = landmarks[0].y;
    const ankleY = (landmarks[27].y + landmarks[28].y) / 2;
    const visibleHeight = ankleY - headY;

    return Math.abs(torsoCenterX - 0.5) < 0.14 && visibleHeight > 0.56;
  }

  exportScan() {
    const payload = this.ui.getExportPayload();
    if (!payload) {
      this.ui.showFeedback('No scan data available to export.', 'warning');
      return;
    }

    const dataStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fitvision_scan_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  loadHistoryItem(id) {
    const item = this.history.find((scan) => scan.id === id);
    if (!item) {
      this.ui.showFeedback('Scan item not found.', 'warning');
      return;
    }

    this.ui.showFeedback('Loaded scan from history.', 'info');
    this.tryOn.update(item.bodyModel, item.landmarks);
    this.ui.showSuccess(item.bodyModel, item.quality);
  }

  importScan(data) {
    if (!data || !data.bodyModel) {
      this.ui.showFeedback('Invalid scan data. Make sure you selected a valid JSON export.', 'warning');
      return;
    }

    const record = {
      id: `${Date.now()}`,
      timestamp: Date.now(),
      bodyModel: data.bodyModel,
      quality: data.quality ?? 0,
      landmarks: data.landmarks || []
    };

    this.storage.add(record);
    this.history = this.storage.getAll();
    this.ui.setHistory(this.history);
    this.ui.showSuccess(record);
    this.tryOn.update(record.bodyModel, record.landmarks);
    this.ui.showFeedback('Imported scan successfully.', 'info');
  }

  clearHistory() {
    this.storage.clear();
    this.history = [];
    this.ui.setHistory([]);
  }
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}
