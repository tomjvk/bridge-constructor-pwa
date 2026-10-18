import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('PWA Configuration', () => {
  it('defines valid standalone PWA manifest metadata', () => {
    const manifestPath = path.resolve(__dirname, '../../public/manifest.webmanifest');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(content.display).toBe('standalone');
    expect(content.orientation).toBe('landscape');
    expect(content.icons.length).toBeGreaterThanOrEqual(2);
    expect(content.name).toContain('Bridge Constructor');
  });
});
