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
  android: {
    backgroundColor: '#0b0c10',
  },
  plugins: {
    SystemBars: {
      // Light status bar icons over the dark app; the page handles the insets (viewport-fit=cover).
      style: 'DARK',
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
