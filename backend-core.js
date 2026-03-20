const { distance, isValidPose } = require('./utils-node.js');

const BODY_PART_LANDMARKS = {
  head: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  shoulder: [11, 12],
  torso: [11, 12, 23, 24],
  arm: [13, 14, 15, 16],
  hip: [23, 24],
  leg: [23, 24, 25, 26, 27, 28],
  ankle: [27, 28, 29, 30, 31, 32],
  foot: [29, 30, 31, 32]
};

const clothingDatabase = [
  {
    id: 1,
    name: 'Black Premium Hoodie',
    category: 'upper',
    confidence: 0.95,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 100,
    sizes: { small: 0.85, medium: 1.0, large: 1.2 },
    fitFor: ['athletic', 'casual']
  },
  {
    id: 2,
    name: 'White T-Shirt',
    category: 'upper',
    confidence: 0.92,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 50,
    sizes: { small: 0.9, medium: 1.0, large: 1.15 },
    fitFor: ['casual', 'comfort']
  },
  {
    id: 3,
    name: 'Blue Jeans',
    category: 'lower',
    confidence: 0.88,
    bodyParts: ['hip', 'leg'],
    points: 75,
    sizes: { small: 0.95, medium: 1.0, large: 1.1 },
    fitFor: ['casual', 'everyday']
  },
  {
    id: 4,
    name: 'Fitted Blazer',
    category: 'upper',
    confidence: 0.91,
    bodyParts: ['shoulder', 'torso'],
    points: 110,
    sizes: { small: 0.8, medium: 1.0, large: 1.25 },
    fitFor: ['formal', 'business']
  },
  {
    id: 5,
    name: 'Athletic Shorts',
    category: 'lower',
    confidence: 0.87,
    bodyParts: ['hip', 'leg'],
    points: 65,
    sizes: { small: 0.9, medium: 1.0, large: 1.2 },
    fitFor: ['athletic', 'casual']
  },
  {
    id: 6,
    name: 'Leather Jacket',
    category: 'upper',
    confidence: 0.93,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 120,
    sizes: { small: 0.75, medium: 1.0, large: 1.3 },
    fitFor: ['casual', 'statement']
  },
  {
    id: 7,
    name: 'Baseball Cap',
    category: 'accessories',
    confidence: 0.86,
    bodyParts: ['head'],
    points: 45,
    sizes: { small: 1.0, medium: 1.0, large: 1.0 },
    fitFor: ['casual', 'sport']
  },
  {
    id: 8,
    name: 'Training Sneakers',
    category: 'accessories',
    confidence: 0.9,
    bodyParts: ['ankle', 'foot'],
    points: 55,
    sizes: { small: 0.95, medium: 1.0, large: 1.05 },
    fitFor: ['athletic', 'everyday']
  }
];

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function averagePoint(points) {
  const valid = points.filter(Boolean);
  if (!valid.length) return null;

  return {
    x: valid.reduce((sum, point) => sum + point.x, 0) / valid.length,
    y: valid.reduce((sum, point) => sum + point.y, 0) / valid.length
  };
}

function getVisibilityRatio(landmarks, indices) {
  const points = indices
    .map((index) => landmarks[index])
    .filter(Boolean);

  if (!points.length) return 0;

  const visible = points.filter((point) => (point.visibility ?? 0) > 0.5).length;
  return visible / points.length;
}

function getOverallVisibility(landmarks) {
  if (!Array.isArray(landmarks) || !landmarks.length) return 0;
  const visible = landmarks.filter((point) => point && (point.visibility ?? 0) > 0.5).length;
  return visible / landmarks.length;
}

function getBodyMetrics(landmarks) {
  if (!isValidPose(landmarks)) return null;

  const ankleMidpoint = averagePoint([landmarks[27], landmarks[28]]) || landmarks[27];

  return {
    shoulderWidth: distance(landmarks[11], landmarks[12]),
    chestWidth: distance(landmarks[11], landmarks[12]) * 0.95,
    torsoLength: distance(landmarks[11], landmarks[23]),
    armLength: distance(landmarks[12], landmarks[16]),
    legLength: distance(landmarks[24], landmarks[28]),
    hipWidth: distance(landmarks[23], landmarks[24]),
    heightEstimate: distance(landmarks[0], ankleMidpoint),
    visibilityScore: round(getOverallVisibility(landmarks), 4)
  };
}

function getBodySize(metrics) {
  if (!metrics) return 'medium';

  if (metrics.shoulderWidth > 0.25) return 'large';
  if (metrics.shoulderWidth < 0.18) return 'small';
  return 'medium';
}

function analyzeBodyShape(metrics) {
  const size = getBodySize(metrics);
  let description = 'Well-balanced, standard proportions';
  let recommendations = [
    'Standard sizes should be a reliable starting point.',
    'Use hem or sleeve adjustments for the cleanest fit.',
    'Most silhouettes should stay proportional on your frame.'
  ];

  if (size === 'large') {
    description = 'Athletic or broad-shouldered frame with stronger upper-body width.';
    recommendations = [
      'Look for structured shoulders with stretch through the torso.',
      'Choose tapered pieces so the fit stays clean below the chest.',
      'Prioritize flexible fabrics for jackets and fitted tops.'
    ];
  } else if (size === 'small') {
    description = 'Narrower frame with a lighter shoulder profile.';
    recommendations = [
      'Start with tailored or petite-friendly cuts.',
      'Avoid oversized layers that can swallow your proportions.',
      'Shorter jackets and cleaner lines will keep the silhouette sharp.'
    ];
  }

  return { size, description, recommendations };
}

