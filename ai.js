/*
 * FitVision - AI logic (heuristic, deterministic analysis)
 * This module provides body type classification, size recommendation, and confidence scoring.
 */

export function predictBodyType(bodyModel) {
  if (!bodyModel) return 'Unknown';
  if (typeof bodyModel.bodyType === 'string' && bodyModel.bodyType) {
    return bodyModel.bodyType;
  }

  const ratio = bodyModel.measurements?.shoulderToHipRatio ?? bodyModel.raw?.shouldertoHipRatio;
  if (typeof ratio === 'number') {
    if (ratio > 1.1) return 'Inverted triangle';
    if (ratio < 0.92) return 'Triangle';
    return 'Rectangle';
  }

  const shoulderToHeight = bodyModel.proportions?.shoulderToHeight;
  if (shoulderToHeight > 0.26) return 'Broad';
  if (shoulderToHeight < 0.2) return 'Slim';
  return 'Regular';
}

export function recommendSize(bodyModel) {
  if (!bodyModel) return 'M';

  const height = bodyModel.measurements?.heightCm
    || parseInt((bodyModel.height || '').replace(/[^0-9]/g, ''), 10)
    || 170;
  const shoulder = bodyModel.measurements?.shoulderWidthCm
    || parseInt((bodyModel.shoulderWidth || '').replace(/[^0-9]/g, ''), 10)
    || 45;
  const hip = bodyModel.measurements?.hipWidthCm || 40;
  const chestCircumference = bodyModel.measurements?.chestCircumferenceCm
    || (shoulder * 2.08);
  const waistCircumference = bodyModel.measurements?.waistCircumferenceCm
    || (hip * 2.0);
  const hipCircumference = bodyModel.measurements?.hipCircumferenceCm
    || (hip * 2.08);

  const sizeByHeight = height < 165 ? -1 : height < 175 ? 0 : height < 185 ? 1 : 2;
  const sizeByShoulder = shoulder < 42 ? -1 : shoulder < 47 ? 0 : shoulder < 52 ? 1 : 2;
  const sizeByChest = chestCircumference < 88 ? -1 : chestCircumference < 96 ? 0 : chestCircumference < 104 ? 1 : 2;
  const sizeByWaist = waistCircumference < 74 ? -1 : waistCircumference < 82 ? 0 : waistCircumference < 90 ? 1 : 2;
  const sizeByHip = hipCircumference < 90 ? -1 : hipCircumference < 98 ? 0 : hipCircumference < 106 ? 1 : 2;

  const score = sizeByHeight + sizeByShoulder + sizeByChest + sizeByWaist + sizeByHip;
  if (score <= -3) return 'XS';
  if (score <= -1) return 'S';
  if (score <= 2) return 'M';
  if (score <= 6) return 'L';
  return 'XL';
}

export function computeConfidence(bodyModel, qualityScore) {
  const base = Math.min(1, Math.max(0, (qualityScore || 0) / 100));
  const shapeCertainty = bodyModel && bodyModel.raw && bodyModel.raw.shouldertoHipRatio ? 0.08 : 0;
  const precisionBonus = bodyModel?.precision?.reliability
    ? Math.min(0.14, bodyModel.precision.reliability * 0.14)
    : 0;
  const measurementBonus = averageConfidence(bodyModel?.measurementConfidence) * 0.08;
  return Math.min(0.99, base * 0.78 + shapeCertainty + precisionBonus + measurementBonus);
}

export function buildBodyModel(input) {
  // Accept precomputed model or raw landmarks
  if (input && input.bodyModel) return input.bodyModel;
  return input;
}

export function normalizeHeightCm(heightCm) {
  if (!heightCm) return null;
  return Math.round(heightCm);
}

export function normalizeShoulderCm(shoulderCm) {
  if (!shoulderCm) return null;
  return Math.round(shoulderCm);
}

