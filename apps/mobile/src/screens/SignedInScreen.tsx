import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Button } from 'react-native';
import { useAuth, useSession } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { env } from '../config/env';

export default function SignedInScreen() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const router = useRouter();

  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  if (!isSignedIn || !userId) {
    router.replace('/SignInScreen');
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Signed In</Text>
      <Text style={styles.userId}>User ID: {userId}</Text>
      <Button title="Sign out" onPress={() => router.push('/SignInScreen')} />
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
