const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const CONFIG = require('./config.js');

const app = express();
const PORT = CONFIG.API.PORT;

// MIDDLEWARE
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// ENHANCED CLOTHING DATABASE
const clothingDatabase = [
  {
    id: 1,
    name: 'Black Premium Hoodie',
    confidence: 0.95,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 100,
    sizes: { small: 0.85, medium: 1.0, large: 1.2 },
    fitFor: ['athletic', 'casual']
  },
  {
    id: 2,
    name: 'White T-Shirt',
    confidence: 0.92,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 50,
    sizes: { small: 0.9, medium: 1.0, large: 1.15 },
    fitFor: ['casual', 'comfort']
  },
  {
    id: 3,
    name: 'Blue Jeans',
    confidence: 0.88,
    bodyParts: ['hip', 'leg'],
    points: 75,
    sizes: { small: 0.95, medium: 1.0, large: 1.1 },
    fitFor: ['casual', 'everyday']
  },
  {
    id: 4,
    name: 'Fitted Blazer',
    confidence: 0.91,
    bodyParts: ['shoulder', 'torso'],
    points: 110,
    sizes: { small: 0.8, medium: 1.0, large: 1.25 },
    fitFor: ['formal', 'business']
  },
  {
    id: 5,
    name: 'Athletic Shorts',
    confidence: 0.87,
    bodyParts: ['hip', 'leg'],
    points: 65,
    sizes: { small: 0.9, medium: 1.0, large: 1.2 },
    fitFor: ['athletic', 'casual']
  },
  {
    id: 6,
    name: 'Leather Jacket',
    confidence: 0.93,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 120,
    sizes: { small: 0.75, medium: 1.0, large: 1.3 },
    fitFor: ['casual', 'statement']
  }
];

