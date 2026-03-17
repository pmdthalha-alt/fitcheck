/**
 * FitCheck AI - Utility Functions
 * Common helper functions for pose analysis and detection
 */

// MATH UTILITIES
function distance(p1, p2) {
  if (!p1 || !p2) return Infinity;
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function euclideanDistance(p1, p2) {
  if (!p1 || !p2) return Infinity;
  return Math.sqrt(
    Math.pow(p1.x - p2.x, 2) + 
    Math.pow(p1.y - p2.y, 2) + 
    Math.pow(p1.z - p2.z, 2)
  );
}

function angle(p1, p2, p3) {
  // Calculate angle at p2 between p1 and p3
  const a = distance(p2, p1);
  const b = distance(p2, p3);
  const c = distance(p1, p3);
  
  if (a === 0 || b === 0) return 0;
  
  return Math.acos((Math.pow(a, 2) + Math.pow(b, 2) - Math.pow(c, 2)) / (2 * a * b)) * 180 / Math.PI;
}

// POSE ANALYSIS
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
    headHeight: distance(landmarks[0], landmarks[1]), // Nose to eyes
    shoulderWidth: distance(landmarks[11], landmarks[12]), // Shoulder to shoulder
    torsoHeight: distance(landmarks[11], landmarks[23]), // Shoulder to hip
    armLength: distance(landmarks[12], landmarks[14]), // Shoulder to wrist
    elbowAngle: angle(landmarks[12], landmarks[14], landmarks[16]), // Arm bend
    legLength: distance(landmarks[24], landmarks[26]), // Hip to ankle
    hipWidth: distance(landmarks[23], landmarks[24]), // Hip to hip
    neckPosition: { x: landmarks[0].x, y: landmarks[0].y } // Head position
  };
}

function getVisibilityScore(landmarks) {
  if (!landmarks) return 0;
  
  const visibleCount = landmarks.filter(l => l.visibility > 0.5).length;
  return visibleCount / landmarks.length;
}

function getBodyPartVisibility(landmarks, bodyPartIndices) {
  if (!landmarks) return 0;
  
  const visibleParts = bodyPartIndices.filter(i => 
    landmarks[i] && landmarks[i].visibility > 0.5
  ).length;
  
  return visibleParts / bodyPartIndices.length;
}

// CLOTHING DETECTION HELPERS
function getCoverageBoundingBox(landmarks, bodyPartIndices) {
  if (!landmarks || bodyPartIndices.length === 0) return null;
  
  const parts = bodyPartIndices
    .map(i => landmarks[i])
    .filter(p => p && p.visibility > 0.5);
  
  if (parts.length === 0) return null;
  
  const xs = parts.map(p => p.x);
  const ys = parts.map(p => p.y);
  
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    area: (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  };
}

function calculateConfidence(detection, metrics) {
  let confidence = detection.baseConfidence || 0.5;
  
  // Visibility multiplier
  const visibilityScore = getVisibilityScore(metrics.landmarks);
  confidence *= (0.5 + 0.5 * visibilityScore);
  
  // Stability bonus
  if (metrics.stability > 0.8) {
    confidence *= 1.1;
  }
  
  return Math.min(confidence, 0.99);
}

// SCORING SYSTEM
function calculatePoints(detection, metrics = {}) {
  let points = 50; // Base points
  
  // Confidence bonus
  if (detection.confidence > 0.9) {
    points += 50;
  } else if (detection.confidence > 0.8) {
    points += 30;
  } else if (detection.confidence > 0.7) {
    points += 15;
  }
  
  // Visibility bonus
  if (metrics.visibilityScore > 0.9) {
    points += 20;
  } else if (metrics.visibilityScore > 0.7) {
    points += 10;
  }
  
  // Stability bonus
  if (metrics.stability > 0.9) {
    points += 15;
  }
  
  return Math.min(points, 100);
}

// COMPARISON & MATCHING
function findClosestMatch(detection, database) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const item of database) {
    let score = 0;
    
    // Name matching
    if (detection.name && item.name.includes(detection.name)) {
      score += 40;
    }
    
    // Confidence matching
    score += Math.abs(detection.confidence - item.confidence) * 50;
    
    // Body parts matching
    if (detection.bodyParts && item.bodyParts) {
      const matches = detection.bodyParts.filter(p => 
        item.bodyParts.includes(p)
      ).length;
      score += (matches / detection.bodyParts.length) * 30;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  }
  
  return bestMatch;
}

// VALIDATION
function isValidPose(landmarks) {
  if (!landmarks || !Array.isArray(landmarks)) return false;
  if (landmarks.length !== 33) return false;
  
  const hasValidPoints = landmarks.every(p => 
    p && typeof p.x === 'number' && typeof p.y === 'number'
  );
  
  return hasValidPoints;
}

function isValidDetection(detection) {
  return (
    detection &&
    typeof detection.confidence === 'number' &&
    detection.confidence >= 0 && 
    detection.confidence <= 1 &&
    detection.detectedItem &&
    typeof detection.detectedItem === 'string'
  );
}

// SMOOTHING
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
      let x = 0, y = 0, z = 0, visibility = 0;
      
      for (const pose of this.history) {
        x += pose[i].x;
        y += pose[i].y;
        z += pose[i].z;
        visibility += pose[i].visibility;
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

// EXPORT
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    distance,
    euclideanDistance,
    angle,
    getPoseStability,
    getBodyMetrics,
    getVisibilityScore,
    getBodyPartVisibility,
    getCoverageBoundingBox,
    calculateConfidence,
    calculatePoints,
    findClosestMatch,
    isValidPose,
    isValidDetection,
    PoseSmoother
  };
}
