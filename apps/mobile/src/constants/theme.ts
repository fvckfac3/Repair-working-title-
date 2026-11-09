/** Repair's light/dark palette: warm, calm and low-contrast-safe. */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2B2420',
    background: '#FBF7F3',
    backgroundElement: '#F1E8E0',
    backgroundSelected: '#E6D7CA',
    textSecondary: '#6E625A',
    accent: '#B5543C',
    accentText: '#FFFFFF',
    border: '#E2D4C7',
    safety: '#8A2D3B',
    success: '#3D7A5A',
  },
  dark: {
    text: '#F4EDE7',
    background: '#171311',
    backgroundElement: '#241E1A',
    backgroundSelected: '#352C26',
    textSecondary: '#B9ADA4',
    accent: '#E07A5F',
    accentText: '#1A1210',
    border: '#3A302A',
    safety: '#E58A98',
    success: '#7CC39C',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80, web: 96 }) ?? 0;
export const MaxContentWidth = 800;
