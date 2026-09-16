import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';

export default function SSOCallbackScreen() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded || !isSignedIn) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return <Redirect href="/" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
