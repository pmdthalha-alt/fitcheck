# 🚀 FitCheck AI - Quick Start Guide

## What Was Built

A complete AI-powered outfit and fitness detection system with:
- ✅ Real-time pose detection (MediaPipe)
- ✅ Clothing item detection with AI
- ✅ Live skeleton visualization
- ✅ Points & confidence scoring
- ✅ Modern professional UI matching your design image
- ✅ Backend REST API for detection
- ✅ Full configuration system

---

## ⚡ Quick Start (Windows)

### Option 1: One-Click Start
1. Double-click **START.bat** in the project folder
2. It will install dependencies and start the server
3. Browser will open to localhost:5000

### Option 2: Manual Start

#### Step 1: Install Dependencies
```bash
npm install
```

#### Step 2: Start Backend Server
```bash
npm start
```

You should see:
```
🎯 FitCheck AI Server running on http://localhost:5000
📊 API endpoints:
   POST /api/detect - Detect clothing from pose
   POST /api/analyze-outfit - Analyze full outfit
   GET /api/clothing - Get clothing database
   GET /api/health - Health check
```

#### Step 3: Serve Frontend
In a new terminal/command prompt:

**Using Python:**
```bash
python -m http.server 8000
```

**Or using Node:**
```bash
npx http-server
```

**Or VS Code:**
- Right-click `index.html`
- Select "Open with Live Server"

#### Step 4: Open in Browser
Visit: **http://localhost:8000** (or http://localhost:5000)

---

## 📱 How to Use

1. **Allow Camera Access** - Click allow when browser asks
2. **Stand in Frame** - Position yourself in the camera view
3. **System Detects** - Real-time pose detection starts automatically
4. **View Results** - See:
   - Skeleton overlay with joints
   - Detected clothing item
   - Confidence score
   - Points earned

### Controls
- **BLEND Slider** - Adjust overlay transparency
- **SCALE Slider** - Resize visualization  
- **POSITION Slider** - Move overlay left/right
- **Refresh Button** - Reset detection
- **× Close Button** - Exit scanner

---

## 🔌 API Usage

### Detect Clothing from Pose
```bash
curl -X POST http://localhost:5000/api/detect \
  -H "Content-Type: application/json" \
  -d '{"pose": [{"x": 0.5, "y": 0.3, "visibility": 1}, ...]}'
```

Response:
```json
{
  "detectedItem": "Black Premium Hoodie",
  "confidence": 0.95,
  "points": 100,
  "timestamp": "2024-03-17T..."
}
```

### Analyze Full Outfit
```bash
curl -X POST http://localhost:5000/api/analyze-outfit \
  -H "Content-Type: application/json" \
  -d '{"poses": [[...], [...], [...]]}'
```

### Get Clothing Database
```bash
curl http://localhost:5000/api/clothing
```

---

## 🎨 Customization

### Change Detected Items
Edit `server.js` - `clothingDatabase` array:

```javascript
const clothingDatabase = [
  {
    id: 1,
    name: 'Your Item Name',
    confidence: 0.95,
    bodyParts: ['shoulder', 'torso', 'arm'],
    points: 100
  },
  // Add more...
];
```

### Adjust Detection Sensitivity
Edit `config.js`:

```javascript
CLOTHING_DETECTION: {
  MIN_CONFIDENCE: 0.6,  // Lower = more detections
  VISIBILITY_THRESHOLD: 0.5,  // Lower = needs less visibility
  // ...
}
```

### Change Colors/UI
Edit `index.html` - CSS section:

```css
.statusDot.detecting { background: #00ff00; } /* Green */
.statusDot.points { background: #0099ff; }    /* Blue */
.statusDot.confidence { background: #ffaa00; } /* Orange */
```

---

## 🐛 Troubleshooting

### Camera Not Working?
- ✅ Check browser permissions (Settings → Privacy → Camera)
- ✅ Use HTTPS or localhost:* (Chrome requirement)
- ✅ Try a different browser
- ✅ Restart browser

### "Connection Refused" Error?
- ✅ Ensure backend server is running: `npm start`
- ✅ Check port 5000 is available
- ✅ Try: `netstat -ano | findstr :5000` (Windows)

### Low Detection Confidence?
- ✅ Improve lighting in room
- ✅ Stand 2-3 feet from camera
- ✅ Wear contrasting clothing
- ✅ Keep pose steady

### "API is not responding"
- ✅ Backend (port 5000): `npm start`
- ✅ Frontend (port 8000): `http-server` or Python
- ✅ Check they're in different terminal windows
- ✅ Both must be running simultaneously

---

## 📊 Project Structure

```
fitcheck/
├── index.html          # Frontend app
├── server.js           # Backend API
├── config.js           # Configuration
├── utils.js            # Helper functions
├── package.json        # Dependencies
├── .env                # Environment variables
├── .gitignore          # Git ignore
├── START.bat           # Quick start script
├── README.md           # Full documentation
└── QUICKSTART.md       # This file
```

---

## 🚀 Advanced Features

### Performance Profiling
Set `LOGGING.ENABLE_PROFILING: true` in config.js

### Custom Pose Smoother
Uses 5-frame window for smooth detection (configurable in utils.js)

### Body Metrics Calculation
Automatically calculates:
- Head height
- Shoulder width  
- Torso depth
- Arm length
- Leg length
- Hip width

### Multi-Item Detection
Analyze multiple clothing items simultaneously

---

## 📚 Technology Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | HTML5, CSS3, Canvas API |
| **AI/ML** | MediaPipe Pose, TensorFlow.js |
| **Backend** | Node.js, Express.js |
| **API** | REST with JSON |
| **Real-time** | WebSocket ready |

---

## 🎯 What Each File Does

**index.html**
- Main app interface
- Camera capture
- Real-time visualization
- UI controls and sliders

**server.js**
- REST API endpoints
- Pose analysis algorithm
- Clothing detection logic
- Points calculation

**config.js**
- Tunable parameters
- Detection thresholds
- Model configuration
- Rendering settings

**utils.js**
- Math helpers (distance, angles)
- Pose analysis functions
- Detection algorithms
- Smoothing utilities

---

## ✨ Example Workflow

1. User opens app → Camera requests permission
2. Pose detected → 33 landmarks identified
3. Skeleton drawn → Canvas overlay shows joints
4. Clothing analyzed → Bounding box drawn
5. Detection sent to API → Server processes
6. Results returned → UI updated with:
   - Item name
   - Confidence %
   - Points earned
7. Real-time updates every frame

---

## 🔐 Security Notes

- Backend only accepts POST on `/api/detect` and `/api/analyze-outfit`
- CORS enabled for localhost (modify in server.js for production)
- No data is stored or logged
- Camera access is browser-level permission

---

## 📞 Support

If something doesn't work:

1. **Check console errors** (F12 → Console)
2. **Check network tab** (F12 → Network)
3. **Verify both servers running** (backend + frontend)
4. **Check firewall/antivirus** might block ports
5. **Try different browser** (Chrome, Firefox, Edge)

---

## 🎉 You're Ready!

Your FitCheck AI system is fully functional with:
- ✅ Pose detection
- ✅ Clothing analysis
- ✅ AI scoring
- ✅ Professional UI
- ✅ REST API

**Next run: `npm start` then open http://localhost:8000**

Happy detecting! 🚀