// HELPER FUNCTIONS
function distance(p1, p2) {
  if (!p1 || !p2) return 0;
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function getBodyMetrics(landmarks) {
  if (!landmarks || landmarks.length < 33) return null;

  return {
    shoulderWidth: Math.abs(landmarks[12].x - landmarks[11].x),
    chestWidth: Math.abs(landmarks[12].x - landmarks[11].x) * 0.95,
    torsoLength: distance(landmarks[11], landmarks[23]),
    armLength: distance(landmarks[12], landmarks[16]),
    legLength: distance(landmarks[23], landmarks[27]),
    hipWidth: Math.abs(landmarks[24].x - landmarks[23].x),
    heightEstimate: distance(landmarks[0], landmarks[27]) || 1.7,
    visibilityScore: (landmarks.filter(l => l.visibility > 0.5).length / landmarks.length)
  };
}

function getBodySize(metrics) {
  if (!metrics) return 'medium';
  
  const shoulderWidth = metrics.shoulderWidth;
  if (shoulderWidth > 0.25) return 'large';
  if (shoulderWidth < 0.18) return 'small';
  return 'medium';
}

function analyzeBodyShape(metrics) {
  const size = getBodySize(metrics);
  let description = '';
  let recommendations = [];

  if (size === 'large') {
    description = 'Athletic/Muscular build with broad shoulders';
    recommendations = [
      'Look for fitted items with stretch',
      'Wide sleeve openings recommended',
      'Tapered fits work best'
    ];
  } else if (size === 'small') {
    description = 'Petite frame with narrow shoulders';
    recommendations = [
      'Opt for petite/tailored sizes',
      'Avoid oversized items',
      'Tapered cuts prevent drowning in fabric'
    ];
  } else {
    description = 'Well-balanced, standard proportions';
    recommendations = [
      'Standard sizes fit well',
      'Focus on length adjustments',
      'Most styles complement'
    ];
  }

  return { description, recommendations, size };
}

function calculateFitScore(metrics, item) {
  if (!metrics || !item) return 0;

  let score = item.confidence;
  const bodySize = getBodySize(metrics);
  
  // Apply size multiplier
  if (item.sizes && item.sizes[bodySize]) {
    score *= item.sizes[bodySize];
  }

  // Visibility bonus
  score *= metrics.visibilityScore;

  return Math.min(score, 0.99);
}

// ENDPOINTS

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'FitCheck AI Pro',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Advanced Detection with Body Analysis
app.post('/api/advanced-detect', (req, res) => {
  try {
    const { pose, metrics } = req.body;

    if (!pose || !Array.isArray(pose)) {
      return res.json({
        detectedItems: ['Waiting for pose...'],
        confidence: 0,
        points: 0
      });
    }

    // Get metrics if not provided
    const bodyMetrics = metrics || getBodyMetrics(pose);
    const bodySize = getBodySize(bodyMetrics);
    const shapeAnalysis = analyzeBodyShape(bodyMetrics);

    // Find best matching items
    let bestMatches = [];
    clothingDatabase.forEach(item => {
      const fitScore = calculateFitScore(bodyMetrics, item);
      if (fitScore > 0.6) {
        bestMatches.push({
          ...item,
          fitScore: fitScore,
          sizeFit: bodySize
        });
      }
    });

    // Sort by fit score
    bestMatches.sort((a, b) => b.fitScore - a.fitScore);

    const topMatches = bestMatches.slice(0, 3);
    const avgConfidence = topMatches.length > 0 
      ? topMatches.reduce((sum, item) => sum + item.fitScore, 0) / topMatches.length
      : bodyMetrics.visibilityScore;

    const totalPoints = topMatches.reduce((sum, item) => sum + (item.points * item.fitScore), 0);

    res.json({
      detectedItems: topMatches.map(item => item.name),
      confidence: Math.min(avgConfidence, 0.99),
      points: Math.round(totalPoints),
      bodySize: bodySize,
      shapeAnalysis: shapeAnalysis,
      metrics: bodyMetrics,
      detailedMatches: topMatches,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Advanced detection error:', err);
    res.status(500).json({ error: 'Detection failed', message: err.message });
  }
});

// Legacy Detect Endpoint
app.post('/api/detect', (req, res) => {
  try {
    const { pose } = req.body;

    if (!pose) {
      return res.json({
        detectedItem: 'Waiting for pose...',
        confidence: 0,
        points: 0
      });
    }

    const metrics = getBodyMetrics(pose);
    const bodySize = getBodySize(metrics);

    let bestMatch = null;
    let bestScore = 0;

    clothingDatabase.forEach(item => {
      let score = item.confidence * metrics.visibilityScore;
      if (item.sizes && item.sizes[bodySize]) {
        score *= item.sizes[bodySize];
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    });

    res.json({
      detectedItem: bestMatch?.name || 'Unknown',
      confidence: Math.min(bestScore, 0.99),
      points: Math.round((bestScore * bestMatch?.points) || 0),
      metrics: metrics
    });
  } catch (err) {
    console.error('Detection error:', err);
    res.status(500).json({ error: 'Detection failed' });
  }
});

// Body Measurements Endpoint
app.post('/api/measurements', (req, res) => {
  try {
    const { pose } = req.body;

    if (!pose) {
      return res.status(400).json({ error: 'No pose data' });
    }

    const metrics = getBodyMetrics(pose);
    const cm = (value) => (value * 170).toFixed(1); // Normalize to cm

    res.json({
      measurements: {
        shoulderWidth: cm(metrics.shoulderWidth),
        chestWidth: cm(metrics.chestWidth),
        torsoLength: cm(metrics.torsoLength),
        armLength: cm(metrics.armLength),
        legLength: cm(metrics.legLength),
        hipWidth: cm(metrics.hipWidth),
        heightEstimate: cm(metrics.heightEstimate)
      },
      unit: 'cm',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Measurements failed' });
  }
});

// Body Analysis Endpoint
app.post('/api/body-analysis', (req, res) => {
  try {
    const { pose } = req.body;

    if (!pose) {
      return res.status(400).json({ error: 'No pose data' });
    }

    const metrics = getBodyMetrics(pose);
    const analysis = analyzeBodyShape(metrics);

    res.json({
      bodySize: analysis.size,
      description: analysis.description,
      recommendations: analysis.recommendations,
      metrics: metrics,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Outfit Recommendation Endpoint
app.post('/api/recommendations', (req, res) => {
  try {
    const { pose } = req.body;

    if (!pose) {
      return res.status(400).json({ error: 'No pose data' });
    }

    const metrics = getBodyMetrics(pose);
    const bodySize = getBodySize(metrics);
    const analysis = analyzeBodyShape(metrics);

    const recommendations = clothingDatabase.map(item => ({
      name: item.name,
      fitScore: calculateFitScore(metrics, item),
      sizeRecommended: bodySize,
      reason: analysis.description
    })).sort((a, b) => b.fitScore - a.fitScore);

    res.json({
      recommendations: recommendations.slice(0, 5),
      bodyAnalysis: analysis,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Recommendations failed' });
  }
});

// Clothing Database
app.get('/api/clothing', (req, res) => {
  res.json({
    total: clothingDatabase.length,
    items: clothingDatabase,
    timestamp: new Date().toISOString()
  });
});

// Statistics
app.get('/api/stats', (req, res) => {
  res.json({
    clothingItems: clothingDatabase.length,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// START SERVER
const server = app.listen(PORT, () => {
  console.log(`\n🎯 FitCheck AI Pro Server Active`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`\n📊 API Endpoints:`);
  console.log(`  ✓ POST /api/advanced-detect - Advanced body detection`);
  console.log(`  ✓ POST /api/detect - Basic detection`);
  console.log(`  ✓ POST /api/measurements - Get body measurements`);
  console.log(`  ✓ POST /api/body-analysis - Analyze body shape`);
  console.log(`  ✓ POST /api/recommendations - Get fit recommendations`);
  console.log(`  ✓ GET /api/clothing - Clothing database`);
  console.log(`  ✓ GET /api/health - Health check`);
  console.log(`  ✓ GET /api/stats - Server statistics`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

module.exports = app;
