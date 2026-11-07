import { describe, expect, it } from 'vitest';
import { micBrowser, micFix } from './mic-fix';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:132.0) Gecko/20100101 Firefox/132.0',
};

describe('micBrowser', () => {
  it('tells the browsers apart, iOS Chrome from iOS Safari', () => {
    expect(micBrowser(UA.iosSafari)).toBe('ios_safari');
    expect(micBrowser(UA.iosChrome)).toBe('ios_chrome');
    expect(micBrowser(UA.android)).toBe('android');
    expect(micBrowser(UA.chrome)).toBe('chrome');
    expect(micBrowser(UA.edge)).toBe('chrome');
    expect(micBrowser(UA.safari)).toBe('safari');
    expect(micBrowser(UA.firefox)).toBe('firefox');
    expect(micBrowser('curl/8')).toBe('other');
  });
});

describe('micFix', () => {
  it('a blocked mic gets where the switch is in that browser', () => {
    expect(micFix('ios_safari', 'denied')).toBe('micFixIosSafari');
    expect(micFix('chrome', 'denied')).toBe('micFixChrome');
    expect(micFix('other', 'denied')).toBe('micFixBlocked');
  });
  it('an allowed mic that heard nothing gets the input check, phone or computer', () => {
    expect(micFix('ios_chrome', 'granted')).toBe('micFixPhone');
    expect(micFix('android', 'unknown')).toBe('micFixPhone');
    expect(micFix('safari', 'prompt')).toBe('micFixDesktop');
  });
});
