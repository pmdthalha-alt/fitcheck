/*
 * FitVision - Basic try-on overlay system
 */

export class TryOn {
  constructor() {
    this.el = document.getElementById('tryOnOverlay');
    this.clothing = null;
    this.video = document.getElementById('video');
  }

  update(bodyModel, landmarks) {
    this.clear();
    if (!landmarks || landmarks.length === 0) return;

    const videoRect = this.video.getBoundingClientRect();
    const canvasWidth = videoRect.width;
    const canvasHeight = videoRect.height;

    // shoulder points
    const left = landmarks[11];
    const right = landmarks[12];
    const hip = landmarks[23];

    const shoulderCenter = {
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2
    };

    const shoulderWidth = Math.hypot((left.x - right.x), (left.y - right.y));
    const torsoHeight = Math.hypot((shoulderCenter.y - hip.y), (shoulderCenter.x - hip.x));

    const boxWidth = Math.max(0.18, shoulderWidth) * canvasWidth * 1.2;
    const boxHeight = Math.max(0.25, torsoHeight) * canvasHeight * 1.45;

    const boxX = shoulderCenter.x * canvasWidth - boxWidth / 2;
    const boxY = shoulderCenter.y * canvasHeight - boxHeight * 0.25;

    const box = document.createElement('div');
    box.className = 'tryon-item';
    box.style.position = 'absolute';
    box.style.pointerEvents = 'none';
    box.style.left = `${boxX}px`;
    box.style.top = `${boxY}px`;
    box.style.width = `${boxWidth}px`;
    box.style.height = `${boxHeight}px`;
    box.style.background = 'rgba(0, 200, 255, 0.25)';
    box.style.border = '2px solid rgba(0, 255, 200, 0.7)';
    box.style.borderRadius = '18px';
    box.style.backdropFilter = 'blur(6px)';
    box.style.boxShadow = '0 0 40px rgba(0, 200, 255, 0.3)';

    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.top = '8px';
    label.style.left = '8px';
    label.style.fontSize = '11px';
    label.style.color = 'rgba(255,255,255,0.9)';
    label.textContent = 'Virtual Shirt';

    box.appendChild(label);
    this.el.appendChild(box);
    this.clothing = box;

    box.animate(
      [
        { transform: 'scale(0.7)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 }
      ],
      { duration: 500, easing: 'ease-out' }
    );
  }

  clear() {
    if (!this.el) return;
    this.el.innerHTML = '';
    this.clothing = null;
  }
}