export function generateFitInsights(bodyModel) {
  if (!bodyModel?.measurements) return [];

  const {
    heightCm,
    shoulderWidthCm,
    hipWidthCm,
    torsoLengthCm,
    sleeveLengthCm,
    inseamCm,
    shoulderToHipRatio,
    chestCircumferenceCm,
    waistCircumferenceCm,
    hipCircumferenceCm,
    chestToWaistRatio,
    waistToHipRatio
  } = bodyModel.measurements;
  const reliability = bodyModel.precision?.reliabilityPercent ?? 0;

  const insights = [];

  if (shoulderToHipRatio > 1.08) {
    insights.push('Your upper frame reads broader than the hips, so structured tops and cleaner shoulder seams should land more naturally.');
  } else if (shoulderToHipRatio < 0.92) {
    insights.push('Your lower frame reads stronger than the shoulders, so straight or slightly relaxed top silhouettes should balance better.');
  } else {
    insights.push('Your shoulders and hips look balanced, which usually translates well to standard straight-fit sizing.');
  }

  if ((torsoLengthCm / Math.max(heightCm, 1)) > 0.31) {
    insights.push('Your torso reads a little longer, so check tee, shirt, and jacket lengths before defaulting to cropped cuts.');
  } else if ((torsoLengthCm / Math.max(heightCm, 1)) < 0.27) {
    insights.push('Your torso reads a little shorter, so longline tops may feel oversized faster than expected.');
  }

  if ((sleeveLengthCm / Math.max(heightCm, 1)) > 0.28) {
    insights.push('Your arm length trends longer, so watch sleeve specs on jackets, hoodies, and tailoring.');
  }

  if ((inseamCm / Math.max(heightCm, 1)) > 0.47) {
    insights.push('Your lower-body proportions read long, so cropped pants may rise higher than product photos suggest.');
  } else if ((inseamCm / Math.max(heightCm, 1)) < 0.42) {
    insights.push('Your inseam reads shorter relative to height, so full-length pants may stack sooner and need hemming less often.');
  }

  if (Math.abs(shoulderWidthCm - hipWidthCm) < 2.5) {
    insights.push('Your frame reads visually even from top to bottom, so center-balanced silhouettes should fit more predictably.');
  }

  if (chestCircumferenceCm && waistCircumferenceCm) {
    if ((chestCircumferenceCm / Math.max(waistCircumferenceCm, 1)) > 1.16) {
      insights.push('Your chest reads noticeably fuller than your waist, so structured jackets and tees with more room through the chest should feel cleaner.');
    } else if ((chestCircumferenceCm / Math.max(waistCircumferenceCm, 1)) < 1.04) {
      insights.push('Your chest and waist read close in volume, which usually works well with straight-cut tops and minimal taper.');
    }
  }

  if (hipCircumferenceCm && waistCircumferenceCm) {
    if ((waistCircumferenceCm / Math.max(hipCircumferenceCm, 1)) < 0.92) {
      insights.push('Your waist is read slimmer than your hips, so trousers with room in the seat and a cleaner taper may fit better.');
    }
  }

  if (chestToWaistRatio && chestToWaistRatio > 1.18) {
    insights.push('A larger chest-to-waist ratio usually means button-downs and hoodies should be checked for chest pull before anything else.');
  } else if (waistToHipRatio && waistToHipRatio < 0.88) {
    insights.push('Your waist-to-hip reading suggests a stronger curve through the lower body, so pant rise and seat room are worth watching.');
  }

  if (reliability < 70) {
    insights.push('This scan is usable, but another pass with stronger light and a steadier pose should tighten the measurement margin.');
  }

  return insights.slice(0, 5);
}

