/*
 * FitVision - Body outline try-on overlay
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export class TryOn {
  constructor() {
    this.el = document.getElementById('tryOnOverlay');
    this.video = document.getElementById('video');
    this.scene = null;
  }

  update(bodyModel, landmarks) {
    if (!this.el || !this.video || !Array.isArray(landmarks) || landmarks.length < 29) {
      this.clear();
      return;
    }

    const rect = this.video.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      this.clear();
      return;
    }

    const scene = this.ensureScene();
    if (!scene) {
      return;
    }

    const frame = this.buildFigureFrame(landmarks, bodyModel, rect.width, rect.height);
    if (!frame) {
      this.clear();
      return;
    }

    scene.svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    scene.svg.setAttribute('preserveAspectRatio', 'none');
    scene.svg.style.width = `${rect.width}px`;
    scene.svg.style.height = `${rect.height}px`;

    scene.head.setAttribute('cx', frame.head.cx.toFixed(1));
    scene.head.setAttribute('cy', frame.head.cy.toFixed(1));
    scene.head.setAttribute('rx', frame.head.rx.toFixed(1));
    scene.head.setAttribute('ry', frame.head.ry.toFixed(1));

    scene.body.setAttribute('d', frame.bodyPath);
    scene.leftArm.setAttribute('d', frame.leftArmPath);
    scene.rightArm.setAttribute('d', frame.rightArmPath);
    scene.connector.setAttribute('d', frame.connectorPath);

    scene.svg.style.opacity = '1';
    scene.svg.dataset.visible = 'true';
  }

  clear() {
    if (!this.scene) return;

    this.scene.svg.style.opacity = '0';
    delete this.scene.svg.dataset.visible;
    this.scene.body.setAttribute('d', '');
    this.scene.leftArm.setAttribute('d', '');
    this.scene.rightArm.setAttribute('d', '');
    this.scene.connector.setAttribute('d', '');
  }

  ensureScene() {
    if (this.scene) return this.scene;
    if (!this.el) return null;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('tryon-scene');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.pointerEvents = 'none';
    svg.style.opacity = '0';
    svg.style.overflow = 'visible';
    svg.style.transition = 'opacity 180ms ease';

    const defs = document.createElementNS(SVG_NS, 'defs');

    const fillGradient = document.createElementNS(SVG_NS, 'linearGradient');
    fillGradient.setAttribute('id', 'tryonFill');
    fillGradient.setAttribute('x1', '0%');
    fillGradient.setAttribute('y1', '0%');
    fillGradient.setAttribute('x2', '0%');
    fillGradient.setAttribute('y2', '100%');

    const fillStopTop = document.createElementNS(SVG_NS, 'stop');
    fillStopTop.setAttribute('offset', '0%');
    fillStopTop.setAttribute('stop-color', '#ffffff');
    fillStopTop.setAttribute('stop-opacity', '0.12');

    const fillStopBottom = document.createElementNS(SVG_NS, 'stop');
    fillStopBottom.setAttribute('offset', '100%');
    fillStopBottom.setAttribute('stop-color', '#ffffff');
    fillStopBottom.setAttribute('stop-opacity', '0.03');

    fillGradient.append(fillStopTop, fillStopBottom);

    const glowFilter = document.createElementNS(SVG_NS, 'filter');
    glowFilter.setAttribute('id', 'tryonGlow');
    glowFilter.setAttribute('x', '-20%');
    glowFilter.setAttribute('y', '-20%');
    glowFilter.setAttribute('width', '140%');
    glowFilter.setAttribute('height', '140%');

    const blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '2');
    glowFilter.appendChild(blur);

    defs.append(fillGradient, glowFilter);

    const figure = document.createElementNS(SVG_NS, 'g');
    figure.classList.add('tryon-figure');

    const body = this.createPath('tryon-body');
    const leftArm = this.createPath('tryon-arm tryon-arm-left');
    const rightArm = this.createPath('tryon-arm tryon-arm-right');
    const connector = this.createPath('tryon-connector');
    const head = document.createElementNS(SVG_NS, 'ellipse');
    head.setAttribute('class', 'tryon-head');
    body.setAttribute('fill', 'url(#tryonFill)');
    body.setAttribute('filter', 'url(#tryonGlow)');
    body.setAttribute('stroke', 'rgba(255, 255, 255, 0.78)');
    leftArm.setAttribute('fill', 'none');
    rightArm.setAttribute('fill', 'none');
    connector.setAttribute('fill', 'none');
    head.setAttribute('fill', 'rgba(255, 255, 255, 0.06)');

    figure.append(body, leftArm, rightArm, connector, head);
    svg.append(defs, figure);
    this.el.appendChild(svg);

    this.scene = {
      svg,
      figure,
      body,
      leftArm,
      rightArm,
      connector,
      head
    };

    return this.scene;
  }

  createPath(className) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', className);
    return path;
  }

  buildFigureFrame(landmarks, bodyModel, width, height) {
    const px = (index) => this.pointToPixel(landmarks[index], width, height);
    const leftEye = px(2) || px(1) || px(0);
    const rightEye = px(5) || px(4) || px(0);
    const nose = px(0) || midpoint(leftEye, rightEye) || { x: width * 0.5, y: height * 0.12 };

    const headTop = estimateHeadTopPx(nose, leftEye, rightEye);
    const leftShoulder = px(11);
    const rightShoulder = px(12);
    const leftElbow = px(13);
    const rightElbow = px(14);
    const leftWrist = px(15);
    const rightWrist = px(16);
    const leftHip = px(23);
    const rightHip = px(24);
    const leftKnee = px(25);
    const rightKnee = px(26);
    const leftAnkle = px(27);
    const rightAnkle = px(28);

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftAnkle || !rightAnkle) {
      return null;
    }

    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    const hipCenter = midpoint(leftHip, rightHip);
    const kneeCenter = midpoint(leftKnee || leftAnkle, rightKnee || rightAnkle);
    const ankleCenter = midpoint(leftAnkle, rightAnkle);
    const bodyHeight = Math.max(ankleCenter.y - headTop.y, height * 0.56);

    const measurements = bodyModel?.measurements || {};
    const shoulderWidthRatio = ratioOrDefault(measurements.shoulderWidthCm, measurements.hipWidthCm, 1.0);
    const chestWidthRatio = clampRatio(
      ratioOrDefault(measurements.chestWidthCm, measurements.shoulderWidthCm, 0.96),
      0.86,
      1.12
    );
    const waistWidthRatio = clampRatio(
      ratioOrDefault(measurements.waistWidthCm, measurements.shoulderWidthCm, 0.82),
      0.68,
      0.98
    );
    const hipWidthRatio = clampRatio(
      ratioOrDefault(measurements.hipWidthCm, measurements.shoulderWidthCm, 0.94),
      0.78,
      1.1
    );

    const shoulderSpan = Math.max(distance(leftShoulder, rightShoulder), bodyHeight * 0.16);
    const hipSpan = Math.max(distance(leftHip, rightHip), bodyHeight * 0.13);

    const head = {
      cx: shoulderCenter.x,
      cy: headTop.y + bodyHeight * 0.075,
      rx: clamp(shoulderSpan * 0.18 * shoulderWidthRatio, bodyHeight * 0.045, bodyHeight * 0.085),
      ry: clamp(shoulderSpan * 0.22 * shoulderWidthRatio, bodyHeight * 0.055, bodyHeight * 0.1)
    };

    const neckLeft = {
      x: shoulderCenter.x - shoulderSpan * 0.11,
      y: shoulderCenter.y - bodyHeight * 0.03
    };
    const neckRight = {
      x: shoulderCenter.x + shoulderSpan * 0.11,
      y: shoulderCenter.y - bodyHeight * 0.03
    };
    const chestY = shoulderCenter.y + bodyHeight * 0.12;
    const waistY = shoulderCenter.y + bodyHeight * 0.31;
    const hipY = hipCenter.y + bodyHeight * 0.02;
    const kneeY = kneeCenter.y;
    const ankleY = ankleCenter.y;

    const chestHalf = shoulderSpan * 0.23 * chestWidthRatio;
    const waistHalf = shoulderSpan * 0.18 * waistWidthRatio;
    const hipHalf = hipSpan * 0.18 * hipWidthRatio;
    const thighHalf = hipSpan * 0.12 * hipWidthRatio;
    const calfHalf = shoulderSpan * 0.09;
    const footSpread = shoulderSpan * 0.11;

    const leftChest = { x: shoulderCenter.x - chestHalf, y: chestY };
    const rightChest = { x: shoulderCenter.x + chestHalf, y: chestY };
    const leftWaist = { x: shoulderCenter.x - waistHalf, y: waistY };
    const rightWaist = { x: shoulderCenter.x + waistHalf, y: waistY };
    const leftHipOuter = { x: hipCenter.x - hipHalf, y: hipY };
    const rightHipOuter = { x: hipCenter.x + hipHalf, y: hipY };

    const leftThigh = {
      x: leftHip.x - thighHalf,
      y: (leftHip.y + kneeY) / 2
    };
    const rightThigh = {
      x: rightHip.x + thighHalf,
      y: (rightHip.y + kneeY) / 2
    };
    const leftKneeOuter = {
      x: leftKnee ? leftKnee.x - calfHalf : leftHip.x - calfHalf,
      y: kneeY
    };
    const rightKneeOuter = {
      x: rightKnee ? rightKnee.x + calfHalf : rightHip.x + calfHalf,
      y: kneeY
    };
    const leftAnkleOuter = {
      x: leftAnkle.x - calfHalf * 0.55,
      y: ankleY
    };
    const rightAnkleOuter = {
      x: rightAnkle.x + calfHalf * 0.55,
      y: ankleY
    };
    const leftFoot = {
      x: leftAnkle.x - footSpread,
      y: ankleY + bodyHeight * 0.02
    };
    const rightFoot = {
      x: rightAnkle.x + footSpread,
      y: ankleY + bodyHeight * 0.02
    };

    const leftArmPoints = compactPoints([
      leftShoulder,
      bendArm(leftShoulder, leftElbow, -shoulderSpan * 0.08, bodyHeight * 0.03),
      bendArm(leftElbow || leftShoulder, leftWrist, -shoulderSpan * 0.06, bodyHeight * 0.02),
      bendArm(leftWrist || leftElbow || leftShoulder, leftWrist, -shoulderSpan * 0.1, 0)
    ]);
    const rightArmPoints = compactPoints([
      rightShoulder,
      bendArm(rightShoulder, rightElbow, shoulderSpan * 0.08, bodyHeight * 0.03),
      bendArm(rightElbow || rightShoulder, rightWrist, shoulderSpan * 0.06, bodyHeight * 0.02),
      bendArm(rightWrist || rightElbow || rightShoulder, rightWrist, shoulderSpan * 0.1, 0)
    ]);

    const bodyPath = smoothClosedPath([
      neckLeft,
      leftChest,
      leftWaist,
      leftHipOuter,
      leftThigh,
      leftKneeOuter,
      leftAnkleOuter,
      leftFoot,
      rightFoot,
      rightAnkleOuter,
      rightKneeOuter,
      rightThigh,
      rightHipOuter,
      rightWaist,
      rightChest,
      neckRight
    ]);

    const leftArmPath = smoothOpenPath(leftArmPoints);
    const rightArmPath = smoothOpenPath(rightArmPoints);
    const connectorPath = smoothOpenPath([
      { x: shoulderCenter.x, y: head.cy + head.ry * 0.9 },
      shoulderCenter,
      hipCenter,
      ankleCenter
    ]);

    return {
      head,
      bodyPath,
      leftArmPath,
      rightArmPath,
      connectorPath
    };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function clampRatio(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return (min + max) / 2;
  return clamp(numeric, min, max);
}

function ratioOrDefault(primary, fallback, defaultValue) {
  const numerator = Number(primary);
  const denominator = Number(fallback);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
    return numerator / denominator;
  }
  return defaultValue;
}

function midpoint(a, b) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function estimateHeadTopPx(nose, leftEye, rightEye) {
  const eyes = [leftEye, rightEye].filter(Boolean);
  const eyeY = eyes.length ? eyes.reduce((sum, point) => sum + point.y, 0) / eyes.length : nose.y;
  const headLift = Math.max(12, Math.abs(nose.y - eyeY) * 2.2);
  const eyeTop = eyes.length ? Math.min(...eyes.map((point) => point.y)) : nose.y - headLift * 0.6;
  return {
    x: nose.x,
    y: Math.max(0, eyeTop - headLift),
  };
}

function bendArm(base, joint, offsetX, offsetY) {
  if (!base && !joint) return null;
  const from = base || joint;
  const to = joint || base;
  return {
    x: ((from.x + to.x) / 2) + offsetX,
    y: ((from.y + to.y) / 2) + offsetY
  };
}

function compactPoints(points) {
  return points.filter(Boolean);
}

function smoothOpenPath(points) {
  const pts = compactPoints(points);
  if (pts.length < 2) return '';

  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) {
    const mid = midpoint(pts[0], pts[1]);
    return `${path} Q ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} T ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }

  for (let i = 1; i < pts.length; i += 1) {
    const current = pts[i];
    const previous = pts[i - 1];
    const controlX = previous.x.toFixed(1);
    const controlY = previous.y.toFixed(1);
    const mid = midpoint(previous, current);
    path += ` Q ${controlX} ${controlY} ${mid.x.toFixed(1)} ${mid.y.toFixed(1)}`;
  }

  const last = pts[pts.length - 1];
  path += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return path;
}

function smoothClosedPath(points) {
  const pts = compactPoints(points);
  if (pts.length < 3) return '';

  let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i += 1) {
    const previous = pts[i - 1];
    const current = pts[i];
    const mid = midpoint(previous, current);
    path += ` Q ${previous.x.toFixed(1)} ${previous.y.toFixed(1)} ${mid.x.toFixed(1)} ${mid.y.toFixed(1)}`;
  }

  const last = pts[pts.length - 1];
  const first = pts[0];
  path += ` Q ${last.x.toFixed(1)} ${last.y.toFixed(1)} ${first.x.toFixed(1)} ${first.y.toFixed(1)} Z`;
  return path;
}

function pointToPixel(point, width, height) {
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return null;
  return {
    x: point.x * width,
    y: point.y * height
  };
}
