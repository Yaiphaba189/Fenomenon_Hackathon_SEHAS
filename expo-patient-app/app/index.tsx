/**
 * SEHAS Entry Point — Redirect to onboarding or main app
 */

import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useAppStore } from '../store/useAppStore';

export default function Index() {
  const isRegistered = useAppStore((s) => s.isRegistered);
  const isLoaded = useAppStore((s) => s.isLoaded);
  const loadPatient = useAppStore((s) => s.loadPatient);

  useEffect(() => {
    loadPatient();
  }, []);

  if (!isLoaded) {
    return null;
  }

  if (isRegistered) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Redirect href="/(onboarding)/welcome" />;
}
