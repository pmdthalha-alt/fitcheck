const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const CONFIG = require('./config.js');
const {
  aggregateOutfit,
  clothingDatabase,
  detectFromPose,
  formatMeasurements,
  getBodyMetrics,
  getClothingByCategory,
  isValidPose,
  recommendOutfits
} = require('./backend-core.js');

const app = express();
const PORT = Number(CONFIG.API.PORT) || 5000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

function getPoseFromRequest(req, res) {
  const pose = req.body?.pose;
  if (!Array.isArray(pose) || !isValidPose(pose)) {
    res.status(400).json({ error: 'Invalid pose data. Expected an array of 33 landmarks.' });
    return null;
  }

  return pose;
}

function getPosesFromRequest(req, res) {
  const poses = req.body?.poses;
  if (!Array.isArray(poses) || poses.length === 0) {
    res.status(400).json({ error: 'No pose data provided.' });
    return null;
  }

  const invalidIndex = poses.findIndex((pose) => !isValidPose(pose));
  if (invalidIndex !== -1) {
    res.status(400).json({ error: `Invalid pose at index ${invalidIndex}. Expected 33 landmarks.` });
    return null;
  }

  return poses;
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'FitCheck AI',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.post('/api/advanced-detect', (req, res) => {
  try {
    const pose = getPoseFromRequest(req, res);
    if (!pose) return;

    const result = detectFromPose(pose);

    res.json({
      detectedItems: result.detectedItems,
      confidence: result.confidence,
      points: result.points,
      bodySize: result.bodySize,
      shapeAnalysis: result.shapeAnalysis,
      metrics: result.metrics,
      detailedMatches: result.topMatches,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Advanced detection error:', error);
    res.status(500).json({ error: 'Detection failed', message: error.message });
  }
});

app.post('/api/detect', (req, res) => {
  try {
    const pose = getPoseFromRequest(req, res);
    if (!pose) return;

    const result = detectFromPose(pose, { topN: 1 });
    const bestMatch = result.bestMatch;

    res.json({
      detectedItem: bestMatch?.name || 'Unknown',
      confidence: bestMatch?.fitScore ?? result.confidence,
      points: Math.round((bestMatch?.points || 0) * (bestMatch?.fitScore || 0)),
      metrics: result.metrics,
      bodySize: result.bodySize,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Detection error:', error);
    res.status(500).json({ error: 'Detection failed', message: error.message });
  }
});

app.post('/api/measurements', (req, res) => {
  try {
    const pose = getPoseFromRequest(req, res);
    if (!pose) return;

    const metrics = getBodyMetrics(pose);
    res.json({
      measurements: formatMeasurements(metrics),
      metrics,
      unit: 'cm',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Measurements failed', message: error.message });
  }
});

app.post('/api/body-analysis', (req, res) => {
  try {
    const pose = getPoseFromRequest(req, res);
    if (!pose) return;

    const result = detectFromPose(pose, { topN: 1 });
    res.json({
      bodySize: result.bodySize,
      description: result.shapeAnalysis.description,
      recommendations: result.shapeAnalysis.recommendations,
      metrics: result.metrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Analysis failed', message: error.message });
  }
});

app.post('/api/recommendations', (req, res) => {
  try {
    const pose = getPoseFromRequest(req, res);
    if (!pose) return;

    const result = detectFromPose(pose, { topN: 1 });
    res.json({
      recommendations: recommendOutfits(pose, 5),
      bodyAnalysis: result.shapeAnalysis,
      bodySize: result.bodySize,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Recommendations failed', message: error.message });
  }
});

app.post('/api/analyze-outfit', (req, res) => {
  try {
    const poses = getPosesFromRequest(req, res);
    if (!poses) return;

    const summary = aggregateOutfit(poses);
    res.json({
      ...summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Outfit analysis failed', message: error.message });
  }
});

app.get('/api/clothing', (req, res) => {
  res.json({
    total: clothingDatabase.length,
    items: clothingDatabase,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/clothing/:category', (req, res) => {
  const category = req.params.category.toLowerCase();
  const items = getClothingByCategory(category);

  res.json({
    category,
    total: items.length,
    items,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    clothingItems: clothingDatabase.length,
    supportedEndpoints: 10,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`FitCheck AI server listening on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET  /api/health');
    console.log('  POST /api/advanced-detect');
    console.log('  POST /api/detect');
    console.log('  POST /api/measurements');
    console.log('  POST /api/body-analysis');
    console.log('  POST /api/recommendations');
    console.log('  POST /api/analyze-outfit');
    console.log('  GET  /api/clothing');
    console.log('  GET  /api/clothing/:category');
    console.log('  GET  /api/stats');
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = app;
