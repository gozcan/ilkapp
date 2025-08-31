// src/ui/Button.tsx
import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { buttonTheme } from './theme';

type Variant = keyof typeof buttonTheme;

type Props = {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  hitSlop,
}: Props) {
  const v = buttonTheme[variant];

  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      disabled={disabled || loading}
      style={({ pressed }) => [
        v.container,
        pressed ? v.pressed : null,
        disabled || loading ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={(v.text as any)?.color || '#fff'} />
      ) : (
        <Text style={[v.text, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.6 },
});
