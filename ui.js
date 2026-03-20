/*
 * FitVision - UI helper (DOM, feedback, animations)
 */

export class UI {
  constructor() {
    this.elements = {
      status: document.getElementById('status'),
      instruction: document.getElementById('instruction'),
      confidence: document.getElementById('confidence'),
      direction: document.getElementById('direction'),
      countdown: document.getElementById('countdown'),
      stepInfo: document.getElementById('stepInfo'),
      scanBtn: document.getElementById('scanBtn'),
      restartStepBtn: document.getElementById('restartStepBtn'),
      retryBtn: document.getElementById('retryBtn'),
      exportBtn: document.getElementById('exportBtn'),
      importBtn: document.getElementById('importBtn'),
      importInput: document.getElementById('importInput'),
      heightInput: document.getElementById('heightInput'),
      globalScaleBias: document.getElementById('globalScaleBias'),
      upperBias: document.getElementById('upperBias'),
      lowerBias: document.getElementById('lowerBias'),
      postureBias: document.getElementById('postureBias'),
      globalScaleValue: document.getElementById('globalScaleValue'),
      upperBiasValue: document.getElementById('upperBiasValue'),
      lowerBiasValue: document.getElementById('lowerBiasValue'),
      postureBiasValue: document.getElementById('postureBiasValue'),
      garmentFocus: document.getElementById('garmentFocus'),
      voiceCoachToggle: document.getElementById('voiceCoachToggle'),
      autoStartToggle: document.getElementById('autoStartToggle'),
      audioCuesToggle: document.getElementById('audioCuesToggle'),
      guideOpenBtn: document.getElementById('guideOpenBtn'),
      guideResetBtn: document.getElementById('guideResetBtn'),
      guideModal: document.getElementById('guideModal'),
      guideBackdrop: document.getElementById('guideBackdrop'),
      guideTitle: document.getElementById('guideTitle'),
      guideBody: document.getElementById('guideBody'),
      guideCounter: document.getElementById('guideCounter'),
      guidePrevBtn: document.getElementById('guidePrevBtn'),
      guideNextBtn: document.getElementById('guideNextBtn'),
      guideDoneBtn: document.getElementById('guideDoneBtn'),
      guideSkipBtn: document.getElementById('guideSkipBtn'),
      success: document.getElementById('success'),
      successSubtitle: document.getElementById('successSubtitle'),
      quality: document.getElementById('quality'),
      measurementMeta: document.getElementById('measurementMeta'),
      measurementList: document.getElementById('measurementList'),
      qualityBreakdown: document.getElementById('qualityBreakdown'),
      qualityReasons: document.getElementById('qualityReasons'),
      fitInsights: document.getElementById('fitInsights'),
      garmentGuidance: document.getElementById('garmentGuidance'),
      accuracyPanel: document.getElementById('accuracyPanel'),
      comparisonBox: document.getElementById('comparisonBox'),
      copyReportBtn: document.getElementById('copyReportBtn'),
      shareReportBtn: document.getElementById('shareReportBtn'),
      downloadReportBtn: document.getElementById('downloadReportBtn'),
      reportNote: document.getElementById('reportNote'),
      summary: document.getElementById('summary'),
      coachFeed: document.getElementById('coachFeed'),
      history: document.getElementById('history'),
      historyList: document.getElementById('historyList'),
      clearHistoryBtn: document.getElementById('clearHistoryBtn'),
      analyticsAttempts: document.getElementById('analyticsAttempts'),
      analyticsSuccessRate: document.getElementById('analyticsSuccessRate'),
      analyticsAverageTime: document.getElementById('analyticsAverageTime'),
      analyticsSavedCount: document.getElementById('analyticsSavedCount'),
      overlay: document.getElementById('overlay'),
      circle: document.getElementById('circle'),
      alignmentRing: document.getElementById('alignmentRing'),
      readinessStrip: document.getElementById('readinessStrip'),
      frameCheck: document.getElementById('frameCheck'),
      distanceCheck: document.getElementById('distanceCheck'),
      lightCheck: document.getElementById('lightCheck'),
      stabilityCheck: document.getElementById('stabilityCheck'),
      stepTracker: document.getElementById('stepTracker'),
      progress: document.getElementById('progress'),
      progressBar: document.querySelector('.progress-bar'),
      buttonNote: document.getElementById('buttonNote'),
      tryOn: document.getElementById('tryOnOverlay')
    };

    this.handlers = {};
    this.scanSound = null;
    this.preferences = {
      voiceCoach: true,
      autoStart: true,
      audioCues: true
    };
    this.guideSteps = [
      {
        title: 'Light + framing',
        body: 'Stand where the light is even and keep your shoulders facing the camera. Bright, balanced light gives the scanner the cleanest body outline.'
      },
      {
        title: 'Full body check',
        body: 'Make sure your head, shoulders, hips, knees, and feet all stay inside the scan stage. The app can only be accurate when the full body is visible.'
      },
      {
        title: 'Tune + go',
        body: 'Use the manual tuning controls if you want to nudge the result after a test scan, then hit Start Guided Scan when you are ready.'
      }
    ];
    this.guideIndex = 0;

    this.setupListeners();
    this.init();
  }

