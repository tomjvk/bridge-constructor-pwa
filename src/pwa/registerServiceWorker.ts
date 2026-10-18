export function registerPWA(): void {
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('ServiceWorker registration error:', err);
      });
    });
  }
}
