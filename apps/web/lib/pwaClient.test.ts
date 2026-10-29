import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import manifest from '../app/manifest';
import { registerServiceWorker } from './pwaClient';

describe('Fine Arts PWA shell', () => {
  it('exposes a branded standalone manifest with existing artwork-derived icon sizes', async () => {
    const appManifest = manifest();
    expect(appManifest.name).toBe('Fine Arts');
    expect(appManifest.display).toBe('standalone');
    expect(appManifest.start_url).toBe('/');
    expect(appManifest.theme_color).toBe('#0B0B0C');
    for (const icon of (appManifest.icons ?? []) as Array<{ src: string; sizes?: string }>) {
      const size = Number(icon.sizes?.split('x')[0]);
      const png = await readFile(`public${icon.src}`);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });

  it('does not register when unsupported or disabled, and ignores registration failures', async () => {
    const register = vi.fn().mockResolvedValue({ scope: '/' });
    expect(await registerServiceWorker(undefined, true)).toBeNull();
    expect(await registerServiceWorker({ register }, false)).toBeNull();
    expect(register).not.toHaveBeenCalled();
    expect(await registerServiceWorker({ register }, true)).toEqual({ scope: '/' });
    expect(register).toHaveBeenCalledWith('/service-worker.js', { scope: '/' });
    expect(await registerServiceWorker({ register: vi.fn().mockRejectedValue(new Error('unsupported')) }, true)).toBeNull();
  });

  it('provides a generic offline page and only caches the explicit public shell assets', async () => {
    const [worker, offline] = await Promise.all([
      readFile('public/service-worker.js', 'utf8'),
      readFile('public/offline.html', 'utf8'),
    ]);
    expect(worker).toContain("['/offline.html', '/icons/fine-arts-192.png']");
    expect(worker).toContain("request.mode !== 'navigate'");
    expect(worker).toContain('fetch(request).catch');
    expect(worker).not.toContain('cache.put(');
    expect(offline).toContain('You’re offline');
    expect(offline).toContain('window.location.reload()');
    expect(offline).toContain('href="/messages"');
  });
});
