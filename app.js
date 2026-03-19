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
      if (feedback && feedback.messages && feedback.messages.length) {
        ui.showFeedback(feedback.messages.join(' • '), 'warning');
      }
    },
    onError: (error) => {
      console.error('Pose engine error', error);
      ui.setState('idle');
      ui.setInstruction('Camera / pose initialization failed.');
    }
  });

  await pose.start();

  // Expose for debug
  window.FitVision = { ui, scan, pose, tryOn, storage };
})();
