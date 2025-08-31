// src/ui/Screen.tsx
import React, { ReactNode } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, font } from './theme';

type Props = {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function Screen({ title, children, footer }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <View style={styles.content}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flex: 1,
    paddingHorizontal: spacing.x5,
    paddingVertical: spacing.x4,
  },
  title: {
    fontSize: font.sizes.lg,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.x4,
    textAlign: 'center',
  },
  content: { flex: 1 },
  footer: { marginTop: spacing.x4 },
});