export function buildGarmentGuidance(bodyModel, garmentType = 'tee') {
  if (!bodyModel?.measurements) return [];

  const type = String(garmentType || 'tee').toLowerCase();
  const {
    shoulderWidthCm,
    hipWidthCm,
    torsoLengthCm,
    sleeveLengthCm,
    inseamCm,
    shoulderToHipRatio,
    chestCircumferenceCm,
    waistCircumferenceCm,
    hipCircumferenceCm,
    chestToWaistRatio,
    waistToHipRatio
  } = bodyModel.measurements;

  const guidance = [];
  const balancedFrame = Math.abs(shoulderWidthCm - hipWidthCm) < 2.5;
  const longTorso = torsoLengthCm / Math.max(bodyModel.measurements.heightCm || 1, 1) > 0.31;
  const longArms = sleeveLengthCm / Math.max(bodyModel.measurements.heightCm || 1, 1) > 0.28;
  const longLegs = inseamCm / Math.max(bodyModel.measurements.heightCm || 1, 1) > 0.47;
  const chestLead = Number(chestCircumferenceCm) - Number(waistCircumferenceCm);
  const hipLead = Number(hipCircumferenceCm) - Number(waistCircumferenceCm);

  const addBalancedNote = () => {
    if (balancedFrame) {
      guidance.push('Your frame is well balanced, so standard straight fits should be a safe starting point.');
    } else if (shoulderToHipRatio > 1.08) {
      guidance.push('Your upper frame leads a little wider, so structured shoulders and cleaner top seams will matter more.');
    } else if (shoulderToHipRatio < 0.92) {
      guidance.push('Your lower frame leads a little wider, so relaxed tops and clean drape across the waist should feel easier.');
    }
  };

  addBalancedNote();

  const garmentNotes = {
    tee: [
      'Tee fit: start with true to size if you want a close but not tight look.',
      longTorso ? 'Because your torso reads longer, check shirt length so the hem does not sit too high.' : 'Your torso length looks regular enough for most standard tee lengths.',
      Number.isFinite(chestLead) && chestLead > 12 ? 'A roomier chest cut will probably feel better than a very slim tee.' : 'Most regular tees should balance well through the chest.'
    ],
    shirt: [
      'Shirt fit: collar and shoulder seams should be the first things to check.',
      longArms ? 'Sleeves may need a slightly longer cut to avoid wrist exposure.' : 'Sleeve length looks compatible with most standard woven shirts.',
      Number.isFinite(chestCircumferenceCm) && Number.isFinite(waistCircumferenceCm)
        ? `Button-downs should allow a little room through the chest, especially with a chest-to-waist ratio around ${chestToWaistRatio?.toFixed?.(2) || 'N/A'}.`
        : 'Check the chest panel first if you prefer cleaner button-down drape.'
    ],
    hoodie: [
      'Hoodie fit: true to size should keep the body relaxed without too much drop in the shoulder.',
      balancedFrame ? 'Your proportions should work well with regular hoodie silhouettes.' : 'If you want a cleaner shape, avoid extremely oversized hoodies.',
      Number.isFinite(chestLead) && chestLead > 10 ? 'Look for a hoodie with enough chest room so the front panel does not pull.' : 'A standard hoodie should feel easy through the body.'
    ],
    jacket: [
      'Jacket fit: shoulder width is the anchor, so watch structured seams and chest room.',
      longTorso ? 'A regular jacket may ride up, so pay attention to body length before sizing down.' : 'Most standard jacket lengths should sit in a normal range.',
      Number.isFinite(chestLead) && chestLead > 12 ? 'Check the chest measurement carefully so the jacket closes cleanly without stress.' : 'A regular shell jacket should likely work without much chest strain.'
    ],
    jeans: [
      'Jeans fit: inseam is the main check, so compare hem break and stacking.',
      longLegs ? 'Cropped jeans may land shorter than you expect, so read inseam carefully.' : 'Regular inseam lengths should be a safe starting point.',
      Number.isFinite(hipLead) && hipLead > 10 ? 'Seat room matters more than waist alone, so watch the hip and upper-thigh area.' : 'A straight jean should likely balance fine through the seat.'
    ],
    trousers: [
      'Trousers fit: seat and inseam are the big checks for a clean line.',
      longLegs ? 'If you want a clean break, look for a slightly longer inseam or a tailored hem.' : 'Standard trouser lengths should be easy to tune with a minor hem.',
      Number.isFinite(waistToHipRatio) && waistToHipRatio < 0.88 ? 'Higher-rise trousers or a fuller seat may feel cleaner than a narrow taper.' : 'Most tailored trouser cuts should stay predictable.'
    ],
    activewear: [
      'Activewear fit: favor stretch and mobility over tight structure.',
      balancedFrame ? 'Your proportions should work well with most athletic cuts.' : 'Prioritize shoulder and hip mobility so the fabric does not pull.',
      Number.isFinite(chestCircumferenceCm) ? 'If you want compression, size around the chest circumference first and let stretch do the rest.' : 'Stretch fabrics will help smooth out small fit errors.'
    ]
  };

  const selected = garmentNotes[type] || garmentNotes.tee;
  guidance.push(...selected);

  if (longArms && type !== 'shirt') {
    guidance.push('Longer sleeves may feel shorter on you, so check cuff placement before buying.');
  }

  if (type === 'shirt' || type === 'jacket') {
    guidance.push('Chest room and shoulder seams are the two most important checks for a polished upper-body fit.');
  }

  if (type === 'jeans' || type === 'trousers') {
    guidance.push('Hip and seat circumference are more important than waist alone when you want a clean drape.');
  }

  return guidance.slice(0, 5);
}

