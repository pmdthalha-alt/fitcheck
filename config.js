/**
 * FitCheck AI - Configuration Module
 * Advanced settings for pose detection and clothing analysis
 */

const CONFIG = {
  // API Configuration
  API: {
    PORT: process.env.PORT || 5000,
    HOST: 'localhost',
    TIMEOUT: 30000,
    MAX_REQUESTS_PER_MINUTE: 100
  },

  // Pose Detection Settings
  POSE_DETECTION: {
    MODEL_COMPLEXITY: 1, // 0 (lite), 1 (full), 2 (heavy)
    MIN_DETECTION_CONFIDENCE: 0.5,
    MIN_TRACKING_CONFIDENCE: 0.5,
    SMOOTH_LANDMARKS: true,
    ENABLE_SEGMENTATION: false,
    FRAME_INTERVAL: 1 // Process every Nth frame (1 = all frames)
  },

  // Clothing Detection Settings
  CLOTHING_DETECTION: {
    MIN_CONFIDENCE: 0.6,
    MAX_DISTANCE_THRESHOLD: 0.3,
    VISIBILITY_THRESHOLD: 0.5,
    ENABLE_MULTI_ITEM: true,
    CACHE_RESULTS: true,
    CACHE_DURATION: 2000 // ms
  },

  // Scoring System
  SCORING: {
    BASE_POINTS: 50,
    CONFIDENCE_MULTIPLIER: 100,
    FIT_BONUS: 25,
    VISIBILITY_BONUS: 15,
    MAX_SCORE: 500,
    DECAY_RATE: 0.95 // Points decay over time if not confirmed
  },

  // Canvas Rendering
  RENDERING: {
    SKELETON_COLOR: '#cccccc',
    JOINT_COLOR: '#00ffcc',
    BOUNDING_BOX_COLOR: '#0066ff',
    BOUNDING_BOX_STYLE: 'dashed',
    LINE_WIDTH: 2,
    JOINT_RADIUS: 4,
    BACKGROUND_ALPHA: 0.75,
    FPS_LIMIT: 30
  },

  // Body Parts for Analysis
  BODY_PARTS: {
    HEAD: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    TORSO: [11, 12, 13, 14, 15, 16, 23, 24],
    ARMS: [13, 14, 15, 16],
    LEGS: [23, 24, 25, 26, 27, 28],
    FULL_BODY: Array.from({ length: 33 }, (_, i) => i)
  },

  // Clothing Categories with Landmarks
  CLOTHING_CATEGORIES: {
    UPPER_WEAR: {
      landmarks: [11, 12, 13, 14, 15, 16],
      weight: 0.4
    },
    LOWER_WEAR: {
      landmarks: [23, 24, 25, 26, 27, 28],
      weight: 0.3
    },
    ACCESSORIES: {
      landmarks: [0, 1, 2, 3],
      weight: 0.3
    }
  },

  // Feature Thresholds
  THRESHOLDS: {
    GOOD_VISIBILITY: 0.8,
    ACCEPTABLE_VISIBILITY: 0.5,
    POSE_STABILITY: 0.85,
    DETECTION_MATCH: 0.7
  },

  // Logging
  LOGGING: {
    LEVEL: 'info', // 'debug', 'info', 'warn', 'error'
    LOG_DETECTIONS: true,
    LOG_API_CALLS: true,
    LOG_PERFORMANCE: true
  },

  // Performance
  PERFORMANCE: {
    ENABLE_PROFILING: false,
    BENCHMARK_INTERVAL: 60000, // 1 minute
    MAX_CONCURRENT_WORKERS: 4
  }
};

// Export for use in server
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
