import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Passed as emailRedirectTo on sign-up so the confirmation email links back
// into the app. Native uses its `fitnesstracker://` scheme; a PWA must send
// people back to the public HTTPS origin instead (a custom scheme cannot be
// opened by Safari).
export const authRedirectTo =
  Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/` : makeRedirectUri();

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    return;
  }
  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) {
    return;
  }
  await supabase.auth.setSession({ access_token, refresh_token });
}

// Catches the app being opened via the email confirmation link (both "app
// was already closed" via getInitialURL and "app was open in background" via
// the url event) and turns the tokens in it into a real Supabase session.
export function useAuthDeepLink() {
  const url = Linking.useLinkingURL();

  useEffect(() => {
    if (url) {
      createSessionFromUrl(url);
    }
  }, [url]);
}
