import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { isNative } from './platform';
import './styles.css';

// iOS: stop the whole page from pinch-zooming; the canvas and timeline handle pinch themselves.
document.addEventListener('gesturestart', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support for the web version (the iOS app bundles its files already).
if (!isNative && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

// Test/automation hook: open the app with ?debug to reach the editor state from the console.
if (location.search.includes('debug')) {
  void Promise.all([import('./state/store'), import('./model/effectDefs')]).then(([store, fx]) => {
    (window as unknown as Record<string, unknown>).__xm = { ...store, EFFECT_LIST: fx.EFFECT_LIST };
  });
}
