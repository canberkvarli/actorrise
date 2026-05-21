import { createApiClient, type ApiClient } from '@actorrise/api-client';

import { supabase } from './supabase';

const PRODUCTION_API_URL = 'https://api.actorrise.com';

const baseUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:8000' : PRODUCTION_API_URL);

/**
 * Shared api-client instance. Pulls the access token from the active
 * Supabase session each request — the supabase-js client refreshes the
 * token in the background, so we always see a valid one here.
 *
 * Endpoint methods (searchMonologues, getScript, etc.) get added to
 * @actorrise/api-client as Phase 2/3 needs them.
 */
export const api: ApiClient = createApiClient({
  baseUrl,
  getToken: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token;
  },
});
