import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xmotion.app',
  appName: 'Xmotion',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0e0f13',
    // Keep the editor from rubber-banding while dragging on the canvas and timeline.
    scrollEnabled: false,
  },
};

export default config;
