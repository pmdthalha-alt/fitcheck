/**
 * FitCheck AI - Advanced Server Implementation
 * Uses configuration and utilities for enhanced detection
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const CONFIG = require('./config.js');
const {
  distance,
  getBodyMetrics,
  getVisibilityScore,
  calculateConfidence,
  calculatePoints,
  isValidPose,
  PoseSmoother
} = require('./utils.js');

const app = express();
const PORT = CONFIG.API.PORT;

// MIDDLEWARE
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// POSE SMOOTHING
const poseSmoothers = new Map(); // Per-user smoothing

// CLOTHING DATABASE
const clothingDatabase = [
  {
    id: 1,
    name: 'Black Premium Hoodie',
    confidence: 0.95,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 100
  },
  {
    id: 2,
    name: 'White T-Shirt',
    confidence: 0.92,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 50
  },
  {
    id: 3,
    name: 'Blue Jeans',
    confidence: 0.88,
    bodyParts: ['hip', 'leg'],
    points: 75
  },
  {
    id: 4,
    name: 'Sneakers',
    confidence: 0.90,
    bodyParts: ['ankle', 'foot'],
    points: 50
  },
  {
    id: 5,
    name: 'Baseball Cap',
    confidence: 0.87,
    bodyParts: ['head'],
    points: 60
  },
  {
    id: 6,
    name: 'Leather Jacket',
    confidence: 0.93,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 120
  }
];

// LOGGING UTILITY
function logger(level, message, data = {}) {
  if (CONFIG.LOGGING.LEVEL !== 'debug' && level === 'debug') return;
  
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, 
    Object.keys(data).length > 0 ? data : '');
}

// ENHANCED DETECTION
function detectClothingAdvanced(landmarks, userId = 'default') {
  // Validation
  if (!isValidPose(landmarks)) {
    logger('warn', 'Invalid pose received');
    return {
      detectedItem: 'Invalid pose',
      confidence: 0,
      points: 0
    };
  }

  // Smoothing
  if (!poseSmoothers.has(userId)) {
    poseSmoothers.set(userId, new PoseSmoother(CONFIG.CLOTHING_DETECTION.CACHE_DURATION / 100));
  }
  
  const smoother = poseSmoothers.get(userId);
  smoother.add(landmarks);
  const smoothedPose = smoother.getSmoothed();

  // Get metrics
  const metrics = getBodyMetrics(smoothedPose);
  const visibilityScore = getVisibilityScore(smoothedPose);

  // Analyze torso coverage
  const torsoIndices = CONFIG.BODY_PARTS.TORSO;
  const torsoCoverage = (torsoIndices.filter(i => 
    smoothedPose[i] && smoothedPose[i].visibility > CONFIG.CLOTHING_DETECTION.VISIBILITY_THRESHOLD
  ).length) / torsoIndices.length;

  // Match against database
  let bestMatch = null;
  let bestConfidence = 0;

  clothingDatabase.forEach(item => {
    let matchConfidence = item.confidence * visibilityScore * torsoCoverage;
    
    // Body part bonus
    if (item.bodyParts.includes('torso') && torsoCoverage > 0.7) {
      matchConfidence *= 1.2;
    }
    if (item.bodyParts.includes('arm') && getVisibilityScore([smoothedPose[14], smoothedPose[16]]) > 0.7) {
      matchConfidence *= 1.1;
    }

    if (matchConfidence > bestConfidence && matchConfidence >= CONFIG.CLOTHING_DETECTION.MIN_CONFIDENCE) {
      bestConfidence = matchConfidence;
      bestMatch = item;
    }
  });

  if (!bestMatch) {
    return {
      detectedItem: 'Casual Wear',
      confidence: Math.min(visibilityScore, 0.5),
      points: 0,
      metrics: metrics
    };
  }

  // Calculate final confidence
  const finalConfidence = calculateConfidence(
    { baseConfidence: bestConfidence },
    { landmarks: smoothedPose, stability: 0.85 }
  );

  // Calculate points
  const points = calculatePoints(
    { confidence: finalConfidence },
    { visibilityScore, stability: 0.85 }
  ) + bestMatch.points;

  const result = {
    detectedItem: bestMatch.name,
    confidence: finalConfidence,
    points: points,
    metrics: metrics,
    matchId: bestMatch.id
  };

  if (CONFIG.LOGGING.LOG_DETECTIONS) {
    logger('info', `Detection: ${bestMatch.name}`, { confidence: finalConfidence.toFixed(2), points });
  }

  return result;
}

// ENDPOINTS

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Detect Clothing
app.post('/api/detect', (req, res) => {
  try {
    const { pose, userId } = req.body;

    if (!pose) {
      return res.json({
        detectedItem: 'Waiting for pose data...',
        confidence: 0,
        points: 0
      });
    }

    const result = detectClothingAdvanced(pose, userId);
    
    res.json({
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger('error', 'Detection error', { error: err.message });
    res.status(500).json({ 
      error: 'Detection failed',
      message: err.message 
    });
  }
});

// Analyze Full Outfit
app.post('/api/analyze-outfit', (req, res) => {
  try {
    const { poses, userId } = req.body;

    if (!poses || !Array.isArray(poses) || poses.length === 0) {
      return res.status(400).json({ error: 'No pose data provided' });
    }

    const detections = poses.map(pose => detectClothingAdvanced(pose, userId));
    
    const totalScore = detections.reduce((sum, d) => sum + d.points, 0);
    const avgConfidence = detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;
    const detectedItems = [...new Set(detections.map(d => d.detectedItem))];

    res.json({
      totalScore,
      avgConfidence: avgConfidence.toFixed(2),
      detectedItems,
      fitScore: (avgConfidence * 100).toFixed(1),
      frameCount: poses.length,
      recommendation: avgConfidence > 0.8 ? '✅ Great fit!' : '⚠️ Consider adjustments',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger('error', 'Analysis error', { error: err.message });
    res.status(500).json({ 
      error: 'Analysis failed',
      message: err.message 
    });
  }
});

// Get Clothing Database
app.get('/api/clothing', (req, res) => {
  res.json({
    total: clothingDatabase.length,
    items: clothingDatabase,
    timestamp: new Date().toISOString()
  });
});

// Get Clothing by Category
app.get('/api/clothing/:category', (req, res) => {
  const category = req.params.category.toLowerCase();
  
  const filtered = clothingDatabase.filter(item => {
    if (category === 'upper' && item.bodyParts.includes('shoulder')) return true;
    if (category === 'lower' && item.bodyParts.includes('hip')) return true;
    if (category === 'accessories' && item.bodyParts.includes('head')) return true;
    return false;
  });

  res.json({
    category,
    total: filtered.length,
    items: filtered
  });
});

// Statistics
app.get('/api/stats', (req, res) => {
  res.json({
    totalUsers: poseSmoothers.size,
    clothingDatabase: clothingDatabase.length,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// START SERVER
const server = app.listen(PORT, () => {
  logger('info', `🎯 FitCheck AI Server Started`, { port: PORT });
  logger('info', `📊 API Endpoints:`, {
    detect: 'POST /api/detect',
    analyze: 'POST /api/analyze-outfit',
    clothing: 'GET /api/clothing',
    stats: 'GET /api/stats',
    health: 'GET /api/health'
  });
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger('warn', 'SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger('info', 'Server closed');
    process.exit(0);
  });
});

module.exports = app;
