// src/navigation/nav.ts
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name]
) {
  if (navRef.isReady()) {
    // @ts-expect-error - paramlar tipli ama burada geniş kabul ediyoruz
    navRef.navigate(name as any, params as any);
  }
}
