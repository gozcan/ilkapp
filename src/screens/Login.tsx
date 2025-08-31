// src/screens/Login.tsx
import React, { useState } from 'react';
// en üst import satırına şunları ekle
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

  const validate = () => {
    if (!email || !password) {
      Toast.show({
        type: 'error',
        text1: 'Uyarı',
        text2: 'E-posta ve şifre gerekli.',
      });
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      Toast.show({
        type: 'error',
        text1: 'Uyarı',
        text2: 'Geçerli bir e-posta giriniz.',
      });
      return false;
    }
    if (password.length < 6) {
      Toast.show({
        type: 'error',
        text1: 'Uyarı',
        text2: 'Şifre en az 6 karakter olmalı.',
      });
      return false;
    }
    return true;
  };

  const onLogin = async () => {
    if (!validate()) return;
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        Toast.show({
          type: 'error',
          text1: 'Giriş başarısız',
          text2: error.message,
        });
      } else {
        Toast.show({
          type: 'success',
          text1: 'Hoş geldin',
          text2: 'Giriş yapıldı.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: 'height' })}
      keyboardVerticalOffset={Platform.select({ ios: 64, android: 0 })}
    >
      <TouchableWithoutFeedback
        onPress={Keyboard.dismiss}
        accessible={false}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Text style={styles.brand}>İlka</Text>
            <Text style={styles.title}>Giriş Yap</Text>

            {/* E-posta */}
            <TextInput
              placeholder="E-posta"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              returnKeyType="next"
            />

            {/* Şifre + inline göz */}
            <View style={styles.inputWrapper}>
              <TextInput
                placeholder="Şifre"
                secureTextEntry={!showPass}
                value={password}
                onChangeText={setPassword}
                style={styles.inputFlex}
                returnKeyType="done"
                onSubmitEditing={onLogin}
              />
              <TouchableOpacity
                onPress={() => setShowPass(!showPass)}
                style={styles.eyeBtn}
                accessibilityLabel="Şifreyi göster/gizle"
              >
                <Ionicons
                  name={showPass ? 'eye-off' : 'eye'}
                  size={20}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={onLogin}
              style={styles.button}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Giriş Yap</Text>
              )}
            </TouchableOpacity>

            <Toast position="bottom" />
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const COLORS = {
  primary: '#000089', // İlka koyu mavi
  border: '#E6E6E6',
  text: '#111',
  bg: '#fff',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  brand: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    color: COLORS.text,
  },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  inputFlex: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    color: COLORS.text,
  },
  eyeBtn: { padding: 6 },

  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
  // stillere şunları ekle/ güncelle
  scrollContent: { flexGrow: 1 },
});