  init() {
    const storedHeight = parseInt(localStorage.getItem('fitvision_height_cm'), 10);
    if (!Number.isNaN(storedHeight) && storedHeight > 120 && storedHeight < 230) {
      this.elements.heightInput.value = storedHeight;
    }

    this.setState('idle');
    this.setStep(0, 4);
    this.setStepTracker(0, 4);
    this.setAlignmentScore(0);
    this.setProgress(0);
    this.setButtonNote('Start unlocks as soon as your full body is visible and steady.');
    this.setExperienceSettings(this.preferences);
    this.setCalibrationTuning();
    this.setGarmentFocus('tee');
    this.setGuideWizard(0, false);
    this.setQualityReasons([]);
    this.setGarmentGuidance([]);
    this.setAnalyticsSummary();
    this.setReadinessIndicators();
    this.clearQuality();
    this.setHistory([]);
    this.hideSuccess();
    this.resetCoachMessages();

    if (this.elements.successSubtitle) {
      this.elements.successSubtitle.textContent = 'Complete a guided scan to unlock your fit summary.';
    }
  }

  setupListeners() {
    this.elements.scanBtn.addEventListener('click', () => {
      this.emit('start');
    });

    if (this.elements.restartStepBtn) {
      this.elements.restartStepBtn.addEventListener('click', () => {
        this.emit('restartStep');
      });
    }

    this.elements.retryBtn.addEventListener('click', () => {
      this.emit('retry');
    });

    this.elements.exportBtn.addEventListener('click', () => {
      this.emit('export');
    });

    this.elements.importBtn.addEventListener('click', () => {
      this.elements.importInput.value = null;
      this.elements.importInput.click();
    });

    this.elements.importInput.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result);
          this.emit('import', json);
        } catch (error) {
          this.showFeedback('Invalid JSON file.', 'warning');
        }
      };
      reader.readAsText(file);
    });

    this.elements.clearHistoryBtn.addEventListener('click', () => {
      this.emit('clearHistory');
    });

    this.elements.historyList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-scan-id]');
      if (!button) return;

      this.emit('loadHistory', button.dataset.scanId);
    });

    this.elements.heightInput.addEventListener('change', () => {
      const height = parseInt(this.elements.heightInput.value, 10);
      if (!Number.isNaN(height)) {
        localStorage.setItem('fitvision_height_cm', String(height));
        this.emit('heightChange', height);
      }
    });

    [
      ['globalScaleBias', 'globalScale'],
      ['upperBias', 'upperBody'],
      ['lowerBias', 'lowerBody'],
      ['postureBias', 'posture']
    ].forEach(([elementKey, settingKey]) => {
      const el = this.elements[elementKey];
      if (!el) return;

      el.addEventListener('input', () => {
        this.emit('calibrationChange', {
          key: settingKey,
          value: parseInt(el.value, 10) || 0
        });
      });
    });

    if (this.elements.garmentFocus) {
      this.elements.garmentFocus.addEventListener('change', () => {
        this.emit('garmentFocusChange', this.elements.garmentFocus.value);
      });
    }

    [
      ['voiceCoachToggle', 'voiceCoach'],
      ['autoStartToggle', 'autoStart'],
      ['audioCuesToggle', 'audioCues']
    ].forEach(([elementKey, settingKey]) => {
      const el = this.elements[elementKey];
      if (!el) return;

      el.addEventListener('change', () => {
        this.emit('settingChange', {
          key: settingKey,
          value: el.checked
        });
      });
    });

    if (this.elements.guideOpenBtn) {
      this.elements.guideOpenBtn.addEventListener('click', () => this.emit('guideOpen'));
    }

    if (this.elements.guideResetBtn) {
      this.elements.guideResetBtn.addEventListener('click', () => this.emit('guideOpen'));
    }

    if (this.elements.guidePrevBtn) {
      this.elements.guidePrevBtn.addEventListener('click', () => this.emit('guidePrev'));
    }

    if (this.elements.guideNextBtn) {
      this.elements.guideNextBtn.addEventListener('click', () => this.emit('guideNext'));
    }

    if (this.elements.guideDoneBtn) {
      this.elements.guideDoneBtn.addEventListener('click', () => this.emit('guideDone'));
    }

    if (this.elements.guideSkipBtn) {
      this.elements.guideSkipBtn.addEventListener('click', () => this.emit('guideSkip'));
    }

    if (this.elements.guideBackdrop) {
      this.elements.guideBackdrop.addEventListener('click', () => this.emit('guideSkip'));
    }

    if (this.elements.copyReportBtn) {
      this.elements.copyReportBtn.addEventListener('click', () => this.emit('reportCopy'));
    }

    if (this.elements.shareReportBtn) {
      this.elements.shareReportBtn.addEventListener('click', () => this.emit('reportShare'));
    }

    if (this.elements.downloadReportBtn) {
      this.elements.downloadReportBtn.addEventListener('click', () => this.emit('reportDownload'));
    }
  }

  on(event, fn) {
    this.handlers[event] = fn;
  }

  emit(event, payload) {
    if (typeof this.handlers[event] === 'function') {
      this.handlers[event](payload);
    }
  }

  setState(state) {
    const stateMap = {
      idle: {
        status: 'Starting camera...',
        instruction: 'Please allow camera access and stand in the circle.',
        note: 'Start unlocks as soon as your full body is visible and steady.'
      },
      detecting: {
        status: 'Detecting body...',
        instruction: 'Move until your full body is in frame.',
        note: 'Start unlocks as soon as your full body is visible and steady.'
      },
      ready: {
        status: 'Ready to scan',
        instruction: 'Hold still until the scan starts automatically or press Start Scan.',
        note: 'Body detected. Press Start now or stay still for auto-start.'
      },
      scanning: {
        status: 'Scanning...',
        instruction: 'Follow the prompts and move slowly.',
        note: 'Follow the current step and freeze through the countdown.'
      },
      processing: {
        status: 'Processing scan...',
        instruction: 'Building your virtual model...',
        note: 'Building your measurement profile and fit summary.'
      },
      complete: {
        status: 'Scan complete!',
        instruction: 'You can retry or export your results.',
        note: 'Review the fit summary, export JSON, or reset for another pass.'
      }
    };

    const config = stateMap[state] || stateMap.idle;
    this.setStatus(config.status);
    this.setInstruction(config.instruction);
    this.setButtonNote(config.note);

    if (state !== 'scanning') {
      this.setConfidence(0);
      this.showCountdown(null);
    }

    if (this.elements.restartStepBtn) {
      this.elements.restartStepBtn.style.display = state === 'scanning' ? 'inline-flex' : 'none';
    }

    if (this.elements.circle) {
      this.elements.circle.classList.toggle('scanning', state === 'scanning');
    }

    this._currently = state;
    if (this.elements.overlay) {
      this.elements.overlay.dataset.state = state;
    }
  }

  setStatus(text) {
    if (this.elements.status) {
      this.elements.status.textContent = text;
      this.elements.status.style.color = 'var(--text)';
    }
  }

  setInstruction(text) {
    if (this.elements.instruction) {
      this.elements.instruction.textContent = text;
    }
  }

  setButtonNote(text) {
    if (this.elements.buttonNote) {
      this.elements.buttonNote.textContent = text;
    }
  }

  setExperienceSettings(settings = {}) {
    this.preferences = {
      ...this.preferences,
      ...settings
    };

    if (this.elements.voiceCoachToggle) {
      this.elements.voiceCoachToggle.checked = Boolean(this.preferences.voiceCoach);
    }
    if (this.elements.autoStartToggle) {
      this.elements.autoStartToggle.checked = Boolean(this.preferences.autoStart);
    }
    if (this.elements.audioCuesToggle) {
      this.elements.audioCuesToggle.checked = Boolean(this.preferences.audioCues);
    }

    if ((this._currently === 'ready' || this._currently === 'detecting') && !this.elements.scanBtn?.disabled) {
      this.setButtonNote(
        this.preferences.autoStart
          ? 'Body detected. Press Start now or stay still for auto-start.'
          : 'Body detected. Press Start now whenever you are ready to begin.'
      );
    }
  }

  setCalibrationTuning(tuning = {}) {
    const defaults = {
      globalScale: 0,
      upperBody: 0,
      lowerBody: 0,
      posture: 0
    };
    const state = { ...defaults, ...tuning };

    const pairs = [
      ['globalScaleBias', 'globalScaleValue', state.globalScale],
      ['upperBias', 'upperBiasValue', state.upperBody],
      ['lowerBias', 'lowerBiasValue', state.lowerBody],
      ['postureBias', 'postureBiasValue', state.posture]
    ];

    pairs.forEach(([sliderKey, labelKey, value]) => {
      if (this.elements[sliderKey]) {
        this.elements[sliderKey].value = String(value);
      }
      if (this.elements[labelKey]) {
        const sign = value > 0 ? '+' : '';
        this.elements[labelKey].textContent = `${sign}${value}%`;
      }
    });
  }

  setGarmentFocus(value = 'tee') {
    if (this.elements.garmentFocus) {
      this.elements.garmentFocus.value = value;
    }
  }

  setGuideWizard(index = 0, visible = false) {
    this.guideIndex = Math.max(0, Math.min(this.guideSteps.length - 1, index));
    const step = this.guideSteps[this.guideIndex];

    if (this.elements.guideModal) {
      this.elements.guideModal.classList.toggle('active', Boolean(visible));
      this.elements.guideModal.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    if (this.elements.guideTitle) {
      this.elements.guideTitle.textContent = step?.title || 'Calibration Wizard';
    }
    if (this.elements.guideBody) {
      this.elements.guideBody.textContent = step?.body || '';
    }
    if (this.elements.guideCounter) {
      this.elements.guideCounter.textContent = `Step ${this.guideIndex + 1} / ${this.guideSteps.length}`;
    }
    if (this.elements.guidePrevBtn) {
      this.elements.guidePrevBtn.disabled = this.guideIndex === 0;
    }
    if (this.elements.guideNextBtn) {
      this.elements.guideNextBtn.style.display = this.guideIndex < this.guideSteps.length - 1 ? 'inline-flex' : 'none';
    }
    if (this.elements.guideDoneBtn) {
      this.elements.guideDoneBtn.style.display = this.guideIndex === this.guideSteps.length - 1 ? 'inline-flex' : 'none';
    }
  }

  openGuideWizard() {
    this.setGuideWizard(0, true);
  }

  closeGuideWizard() {
    this.setGuideWizard(this.guideIndex, false);
  }

  setQualityReasons(reasons = []) {
    const container = this.elements.qualityReasons;
    if (!container) return;

    if (!Array.isArray(reasons) || !reasons.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = reasons
      .map((reason) => `<div class="insight-item">${reason}</div>`)
      .join('');
  }

  setGarmentGuidance(lines = []) {
    const container = this.elements.garmentGuidance;
    if (!container) return;

    if (!Array.isArray(lines) || !lines.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = lines
      .map((line) => `<div class="insight-item">${line}</div>`)
      .join('');
  }

  setReportNote(text) {
    if (this.elements.reportNote) {
      this.elements.reportNote.textContent = text;
    }
  }

  setGlow(enabled) {
    const toggle = (el) => {
      if (!el) return;
      el.classList.toggle('glow', enabled);
    };

    toggle(this.elements.scanBtn);
    toggle(this.elements.instruction);
    this.showTapHint(enabled);
  }

  setZoneHighlights({ shoulders = false, arms = false, legs = false } = {}) {
    const circle = this.elements.circle;
    if (!circle) return;

    circle.classList.toggle('highlight-shoulders', shoulders);
    circle.classList.toggle('highlight-arms', arms);
    circle.classList.toggle('highlight-legs', legs);
  }

  setScanBeam(active) {
    const beam = document.querySelector('#circle .scanBeam');
    if (!beam) return;
    beam.classList.toggle('active', active);
  }

  setScanWave(active) {
    const wave = document.querySelector('#circle .scanWave');
    if (!wave) return;
    wave.classList.toggle('active', active);
  }

  showTapHint(show) {
    const hint = document.getElementById('tapHint');
    if (!hint) return;
    hint.classList.toggle('active', show);
  }

  setAlignmentScore(value) {
    const el = document.getElementById('alignmentScore');
    if (!el) return;

    const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
    el.textContent = `${percent}%`;
    el.classList.toggle('glow', percent > 80);
  }

  setCircleReady(ready) {
    if (this.elements.circle) {
      this.elements.circle.classList.toggle('ready', ready);
    }
  }

  setStep(stepIndex, total) {
    const display = total ? `Step ${stepIndex} / ${total}` : '';
    this.elements.stepInfo.textContent = display;
  }

  setProgress(value) {
    if (!this.elements.progress || !this.elements.progressBar) return;

    this.elements.progress.style.display = 'block';
    this.elements.progressBar.style.width = `${Math.round(value * 100)}%`;
  }

  setReadinessIndicators(readiness = {}) {
    const defaults = {
      frame: { ok: false, label: 'Wait' },
      distance: { ok: false, label: 'Wait' },
      light: { ok: false, label: 'Wait' },
      steady: { ok: false, label: 'Wait' }
    };
    const state = { ...defaults, ...readiness };
    const map = [
      ['frameCheck', state.frame],
      ['distanceCheck', state.distance],
      ['lightCheck', state.light],
      ['stabilityCheck', state.steady]
    ];

    map.forEach(([key, value]) => {
      const el = this.elements[key];
      if (!el) return;

      el.classList.toggle('ok', Boolean(value?.ok));
      el.classList.toggle('warn', !value?.ok);

      const strong = el.querySelector('strong');
      if (strong) {
        strong.textContent = value?.label || 'Wait';
      }
    });
  }

  setAnalyticsSummary(summary = {}) {
    const {
      attempts = 0,
      successRate = 0,
      averageTimeSeconds = 0,
      savedScans = 0
    } = summary;

    if (this.elements.analyticsAttempts) {
      this.elements.analyticsAttempts.textContent = String(attempts);
    }
    if (this.elements.analyticsSuccessRate) {
      this.elements.analyticsSuccessRate.textContent = `${Math.round(successRate)}%`;
    }
    if (this.elements.analyticsAverageTime) {
      this.elements.analyticsAverageTime.textContent = `${Number(averageTimeSeconds).toFixed(1)}s`;
    }
    if (this.elements.analyticsSavedCount) {
      this.elements.analyticsSavedCount.textContent = String(savedScans);
    }
  }

  setStepTracker(index, total) {
    if (!this.elements.stepTracker) return;

    const steps = Array.from(this.elements.stepTracker.querySelectorAll('.step'));
    steps.forEach((step, idx) => {
      step.classList.toggle('active', idx === index);
      step.classList.toggle('completed', idx < index);
    });

    if (total && steps.length !== total) {
      steps.forEach((step) => {
        step.style.display = 'flex';
      });
    }
  }

  setConfidence(value) {
    if (!this.elements.confidence) return;

    const percent = Math.round(value * 100);
    this.elements.confidence.textContent = `Confidence: ${percent}%`;
  }

  setAlignmentProgress(value) {
    if (!this.elements.alignmentRing) return;

    const angle = Math.round(Math.max(0, Math.min(1, value)) * 360);
    this.elements.alignmentRing.style.setProperty('--angle', `${angle}deg`);
  }

  speak(text) {
    if (!this.preferences.voiceCoach) return;
    if (!window.speechSynthesis || !text) return;

    const now = Date.now();
    const normalized = text.trim();
    if (this._lastSpokenText === normalized && now - (this._lastSpeechAt || 0) < 1800) {
      return;
    }

    this._lastSpokenText = normalized;
    this._lastSpeechAt = now;

    const utterance = new SpeechSynthesisUtterance(normalized);
    utterance.rate = 1.05;
    utterance.pitch = 1.02;

    if (this.elements.instruction) {
      this.elements.instruction.classList.add('speaking');
    }

    utterance.onend = () => {
      if (this.elements.instruction) {
        this.elements.instruction.classList.remove('speaking');
      }
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  setScanEnabled(enabled) {
    this.elements.scanBtn.disabled = !enabled;
    this.elements.scanBtn.classList.toggle('ready', enabled);

    if (this._currently === 'idle' || this._currently === 'detecting' || this._currently === 'ready') {
      this.setButtonNote(
        enabled
          ? this.preferences.autoStart
            ? 'Body detected. Press Start now or keep holding still for auto-start.'
            : 'Body detected. Press Start now whenever you want to begin the guided scan.'
          : 'Start unlocks as soon as your full body is visible and steady.'
      );
    }
  }

  showSuccess(scanRecord) {
    const { bodyModel, quality } = scanRecord || {};
    const size = bodyModel?.size || bodyModel?.recommendedSize || '--';
    const bodyType = bodyModel?.bodyType || 'Fit profile';

    this.elements.success.classList.add('is-visible');
    this.setState('complete');
    this.setQuality(quality != null ? quality : 0);
    this.setExportInfo(scanRecord);
    this.setSummary(bodyModel);
    this.setMeasurements(bodyModel);
    this.setAccuracyPanel(bodyModel);
    this.setQualityBreakdown(scanRecord?.qualityBreakdown || bodyModel?.qualityBreakdown || null);
    this.setQualityReasons(scanRecord?.qualityReasons || bodyModel?.qualityReasons || []);
    this.setFitInsights(bodyModel?.fitInsights || []);
    this.setGarmentGuidance(bodyModel?.garmentGuidance || []);
    this.setComparison(scanRecord?.comparison || null);
    this.setReportNote('Copy, share, or download the full report after each scan.');

    if (this.elements.successSubtitle) {
      this.elements.successSubtitle.textContent = `${bodyType} profile | Recommended size ${size}`;
    }
  }

  hideSuccess() {
    this.elements.success.classList.remove('is-visible');
    if (this.elements.successSubtitle) {
      this.elements.successSubtitle.textContent = 'Complete a guided scan to unlock your fit summary.';
    }
  }

  setQuality(score) {
    const numeric = Number(score);
    const percent = Number.isFinite(numeric) ? Math.round(numeric) : 0;
    this.elements.quality.innerHTML = `Scan quality: <strong>${percent}%</strong>`;
  }

  clearQuality() {
    this.elements.quality.textContent = '';
    this.setSummary(null);
    this.setMeasurements(null);
    this.setAccuracyPanel(null);
    this.setQualityBreakdown(null);
    this.setQualityReasons([]);
    this.setFitInsights([]);
    this.setGarmentGuidance([]);
    this.setComparison(null);
    this.setReportNote('A plain-language report can be copied, shared, or downloaded after each scan.');
  }

  setSummary(bodyModel) {
    const container = this.elements.summary;
    if (!bodyModel) {
      container.innerHTML = '';
      return;
    }

    const {
      height,
      shoulderWidth,
      bodyType,
      size,
      recommendedSize,
      confidence,
      measurements,
      measurementIntegrity
    } = bodyModel;
    const conf = Math.max(0, Math.min(1, confidence || 0));
    const ratio = formatNumber(measurements?.shoulderToHipRatio, 2, 'N/A');
    const integrity = Number.isFinite(Number(measurementIntegrity))
      ? Math.round(Number(measurementIntegrity))
      : null;

    container.innerHTML = `
      <div class="summary-row"><strong>Body type:</strong> ${bodyType}</div>
      <div class="summary-row"><strong>Recommended size:</strong> ${size || recommendedSize || 'N/A'}</div>
      <div class="summary-row"><strong>Scan confidence:</strong> ${Math.round(conf * 100)}%</div>
      ${integrity != null ? `<div class="summary-row"><strong>Measurement integrity:</strong> ${integrity}%</div>` : ''}
      <div class="summary-row"><strong>Frame balance:</strong> Shoulder to hip ratio ${ratio}</div>
    `;
  }

  setMeasurements(bodyModel) {
    const meta = this.elements.measurementMeta;
    const list = this.elements.measurementList;
    if (!meta || !list) return;

    if (!bodyModel?.measurements) {
      meta.textContent = '';
      list.innerHTML = '';
      return;
    }

    const { measurements, precision } = bodyModel;
    const reliability = precision?.reliabilityPercent ?? 0;
    const marginCm = precision?.marginCm ?? 0;
    const integrity = Number.isFinite(Number(bodyModel.measurementIntegrity))
      ? Math.round(Number(bodyModel.measurementIntegrity))
      : null;

    meta.textContent = `Calibrated from your entered height with an estimated +/- ${formatNumber(marginCm, 1, 'N/A cm')} variance. Measurement confidence ${Math.round(reliability)}%${integrity != null ? ` | Sanity score ${integrity}%` : ''}.`;

    const ranges = bodyModel.measurementRanges || {};
    const cards = [
      ['Height', 'heightCm'],
      ['Shoulders', 'shoulderWidthCm'],
      ['Chest', 'chestCircumferenceCm'],
      ['Waist', 'waistCircumferenceCm'],
      ['Hip Circ.', 'hipCircumferenceCm'],
      ['Hip Width', 'hipWidthCm'],
      ['Torso', 'torsoLengthCm'],
      ['Torso Depth', 'torsoDepthCm'],
      ['Sleeve', 'sleeveLengthCm'],
      ['Leg Length', 'legLengthCm'],
      ['Inseam', 'inseamCm']
    ];

    list.innerHTML = cards
      .map(([label, key]) => {
        const value = measurements[key];
        const range = ranges[key];
        const valueLabel = formatMeasurementValue(value);
        const rangeLabel = range?.marginCm
          ? `${range.confidenceLabel || formatConfidenceLabel(range.confidence)} | Approx. +/- ${range.marginCm.toFixed(1)} cm`
          : 'Estimated';

        return `
        <div class="measurement-card">
          <span>${label}</span>
          <strong>${valueLabel}</strong>
          <small>${rangeLabel}</small>
        </div>
      `;
      })
      .join('');
  }

  setAccuracyPanel(bodyModel) {
    const container = this.elements.accuracyPanel;
    if (!container) return;

    if (!bodyModel?.measurementConfidence) {
      container.innerHTML = '';
      return;
    }

    const entries = Object.entries(bodyModel.measurementConfidence)
      .filter(([, value]) => Number.isFinite(Number(value)))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 4);

    if (!entries.length) {
      container.innerHTML = '';
      return;
    }

    const strongest = entries[0];
    const weakest = [...entries].sort((a, b) => Number(a[1]) - Number(b[1]))[0];
    const warnings = Array.isArray(bodyModel.measurementWarnings) ? bodyModel.measurementWarnings : [];

    container.innerHTML = `
      <div class="accuracy-head">
        <strong>Accuracy overview</strong>
        <span>Best: ${formatMeasurementName(strongest[0])}</span>
      </div>
      <div class="accuracy-chips">
        ${entries.map(([key, value]) => `
          <div class="accuracy-chip">
            <strong>${formatMeasurementName(key)}</strong>
            <small>${formatConfidenceLabel(value)} ${Math.round(Number(value) * 100)}%</small>
          </div>
        `).join('')}
      </div>
      ${warnings.length ? `
        <div class="accuracy-warnings">
          <span>Sanity check</span>
          ${warnings.slice(0, 3).map((warning) => `
            <div class="accuracy-warning-item">${warning}</div>
          `).join('')}
        </div>
      ` : ''}
      <div class="accuracy-note">
        Weakest area right now: ${formatMeasurementName(weakest[0])}.
      </div>
    `;
  }

  setQualityBreakdown(breakdown) {
    const container = this.elements.qualityBreakdown;
    if (!container) return;

    if (!breakdown) {
      container.innerHTML = '';
      return;
    }

    const rows = [
      ['Visibility', breakdown.visibility],
      ['Framing', breakdown.framing],
      ['Posture', breakdown.posture],
      ['Coverage', breakdown.coverage]
    ];

    container.innerHTML = rows
      .map(([label, value]) => `
        <div class="breakdown-row">
          <header>
            <span>${label}</span>
            <strong>${Math.round(Number(value) || 0)}%</strong>
          </header>
          <div class="breakdown-track">
            <div class="breakdown-fill" style="--value: ${Math.max(0, Math.min(100, Number(value) || 0))}%"></div>
          </div>
        </div>
      `)
      .join('');
  }

  setFitInsights(insights = []) {
    const container = this.elements.fitInsights;
    if (!container) return;

    if (!Array.isArray(insights) || !insights.length) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = insights
      .map((insight) => `<div class="insight-item">${insight}</div>`)
      .join('');
  }

  setComparison(comparison) {
    const container = this.elements.comparisonBox;
    if (!container) return;

    if (!comparison?.summary) {
      container.innerHTML = '';
      return;
    }

    const deltas = Array.isArray(comparison.deltas) && comparison.deltas.length
      ? `
        <div class="comparison-deltas">
          ${comparison.deltas.map((item) => `
            <div class="comparison-pill">${item.label}: ${item.changeCm > 0 ? '+' : ''}${item.changeCm.toFixed(1)} cm</div>
          `).join('')}
        </div>
      `
      : '';

    container.innerHTML = `
      <strong>Compared To Previous Scan</strong>
      <p>${comparison.summary}</p>
      ${deltas}
    `;
  }

  setExportInfo(scanRecord) {
    this.exportPayload = scanRecord;
    this.reportPayload = scanRecord;
  }

  getExportPayload() {
    return this.exportPayload;
  }

  setReportPayload(scanRecord) {
    this.reportPayload = scanRecord;
    this.exportPayload = scanRecord;
  }

  getReportPayload() {
    return this.reportPayload || this.exportPayload;
  }

  resetCoachMessages() {
    if (!this.elements.coachFeed) return;

    this.elements.coachFeed.innerHTML = '';
    this.lastCoachKey = null;
    this.lastCoachText = null;
    this.lastCoachAt = 0;
    this.pushCoachMessage(
      'I am watching your pose. Stand where I can see your full body and I will coach each adjustment.',
      'coach',
      'coach-welcome',
      true
    );
  }

  pushCoachMessage(text, role = 'coach', key = text, force = false) {
    if (!this.elements.coachFeed || !text) return;

    const message = text.trim();
    const now = Date.now();
    if (!force && key === this.lastCoachKey && now - this.lastCoachAt < 2200) return;
    if (!force && message === this.lastCoachText && now - this.lastCoachAt < 2200) return;

    this.lastCoachKey = key;
    this.lastCoachText = message;
    this.lastCoachAt = now;

    const entry = document.createElement('div');
    entry.className = 'coach-entry';
    entry.innerHTML = `
      <div class="coach-avatar">AI</div>
      <div class="coach-bubble">
        <strong>${role === 'coach' ? 'Fit Coach' : 'Update'}</strong>
        <p>${message}</p>
      </div>
    `;

    this.elements.coachFeed.appendChild(entry);

    while (this.elements.coachFeed.children.length > 8) {
      this.elements.coachFeed.removeChild(this.elements.coachFeed.firstElementChild);
    }

    this.elements.coachFeed.scrollTop = this.elements.coachFeed.scrollHeight;
  }

  setHistory(history) {
    const list = this.elements.historyList;
    list.innerHTML = '';

    if (!history.length) {
      const li = document.createElement('li');
      li.className = 'history-empty';
      li.textContent = 'No saved scans yet. Run a scan and your recent results will show up here.';
      list.appendChild(li);
      return;
    }

    history.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const time = new Date(item.timestamp).toLocaleString();

      const info = document.createElement('div');
      info.className = 'history-copy';

      const title = document.createElement('strong');
      title.textContent = time;

      const meta = document.createElement('span');
      const size = item.bodyModel?.size || item.bodyModel?.recommendedSize || '--';
      const bodyType = item.bodyModel?.bodyType || 'Unknown';
      const qualityValue = Number(item.quality);
      const quality = Number.isFinite(qualityValue) ? `${Math.round(qualityValue)}% quality` : 'Pending';
      meta.textContent = `${bodyType} | Size ${size} | ${quality}`;

      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.scanId = item.id;
      button.textContent = 'Load';

      info.appendChild(title);
      info.appendChild(meta);
      li.appendChild(info);
      li.appendChild(button);
      list.appendChild(li);
    });
  }

  showFeedback(message, type = 'info') {
    this.setStatus(message);

    if (type === 'warning') {
      this.elements.status.style.color = 'var(--sand)';
    } else if (type === 'error') {
      this.elements.status.style.color = 'var(--danger)';
    }
  }

  showDirection(symbol, type) {
    const dir = this.elements.direction;
    if (!dir) return;

    dir.classList.remove('good', 'warning');
    if (!symbol) {
      dir.classList.remove('active');
      return;
    }

    dir.textContent = symbol;
    if (type === 'good') dir.classList.add('good');
    if (type === 'warning') dir.classList.add('warning');
    dir.classList.add('active');

    clearTimeout(this.directionTimer);
    this.directionTimer = setTimeout(() => {
      dir.classList.remove('active');
      dir.classList.remove('good', 'warning');
    }, 1200);
  }

  showCountdown(value) {
    const count = this.elements.countdown;
    if (!count) return;

    if (value == null) {
      count.classList.remove('active');
      count.textContent = '';
      return;
    }

    count.textContent = String(value);
    count.classList.add('active');
  }

  playBeep() {
    if (!this.preferences.audioCues) return;
    if (!this.scanSound) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 660;
      gain.gain.value = 0.12;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.08);
      this.scanSound = ctx;
      return;
    }

    const ctx = this.scanSound;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 660;
    gain.gain.value = 0.12;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.08);
  }
}

function formatNumber(value, decimals = 1, fallback = 'N/A') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return `${numeric.toFixed(decimals)} cm`;
}

function formatMeasurementValue(value, decimals = 1, fallback = '--') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return `${numeric.toFixed(decimals)} cm`;
}

function formatConfidenceLabel(confidence) {
  const numeric = Number(confidence);
  if (!Number.isFinite(numeric)) return 'Estimated';
  if (numeric >= 0.82) return 'High confidence';
  if (numeric >= 0.65) return 'Good confidence';
  if (numeric >= 0.48) return 'Fair confidence';
  return 'Low confidence';
}

function formatMeasurementName(key) {
  const labels = {
    heightCm: 'Height',
    shoulderWidthCm: 'Shoulders',
    hipWidthCm: 'Hip width',
    torsoLengthCm: 'Torso',
    sleeveLengthCm: 'Sleeve',
    legLengthCm: 'Leg length',
    inseamCm: 'Inseam',
    torsoDepthCm: 'Torso depth',
    chestWidthCm: 'Chest width',
    waistWidthCm: 'Waist width',
    chestCircumferenceCm: 'Chest',
    waistCircumferenceCm: 'Waist',
    hipCircumferenceCm: 'Hips'
  };
  return labels[key] || key;
}