export function buildQualityReasons(qualityBreakdown, context = {}) {
  if (!qualityBreakdown) return [];

  const reasons = [];
  const { visibility = 0, framing = 0, posture = 0, coverage = 0 } = qualityBreakdown;
  const { lowLight, autoStart } = context;

  if (visibility < 70) {
    reasons.push('Visibility is the main limiter. A brighter room or cleaner background should improve the score fast.');
  } else {
    reasons.push('Visibility was strong, so the scanner could read the core landmarks with decent stability.');
  }

  if (framing < 70) {
    reasons.push('Your body was a little off-center in parts of the scan. Keeping the torso centered will help more than moving faster.');
  } else {
    reasons.push('Framing stayed fairly centered, which is a good sign for repeatable scans.');
  }

  if (posture < 72) {
    reasons.push('Posture drift lowered confidence. Standing tall with relaxed shoulders and still feet should tighten the estimate.');
  } else {
    reasons.push('Posture stayed controlled enough to support a reliable measurement pass.');
  }

  if (coverage < 100) {
    reasons.push('A full four-step capture makes the model more dependable, so finishing every view helps the final score.');
  }

  if (lowLight) {
    reasons.push('Low light was detected, which usually reduces landmark confidence and raises the error margin.');
  }

  if (!autoStart) {
    reasons.push('Auto-start is disabled, so you have more control over when each capture begins.');
  }

  return reasons.slice(0, 4);
}

export function compareBodyModels(currentModel, previousModel) {
  const current = currentModel?.measurements;
  const previous = previousModel?.measurements;
  if (!current || !previous) return null;

  const deltas = [
    ['Shoulders', current.shoulderWidthCm - previous.shoulderWidthCm],
    ['Chest', (current.chestCircumferenceCm || 0) - (previous.chestCircumferenceCm || 0)],
    ['Waist', (current.waistCircumferenceCm || 0) - (previous.waistCircumferenceCm || 0)],
    ['Hip Circ.', (current.hipCircumferenceCm || 0) - (previous.hipCircumferenceCm || 0)],
    ['Hip Width', current.hipWidthCm - previous.hipWidthCm],
    ['Torso', current.torsoLengthCm - previous.torsoLengthCm],
    ['Depth', (current.torsoDepthCm || 0) - (previous.torsoDepthCm || 0)],
    ['Sleeve', current.sleeveLengthCm - previous.sleeveLengthCm],
    ['Inseam', current.inseamCm - previous.inseamCm]
  ]
    .map(([label, changeCm]) => ({
      label,
      changeCm: roundTo(changeCm, 1)
    }))
    .filter((item) => Math.abs(item.changeCm) >= 0.3)
    .sort((a, b) => Math.abs(b.changeCm) - Math.abs(a.changeCm));

  if (!deltas.length) {
    return {
      summary: 'This scan is very close to your previous saved record.',
      deltas: []
    };
  }

  const lead = deltas[0];
  const direction = lead.changeCm > 0 ? 'higher' : 'lower';
  return {
    summary: `${lead.label} reads ${Math.abs(lead.changeCm).toFixed(1)} cm ${direction} than your previous saved scan.`,
    deltas: deltas.slice(0, 4)
  };
}