function getBodyPartCoverage(landmarks, bodyParts = []) {
  if (!isValidPose(landmarks)) return 0;
  if (!bodyParts.length) return getOverallVisibility(landmarks);

  const ratios = bodyParts
    .map((part) => BODY_PART_LANDMARKS[part])
    .filter(Boolean)
    .map((indices) => getVisibilityRatio(landmarks, indices));

  if (!ratios.length) return getOverallVisibility(landmarks);
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

function calculateFitScore(metrics, item, landmarks) {
  if (!metrics || !item) return 0;

  const bodySize = getBodySize(metrics);
  const bodyPartCoverage = getBodyPartCoverage(landmarks, item.bodyParts);
  let score = item.confidence;

  if (item.sizes && item.sizes[bodySize]) {
    score *= item.sizes[bodySize];
  }

  score *= 0.5 + (metrics.visibilityScore || 0) * 0.5;
  score *= 0.45 + bodyPartCoverage * 0.55;

  return round(clamp(score, 0, 0.99), 4);
}

function buildDetailedMatches(landmarks, metrics) {
  const bodySize = getBodySize(metrics);

  return clothingDatabase
    .map((item) => ({
      ...item,
      fitScore: calculateFitScore(metrics, item, landmarks),
      sizeFit: bodySize,
      bodyPartCoverage: round(getBodyPartCoverage(landmarks, item.bodyParts), 2)
    }))
    .sort((left, right) => right.fitScore - left.fitScore);
}

function detectFromPose(landmarks, options = {}) {
  if (!isValidPose(landmarks)) return null;

  const metrics = getBodyMetrics(landmarks);
  const bodySize = getBodySize(metrics);
  const shapeAnalysis = analyzeBodyShape(metrics);
  const minimumFitScore = options.minimumFitScore ?? 0.45;
  const topN = options.topN ?? 3;

  const detailedMatches = buildDetailedMatches(landmarks, metrics);
  const highConfidenceMatches = detailedMatches.filter((item) => item.fitScore >= minimumFitScore);
  const topMatches = (highConfidenceMatches.length ? highConfidenceMatches : detailedMatches).slice(0, topN);

  const confidence = topMatches.length
    ? topMatches.reduce((sum, item) => sum + item.fitScore, 0) / topMatches.length
    : metrics.visibilityScore;

  const points = Math.round(
    topMatches.reduce((sum, item) => sum + (item.points * item.fitScore), 0)
  );

  return {
    metrics,
    bodySize,
    shapeAnalysis,
    bestMatch: topMatches[0] || null,
    topMatches,
    detectedItems: topMatches.map((item) => item.name),
    confidence: round(clamp(confidence, 0, 0.99), 4),
    points
  };
}

function cmFromNormalized(value, baselineCm = 170) {
  return round(Math.max(0, value) * baselineCm, 1);
}

function formatMeasurements(metrics) {
  if (!metrics) return null;

  return {
    shoulderWidth: cmFromNormalized(metrics.shoulderWidth),
    chestWidth: cmFromNormalized(metrics.chestWidth),
    torsoLength: cmFromNormalized(metrics.torsoLength),
    armLength: cmFromNormalized(metrics.armLength),
    legLength: cmFromNormalized(metrics.legLength),
    hipWidth: cmFromNormalized(metrics.hipWidth),
    heightEstimate: cmFromNormalized(metrics.heightEstimate)
  };
}

function recommendOutfits(landmarks, limit = 5) {
  const summary = detectFromPose(landmarks, { topN: clothingDatabase.length, minimumFitScore: 0 });
  if (!summary) return [];

  return summary.topMatches
    .slice(0, limit)
    .map((item) => ({
      name: item.name,
      category: item.category,
      fitScore: item.fitScore,
      sizeRecommended: summary.bodySize,
      bodyPartCoverage: item.bodyPartCoverage,
      reason: summary.shapeAnalysis.description
    }));
}

function aggregateOutfit(poses) {
  const validPoses = poses.filter((pose) => isValidPose(pose));
  if (!validPoses.length) return null;

  const detections = validPoses
    .map((pose) => detectFromPose(pose))
    .filter(Boolean);

  const detectedItems = [...new Set(detections.flatMap((result) => result.detectedItems))];
  const avgConfidence = detections.reduce((sum, result) => sum + result.confidence, 0) / detections.length;
  const totalScore = detections.reduce((sum, result) => sum + result.points, 0);

  return {
    totalScore,
    avgConfidence: round(avgConfidence, 4),
    detectedItems,
    fitScore: round(avgConfidence * 100, 1),
    frameCount: validPoses.length,
    recommendation: avgConfidence > 0.8
      ? 'Great fit across the captured poses.'
      : avgConfidence > 0.6
        ? 'Solid fit signal, but another steadier capture would help.'
        : 'Capture a steadier full-body sequence for a better read.'
  };
}

function getClothingByCategory(category) {
  const normalized = String(category || '').toLowerCase();
  if (!normalized) return [];

  return clothingDatabase.filter((item) => {
    if (item.category === normalized) return true;
    if (normalized === 'accessories') {
      return item.bodyParts.includes('head') || item.bodyParts.includes('foot');
    }
    return false;
  });
}

module.exports = {
  analyzeBodyShape,
  aggregateOutfit,
  buildDetailedMatches,
  clothingDatabase,
  detectFromPose,
  formatMeasurements,
  getBodyMetrics,
  getBodySize,
  getClothingByCategory,
  isValidPose,
  recommendOutfits
};
