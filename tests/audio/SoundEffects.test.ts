import { describe, it, expect } from 'vitest';
import { SoundEffects } from '../../src/audio/SoundEffects';

describe('SoundEffects', () => {
  it('instantiates and handles unlock, play, and stop without errors in headless mode', () => {
    const sfx = new SoundEffects();
    expect(sfx).toBeDefined();

    // In Node/Vitest where AudioContext may not exist natively, methods should fail-soft
    expect(() => sfx.unlock()).not.toThrow();
    expect(() => sfx.playCreak(0.8)).not.toThrow();
    expect(() => sfx.playSnap()).not.toThrow();
    expect(() => sfx.startEngine()).not.toThrow();
    expect(() => sfx.updateEngine(1.2)).not.toThrow();
    expect(() => sfx.stopEngine()).not.toThrow();
    expect(() => sfx.playWin()).not.toThrow();
  });
});
