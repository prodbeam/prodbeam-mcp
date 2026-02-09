import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestDeviceCode, pollForToken, refreshGitHubToken } from './github-device-flow.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
  } as Response;
}

describe('github-device-flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestDeviceCode', () => {
    it('posts to GitHub device/code endpoint', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          device_code: 'dc_test',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          interval: 5,
          expires_in: 900,
        })
      );

      const result = await requestDeviceCode('test-client-id', ['repo', 'read:org']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.com/login/device/code',
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.deviceCode).toBe('dc_test');
      expect(result.userCode).toBe('ABCD-1234');
      expect(result.verificationUri).toBe('https://github.com/login/device');
      expect(result.interval).toBe(5);
    });

    it('throws on non-200 response', async () => {
      mockFetch.mockResolvedValue(jsonResponse({}, 500));
      await expect(requestDeviceCode('test', ['repo'])).rejects.toThrow(
        'GitHub device code request failed'
      );
    });
  });

  describe('pollForToken', () => {
    it('returns tokens on successful authorization', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          access_token: 'ghu_new',
          refresh_token: 'ghr_new',
          expires_in: 28800,
          refresh_token_expires_in: 15811200,
          scope: 'repo,read:org',
          token_type: 'bearer',
        })
      );

      const result = await pollForToken('test-client-id', 'dc_test', 0.01, 10);

      expect(result.method).toBe('oauth');
      expect(result.accessToken).toBe('ghu_new');
      expect(result.refreshToken).toBe('ghr_new');
      expect(result.scopes).toEqual(['repo', 'read:org']);
    });

    it('polls until authorization is complete', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve(jsonResponse({ error: 'authorization_pending' }));
        }
        return Promise.resolve(
          jsonResponse({
            access_token: 'ghu_delayed',
            refresh_token: 'ghr_delayed',
            expires_in: 28800,
            scope: 'repo',
          })
        );
      });

      const result = await pollForToken('test', 'dc', 0.01, 10);
      expect(result.accessToken).toBe('ghu_delayed');
      expect(callCount).toBe(3);
    });

    it('throws on access_denied', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ error: 'access_denied' }));
      await expect(pollForToken('test', 'dc', 0.01, 10)).rejects.toThrow('User denied');
    });

    it('throws on expired_token', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ error: 'expired_token' }));
      await expect(pollForToken('test', 'dc', 0.01, 10)).rejects.toThrow('Device code expired');
    });
  });

  describe('refreshGitHubToken', () => {
    it('returns new tokens on successful refresh', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          access_token: 'ghu_refreshed',
          refresh_token: 'ghr_refreshed',
          expires_in: 28800,
          refresh_token_expires_in: 15811200,
          scope: 'repo,read:org',
        })
      );

      const result = await refreshGitHubToken('test-client-id', 'ghr_old');

      expect(result.accessToken).toBe('ghu_refreshed');
      expect(result.refreshToken).toBe('ghr_refreshed');
      expect(result.method).toBe('oauth');
    });

    it('throws on refresh failure', async () => {
      mockFetch.mockResolvedValue(
        jsonResponse({
          error: 'bad_refresh_token',
          error_description: 'The refresh token is invalid',
        })
      );

      await expect(refreshGitHubToken('test', 'bad')).rejects.toThrow('refresh failed');
    });
  });
});
