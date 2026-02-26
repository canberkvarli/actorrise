/**
 * Parse a 403 feature-gate error from the backend into a structured upgrade prompt.
 * Works with both Axios errors and TTSError from useOpenAITTS.
 */

export interface UpgradeErrorInfo {
  message: string;
  upgradeUrl: string;
  limit?: number;
  used?: number;
}

export function parseUpgradeError(error: unknown): UpgradeErrorInfo | null {
  // TTSError or similar with .status and .detail
  if (error && typeof error === 'object' && 'status' in error) {
    const e = error as { status: number; detail?: unknown };
    if (e.status === 403 && e.detail && typeof e.detail === 'object') {
      const d = e.detail as Record<string, unknown>;
      return {
        message: typeof d.message === 'string' ? d.message : 'Upgrade your plan to use this feature.',
        upgradeUrl: typeof d.upgrade_url === 'string' ? d.upgrade_url : '/pricing',
        limit: typeof d.limit === 'number' ? d.limit : undefined,
        used: typeof d.used === 'number' ? d.used : undefined,
      };
    }
  }

  // Axios error shape: error.response.status + error.response.data.detail
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response?: { status?: number; data?: { detail?: unknown } } }).response;
    if (resp?.status === 403 && resp.data?.detail && typeof resp.data.detail === 'object') {
      const d = resp.data.detail as Record<string, unknown>;
      return {
        message: typeof d.message === 'string' ? d.message : 'Upgrade your plan to use this feature.',
        upgradeUrl: typeof d.upgrade_url === 'string' ? d.upgrade_url : '/pricing',
        limit: typeof d.limit === 'number' ? d.limit : undefined,
        used: typeof d.used === 'number' ? d.used : undefined,
      };
    }
  }

  return null;
}
