import { StorageManager } from './storage.js';
import { UI } from './ui.js';
import { PoseEngine } from './pose.js';
import { ScanManager } from './scan.js';
import { TryOn } from './tryon.js';

// Entry point for FitVision
(async function () {
  const storage = new StorageManager();
  const ui = new UI();
  const tryOn = new TryOn();
  const scan = new ScanManager({ ui, storage, tryOn });

  const pose = new PoseEngine({
    onPose: (landmarks, meta) => scan.updatePose(landmarks, meta),
    onFeedback: (feedback) => {
      const messages = Array.isArray(feedback?.messages)
        ? feedback.messages
        : feedback?.message
          ? [feedback.message]
          : [];

      if (messages.includes('No person detected')) {
        scan.handlePoseLost(feedback);
        return;
      }
    },
    onError: (error) => {
      console.error('Pose engine error', error);
      ui.setState('idle');
      ui.setInstruction('Camera / pose initialization failed.');
      ui.pushCoachMessage('Camera access failed. Allow camera permissions and refresh so I can guide your scan.', 'coach', 'camera-error', true);
    }
  });

  await pose.start();

  // Expose for debug
  window.FitVision = { ui, scan, pose, tryOn, storage };
})();