export function buildReportText(scanRecord) {
  if (!scanRecord?.bodyModel?.measurements) return '';

  const { bodyModel, quality, timestamp, garmentFocus, qualityBreakdown, qualityReasons, comparison } = scanRecord;
  const measurements = bodyModel.measurements;
  const ranges = bodyModel.measurementRanges || {};
  const integrityLine = Number.isFinite(Number(bodyModel.measurementIntegrity))
    ? [`Measurement integrity: ${Math.round(Number(bodyModel.measurementIntegrity))}%`]
    : [];
  const lines = [
    'FitVision scan report',
    `Date: ${new Date(timestamp || Date.now()).toLocaleString()}`,
    `Body type: ${bodyModel.bodyType || 'Unknown'}`,
    `Recommended size: ${bodyModel.size || bodyModel.recommendedSize || 'N/A'}`,
    `Garment focus: ${formatGarmentLabel(garmentFocus)}`,
    `Scan quality: ${Math.round(quality || 0)}%`,
    `Confidence: ${Math.round((bodyModel.confidence || 0) * 100)}%`,
    ...integrityLine,
    '',
    'Measurements',
    `Height: ${formatCmWithRange(measurements.heightCm, ranges.heightCm)}`,
    `Shoulders: ${formatCmWithRange(measurements.shoulderWidthCm, ranges.shoulderWidthCm)}`,
    `Chest circumference: ${formatCmWithRange(measurements.chestCircumferenceCm, ranges.chestCircumferenceCm)}`,
    `Waist circumference: ${formatCmWithRange(measurements.waistCircumferenceCm, ranges.waistCircumferenceCm)}`,
    `Hip circumference: ${formatCmWithRange(measurements.hipCircumferenceCm, ranges.hipCircumferenceCm)}`,
    `Hip width: ${formatCmWithRange(measurements.hipWidthCm, ranges.hipWidthCm)}`,
    `Torso: ${formatCmWithRange(measurements.torsoLengthCm, ranges.torsoLengthCm)}`,
    `Torso depth: ${formatCmWithRange(measurements.torsoDepthCm, ranges.torsoDepthCm)}`,
    `Sleeve: ${formatCmWithRange(measurements.sleeveLengthCm, ranges.sleeveLengthCm)}`,
    `Leg length: ${formatCmWithRange(measurements.legLengthCm, ranges.legLengthCm)}`,
    `Inseam: ${formatCmWithRange(measurements.inseamCm, ranges.inseamCm)}`,
    `Chest-to-waist ratio: ${formatRatio(measurements.chestToWaistRatio)}`,
    `Waist-to-hip ratio: ${formatRatio(measurements.waistToHipRatio)}`,
    '',
    'Quality breakdown',
    `Visibility: ${Math.round(qualityBreakdown?.visibility || 0)}%`,
    `Framing: ${Math.round(qualityBreakdown?.framing || 0)}%`,
    `Posture: ${Math.round(qualityBreakdown?.posture || 0)}%`,
    `Coverage: ${Math.round(qualityBreakdown?.coverage || 0)}%`
  ];

  lines.push('', 'Accuracy note', 'These measurements are camera-estimated and include a confidence range that widens when the scan quality drops.');

  const confidenceEntries = Object.entries(bodyModel.measurementConfidence || {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4);
  if (confidenceEntries.length) {
    lines.push(
      '',
      'Measurement confidence',
      ...confidenceEntries.map(([key, value]) => `- ${formatMeasurementName(key)}: ${formatConfidenceLabel(value)}`)
    );
  }

  if (Array.isArray(bodyModel.fitInsights) && bodyModel.fitInsights.length) {
    lines.push('', 'Fit guidance', ...bodyModel.fitInsights.map((item) => `- ${item}`));
  }

  if (Array.isArray(bodyModel.garmentGuidance) && bodyModel.garmentGuidance.length) {
    lines.push('', 'Garment guidance', ...bodyModel.garmentGuidance.map((item) => `- ${item}`));
  }

  if (Array.isArray(qualityReasons) && qualityReasons.length) {
    lines.push('', 'Quality reasons', ...qualityReasons.map((item) => `- ${item}`));
  }

  if (Array.isArray(bodyModel.measurementWarnings) && bodyModel.measurementWarnings.length) {
    lines.push('', 'Measurement warnings', ...bodyModel.measurementWarnings.map((item) => `- ${item}`));
  }

  if (comparison?.summary) {
    lines.push('', 'Comparison', comparison.summary);
  }

  return lines.join('\n');
}

function formatGarmentLabel(garmentFocus) {
  const labels = {
    tee: 'Tee',
    shirt: 'Shirt',
    hoodie: 'Hoodie',
    jacket: 'Jacket',
    jeans: 'Jeans',
    trousers: 'Trousers',
    activewear: 'Activewear'
  };
  return labels[String(garmentFocus || 'tee').toLowerCase()] || 'General';
}

function roundTo(value, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function formatCm(value, decimals = 1, fallback = 'N/A') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return `${numeric.toFixed(decimals)} cm`;
}

function formatCmWithRange(value, range, decimals = 1) {
  const base = formatCm(value, decimals);
  if (!range || !Number.isFinite(Number(range.marginCm))) {
    return base;
  }

  const label = range.confidenceLabel || formatConfidenceLabel(range.confidence);
  return `${base} +/- ${Number(range.marginCm).toFixed(decimals)} cm (${label})`;
}

function formatRatio(value, decimals = 2, fallback = 'N/A') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric.toFixed(decimals);
}

function formatConfidenceLabel(confidence) {
  const numeric = Number(confidence);
  if (!Number.isFinite(numeric)) return 'Estimated';
  if (numeric >= 0.82) return 'High confidence';
  if (numeric >= 0.65) return 'Good confidence';
  if (numeric >= 0.48) return 'Fair confidence';
  return 'Low confidence';
}

function averageConfidence(map) {
  if (!map || typeof map !== 'object') return 0;
  const values = Object.values(map)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
    chestCircumferenceCm: 'Chest circumference',
    waistCircumferenceCm: 'Waist circumference',
    hipCircumferenceCm: 'Hip circumference'
  };
  return labels[key] || key;
}
