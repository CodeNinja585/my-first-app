import { ClerkProvider } from '@clerk/expo';
import * as SecureStore from 'expo-secure-store';
import { Stack } from 'expo-router';
import { env } from '../src/config/env';

const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('SecureStore get error:', error);
      return null;
    }
  },
  async saveToken(key: string, token: string) {
    try {
      return await SecureStore.setItemAsync(key, token);
    } catch (error) {
      console.error('SecureStore set error:', error);
    }
  },
};

const publishableKey = env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required');
  process.exit(1);
}

export default function AppLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <Stack />
    </ClerkProvider>
  );
}
