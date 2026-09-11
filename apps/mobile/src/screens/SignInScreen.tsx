import { View, Text, Button, ActivityIndicator, StyleSheet } from 'react-native';
import { useOAuth } from '@clerk/expo';
import { useState } from 'react';

export function SignInScreen() {
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const [isSigningIn, setIsSigningIn] = useState(false);

  const onGooglePress = async () => {
    try {
      setIsSigningIn(true);
      const result = await startOAuthFlow();

      // The result type may vary - just log it for now
      console.log('OAuth result:', result);
    } catch (error) {
      console.error('Google sign-in error:', error);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      {isSigningIn ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <Button title="Sign in with Google" onPress={onGooglePress} />
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
});
