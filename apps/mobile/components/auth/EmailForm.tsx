import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';

interface EmailFormProps {
  mode: 'signup' | 'login';
  onSuccess?: () => void;
}

export function EmailForm({ mode, onSuccess }: EmailFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.includes('@') && password.length >= 6 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const fn =
        mode === 'signup'
          ? supabase.auth.signUp({ email, password })
          : supabase.auth.signInWithPassword({ email, password });
      const { error: authError } = await fn;
      if (authError) throw authError;
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3 mt-2">
      <View>
        <Text className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
          Email
        </Text>
        <TextInput
          className="border border-border bg-card rounded-xl px-4 py-3 text-base text-foreground"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="you@example.com"
          placeholderTextColor="#A1A1AA"
        />
      </View>

      <View>
        <Text className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
          Password
        </Text>
        <TextInput
          className="border border-border bg-card rounded-xl px-4 py-3 text-base text-foreground"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
          placeholder="At least 6 characters"
          placeholderTextColor="#A1A1AA"
        />
      </View>

      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        className={`rounded-xl py-3.5 items-center justify-center mt-2 ${
          canSubmit ? 'bg-brand active:opacity-80' : 'bg-brand/40'
        }`}>
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-white font-semibold text-base">
            {mode === 'signup' ? 'Create account' : 'Sign in'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
