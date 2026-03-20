# FitCheck

FitCheck is a browser-based body scanning prototype with a live camera feed, pose-guided scan flow, fit summary, export/import, and scan history. The repo also includes an Express API plus investor and API demo pages.

## Main files

- `index.html` - Main scanner interface
- `app.js` - Frontend entry point
- `scan.js` - Guided scan workflow and body model generation
- `pose.js` - MediaPipe pose engine
- `server.js` - Basic Express API
- `server-advanced.js` - Advanced API variant
- `backend-core.js` - Shared API analysis logic

## Local run

1. Install dependencies:

```bash
npm install
```

2. Start the app and API:

```bash
npm start
```

3. Open:

- `http://localhost:5000/` for the scanner
- `http://localhost:5000/api-console.html` for the API console
- `http://localhost:5000/api-test.html` for the basic API tester
- `http://localhost:5000/investor-dashboard.html` for the investor view

Optional:

```bash
npm run advanced
```

This starts the smoothed API variant on the same default port.

## Notes

- Camera access is required for the main scanner.
- Scan history is stored locally in the browser.
- Exported scans are saved as JSON and can be imported again later.
