export async function registerServiceWorker(
  serviceWorker: Pick<ServiceWorkerContainer, 'register'> | undefined,
  enabled: boolean,
) {
  if (!enabled || !serviceWorker) return null;
  try {
    return await serviceWorker.register('/service-worker.js', { scope: '/' });
  } catch {
    // PWA support is optional; registration failure must never block the app.
    return null;
  }
}
