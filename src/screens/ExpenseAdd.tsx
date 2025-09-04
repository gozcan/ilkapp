import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

import { supabase } from '../lib/supabase';
import { colors, font, radius, shadow, spacing } from '../ui/theme';
import Screen from '../ui/Screen';
import { navRef } from '../navigation/nav';

type RouteParams = { projectId: number; taskId?: number | null };
type LocalPhoto = { uri: string; w?: number; h?: number };

export default function ExpenseAddScreen() {
  const current = navRef.getCurrentRoute();
  const params = (current?.params ?? {}) as RouteParams;
  const projectId = params.projectId!;
  const taskId = params.taskId ?? null;
  if (!projectId) {
    return (
      <Screen title="Harcama Ekle">
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#EF4444' }}>
            Proje bilgisi eksik. Lütfen geri dönün.
          </Text>
        </View>
      </Screen>
    );
  }

  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [dateText, setDateText] = useState(() => {
    const d = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // YYYY-MM-DD
  });
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const amountNum = useMemo(() => {
    const n = Number(String(amountText).replace(',', '.'));
    return isNaN(n) ? NaN : n;
  }, [amountText]);

  const isAmountValid = Number.isFinite(amountNum) && amountNum > 0;
  const canSave = isAmountValid && !saving && !uploading;

  /** --------- Foto ekleme --------- */
  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'İzin gerekli',
        text2: 'Galeri izni verilmedi.',
        position: 'top',
      });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      selectionLimit: 0, // çoklu seçim destekli (iOS 14+)
    });
    if (!res.canceled && res.assets?.length) {
      setPhotos((p) => [
        ...p,
        ...res.assets.map((a) => ({ uri: a.uri, w: a.width, h: a.height })),
      ]);
    }
  };

  const captureWithCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'İzin gerekli',
        text2: 'Kamera izni verilmedi.',
        position: 'top',
      });
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setPhotos((p) => [...p, { uri: a.uri, w: a.width, h: a.height }]);
    }
  };

  const removeLocalPhoto = (idx: number) => {
    setPhotos((p) => p.filter((_, i) => i !== idx));
  };

  /** --------- Kaydet --------- */
  const onSave = async () => {
    if (!isAmountValid) {
      Toast.show({
        type: 'error',
        text1: 'Tutar gerekli',
        text2: 'Lütfen geçerli bir tutar girin.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      setSaving(true);

      // 1) Oturum + kullanıcı
      const [{ data: sess }, { data: userData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);
      const accessToken = sess.session?.access_token;
      const uid = userData.user?.id;
      if (!accessToken || !uid) {
        throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.');
      }

      // 2) Expense kaydı
      const { data: companyRow } = await supabase
        .from('projects')
        .select('company_id')
        .eq('id', projectId)
        .single();

      if (!companyRow?.company_id) throw new Error('Şirket bulunamadı.');

      const { data: expIns, error: expErr } = await supabase
        .from('expenses')
        .insert({
          company_id: companyRow.company_id,
          project_id: projectId,
          task_id: taskId,
          amount: Math.round(amountNum * 100) / 100,
          currency: 'TRY',
          description: description.trim() || null,
          spent_at: dateText, // YYYY-MM-DD
          created_by: uid,
        })
        .select('id')
        .single();

      if (expErr) throw expErr;
      const expenseId = expIns!.id as number;

      // 3) Foto(lar)ı yükle → storage + expense_media
      if (photos.length > 0) {
        setUploading(true);
        const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
        for (const ph of photos) {
          // Sıkıştır (max 1600px)
          const manip = await ImageManipulator.manipulateAsync(
            ph.uri,
            [{ resize: { width: Math.min(ph.w ?? 1600, 1600) } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
          );

          const filename = `${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}.jpg`;
          const storagePath = `${uid}/${expenseId}/${filename}`;
          const uploadUrl = `${supabaseUrl}/storage/v1/object/expense-media/${encodeURI(
            storagePath
          )}`;

          const resp = await FileSystem.uploadAsync(uploadUrl, manip.uri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'image/jpeg',
              'x-upsert': 'false',
            },
          });

          if (resp.status !== 200 && resp.status !== 201) {
            throw new Error(`Foto yüklenemedi (HTTP ${resp.status})`);
          }

          const { error: dbErr } = await supabase.from('expense_media').insert({
            expense_id: expenseId,
            storage_path: storagePath,
            url: storagePath,
            created_by: uid,
          });
          if (dbErr) throw dbErr;
        }
      }

      Toast.show({
        type: 'success',
        text1: 'Eklendi',
        text2: 'Harcama kaydedildi.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // 4) TaskDetail’e geri dön
      if (navRef.isReady() && navRef.canGoBack()) navRef.goBack();
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: e?.message ?? 'Kaydedilemedi',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const goBack = () => {
    if (navRef.isReady() && navRef.canGoBack()) navRef.goBack();
  };

  return (
    <Screen title="Harcama Ekle">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: spacing.x8, gap: spacing.x4 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header (geri) */}
          <View style={styles.header}>
            <Pressable
              onPress={goBack}
              hitSlop={10}
              style={styles.backBtn}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={colors.text}
              />
              <Text style={styles.backText}>Geri</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Harcama Ekle</Text>
            <View style={{ width: 60 }} />
          </View>

          {/* Form kartı */}
          <View style={styles.card}>
            {/* Tutar */}
            <Text style={styles.label}>Tutar (₺) *</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0,00"
              keyboardType="decimal-pad"
              style={[
                styles.input,
                !isAmountValid && amountText !== '' ? styles.inputError : null,
              ]}
            />
            {!isAmountValid && amountText !== '' && (
              <Text style={styles.errorTextSmall}>
                Geçerli bir tutar girin (0’dan büyük).
              </Text>
            )}

            {/* Tarih */}
            <Text style={[styles.label, { marginTop: spacing.x3 }]}>
              Tarih (YYYY-AA-GG)
            </Text>
            <TextInput
              value={dateText}
              onChangeText={setDateText}
              placeholder="YYYY-AA-GG"
              style={styles.input}
            />

            {/* Açıklama */}
            <Text style={[styles.label, { marginTop: spacing.x3 }]}>
              Açıklama
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Kısa açıklama…"
              multiline
              style={[
                styles.input,
                { minHeight: 90, textAlignVertical: 'top' },
              ]}
            />
          </View>

          {/* Foto kartı */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Fotoğraflar (opsiyonel)</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={pickFromLibrary}
                  style={styles.addBtn}
                >
                  <Text style={styles.addBtnText}>
                    {uploading ? 'Yükleniyor…' : 'Galeriden'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={captureWithCamera}
                  style={styles.addBtn}
                >
                  <Text style={styles.addBtnText}>
                    {uploading ? 'Yükleniyor…' : 'Kameradan'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {photos.length === 0 ? (
              <Text style={styles.muted}>Henüz fotoğraf seçilmedi.</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, marginTop: 10 }}
              >
                {photos.map((p, idx) => (
                  <View
                    key={`${p.uri}-${idx}`}
                    style={{ position: 'relative' }}
                  >
                    <Image
                      source={{ uri: p.uri }}
                      style={styles.thumb}
                    />
                    <Pressable
                      onPress={() => removeLocalPhoto(idx)}
                      style={styles.trashBtn}
                      hitSlop={8}
                    >
                      <Ionicons
                        name="trash"
                        size={16}
                        color="#fff"
                      />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Kaydet */}
          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveBtn,
              (!canSave || pressed) && { opacity: 0.7 },
            ]}
          >
            {saving || uploading ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.saveText}>Kaydet</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.x2, // status bar/üst boşluk
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingRight: 8,
  },
  backText: { color: colors.text, fontWeight: '700' },
  headerTitle: {
    fontSize: font.sizes.lg ?? 18,
    fontWeight: '800',
    color: colors.text,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.x4,
    borderWidth: 1,
    borderColor: '#EDEDED',
    ...shadow.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  label: { fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: colors.text,
    marginTop: spacing.x2,
    backgroundColor: '#fff',
  },
  inputError: { borderColor: '#EF4444' },

  sectionTitle: {
    fontSize: font.sizes.md,
    fontWeight: '700',
    color: colors.text,
  },
  muted: { color: '#6B7280' },

  addBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
  },
  addBtnText: { color: '#fff', fontWeight: '700' },

  thumb: {
    width: 120,
    height: 90,
    borderRadius: radius.md,
    backgroundColor: '#F3F4F6',
  },
  trashBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    padding: 6,
  },

  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.x4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: font.sizes.md },

  errorTextSmall: { color: '#EF4444', marginTop: 6 },
});
