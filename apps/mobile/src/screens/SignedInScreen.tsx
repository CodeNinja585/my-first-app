import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Button } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { env } from '../config/env';

interface MeResponse {
  userId: string;
}

export default function SignedInScreen() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const [apiUserId, setApiUserId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${env.EXPO_PUBLIC_API_URL}/v1/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const data = (await response.json()) as MeResponse;
        if (!cancelled) {
          setApiUserId(data.userId);
        }
      } catch (error) {
        if (!cancelled) {
          setApiError(String(error));
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userId, getToken]);

  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (!isSignedIn || !userId) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Signed In</Text>
      <Text style={styles.userId}>User ID: {userId}</Text>
      {apiUserId ? <Text style={styles.userId}>API confirms: {apiUserId}</Text> : null}
      {apiError ? <Text style={styles.userId}>API error: {apiError}</Text> : null}
      <Button title="Sign out" onPress={() => void signOut()} />
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
  userId: {
    fontSize: 16,
    color: '#666',
  },
});
