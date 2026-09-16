import { useState } from 'react';
import { View, Text, Button, ActivityIndicator, StyleSheet } from 'react-native';
import { useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export function SignInScreen() {
  const { startSSOFlow } = useSSO();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGooglePress = async () => {
    try {
      setIsSigningIn(true);
      setError(null);
      const result = await startSSOFlow({ strategy: 'oauth_google' });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({ session: result.createdSessionId });
      } else if (result.authSessionResult && result.authSessionResult.type !== 'success') {
        setError(`Sign-in ended: ${result.authSessionResult.type}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {isSigningIn ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <Button title="Sign in with Google" onPress={() => void onGooglePress()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
  },
  error: {
    fontSize: 14,
    color: '#b00020',
    marginBottom: 12,
    textAlign: 'center',
  },
});
