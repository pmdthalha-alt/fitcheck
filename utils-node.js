/**
 * Node-compatible utility helpers used by the advanced server.
 */

function distance(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function euclideanDistance(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) +
    Math.pow(p1.y - p2.y, 2) +
    Math.pow((p1.z || 0) - (p2.z || 0), 2)
  );
}

function angle(p1, p2, p3) {
  const a = distance(p2, p1);
  const b = distance(p2, p3);
  const c = distance(p1, p3);

  if (a === 0 || b === 0) return 0;

  let cosine = (Math.pow(a, 2) + Math.pow(b, 2) - Math.pow(c, 2)) / (2 * a * b);
  cosine = Math.max(-1, Math.min(1, cosine));
  return Math.acos(cosine) * 180 / Math.PI;
}

function getPoseStability(currentPose, previousPose, threshold = 0.1) {
  if (!previousPose || !currentPose) return 0;

  let totalDistance = 0;
  for (let i = 0; i < Math.min(currentPose.length, previousPose.length); i++) {
    totalDistance += distance(currentPose[i], previousPose[i]);
  }

  const avgDistance = totalDistance / currentPose.length;
  return Math.max(0, 1 - (avgDistance / threshold));
}

function getBodyMetrics(landmarks) {
  if (!landmarks || landmarks.length < 33) return null;

  return {
    headHeight: distance(landmarks[0], landmarks[1]),
    shoulderWidth: euclideanDistance(landmarks[11], landmarks[12]),
    torsoHeight: distance(landmarks[11], landmarks[23]),
    armLength: distance(landmarks[12], landmarks[16]),
    elbowAngle: angle(landmarks[12], landmarks[14], landmarks[16]),
    legLength: distance(landmarks[24], landmarks[28]),
    hipWidth: distance(landmarks[23], landmarks[24]),
    neckPosition: { x: landmarks[0].x, y: landmarks[0].y }
  };
}

function getVisibilityScore(landmarks) {
  if (!landmarks || !landmarks.length) return 0;

  const visibleCount = landmarks.filter((landmark) => landmark && landmark.visibility > 0.5).length;
  return visibleCount / landmarks.length;
}

function calculateConfidence(detection, metrics) {
  let confidence = detection.baseConfidence || 0.5;

  const visibilityScore = getVisibilityScore(metrics.landmarks || []);
  confidence *= (0.5 + 0.5 * visibilityScore);

  if (metrics.stability > 0.8) {
    confidence *= 1.1;
  }

  return Math.min(confidence, 0.99);
}

function calculatePoints(detection, metrics = {}) {
  let points = 50;

  if (detection.confidence > 0.9) {
    points += 50;
  } else if (detection.confidence > 0.8) {
    points += 30;
  } else if (detection.confidence > 0.7) {
    points += 15;
  }

  if (metrics.visibilityScore > 0.9) {
    points += 20;
  } else if (metrics.visibilityScore > 0.7) {
    points += 10;
  }

  if (metrics.stability > 0.9) {
    points += 15;
  }

  return Math.min(points, 100);
}

function isValidPose(landmarks) {
  if (!landmarks || !Array.isArray(landmarks)) return false;
  if (landmarks.length !== 33) return false;

  return landmarks.every((point) =>
    point &&
    typeof point.x === 'number' &&
    typeof point.y === 'number'
  );
}

class PoseSmoother {
  constructor(windowSize = 5) {
    this.windowSize = windowSize;
    this.history = [];
  }

  add(pose) {
    this.history.push(pose);
    if (this.history.length > this.windowSize) {
      this.history.shift();
    }
  }

  getSmoothed() {
    if (this.history.length === 0) return null;

    const smoothed = [];
    for (let i = 0; i < 33; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      let visibility = 0;

      for (const pose of this.history) {
        x += pose[i].x;
        y += pose[i].y;
        z += pose[i].z || 0;
        visibility += pose[i].visibility || 0;
      }

      const count = this.history.length;
      smoothed.push({
        x: x / count,
        y: y / count,
        z: z / count,
        visibility: visibility / count
      });
    }

    return smoothed;
  }
}

module.exports = {
  angle,
  calculateConfidence,
  calculatePoints,
  distance,
  euclideanDistance,
  getBodyMetrics,
  getPoseStability,
  getVisibilityScore,
  isValidPose,
  PoseSmoother
};
