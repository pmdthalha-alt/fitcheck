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
      success: document.getElementById('success'),
      successSubtitle: document.getElementById('successSubtitle'),
      quality: document.getElementById('quality'),
      summary: document.getElementById('summary'),
      history: document.getElementById('history'),
      historyList: document.getElementById('historyList'),
      clearHistoryBtn: document.getElementById('clearHistoryBtn'),
      overlay: document.getElementById('overlay'),
      circle: document.getElementById('circle'),
      alignmentRing: document.getElementById('alignmentRing'),
      stepTracker: document.getElementById('stepTracker'),
      progress: document.getElementById('progress'),
      progressBar: document.querySelector('.progress-bar'),
      tryOn: document.getElementById('tryOnOverlay')
    };

    this.handlers = {};
    this.scanSound = null;

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
    this.clearQuality();
    this.setHistory([]);
    this.hideSuccess();
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
      const scanId = button.dataset.scanId;
      this.emit('loadHistory', scanId);
    });

    this.elements.heightInput.addEventListener('change', () => {
      const height = parseInt(this.elements.heightInput.value, 10);
      if (!Number.isNaN(height)) {
        localStorage.setItem('fitvision_height_cm', String(height));
        this.emit('heightChange', height);
      }
    });
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
    // states: idle, detecting, ready, scanning, processing, complete
    const stateMap = {
      idle: { status: 'Starting camera...', instruction: 'Please allow camera access and stand in the circle.' },
      detecting: { status: 'Detecting body...', instruction: 'Move until your full body is in frame.' },
      ready: { status: 'Ready to scan', instruction: 'Hold still until the scan starts automatically or press Start Scan.' },
      scanning: { status: 'Scanning...', instruction: 'Follow the prompts and move slowly.' },
      processing: { status: 'Processing scan...', instruction: 'Building your virtual model…' },
      complete: { status: 'Scan complete!', instruction: 'You can retry or export your results.' }
    };

    const config = stateMap[state] || stateMap.idle;
    this.setStatus(config.status);
    this.setInstruction(config.instruction);

    // only show a confidence meter while scanning
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
    this.elements.overlay.dataset.state = state;
  }

  setStatus(text) {
    this.elements.status.textContent = text;
  }

  setInstruction(text) {
    this.elements.instruction.textContent = text;
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
    this.elements.circle.classList.toggle('ready', ready);
  }

  setStep(stepIndex, total) {
    const display = total ? `Step ${stepIndex} / ${total}` : '';
    this.elements.stepInfo.textContent = display;
  }

  setProgress(value) {
    this.elements.progress.style.display = value > 0 ? 'block' : 'none';
    this.elements.progressBar.style.width = `${Math.round(value * 100)}%`;
  }

  setStepTracker(index, total) {
    if (!this.elements.stepTracker) return;
    const steps = Array.from(this.elements.stepTracker.querySelectorAll('.step'));
    steps.forEach((step, idx) => {
      step.classList.toggle('active', idx === index);
      step.classList.toggle('completed', idx < index);
    });

    if (total && steps.length !== total) {
      // allow dynamic step count if needed
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
    if (!window.speechSynthesis || !text) return;
    const now = Date.now();
    const normalized = text.trim();
    if (this._lastSpokenText === normalized && now - (this._lastSpeechAt || 0) < 1800) return;
    this._lastSpokenText = normalized;
    this._lastSpeechAt = now;

    const utterance = new SpeechSynthesisUtterance(normalized);
    utterance.rate = 1.05;
    utterance.pitch = 1.02;

    this.elements.instruction.classList.add('speaking');
    utterance.onend = () => {
      this.elements.instruction.classList.remove('speaking');
    };

    window.speechSynthesis.speak(utterance);
  }

  setScanEnabled(enabled) {
    this.elements.scanBtn.disabled = !enabled;
    this.elements.scanBtn.classList.toggle('ready', enabled);
  }

  showSuccess(scanRecord) {
    const { bodyModel, quality } = scanRecord || {};
    this.elements.success.style.opacity = '1';
    this.setState('complete');
    this.setQuality(quality != null ? quality : 0);
    this.setExportInfo(scanRecord);
    this.setSummary(bodyModel);
  }

  hideSuccess() {
    this.elements.success.style.opacity = '0';
  }

  setQuality(score) {
    this.elements.quality.innerHTML = `Scan quality: <strong>${Math.round(score)}%</strong>`;
  }

  clearQuality() {
    this.elements.quality.textContent = '';
    this.setSummary(null);
  }

  setSummary(bodyModel) {
    const container = this.elements.summary;
    if (!bodyModel) {
      container.innerHTML = '';
      return;
    }

    const { height, shoulderWidth, bodyType, size, confidence } = bodyModel;
    const conf = Math.max(0, Math.min(1, confidence || 0));
    const errorCm = Math.round((1 - conf) * 10);
    container.innerHTML = `
      <div class="summary-row"><strong>Height:</strong> ${height} ±${errorCm}cm</div>
      <div class="summary-row"><strong>Shoulders:</strong> ${shoulderWidth}</div>
      <div class="summary-row"><strong>Body type:</strong> ${bodyType}</div>
      <div class="summary-row"><strong>Size:</strong> ${size}</div>
      <div class="summary-row"><strong>Confidence:</strong> ${Math.round(conf * 100)}%</div>
    `;
  }

  setExportInfo(scanRecord) {
    this.exportPayload = scanRecord;
  }

  getExportPayload() {
    return this.exportPayload;
  }

  setHistory(history) {
    const list = this.elements.historyList;
    list.innerHTML = '';

    history.forEach((item) => {
      const li = document.createElement('li');
      const time = new Date(item.timestamp).toLocaleString();
      li.innerHTML = `<div>${time}</div><button data-scan-id="${item.id}">Load</button>`;
      list.appendChild(li);
    });
  }

  showFeedback(message, type = 'info') {
    // simple toast-like overlay (reuses status)
    this.setStatus(message);
    if (type === 'warning') {
      this.elements.status.style.color = '#ffeb3b';
    } else if (type === 'error') {
      this.elements.status.style.color = '#ff4d4d';
    } else {
      this.elements.status.style.color = '#fff';
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
    } else {
      // reuse context if possible
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
}
