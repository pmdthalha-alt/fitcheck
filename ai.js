/*
 * FitVision - AI logic (heuristic, deterministic analysis)
 * This module provides body type classification, size recommendation, and confidence scoring.
 */

export function predictBodyType(bodyModel) {
  if (!bodyModel || !bodyModel.proportions) return 'Unknown';

  const { shoulderToHeight, torsoToHeight } = bodyModel.proportions;

  // Basic heuristic based on shoulder/height ratio
  // More muscular/broad builds tend to have higher shoulder-to-height ratio.
  if (shoulderToHeight > 0.26) return 'Broad';
  if (shoulderToHeight < 0.20) return 'Slim';
  return 'Regular';
}

export function recommendSize(bodyModel) {
  if (!bodyModel) return 'M';

  // Simple size recommendation based on height and shoulder width
  const height = parseInt((bodyModel.height || '').replace(/[^0-9]/g, ''), 10) || 170;
  const shoulder = parseInt((bodyModel.shoulderWidth || '').replace(/[^0-9]/g, ''), 10) || 45;

  // Rough size table
  const sizeByHeight = height < 165 ? -1 : height < 175 ? 0 : height < 185 ? 1 : 2;
  const sizeByShoulder = shoulder < 42 ? -1 : shoulder < 47 ? 0 : shoulder < 52 ? 1 : 2;

  const score = sizeByHeight + sizeByShoulder;
  if (score <= -2) return 'XS';
  if (score === -1) return 'S';
  if (score === 0) return 'M';
  if (score === 1) return 'L';
  return 'XL';
}

export function computeConfidence(bodyModel, qualityScore) {
  const base = Math.min(1, Math.max(0, (qualityScore || 0) / 100));
  const shapeCertainty = bodyModel && bodyModel.raw && bodyModel.raw.shouldertoHipRatio ? 0.1 : 0;
  return Math.min(1, base + shapeCertainty);
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
