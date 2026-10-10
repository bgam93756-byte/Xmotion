import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './ui/App';
import { runBackHandler } from './ui/back';
import { isNative } from './platform';
import './styles.css';

// iOS: stop the whole page from pinch-zooming; the canvas and timeline handle pinch themselves.
document.addEventListener('gesturestart', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Android back button: close the newest sheet or panel, step out of the editor, then leave the app.
if (Capacitor.getPlatform() === 'android') {
  void import('@capacitor/app').then(({ App: NativeApp }) =>
    NativeApp.addListener('backButton', () => {
      if (!runBackHandler()) void NativeApp.exitApp();
    }),
  );
}

// Offline support for the web version (the iOS app bundles its files already).
if (!isNative && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

// Ask the browser not to clear saved projects and media when space runs low.
if (!isNative) void navigator.storage?.persist?.().catch(() => false);

// Test/automation hook: open the app with ?debug to reach the editor state from the console.
if (location.search.includes('debug')) {
  void Promise.all([
    import('./state/store'),
    import('./model/effectDefs'),
    import('./engine/renderer'),
    import('./model/schema'),
    import('./engine/media'),
    import('./engine/gl'),
    import('./engine/transform'),
    import('./model/tree'),
    import('./engine/camera'),
    import('./ui/back'),
  ]).then(
    ([store, fx, renderer, schema, media, gl, transform, tree, camera, back]) => {
      (window as unknown as Record<string, unknown>).__xm = {
        ...store,
        EFFECT_LIST: fx.EFFECT_LIST,
        Renderer: renderer.Renderer,
        schema,
        media: media.media,
        glfx: gl.glfx,
        transform,
        tree,
        camera,
        back: back.runBackHandler,
      };
    },
  );
}
