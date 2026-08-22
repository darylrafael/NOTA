import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { initDatabase } from '../db/schema';
import OnboardingOverlay from '../components/OnboardingOverlay';
import { ONBOARDING_KEY } from '../constants/onboarding';
import { colors } from '../constants/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  const [storageReady, setStorageReady] = useState(false);
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);
  const [presentOnboarding, setPresentOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const value = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (!cancelled) {
          setShouldShowOnboarding(value !== 'true');
          setStorageReady(true);
        }
      } catch {
        if (!cancelled) {
          setShouldShowOnboarding(true);
          setStorageReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady || !shouldShowOnboarding) {
      setPresentOnboarding(false);
      return;
    }
    let frame1 = 0;
    let frame2 = 0;
    let cancelled = false;
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (!cancelled) setPresentOnboarding(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, [storageReady, shouldShowOnboarding]);

  function handleOnboardingComplete() {
    setPresentOnboarding(false);
    setShouldShowOnboarding(false);
  }

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SQLiteProvider databaseName="nota.db" onInit={initDatabase}>
        <Stack
          screenOptions={{
            headerShown: false,
            headerBackTitle: 'Back',
            // Satu sistem header untuk seluruh stack screen sekunder
            // (Budget, Confirm, Receipt Detail, Category Detail) - sebelumnya
            // tiap layar punya perlakuan berbeda-beda (lihat design review).
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTintColor: colors.primary,
            headerTitleStyle: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: colors.textPrimary },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen
            name="confirm"
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen
            name="receipt/[id]"
            options={{ headerShown: true, title: 'Transaction Details' }}
          />
          <Stack.Screen
            name="category/[name]"
            options={{ headerShown: true, title: 'Category Details' }}
          />
          <Stack.Screen
            name="merchant/[name]"
            options={{ headerShown: true, title: 'Store Details' }}
          />
          <Stack.Screen
            name="budget"
            options={{ headerShown: true, title: 'Monthly Budgets', presentation: 'modal' }}
          />
          <Stack.Screen
            name="split/[id]"
            options={{ headerShown: false, presentation: 'modal' }}
          />
        </Stack>
      </SQLiteProvider>

      {presentOnboarding && <OnboardingOverlay onComplete={handleOnboardingComplete} />}
    </GestureHandlerRootView>
  );
}
