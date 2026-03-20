/*
 * FitVision - Scan workflow + body model generation
 */

import { getBodyMetrics, getVisibilityScore, getPoseStability, angle } from './utils.js';
import {
  predictBodyType,
  recommendSize,
  computeConfidence,
  generateFitInsights,
  buildGarmentGuidance,
  buildQualityReasons,
  compareBodyModels,
  buildReportText
} from './ai.js';

const DETECT_VISIBILITY_MIN = 0.48;
const STEP_VISIBILITY_MIN = 0.5;
const MANUAL_START_VISIBILITY_MIN = 0.4;
const AUTO_START_STABILITY_MIN = 0.45;
const ALIGNMENT_STABILITY_MIN = 0.58;
const AUTO_START_HOLD_MS = 1200;
const SETTINGS_KEY = 'fitvision_scan_settings_v1';
const CALIBRATION_KEY = 'fitvision_calibration_v1';
const GARMENT_KEY = 'fitvision_garment_focus_v1';
const GUIDE_KEY = 'fitvision_guide_seen_v1';

const SCAN_STEPS = [
  {
    key: 'front',
    label: 'Front scan',
    instruction: 'Stand straight and look at the camera.',
    check: (landmarks) => {
      const visibility = getVisibilityScore(landmarks);
      const centered = isCenteredForScan(landmarks);
      const zDiff = landmarks[11].z - landmarks[12].z;
      const frontScore = 1 - Math.min(1, Math.abs(zDiff) / 0.1);
      const progress = clamp01((visibility * 0.5) + (centered ? 0.2 : 0) + (frontScore * 0.3));
      const passed = visibility > STEP_VISIBILITY_MIN && centered && Math.abs(zDiff) < 0.08;
      const message = !visibility
        ? 'Make sure your full body is visible and well-lit.'
        : !centered
          ? 'Place your body centered inside the circle.'
          : Math.abs(zDiff) >= 0.08
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
      const passed = visibility > STEP_VISIBILITY_MIN && zDiff > 0.05;
      const message = !visibility
        ? 'Make sure your full body is visible and well-lit.'
        : zDiff < 0.05
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
      const passed = visibility > STEP_VISIBILITY_MIN && Math.abs(zDiff) > 0.1;
      const message = !visibility
        ? 'Make sure your full body is visible and well-lit.'
        : Math.abs(zDiff) < 0.1
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
      const passed = visibility > STEP_VISIBILITY_MIN && zDiff < -0.05;
      const message = !visibility
        ? 'Make sure your full body is visible and well-lit.'
        : zDiff > -0.05
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
    this.settings = this.loadSettings();
    this.calibration = this.loadCalibration();
    this.garmentFocus = this.loadGarmentFocus();
    this.guideSeen = this.loadGuideSeen();
    this.aspectRatio = 16 / 9;

    this.lastStepKey = null;
    this.lastAligned = false;
    this.lastCoachKey = null;
    this.currentReport = null;

    this.reset();
    this.ui.setExperienceSettings(this.settings);
    this.ui.setCalibrationTuning(this.calibration);
    this.ui.setGarmentFocus(this.garmentFocus);
    this.ui.setAnalyticsSummary(this.buildAnalyticsSummary());

    this.ui.on('start', () => this.startScan());
    this.ui.on('retry', () => this.reset());
    this.ui.on('export', () => this.exportScan());
    this.ui.on('import', (data) => this.importScan(data));
    this.ui.on('loadHistory', (id) => this.loadHistoryItem(id));
    this.ui.on('clearHistory', () => this.clearHistory());
    this.ui.on('guideOpen', () => this.openGuideWizard());
    this.ui.on('guidePrev', () => this.moveGuideWizard(-1));
    this.ui.on('guideNext', () => this.moveGuideWizard(1));
    this.ui.on('guideDone', () => this.completeGuideWizard());
    this.ui.on('guideSkip', () => this.skipGuideWizard());
    this.ui.on('reportCopy', () => this.copyReport());
    this.ui.on('reportShare', () => this.shareReport());
    this.ui.on('reportDownload', () => this.downloadReport());
    this.ui.on('heightChange', (height) => {
      this.calibratedHeight = height;
      this.ui.showFeedback(`Height set to ${height}cm`, 'info');
      this.ui.pushCoachMessage(`Height calibration updated to ${height} cm. Your measurements will use that for better scaling.`, 'coach', 'height-calibration', true);
    });
    this.ui.on('restartStep', () => this.restartStep());
    this.ui.on('settingChange', ({ key, value }) => this.updateSetting(key, value));
    this.ui.on('calibrationChange', ({ key, value }) => this.updateCalibration(key, value));
    this.ui.on('garmentFocusChange', (value) => this.updateGarmentFocus(value));
  }

  reset() {
    const interrupted = this.scanStart && this.state && this.state !== 'complete' && this.state !== 'idle';
    if (interrupted) {
      this.analytics.failures += 1;
      this.saveAnalytics();
    }

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
    this.lastCoachKey = null;
    this.currentReport = null;
    this.history = this.storage.getAll();
    this.ui.setHistory(this.history);
    this.ui.setAnalyticsSummary(this.buildAnalyticsSummary());
    this.ui.setState('idle');
    this.ui.setStep(0, SCAN_STEPS.length);
    this.ui.setProgress(0);
    this.ui.setScanEnabled(false);
    this.ui.setZoneHighlights({ shoulders: false, arms: false, legs: false });
    this.ui.setScanBeam(false);
    this.ui.setScanWave(false);
    this.ui.hideSuccess();
    this.ui.clearQuality();
    this.ui.setReportPayload(null);
    this.ui.resetCoachMessages();
    this.ui.pushCoachMessage('Stand naturally with your head and feet visible. I will tell you how to adjust before I capture anything.', 'coach', 'reset-ready', true);
    this.tryOn.clear();
    this.ui.setGuideWizard(0, false);
    if (!this.guideSeen) {
      window.setTimeout(() => this.openGuideWizard(), 180);
    }
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

  loadSettings() {
    const defaults = {
      voiceCoach: true,
      autoStart: true,
      audioCues: true
    };

    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
  }

  loadCalibration() {
    const defaults = {
      globalScale: 0,
      upperBody: 0,
      lowerBody: 0,
      posture: 0
    };

    try {
      const raw = localStorage.getItem(CALIBRATION_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  }

  saveCalibration() {
    try {
      localStorage.setItem(CALIBRATION_KEY, JSON.stringify(this.calibration));
    } catch {
      // ignore
    }
  }

  updateCalibration(key, value) {
    if (!key) return;
    this.calibration = {
      ...this.calibration,
      [key]: Number(value) || 0
    };
    this.saveCalibration();
    this.ui.setCalibrationTuning(this.calibration);
    this.ui.pushCoachMessage(
      `${formatCalibrationLabel(key)} nudged to ${value > 0 ? '+' : ''}${value}%.`,
      'coach',
      `calibration-${key}-${value}`,
      true
    );
  }

  loadGarmentFocus() {
    try {
      return localStorage.getItem(GARMENT_KEY) || 'tee';
    } catch {
      return 'tee';
    }
  }

  saveGarmentFocus() {
    try {
      localStorage.setItem(GARMENT_KEY, this.garmentFocus || 'tee');
    } catch {
      // ignore
    }
  }

  updateGarmentFocus(value) {
    this.garmentFocus = value || 'tee';
    this.saveGarmentFocus();
    this.ui.setGarmentFocus(this.garmentFocus);
    this.ui.pushCoachMessage(
      `Garment focus set to ${formatGarmentLabel(this.garmentFocus)}.`,
      'coach',
      `garment-${this.garmentFocus}`,
      true
    );
  }

  loadGuideSeen() {
    try {
      return localStorage.getItem(GUIDE_KEY) === '1';
    } catch {
      return false;
    }
  }

  saveGuideSeen() {
    try {
      localStorage.setItem(GUIDE_KEY, '1');
    } catch {
      // ignore
    }
  }

  openGuideWizard() {
    this.ui.openGuideWizard();
  }

  moveGuideWizard(delta) {
    const nextIndex = this.guideIndexSafe(delta);
    this.ui.setGuideWizard(nextIndex, true);
  }

  completeGuideWizard() {
    this.saveGuideSeen();
    this.guideSeen = true;
    this.ui.closeGuideWizard();
    this.ui.showFeedback('Calibration wizard complete.', 'info');
    this.ui.pushCoachMessage('Calibration wizard finished. You are ready to scan.', 'coach', 'guide-complete', true);
  }

  skipGuideWizard() {
    this.saveGuideSeen();
    this.guideSeen = true;
    this.ui.closeGuideWizard();
    this.ui.pushCoachMessage('Calibration wizard skipped. You can reopen it any time.', 'coach', 'guide-skip', true);
  }

  guideIndexSafe(delta = 0) {
    const max = Math.max(0, (this.ui.guideSteps?.length || 1) - 1);
    const next = Math.max(0, Math.min(max, (this.ui.guideIndex || 0) + delta));
    return next;
  }

  updateSetting(key, value) {
    if (!key) return;
    this.settings = {
      ...this.settings,
      [key]: Boolean(value)
    };
    this.saveSettings();
    this.ui.setExperienceSettings(this.settings);
    this.ui.pushCoachMessage(
      `${formatSettingLabel(key)} ${value ? 'enabled' : 'disabled'}.`,
      'coach',
      `setting-${key}-${value ? 'on' : 'off'}`,
      true
    );
  }

  buildAnalyticsSummary() {
    const attempts = this.analytics?.attempts || 0;
    const successes = this.analytics?.successes || 0;
    const successRate = attempts ? (successes / attempts) * 100 : 0;
    const averageTimeSeconds = successes
      ? (this.analytics.totalTimeMs || 0) / successes / 1000
      : 0;

    return {
      attempts,
      successRate,
      averageTimeSeconds,
      savedScans: this.history?.length || 0
    };
  }

  updatePose(landmarks, meta = {}) {
    const visibility = getVisibilityScore(landmarks);
    const centered = this.isCentered(landmarks);
    const stability = this.lastPose ? getPoseStability(landmarks, this.lastPose, 0.03) : 0;
    this.lastPose = landmarks;

    const { lowLight, tooClose, tooFar, aspectRatio } = meta;
    this.lastPoseMeta = { lowLight, tooClose, tooFar, aspectRatio };
    if (aspectRatio) {
      this.aspectRatio = aspectRatio;
    }

    if (this.state !== 'processing' && this.state !== 'complete') {
      this.tryOn.update(null, landmarks);
    }

    // Directional guidance (distance + centering + stability)
    const torsoCenterX = ((landmarks[11].x + landmarks[12].x) / 2 + (landmarks[23].x + landmarks[24].x) / 2) / 2;
    const torsoOffsetX = torsoCenterX - 0.5;
    const inCenter = Math.abs(torsoOffsetX) < 0.11;
    const positionScore = 1 - Math.min(1, Math.abs(torsoOffsetX) / 0.11);
    const distanceScore = tooClose || tooFar ? 0 : 1;
    const stabilityScore = Math.min(1, Math.max(0, (stability - 0.3) / 0.55));

    const alignmentScore = clamp01(positionScore * 0.5 + distanceScore * 0.2 + stabilityScore * 0.3);
    const confidenceScore = clamp01(visibility * 0.45 + stability * 0.45 + alignmentScore * 0.1);

    this.ui.setAlignmentProgress(alignmentScore);
    this.ui.setAlignmentScore(alignmentScore);
    this.ui.setConfidence(confidenceScore);
    this.ui.setReadinessIndicators({
      frame: {
        ok: visibility > DETECT_VISIBILITY_MIN && centered,
        label: visibility <= DETECT_VISIBILITY_MIN ? 'Find body' : centered ? 'Good' : 'Center'
      },
      distance: {
        ok: !tooClose && !tooFar,
        label: tooClose ? 'Back' : tooFar ? 'Closer' : 'Good'
      },
      light: {
        ok: !lowLight,
        label: lowLight ? 'Low' : 'Good'
      },
      steady: {
        ok: stability > AUTO_START_STABILITY_MIN,
        label: stability > AUTO_START_STABILITY_MIN ? 'Good' : 'Hold'
      }
    });

    const aligned = inCenter && !tooClose && !tooFar && stability > ALIGNMENT_STABILITY_MIN;

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
    const detectionDirection = getDetectionDirectionState({
      tooClose,
      tooFar,
      inCenter,
      torsoOffsetX,
      stability,
      aligned
    });
    this.ui.showDirection(detectionDirection.label, detectionDirection.type);
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

      const manualStartReady = visibility > MANUAL_START_VISIBILITY_MIN && !lowLight;
      const autoStartReady = this.settings.autoStart
        && visibility > DETECT_VISIBILITY_MIN
        && centered
        && stability > AUTO_START_STABILITY_MIN
        && !lowLight;

      this.ui.setScanEnabled(manualStartReady);

      if (autoStartReady) {
        // ready to scan
        if (!this.stableStart) this.stableStart = performance.now();
        if (performance.now() - this.stableStart > AUTO_START_HOLD_MS) {
          this.ui.setState('ready');
          this.ui.setCircleReady(true);
          this.ui.playBeep();
          // auto start
          this.startScan(true);
        } else {
          const remaining = Math.max(0, AUTO_START_HOLD_MS / 1000 - (performance.now() - this.stableStart) / 1000);
          this.ui.setInstruction(`Hold still for ${remaining.toFixed(1)}s to auto-start`);
        }
      } else {
        this.stableStart = null;
        this.ui.setCircleReady(false);

        if (warnings.length) {
          this.ui.setInstruction(warnings.join(' | '));
        } else if (visibility < DETECT_VISIBILITY_MIN) {
          this.ui.setInstruction('Move closer so your whole body is visible.');
        } else if (!centered) {
          this.ui.setInstruction('Center your body in the circle.');
        } else if (manualStartReady) {
          this.ui.setState('ready');
          this.ui.setInstruction(
            this.settings.autoStart
              ? 'Body detected. Press Start Scan now or hold still for auto-start.'
              : 'Body detected. Press Start Scan when you are ready.'
          );
        } else {
          this.ui.setInstruction('Hold still to stabilize.');
        }
      }

      this.emitCoachTip({
        phase: 'detecting',
        lowLight,
        tooClose,
        tooFar,
        inCenter,
        torsoOffsetX,
        visibility,
        stability,
        aligned,
        shouldersAligned,
        armsAligned,
        legsAligned
      });
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
      }

      if (lowLight) {
        instruction = 'Lighting is low. Increase room light for better results.';
      } else if (tooClose) {
        instruction = 'You are too close. Step back a little.';
      } else if (tooFar) {
        instruction = 'You are too far. Move closer.';
      } else if (aligned) {
        instruction = `Perfect! Hold still to capture (step ${this.stepIndex + 1}/${SCAN_STEPS.length}).`;
      }

      const scanDirection = getScanDirectionState({
        lowLight,
        tooClose,
        tooFar,
        inCenter,
        torsoOffsetX,
        aligned,
        stability,
        stepKey: step.key
      });
      this.ui.showDirection(scanDirection.label, scanDirection.type);
      this.ui.setGlow(aligned);
      this.ui.setCircleReady(aligned);
      this.ui.setInstruction(instruction);
      this.emitCoachTip({
        phase: 'scanning',
        step,
        result,
        lowLight,
        tooClose,
        tooFar,
        inCenter,
        torsoOffsetX,
        stability,
        aligned,
        shouldersAligned,
        armsAligned,
        legsAligned
      });

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

  handlePoseLost() {
    this.stableStart = null;
    this.countdownStart = null;
    this.lastPose = null;
    this.lastPoseMeta = null;
    this.lastAligned = false;

    this.ui.showCountdown(null);
    this.ui.setGlow(false);
    this.ui.setCircleReady(false);
    this.ui.setScanBeam(false);
    this.ui.setScanWave(false);
    this.ui.setZoneHighlights({ shoulders: false, arms: false, legs: false });
    this.ui.setAlignmentProgress(0);
    this.ui.setAlignmentScore(0);
    this.ui.setConfidence(0);
    if (this.state !== 'processing' && this.state !== 'complete') {
      this.tryOn.clear();
    }
    this.ui.setReadinessIndicators({
      frame: { ok: false, label: 'Lost' },
      distance: { ok: false, label: 'Wait' },
      light: { ok: false, label: 'Wait' },
      steady: { ok: false, label: 'Wait' }
    });

    if (this.state === 'scanning') {
      this.ui.showDirection('FIND BODY', 'warning');
      this.ui.showFeedback('Body lost. Step back into frame to continue.', 'warning');
      this.ui.setInstruction('I lost sight of you. Step back into the ring with your head and feet visible.');
      this.ui.setProgress(this.stepIndex / SCAN_STEPS.length);
      this.ui.setStep(this.stepIndex + 1, SCAN_STEPS.length);
      this.ui.pushCoachMessage(
        'I lost your full body for a moment. Step back into the guide ring and I will continue from this step.',
        'coach',
        'coach-body-lost'
      );
      return;
    }

    if (this.state === 'processing' || this.state === 'complete') {
      this.ui.showDirection(null);
      return;
    }

    this.state = 'detecting';
    this.ui.setState('detecting');
    this.ui.setScanEnabled(false);
    this.ui.setProgress(0);
    this.ui.setReadinessIndicators({
      frame: { ok: false, label: 'Find' },
      distance: { ok: false, label: 'Wait' },
      light: { ok: false, label: 'Wait' },
      steady: { ok: false, label: 'Wait' }
    });
    this.ui.showDirection('FIND BODY', 'warning');
    this.ui.setInstruction('Step into view with your head and feet visible.');
    this.ui.pushCoachMessage(
      'Step into the frame with your head and both feet visible. Once I can track your full body, the scan button will unlock.',
      'coach',
      'coach-find-body'
    );
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

  emitCoachTip(context) {
    const tip = this.getCoachTip(context);
    if (!tip) return;

    this.lastCoachKey = tip.key;
    this.ui.pushCoachMessage(tip.text, 'coach', tip.key);
  }

  getCoachTip(context) {
    const {
      phase,
      step,
      result,
      lowLight,
      tooClose,
      tooFar,
      inCenter,
      torsoOffsetX,
      visibility,
      stability,
      aligned,
      shouldersAligned,
      armsAligned,
      legsAligned
    } = context;

    if (lowLight) {
      return {
        key: 'coach-light',
        text: 'I need a brighter silhouette. Turn on a light or face the brightest part of the room.'
      };
    }

    if (tooClose) {
      return {
        key: 'coach-step-back',
        text: 'Take a small step back so I can see your full figure inside the guide ring.'
      };
    }

    if (tooFar) {
      return {
        key: 'coach-step-forward',
        text: 'Step a little closer until your shoulders and hips fill more of the frame.'
      };
    }

    if (!inCenter) {
      return {
        key: torsoOffsetX > 0 ? 'coach-shift-left' : 'coach-shift-right',
        text: torsoOffsetX > 0
          ? 'Shift slightly to your left so your torso sits in the center of the guide.'
          : 'Shift slightly to your right so your torso sits in the center of the guide.'
      };
    }

    if (phase === 'detecting') {
      if ((visibility || 0) < DETECT_VISIBILITY_MIN) {
        return {
          key: 'coach-full-body',
          text: 'Keep your head and both feet visible. I need the full body before I can measure accurately.'
        };
      }

      if (!shouldersAligned) {
        return {
          key: 'coach-shoulders-level',
          text: 'Relax and level your shoulders. Try standing tall with both shoulders even.'
        };
      }

      if (!armsAligned) {
        return {
          key: 'coach-arms',
          text: 'Let your arms hang naturally at your sides so sleeve length reads more cleanly.'
        };
      }

      if (!legsAligned) {
        return {
          key: 'coach-legs',
          text: 'Plant both feet and straighten your legs. That helps me stabilize inseam and leg measurements.'
        };
      }

      if ((stability || 0) < AUTO_START_STABILITY_MIN) {
        return {
          key: 'coach-hold-still',
          text: 'Good framing. Freeze for a moment and I will auto-start the scan once your pose settles.'
        };
      }

      if (aligned) {
        return {
          key: 'coach-ready',
          text: 'Perfect. Stay exactly there and I will begin the guided scan automatically.'
        };
      }

      return null;
    }

    if (phase === 'scanning' && step) {
      if ((stability || 0) < 0.45) {
        return {
          key: `coach-steady-${step.key}`,
          text: 'Hold that position without swaying. The more still you are, the tighter the measurement margin becomes.'
        };
      }

      if (step.key === 'front' && !shouldersAligned) {
        return {
          key: 'coach-front-shoulders',
          text: 'Square your chest to the camera and keep both shoulders level for the front capture.'
        };
      }

      if (step.key === 'front' && !armsAligned) {
        return {
          key: 'coach-front-arms',
          text: 'Keep your elbows soft and your hands close to your sides so your arm length reads correctly.'
        };
      }

      if (step.key === 'front' && !legsAligned) {
        return {
          key: 'coach-front-legs',
          text: 'Stand tall with both legs straight and feet grounded for a cleaner lower-body measurement.'
        };
      }

      if (step.key === 'turnRight' && !result?.passed) {
        return {
          key: 'coach-turn-right',
          text: 'Rotate clockwise until your right shoulder moves closer to the camera, then pause.'
        };
      }

      if (step.key === 'side' && !result?.passed) {
        return {
          key: 'coach-side-profile',
          text: 'Turn further into profile so I can read your side silhouette. Keep your torso upright when you stop.'
        };
      }

      if (step.key === 'turnLeft' && !result?.passed) {
        return {
          key: 'coach-turn-left',
          text: 'Turn back until your left shoulder is slightly closer to the camera, then hold.'
        };
      }

      if (aligned && result?.passed) {
        return {
          key: `coach-hold-${step.key}`,
          text: `Nice. Hold the ${step.label.toLowerCase()} steady through the countdown so I can lock a precise frame.`
        };
      }
    }

    return null;
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
      this.ui.pushCoachMessage('Great hold. I have all the scan views I need and I am building your measurement profile now.', 'coach', 'coach-processing', true);
      this.finishScan(landmarks);
    } else {
      const nextStep = SCAN_STEPS[this.stepIndex];
      this.ui.pushCoachMessage(`Captured ${step.label.toLowerCase()}. Next: ${nextStep.instruction}`, 'coach', `coach-next-${nextStep.key}`, true);
      this.ui.speak(nextStep.instruction);
    }
  }

  restartStep() {
    this.stableSince = null;
    this.countdownStart = null;
    this.ui.showCountdown(null);
    this.ui.showFeedback('Step restarted. Hold still to continue.', 'info');
    const step = SCAN_STEPS[this.stepIndex];
    if (step) {
      this.ui.pushCoachMessage(`Restarted ${step.label.toLowerCase()}. ${step.instruction}`, 'coach', `coach-restart-${step.key}`, true);
    }
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
    this.ui.setAnalyticsSummary(this.buildAnalyticsSummary());

    this.ui.setState('scanning');
    this.ui.setStep(1, SCAN_STEPS.length);
    this.ui.setStepTracker(0, SCAN_STEPS.length);
    this.ui.setProgress(0);
    this.ui.setScanEnabled(false);

    if (auto) {
      this.ui.setInstruction('Auto-starting scan...');
      this.ui.pushCoachMessage('I am starting the guided scan now. Follow each turn and freeze when I ask you to hold.', 'coach', 'coach-scan-start', true);
      this.ui.speak('Auto starting scan. Hold still.');
    } else {
      this.ui.setInstruction(SCAN_STEPS[0].instruction);
      this.ui.pushCoachMessage(`Scan started. ${SCAN_STEPS[0].instruction}`, 'coach', 'coach-manual-start', true);
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
    const bodyModel = this.computeBodyModel(averagedLandmarks, this.collected);
    const qualityBreakdown = this.computeQualityBreakdown();
    const quality = qualityBreakdown.overall;
    const confidence = computeConfidence(bodyModel, quality);
    const sizeRecommendation = recommendSize(bodyModel);
    const bodyType = predictBodyType(bodyModel);
    const previousRecord = this.storage.getLatest();
    const fitInsights = generateFitInsights(bodyModel);
    const qualityReasons = buildQualityReasons(qualityBreakdown, {
      lowLight: this.lastPoseMeta?.lowLight,
      autoStart: this.settings.autoStart
    });
    const garmentGuidance = buildGarmentGuidance(bodyModel, this.garmentFocus);
    const comparison = previousRecord?.bodyModel
      ? compareBodyModels(bodyModel, previousRecord.bodyModel)
      : null;

    const scanRecord = {
      id: `${Date.now()}`,
      timestamp: Date.now(),
      bodyModel: {
        ...bodyModel,
        bodyType,
        size: sizeRecommendation,
        confidence: Math.round(confidence * 100) / 100,
        fitInsights,
        qualityBreakdown,
        qualityReasons,
        garmentGuidance,
        garmentFocus: this.garmentFocus
      },
      quality,
      qualityBreakdown,
      qualityReasons,
      garmentGuidance,
      garmentFocus: this.garmentFocus,
      comparison,
      landmarks: averagedLandmarks,
      stepLandmarks: this.getStepLandmarks()
    };

    scanRecord.reportText = buildReportText(scanRecord);
    this.currentReport = scanRecord;
    this.storage.add(scanRecord);
    this.history = this.storage.getAll();
    this.ui.setHistory(this.history);
    this.ui.setAnalyticsSummary(this.buildAnalyticsSummary());

    const durationMs = performance.now() - (this.scanStart || performance.now());
    this.analytics.successes += 1;
    this.analytics.totalTimeMs += durationMs;
    this.saveAnalytics();
    this.ui.setAnalyticsSummary(this.buildAnalyticsSummary());

    window.setTimeout(() => {
      this.state = 'complete';
      this.ui.setReportPayload(scanRecord);
      this.ui.showSuccess(scanRecord);
      this.tryOn.update(scanRecord.bodyModel, averagedLandmarks);
      this.ui.showFeedback(`Scan complete (${(durationMs / 1000).toFixed(1)}s)`, 'info');
      this.ui.pushCoachMessage('Scan complete. Review the calibrated measurements on the right and export them if you want to keep them.', 'coach', 'coach-complete', true);
      this.ui.speak('Scan complete. You can review or retry.');
    }, 600);
  }

  computeBodyModel(landmarks, collected = []) {
    const metrics = getBodyMetrics(landmarks);
    const views = this.getStepLandmarks(collected);
    const front = views.front || landmarks;
    const side = views.side || views.turnRight || views.turnLeft || landmarks;
    const aspectRatio = this.aspectRatio || 16 / 9;

    const headTop = estimateHeadTop(front);
    const shoulderMid = midpoint(front[11], front[12]);
    const hipMid = midpoint(front[23], front[24]);
    const ankleMid = midpoint(front[27], front[28]);

    const visibleHeightUnits = metricDistance(headTop, ankleMid, aspectRatio) || 1;
    const heightCm = this.calibratedHeight || 170;
    const cmPerUnit = heightCm / visibleHeightUnits;

    const shoulderWidthCm = metricDistance(front[11], front[12], aspectRatio) * cmPerUnit;
    const hipWidthCm = metricDistance(front[23], front[24], aspectRatio) * cmPerUnit;
    const torsoLengthCm = metricDistance(shoulderMid, hipMid, aspectRatio) * cmPerUnit;
    const sleeveLengthCm = average([
      polylineDistance([front[11], front[13], front[15]], aspectRatio),
      polylineDistance([front[12], front[14], front[16]], aspectRatio)
    ]) * cmPerUnit;
    const legLengthCm = average([
      polylineDistance([front[23], front[25], front[27]], aspectRatio),
      polylineDistance([front[24], front[26], front[28]], aspectRatio)
    ]) * cmPerUnit;
    const inseamCm = average([
      polylineDistance([hipMid, front[25], front[27]], aspectRatio),
      polylineDistance([hipMid, front[26], front[28]], aspectRatio)
    ]) * cmPerUnit;
    const sideDepthUnits = average([
      metricDistance(side[11], side[12], aspectRatio),
      metricDistance(side[23], side[24], aspectRatio)
    ]);
    const torsoDepthCm = sideDepthUnits * cmPerUnit;

    const shoulderToHipRatio = shoulderWidthCm / Math.max(hipWidthCm, 1);
    const postureBalance = average([
      this.areShouldersLevel(front) ? 1 : 0.45,
      this.areArmsStraight(front) ? 1 : 0.55,
      this.areLegsStraight(front) ? 1 : 0.55
    ]);
    const symmetryScore = 1 - clamp01(
      Math.abs(
        polylineDistance([front[11], front[13], front[15]], aspectRatio)
        - polylineDistance([front[12], front[14], front[16]], aspectRatio)
      ) / Math.max(metricDistance(front[11], front[12], aspectRatio), 0.001)
    );

    const measurements = {
      heightCm: roundTo(heightCm, 1),
      shoulderWidthCm: roundTo(shoulderWidthCm, 1),
      hipWidthCm: roundTo(hipWidthCm, 1),
      torsoLengthCm: roundTo(torsoLengthCm, 1),
      sleeveLengthCm: roundTo(sleeveLengthCm, 1),
      legLengthCm: roundTo(legLengthCm, 1),
      inseamCm: roundTo(inseamCm, 1),
      torsoDepthCm: roundTo(torsoDepthCm, 1),
      shoulderToHipRatio: roundTo(shoulderToHipRatio, 2)
    };

    const adjustedMeasurements = this.applyMeasurementCalibration(measurements);
    const measurementSanity = sanitizeMeasurementSet(adjustedMeasurements, this.calibratedHeight || heightCm);
    const sanitizedMeasurements = measurementSanity.measurements;
    const adjustedHeight = Math.max(sanitizedMeasurements.heightCm, 1);
    const adjustedRatio = sanitizedMeasurements.shoulderToHipRatio || roundTo(
      sanitizedMeasurements.shoulderWidthCm / Math.max(sanitizedMeasurements.hipWidthCm, 1),
      2
    );
    const bodyType = adjustedRatio > 1.08
      ? 'Inverted triangle'
      : adjustedRatio < 0.92
        ? 'Triangle'
        : 'Rectangle';
    const chestWidthCm = roundTo(
      sanitizedMeasurements.shoulderWidthCm * (
        bodyType === 'Inverted triangle'
          ? 0.95
          : bodyType === 'Triangle'
            ? 0.92
            : 0.94
      ),
      1
    );
    const waistWidthCm = roundTo(
      Math.min(sanitizedMeasurements.shoulderWidthCm, sanitizedMeasurements.hipWidthCm) * (
        bodyType === 'Rectangle' ? 0.86 : 0.84
      ),
      1
    );
    const chestDepthCm = roundTo(
      sanitizedMeasurements.torsoDepthCm * (
        bodyType === 'Inverted triangle'
          ? 0.98
          : bodyType === 'Triangle'
            ? 0.95
            : 0.96
      ),
      1
    );
    const waistDepthCm = roundTo(
      sanitizedMeasurements.torsoDepthCm * (
        bodyType === 'Rectangle' ? 0.84 : 0.82
      ),
      1
    );
    const hipDepthCm = roundTo(sanitizedMeasurements.torsoDepthCm * 0.98, 1);
    const chestCircumferenceCm = roundTo(ellipseCircumference(chestWidthCm, chestDepthCm), 1);
    const waistCircumferenceCm = roundTo(ellipseCircumference(waistWidthCm, waistDepthCm), 1);
    const hipCircumferenceCm = roundTo(ellipseCircumference(sanitizedMeasurements.hipWidthCm, hipDepthCm), 1);
    const frontVisibility = clamp01(getVisibilityScore(front));
    const sideVisibility = clamp01(getVisibilityScore(side));
    const baseReliability = clamp01(
      ((this.computeQualityScore() / 100) * 0.45)
      + (frontVisibility * 0.25)
      + (postureBalance * 0.15)
      + (symmetryScore * 0.15)
    );
    const measurementReview = buildMeasurementWarnings({
      ...sanitizedMeasurements,
      chestCircumferenceCm,
      waistCircumferenceCm,
      hipCircumferenceCm,
      chestWidthCm,
      waistWidthCm,
      hipDepthCm,
      bodyType
    }, {
      reliability: baseReliability,
      frontVisibility,
      sideVisibility,
      postureBalance,
      symmetryScore
    });
    const measurementPenalty = clamp01(Math.min(0.32, measurementSanity.penalty + measurementReview.penalty));
    const measurementWarnings = {
      warnings: [...measurementSanity.warnings, ...measurementReview.warnings].slice(0, 4),
      penalty: measurementPenalty
    };
    const precisionReliability = clamp01(baseReliability - measurementWarnings.penalty);
    const precisionMarginCm = 0.8 + (1 - precisionReliability) * 4.2;
    const measurementConfidence = buildMeasurementConfidence({
      frontVisibility,
      sideVisibility,
      postureBalance,
      symmetryScore,
      overall: precisionReliability
    });
    const measurementRanges = buildMeasurementRanges({
      heightCm: sanitizedMeasurements.heightCm,
      shoulderWidthCm: sanitizedMeasurements.shoulderWidthCm,
      hipWidthCm: sanitizedMeasurements.hipWidthCm,
      torsoLengthCm: sanitizedMeasurements.torsoLengthCm,
      sleeveLengthCm: sanitizedMeasurements.sleeveLengthCm,
      legLengthCm: sanitizedMeasurements.legLengthCm,
      inseamCm: sanitizedMeasurements.inseamCm,
      torsoDepthCm: sanitizedMeasurements.torsoDepthCm,
      chestWidthCm,
      waistWidthCm,
      chestCircumferenceCm,
      waistCircumferenceCm,
      hipCircumferenceCm
    }, precisionMarginCm, measurementConfidence);
    const adjustedProportions = {
      shoulderToHeight: sanitizedMeasurements.shoulderWidthCm / adjustedHeight,
      torsoToHeight: sanitizedMeasurements.torsoLengthCm / adjustedHeight,
      armLength: sanitizedMeasurements.sleeveLengthCm / adjustedHeight,
      legLength: sanitizedMeasurements.legLengthCm / adjustedHeight,
      chestToHeight: chestCircumferenceCm / adjustedHeight,
      waistToHeight: waistCircumferenceCm / adjustedHeight,
      hipToHeight: hipCircumferenceCm / adjustedHeight,
      bodyDepthToHeight: sanitizedMeasurements.torsoDepthCm / adjustedHeight
    };
    const garmentGuidance = buildGarmentGuidance({
      measurements: {
        ...sanitizedMeasurements,
        chestWidthCm,
        waistWidthCm,
        chestDepthCm,
        waistDepthCm,
        hipDepthCm,
        chestCircumferenceCm,
        waistCircumferenceCm,
        hipCircumferenceCm
      },
      precision: {
        reliabilityPercent: roundTo(precisionReliability * 100, 1)
      }
    }, this.garmentFocus);

    return {
      height: `${sanitizedMeasurements.heightCm.toFixed(1)} cm`,
      shoulderWidth: `${sanitizedMeasurements.shoulderWidthCm.toFixed(1)} cm`,
      hipWidth: `${sanitizedMeasurements.hipWidthCm.toFixed(1)} cm`,
      torsoLength: `${sanitizedMeasurements.torsoLengthCm.toFixed(1)} cm`,
      sleeveLength: `${sanitizedMeasurements.sleeveLengthCm.toFixed(1)} cm`,
      inseam: `${sanitizedMeasurements.inseamCm.toFixed(1)} cm`,
      calibratedHeight: this.calibratedHeight,
      bodyType,
      recommendedSize: recommendSize({
        measurements: {
          ...sanitizedMeasurements,
          chestCircumferenceCm,
          waistCircumferenceCm,
          hipCircumferenceCm
        }
      }),
      proportions: adjustedProportions,
      measurements: {
        ...sanitizedMeasurements,
        chestWidthCm,
        waistWidthCm,
        chestDepthCm,
        waistDepthCm,
        hipDepthCm,
        chestCircumferenceCm,
        waistCircumferenceCm,
        hipCircumferenceCm,
        chestToWaistRatio: roundTo(chestCircumferenceCm / Math.max(waistCircumferenceCm, 1), 2),
        waistToHipRatio: roundTo(waistCircumferenceCm / Math.max(hipCircumferenceCm, 1), 2)
      },
      garmentFocus: this.garmentFocus,
      garmentGuidance,
      measurementConfidence,
      measurementRanges,
      measurementWarnings: measurementWarnings.warnings,
      measurementIntegrity: roundTo((1 - measurementWarnings.penalty) * 100, 1),
      precision: {
        reliability: precisionReliability,
        reliabilityPercent: roundTo(precisionReliability * 100, 1),
        marginCm: roundTo(precisionMarginCm, 1),
        basedOnViews: Object.keys(views)
      },
      raw: {
        heightNormalized: visibleHeightUnits,
        shoulderWidthNormalized: metricDistance(front[11], front[12], aspectRatio),
        shouldertoHipRatio: adjustedRatio
      },
      metrics,
      timestamp: Date.now()
    };
  }

  applyMeasurementCalibration(measurements) {
    const tuning = this.calibration || {};
    const globalScale = 1 + ((tuning.globalScale || 0) / 100);
    const upperScale = 1 + ((tuning.upperBody || 0) / 100);
    const lowerScale = 1 + ((tuning.lowerBody || 0) / 100);
    const postureScale = 1 + ((tuning.posture || 0) / 100);

    const adjusted = { ...measurements };
    adjusted.heightCm = roundTo(adjusted.heightCm * globalScale, 1);
    adjusted.shoulderWidthCm = roundTo(adjusted.shoulderWidthCm * globalScale * upperScale, 1);
    adjusted.hipWidthCm = roundTo(adjusted.hipWidthCm * globalScale * lowerScale, 1);
    adjusted.torsoLengthCm = roundTo(adjusted.torsoLengthCm * globalScale * postureScale, 1);
    adjusted.sleeveLengthCm = roundTo(adjusted.sleeveLengthCm * globalScale * upperScale, 1);
    adjusted.legLengthCm = roundTo(adjusted.legLengthCm * globalScale * lowerScale, 1);
    adjusted.inseamCm = roundTo(adjusted.inseamCm * globalScale * lowerScale, 1);
    adjusted.torsoDepthCm = roundTo(adjusted.torsoDepthCm * globalScale * postureScale, 1);
    adjusted.shoulderToHipRatio = roundTo(
      adjusted.shoulderWidthCm / Math.max(adjusted.hipWidthCm, 1),
      2
    );

    return adjusted;
  }

  computeQualityBreakdown() {
    const visibility = average(
      this.collected.map((entry) => getVisibilityScore(entry.landmarks))
    );
    const framing = average(
      this.collected.map((entry) => (this.isCentered(entry.landmarks) ? 1 : 0.55))
    );
    const posture = average(
      this.collected.map(({ landmarks, step }) => {
        if (!landmarks) return 0;

        const shoulders = this.areShouldersLevel(landmarks) ? 1 : 0.65;
        const arms = step === 'front'
          ? (this.areArmsStraight(landmarks) ? 1 : 0.7)
          : 0.86;
        const legs = this.areLegsStraight(landmarks) ? 1 : 0.72;

        return average([shoulders, arms, legs]);
      })
    );
    const coverage = this.collected.length / SCAN_STEPS.length;

    const base = (visibility * 0.45) + (framing * 0.2) + (posture * 0.2) + (coverage * 0.15);
    return {
      overall: clamp01(base) * 100,
      visibility: clamp01(visibility) * 100,
      framing: clamp01(framing) * 100,
      posture: clamp01(posture) * 100,
      coverage: clamp01(coverage) * 100
    };
  }

  computeQualityScore() {
    return this.computeQualityBreakdown().overall;
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

  getStepLandmarks(collected = this.collected) {
    return collected.reduce((acc, entry) => {
      if (entry?.step && entry?.landmarks) {
        acc[entry.step] = entry.landmarks;
      }
      return acc;
    }, {});
  }

  isCentered(landmarks) {
    return isCenteredForScan(landmarks);
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
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `fitvision_scan_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  getReportRecord() {
    return this.currentReport || this.ui.getReportPayload() || this.storage.getLatest();
  }

  async copyReport() {
    const record = this.getReportRecord();
    if (!record) {
      this.ui.showFeedback('No report available to copy.', 'warning');
      return;
    }

    const text = record.reportText || buildReportText(record);
    try {
      await navigator.clipboard.writeText(text);
      this.ui.showFeedback('Report copied to clipboard.', 'info');
      this.ui.pushCoachMessage('Report copied. You can paste it into chat, email, or notes.', 'coach', 'report-copied', true);
    } catch {
      this.ui.showFeedback('Clipboard access failed.', 'warning');
    }
  }

  async shareReport() {
    const record = this.getReportRecord();
    if (!record) {
      this.ui.showFeedback('No report available to share.', 'warning');
      return;
    }

    const text = record.reportText || buildReportText(record);
    const title = 'FitVision Scan Report';
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        this.ui.showFeedback('Report shared.', 'info');
        return;
      } catch {
        // fall through to copy
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      this.ui.showFeedback('Share fallback copied the report text.', 'info');
    } catch {
      this.ui.showFeedback('Sharing is not available in this browser.', 'warning');
    }
  }

  downloadReport() {
    const record = this.getReportRecord();
    if (!record) {
      this.ui.showFeedback('No report available to download.', 'warning');
      return;
    }

    const text = record.reportText || buildReportText(record);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fitvision_report_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    this.ui.showFeedback('Report downloaded.', 'info');
  }

  loadHistoryItem(id) {
    const item = this.history.find((scan) => scan.id === id);
    if (!item) {
      this.ui.showFeedback('Scan item not found.', 'warning');
      return;
    }

    const measurementRanges = item.bodyModel?.measurementRanges || buildMeasurementRanges(
      item.bodyModel?.measurements || {},
      item.bodyModel?.precision?.marginCm || 1.2
    );
    const measurementReview = buildMeasurementWarnings(
      item.bodyModel?.measurements || {},
      {
        reliability: item.bodyModel?.precision?.reliability || 0.6,
        bodyType: item.bodyModel?.bodyType
      }
    );
    const measurementWarnings = Array.isArray(item.bodyModel?.measurementWarnings) && item.bodyModel.measurementWarnings.length
      ? item.bodyModel.measurementWarnings
      : measurementReview.warnings;
    const enrichedItem = {
      ...item,
      bodyModel: {
        ...item.bodyModel,
        fitInsights: item.bodyModel?.fitInsights || generateFitInsights(item.bodyModel),
        garmentGuidance: item.bodyModel?.garmentGuidance || buildGarmentGuidance(item.bodyModel, item.garmentFocus || this.garmentFocus),
        qualityReasons: item.bodyModel?.qualityReasons || buildQualityReasons(item.qualityBreakdown || { visibility: 0, framing: 0, posture: 0, coverage: 0 }, {}),
        measurementConfidence: item.bodyModel?.measurementConfidence || buildConfidenceFromRanges(measurementRanges),
        measurementRanges,
        measurementWarnings,
        measurementIntegrity: Number.isFinite(Number(item.bodyModel?.measurementIntegrity))
          ? item.bodyModel.measurementIntegrity
          : roundTo((1 - measurementReview.penalty) * 100, 1)
      }
    };

    this.state = 'complete';
    this.ui.showFeedback('Loaded scan from history.', 'info');
    this.tryOn.update(enrichedItem.bodyModel, enrichedItem.landmarks);
    this.currentReport = enrichedItem;
    this.ui.setReportPayload(enrichedItem);
    this.ui.showSuccess(enrichedItem);
    this.ui.pushCoachMessage('Loaded a saved scan. You can compare the calibrated measurements or export the record again.', 'coach', 'coach-history-load', true);
  }

  importScan(data) {
    if (!data || !data.bodyModel) {
      this.ui.showFeedback('Invalid scan data. Make sure you selected a valid JSON export.', 'warning');
      return;
    }

    const previousRecord = this.storage.getLatest();
    const fitInsights = data.bodyModel?.fitInsights || generateFitInsights(data.bodyModel);
    const comparison = previousRecord?.bodyModel
      ? compareBodyModels(data.bodyModel, previousRecord.bodyModel)
      : null;
    const measurementRanges = data.bodyModel?.measurementRanges || buildMeasurementRanges(
      data.bodyModel?.measurements || {},
      data.bodyModel?.precision?.marginCm || 1.2
    );
    const measurementReview = buildMeasurementWarnings(
      data.bodyModel?.measurements || {},
      {
        reliability: data.bodyModel?.precision?.reliability || 0.6,
        bodyType: data.bodyModel?.bodyType
      }
    );
    const measurementWarnings = Array.isArray(data.bodyModel?.measurementWarnings) && data.bodyModel.measurementWarnings.length
      ? data.bodyModel.measurementWarnings
      : measurementReview.warnings;

    const record = {
      id: `${Date.now()}`,
      timestamp: Date.now(),
      bodyModel: {
        ...data.bodyModel,
        fitInsights,
        garmentGuidance: data.bodyModel?.garmentGuidance || buildGarmentGuidance(data.bodyModel, data.garmentFocus || this.garmentFocus),
        qualityReasons: data.bodyModel?.qualityReasons || buildQualityReasons(data.qualityBreakdown || data.bodyModel?.qualityBreakdown || { visibility: 0, framing: 0, posture: 0, coverage: 0 }, {}),
        measurementConfidence: data.bodyModel?.measurementConfidence || buildConfidenceFromRanges(measurementRanges),
        measurementRanges,
        measurementWarnings,
        measurementIntegrity: Number.isFinite(Number(data.bodyModel?.measurementIntegrity))
          ? data.bodyModel.measurementIntegrity
          : roundTo((1 - measurementReview.penalty) * 100, 1)
      },
      quality: data.quality ?? 0,
      qualityBreakdown: data.qualityBreakdown || data.bodyModel?.qualityBreakdown || null,
      comparison,
      garmentFocus: data.garmentFocus || this.garmentFocus,
      landmarks: data.landmarks || []
    };

    this.storage.add(record);
    this.history = this.storage.getAll();
    this.ui.setHistory(this.history);
    this.ui.setAnalyticsSummary(this.buildAnalyticsSummary());
    this.state = 'complete';
    record.reportText = buildReportText(record);
    this.currentReport = record;
    this.ui.setReportPayload(record);
    this.ui.showSuccess(record);
    this.tryOn.update(record.bodyModel, record.landmarks);
    this.ui.showFeedback('Imported scan successfully.', 'info');
    this.ui.pushCoachMessage('Imported scan ready. Review the measurements on the right or run another live scan anytime.', 'coach', 'coach-import', true);
  }

  clearHistory() {
    this.storage.clear();
    this.history = [];
    this.ui.setHistory([]);
    this.ui.setAnalyticsSummary(this.buildAnalyticsSummary());
    this.ui.showFeedback('Scan history cleared.', 'info');
  }
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function getDetectionDirectionState({
  tooClose,
  tooFar,
  inCenter,
  torsoOffsetX,
  stability,
  aligned
}) {
  if (tooClose) return { label: 'BACK', type: 'warning' };
  if (tooFar) return { label: 'STEP IN', type: 'warning' };
  if (!inCenter) return { label: torsoOffsetX > 0 ? 'LEFT' : 'RIGHT', type: 'warning' };
  if (stability < 0.5) return { label: 'HOLD', type: 'warning' };
  if (aligned) return { label: 'READY', type: 'good' };
  return { label: null, type: null };
}

function getScanDirectionState({
  lowLight,
  tooClose,
  tooFar,
  inCenter,
  torsoOffsetX,
  aligned,
  stability,
  stepKey
}) {
  if (lowLight) return { label: null, type: null };
  if (tooClose) return { label: 'BACK', type: 'warning' };
  if (tooFar) return { label: 'STEP IN', type: 'warning' };
  if (!inCenter) return { label: torsoOffsetX > 0 ? 'LEFT' : 'RIGHT', type: 'warning' };
  if (stability < 0.45) return { label: 'HOLD', type: 'warning' };
  if (aligned) return { label: 'READY', type: 'good' };

  const stepLabels = {
    front: 'FRONT',
    turnRight: 'TURN R',
    side: 'SIDE',
    turnLeft: 'TURN L'
  };

  return {
    label: stepLabels[stepKey] || null,
    type: stepLabels[stepKey] ? 'warning' : null
  };
}

function isCenteredForScan(landmarks) {
  if (!landmarks || landmarks.length < 29) return false;

  const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2;
  const hipMidX = (landmarks[23].x + landmarks[24].x) / 2;
  const torsoCenterX = (shoulderMidX + hipMidX) / 2;

  const headY = landmarks[0].y;
  const ankleY = (landmarks[27].y + landmarks[28].y) / 2;
  const visibleHeight = ankleY - headY;

  return Math.abs(torsoCenterX - 0.5) < 0.18 && visibleHeight > 0.48;
}

function midpoint(a, b) {
  if (!a && !b) return { x: 0, y: 0, z: 0, visibility: 0 };
  if (!a) return b;
  if (!b) return a;

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z || 0) + (b.z || 0)) / 2,
    visibility: ((a.visibility || 0) + (b.visibility || 0)) / 2
  };
}

function estimateHeadTop(landmarks) {
  const facePoints = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((index) => landmarks[index])
    .filter(Boolean);
  const nose = landmarks[0] || facePoints[0];
  if (!nose) return { x: 0.5, y: 0.1, z: 0, visibility: 0 };

  const topFaceY = Math.min(...facePoints.map((point) => point.y));
  const eyeY = average([
    landmarks[2]?.y ?? nose.y,
    landmarks[5]?.y ?? nose.y
  ]);
  const foreheadOffset = Math.max(0.015, Math.abs(nose.y - eyeY) * 2.4);

  return {
    x: nose.x,
    y: Math.max(0, topFaceY - foreheadOffset),
    z: nose.z || 0,
    visibility: nose.visibility || 0
  };
}

function metricDistance(a, b, aspectRatio = 16 / 9) {
  if (!a || !b) return 0;

  const dx = (a.x - b.x) * aspectRatio;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function polylineDistance(points, aspectRatio = 16 / 9) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += metricDistance(points[i - 1], points[i], aspectRatio);
  }
  return total;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function roundTo(value, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function ellipseCircumference(widthCm, depthCm) {
  const a = Math.max(Number(widthCm) || 0, 0) / 2;
  const b = Math.max(Number(depthCm) || 0, 0) / 2;
  if (!a || !b) return 0;

  // Ramanujan's second approximation for ellipse circumference.
  const h = Math.pow(a - b, 2) / Math.pow(a + b, 2);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

function buildMeasurementRanges(measurements, precisionMarginCm, confidenceMap = {}) {
  const base = Math.max(0.6, Number(precisionMarginCm) || 0.6);
  const scales = {
    heightCm: 0.7,
    shoulderWidthCm: 0.75,
    hipWidthCm: 0.8,
    torsoLengthCm: 0.9,
    sleeveLengthCm: 0.95,
    legLengthCm: 0.95,
    inseamCm: 0.95,
    torsoDepthCm: 0.9,
    chestWidthCm: 0.85,
    waistWidthCm: 0.9,
    chestCircumferenceCm: 1.15,
    waistCircumferenceCm: 1.2,
    hipCircumferenceCm: 1.15
  };

  return Object.entries(measurements).reduce((acc, [key, value]) => {
    if (!Number.isFinite(Number(value))) return acc;

    const confidenceValue = Number(confidenceMap[key]);
    const confidence = Number.isFinite(confidenceValue) ? clamp01(confidenceValue) : 0.5;
    const confidenceScale = 1.45 - (confidence * 0.75);
    const margin = roundTo(base * (scales[key] || 0.8) * confidenceScale, 1);
    const numeric = Number(value);
    acc[key] = {
      min: roundTo(Math.max(0, numeric - margin), 1),
      max: roundTo(numeric + margin, 1),
      marginCm: margin,
      confidence,
      confidenceLabel: formatConfidenceLabel(confidence)
    };
    return acc;
  }, {});
}

function buildMeasurementConfidence({
  frontVisibility = 0,
  sideVisibility = 0,
  postureBalance = 0,
  symmetryScore = 0,
  overall = 0
} = {}) {
  const base = clamp01(overall);
  const front = clamp01(frontVisibility);
  const side = clamp01(sideVisibility);
  const posture = clamp01(postureBalance);
  const symmetry = clamp01(symmetryScore);

  return {
    heightCm: clamp01((base * 0.55) + (front * 0.15) + (posture * 0.2) + (symmetry * 0.1)),
    shoulderWidthCm: clamp01((base * 0.5) + (front * 0.25) + (posture * 0.15) + (symmetry * 0.1)),
    hipWidthCm: clamp01((base * 0.48) + (front * 0.2) + (posture * 0.18) + (symmetry * 0.14)),
    torsoLengthCm: clamp01((base * 0.5) + (front * 0.18) + (posture * 0.22) + (symmetry * 0.1)),
    sleeveLengthCm: clamp01((base * 0.48) + (front * 0.24) + (posture * 0.16) + (symmetry * 0.12)),
    legLengthCm: clamp01((base * 0.45) + (front * 0.18) + (posture * 0.2) + (symmetry * 0.17)),
    inseamCm: clamp01((base * 0.42) + (front * 0.15) + (side * 0.2) + (posture * 0.14) + (symmetry * 0.09)),
    torsoDepthCm: clamp01((base * 0.45) + (side * 0.28) + (posture * 0.14) + (symmetry * 0.13)),
    chestWidthCm: clamp01((base * 0.5) + (front * 0.25) + (posture * 0.15) + (symmetry * 0.1)),
    waistWidthCm: clamp01((base * 0.48) + (front * 0.22) + (posture * 0.15) + (symmetry * 0.15)),
    chestCircumferenceCm: clamp01((base * 0.48) + (front * 0.2) + (side * 0.18) + (posture * 0.1) + (symmetry * 0.04)),
    waistCircumferenceCm: clamp01((base * 0.46) + (front * 0.18) + (side * 0.2) + (posture * 0.12) + (symmetry * 0.04)),
    hipCircumferenceCm: clamp01((base * 0.47) + (front * 0.18) + (side * 0.2) + (posture * 0.11) + (symmetry * 0.04))
  };
}

function buildConfidenceFromRanges(ranges = {}) {
  return Object.entries(ranges).reduce((acc, [key, range]) => {
    const numeric = Number(range?.confidence);
    if (Number.isFinite(numeric)) {
      acc[key] = clamp01(numeric);
    }
    return acc;
  }, {});
}

function sanitizeMeasurementSet(measurements = {}, heightCm = 170) {
  const fallbackHeight = Number.isFinite(Number(heightCm)) ? Number(heightCm) : Number(measurements.heightCm) || 170;
  const baseHeight = clamp(fallbackHeight, 120, 230);
  const sanitized = { ...measurements };
  const warnings = [];
  let penalty = 0;

  const clampField = (key, minRatio, maxRatio, label, severity = 0.035) => {
    const numeric = Number(sanitized[key]);
    if (!Number.isFinite(numeric)) return;

    const min = baseHeight * minRatio;
    const max = baseHeight * maxRatio;
    const clamped = clamp(numeric, min, max);
    if (Math.abs(clamped - numeric) > 0.25) {
      warnings.push(`${label} was nudged into a plausible range.`);
      penalty += severity;
    }
    sanitized[key] = roundTo(clamped, 1);
  };

  if (Number.isFinite(Number(sanitized.heightCm))) {
    const clampedHeight = clamp(Number(sanitized.heightCm), 120, 230);
    if (Math.abs(clampedHeight - Number(sanitized.heightCm)) > 0.25) {
      warnings.push('Height calibration was adjusted to a realistic range.');
      penalty += 0.04;
    }
    sanitized.heightCm = roundTo(clampedHeight, 1);
  } else {
    sanitized.heightCm = roundTo(baseHeight, 1);
  }

  clampField('shoulderWidthCm', 0.14, 0.35, 'Shoulder width');
  clampField('hipWidthCm', 0.14, 0.4, 'Hip width');
  clampField('torsoLengthCm', 0.2, 0.43, 'Torso length');
  clampField('sleeveLengthCm', 0.22, 0.48, 'Sleeve length', 0.03);
  clampField('legLengthCm', 0.34, 0.62, 'Leg length');
  clampField('inseamCm', 0.35, 0.58, 'Inseam');
  clampField('torsoDepthCm', 0.09, 0.28, 'Torso depth', 0.03);

  sanitized.shoulderToHipRatio = roundTo(
    Number(sanitized.shoulderWidthCm) / Math.max(Number(sanitized.hipWidthCm), 1),
    2
  );

  return {
    measurements: sanitized,
    warnings,
    penalty: clamp01(Math.min(0.22, penalty))
  };
}

function buildMeasurementWarnings(measurements = {}, context = {}) {
  const warnings = [];
  let penalty = 0;
  const add = (text, severity = 0.04) => {
    warnings.push(text);
    penalty += severity;
  };

  const height = Math.max(Number(measurements.heightCm) || 0, 1);
  const shoulder = Number(measurements.shoulderWidthCm) || 0;
  const hip = Number(measurements.hipWidthCm) || 0;
  const torso = Number(measurements.torsoLengthCm) || 0;
  const sleeve = Number(measurements.sleeveLengthCm) || 0;
  const leg = Number(measurements.legLengthCm) || 0;
  const inseam = Number(measurements.inseamCm) || 0;
  const depth = Number(measurements.torsoDepthCm) || 0;
  const chest = Number(measurements.chestCircumferenceCm) || 0;
  const waist = Number(measurements.waistCircumferenceCm) || 0;
  const hips = Number(measurements.hipCircumferenceCm) || 0;
  const shoulderToHipRatio = Number(measurements.shoulderToHipRatio) || Number(context.shoulderToHipRatio) || 0;
  const chestToWaistRatio = Number(measurements.chestToWaistRatio) || (chest / Math.max(waist, 1));
  const waistToHipRatio = Number(measurements.waistToHipRatio) || (waist / Math.max(hips, 1));

  const ratioChecks = [
    ['Shoulder width', shoulder / height, 0.14, 0.35, 'Shoulder width looks unusual for the selected height.'],
    ['Hip width', hip / height, 0.14, 0.4, 'Hip width looks unusual for the selected height.'],
    ['Torso length', torso / height, 0.2, 0.43, 'Torso length looks unusual for the selected height.'],
    ['Sleeve length', sleeve / height, 0.22, 0.48, 'Sleeve length looks unusual for the selected height.'],
    ['Leg length', leg / height, 0.34, 0.62, 'Leg length looks unusual for the selected height.'],
    ['Inseam', inseam / height, 0.35, 0.58, 'Inseam looks unusual for the selected height.'],
    ['Torso depth', depth / height, 0.09, 0.28, 'Torso depth looks unusual for the selected height.']
  ];

  ratioChecks.forEach(([, value, min, max, message]) => {
    if (Number.isFinite(value) && (value < min || value > max)) {
      add(message, 0.035);
    }
  });

  if (Number.isFinite(chestToWaistRatio) && chestToWaistRatio < 0.88) {
    add('Chest circumference reads smaller than waist circumference. Retake the front view for a cleaner result.', 0.05);
  } else if (Number.isFinite(chestToWaistRatio) && chestToWaistRatio > 1.45) {
    add('Chest-to-waist volume looks unusually large. Check posture and camera angle.', 0.05);
  }

  if (Number.isFinite(waistToHipRatio) && (waistToHipRatio < 0.72 || waistToHipRatio > 1.08)) {
    add('Waist-to-hip balance looks unusual. A steadier side view may help.', 0.05);
  }

  if (Number.isFinite(shoulderToHipRatio) && (shoulderToHipRatio < 0.78 || shoulderToHipRatio > 1.32)) {
    add('Shoulder and hip widths disagree more than expected. Try recapturing the front view.', 0.05);
  }

  const reliability = Number(context.reliability);
  if (Number.isFinite(reliability) && reliability < 0.55) {
    add('Scan confidence is low. Brighter light and a steadier pose should improve the result.', 0.06);
  }

  const frontVisibility = Number(context.frontVisibility);
  const sideVisibility = Number(context.sideVisibility);
  if (Number.isFinite(frontVisibility) && Number.isFinite(sideVisibility) && (frontVisibility < 0.58 || sideVisibility < 0.58)) {
    add('One or more views were partially hidden. Keep the full body visible from head to feet.', 0.04);
  }

  const postureBalance = Number(context.postureBalance);
  if (Number.isFinite(postureBalance) && postureBalance < 0.65) {
    add('Posture drift likely widened the margin. Stand tall with relaxed shoulders and still feet.', 0.05);
  }

  const symmetryScore = Number(context.symmetryScore);
  if (Number.isFinite(symmetryScore) && symmetryScore < 0.62) {
    add('Left/right symmetry was uneven. Make sure both shoulders and hands stay visible.', 0.04);
  }

  const bodyType = String(context.bodyType || '');
  if (bodyType === 'Rectangle' && chestToWaistRatio > 1.18) {
    add('The shape looks less rectangle-like than the body type label suggests. A rescan could tighten the fit model.', 0.03);
  }

  return {
    warnings: warnings.slice(0, 4),
    penalty: clamp01(Math.min(0.22, penalty))
  };
}

function formatConfidenceLabel(confidence) {
  const numeric = Number(confidence);
  if (!Number.isFinite(numeric)) return 'Estimated';
  if (numeric >= 0.82) return 'High confidence';
  if (numeric >= 0.65) return 'Good confidence';
  if (numeric >= 0.48) return 'Fair confidence';
  return 'Low confidence';
}

function formatSettingLabel(key) {
  const labels = {
    voiceCoach: 'Voice coach',
    autoStart: 'Auto start',
    audioCues: 'Audio cues'
  };
  return labels[key] || key;
}
