// src/screens/TaskDetail.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  GestureHandlerRootView,
  PinchGestureHandler,
  State as GHState,
} from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';

import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Toast from 'react-native-toast-message';
import {
  colors,
  font,
  radius,
  shadow,
  spacing,
  taskPriorityColor,
  taskStatusColor,
} from '../ui/theme';
import { navigate } from '../navigation/nav';

export type TaskStatus = 'yapılacak' | 'yapılıyor' | 'tamamlandı' | 'iptal';
export type TaskPriority = 'low' | 'medium' | 'high';

type Task = {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type MediaRow = {
  id: number;
  task_id: number;
  storage_path: string;
  url: string;
  created_by: string;
  created_at: string;
  signedUrl?: string;
};

type Expense = {
  id: number;
  company_id: number;
  project_id: number;
  task_id: number | null;
  amount: number;
  currency: 'TRY';
  description: string | null;
  spent_at: string; // YYYY-MM-DD
  created_by: string;
  created_at: string;
  updated_at?: string;
};

type ExpenseWithMedia = Expense & {
  media?: { storage_path: string }[];
  signedUrl?: string | null;
};

type Props = { taskId: number; projectName?: string };

const STATUS_OPTIONS: TaskStatus[] = [
  'yapılacak',
  'yapılıyor',
  'tamamlandı',
  'iptal',
];
const tl = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 2,
});

/** ---------- Animasyonlu yardımcılar ---------- */
function useFadeIn(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);
  return { opacity, translateY };
}

const AnimatedCard: React.FC<{ delay?: number; style?: any }> = ({
  delay = 0,
  style,
  children,
}) => {
  const { opacity, translateY } = useFadeIn(delay);
  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
};

const AnimatedScalePressable: React.FC<
  React.ComponentProps<typeof Pressable> & { scaleTo?: number }
> = ({ scaleTo = 0.98, style, children, onPressIn, onPressOut, ...rest }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const handleIn = (e: any) => {
    Animated.spring(scale, {
      toValue: scaleTo,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
    onPressIn?.(e);
  };
  const handleOut = (e: any) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
    onPressOut?.(e);
  };
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPressIn={handleIn}
        onPressOut={handleOut}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

export default function TaskDetailScreen({ taskId, projectName }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [desc, setDesc] = useState('');

  // Media
  const [mediaLoading, setMediaLoading] = useState(true);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [uploading, setUploading] = useState(false);

  // Önizleme (büyütme) modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Foto sil onay modalı
  const [confirm, setConfirm] = useState<{ visible: boolean; row?: MediaRow }>({
    visible: false,
  });

  // SelectModal durumları
  const [prioOpen, setPrioOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  // Harcamalar
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [expenses, setExpenses] = useState<ExpenseWithMedia[]>([]);
  const [expActions, setExpActions] = useState<{
    visible: boolean;
    row?: ExpenseWithMedia;
  }>({ visible: false });

  // Harcama düzenle
  const [expEdit, setExpEdit] = useState<{
    visible: boolean;
    id?: number;
    amount?: string;
    dateStr?: string;
    description?: string;
    saving?: boolean;
  }>({ visible: false });

  // FAB action sheet
  const [fabSheet, setFabSheet] = useState(false);

  // Pull to refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), loadMedia(), loadExpenses()]);
    setRefreshing(false);
  }, [load, loadMedia, loadExpenses]);

  // Pinch-to-zoom
  const baseScaleNumRef = useRef(1);
  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true }
  );
  const onPinchStateChange = (e: any) => {
    const st = e.nativeEvent.state;
    const wasActive = e.nativeEvent.oldState === GHState.ACTIVE;
    if (
      st === GHState.END ||
      st === GHState.CANCELLED ||
      st === GHState.FAILED ||
      wasActive
    ) {
      const pinch = e.nativeEvent.scale ?? 1;
      let next = baseScaleNumRef.current * pinch;
      next = Math.max(1, Math.min(4, next)); // 1x–4x
      baseScaleNumRef.current = next;
      baseScale.setValue(next);
      pinchScale.setValue(1);
    }
  };
  const resetZoom = () => {
    baseScaleNumRef.current = 1;
    baseScale.setValue(1);
    pinchScale.setValue(1);
  };

  /** ----- Data ----- */
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select(
        'id, project_id, title, description, status, priority, due_date, created_by, created_at, updated_at'
      )
      .eq('id', taskId)
      .single();
    if (error) {
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: error.message,
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setTask(data as Task | null);
    setDesc((data?.description as string) ?? '');
    setLoading(false);
  }, [taskId]);

  const makeSigned = async (rows: MediaRow[]) => {
    const out: MediaRow[] = [];
    for (const row of rows) {
      const { data: s } = await supabase.storage
        .from('task-media')
        .createSignedUrl(row.storage_path, 3600);
      out.push({ ...row, signedUrl: s?.signedUrl });
    }
    return out;
  };

  const loadMedia = useCallback(async () => {
    setMediaLoading(true);
    const { data, error } = await supabase
      .from('task_media')
      .select('id, task_id, storage_path, url, created_by, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (error) {
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: error.message,
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setMediaLoading(false);
      return;
    }
    setMedia(await makeSigned(data ?? []));
    setMediaLoading(false);
  }, [taskId]);

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true);
    const { data, error } = await supabase
      .from('expenses')
      .select(
        `
        id, company_id, project_id, task_id, amount, currency, description, spent_at, created_by, created_at,
        expense_media:expense_media(storage_path)
      `
      )
      .eq('task_id', taskId)
      .order('spent_at', { ascending: false });
    if (error) {
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: error.message,
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setExpensesLoading(false);
      return;
    }
    const rows: ExpenseWithMedia[] = [];
    for (const row of (data as any[]) ?? []) {
      const mediaArr = (row.expense_media as { storage_path: string }[]) || [];
      let signedUrl: string | null = null;
      if (mediaArr.length > 0) {
        const first = mediaArr[0];
        const { data: s } = await supabase.storage
          .from('expense-media')
          .createSignedUrl(first.storage_path, 3600);
        signedUrl = s?.signedUrl ?? null;
      }
      rows.push({ ...(row as Expense), media: mediaArr, signedUrl });
    }
    setExpenses(rows);
    setExpensesLoading(false);
  }, [taskId]);

  useEffect(() => {
    load();
    loadMedia();
    loadExpenses();
  }, [load, loadMedia, loadExpenses]);
  useFocusEffect(
    useCallback(() => {
      loadExpenses();
    }, [loadExpenses])
  );

  /** ----- Güncellemeler ----- */
  const setStatus = async (next: TaskStatus) => {
    if (!task) return;
    await Haptics.selectionAsync();
    const prev = task.status;
    setTask({ ...task, status: next });
    const { error, data } = await supabase
      .from('tasks')
      .update({ status: next })
      .eq('id', task.id)
      .select()
      .single();
    if (error) {
      setTask({ ...task, status: prev });
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: error.message,
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      setTask(data as Task);
      Toast.show({
        type: 'success',
        text1: 'Güncellendi',
        text2: 'Durum güncellendi.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const updatePriority = async (next: TaskPriority) => {
    if (!task) return;
    await Haptics.selectionAsync();
    const prev = task.priority;
    setTask({ ...task, priority: next });
    const { error, data } = await supabase
      .from('tasks')
      .update({ priority: next })
      .eq('id', task.id)
      .select()
      .single();
    if (error) {
      setTask({ ...task, priority: prev });
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: error.message,
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      setTask(data as Task);
      Toast.show({
        type: 'success',
        text1: 'Güncellendi',
        text2: 'Öncelik güncellendi.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setPrioOpen(false);
  };

  const saveDesc = async () => {
    if (!task) return;
    try {
      setSaving(true);
      const { error, data } = await supabase
        .from('tasks')
        .update({ description: desc.trim() || null })
        .eq('id', task.id)
        .select()
        .single();
      if (error) {
        Toast.show({
          type: 'error',
          text1: 'Hata',
          text2: error.message,
          position: 'top',
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setTask(data as Task);
        Toast.show({
          type: 'success',
          text1: 'Kaydedildi',
          text2: 'Açıklama güncellendi.',
          position: 'top',
        });
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
      }
    } finally {
      setSaving(false);
    }
  };

  /** ----- Foto: izin + seçim/çekim + sıkıştırma + upload ----- */
  const ensurePermissions = async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (lib.status !== 'granted' && cam.status !== 'granted') {
      Toast.show({
        type: 'error',
        text1: 'İzin gerekli',
        text2: 'Kamera veya galeri izni verilmedi.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return false;
    }
    return true;
  };

  const pickFromLibrary = async () => {
    if (!(await ensurePermissions())) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;
    await processAndUpload(
      res.assets[0].uri,
      res.assets[0].width,
      res.assets[0].height
    );
  };

  const captureWithCamera = async () => {
    if (!(await ensurePermissions())) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (res.canceled || !res.assets?.length) return;
    await processAndUpload(
      res.assets[0].uri,
      res.assets[0].width,
      res.assets[0].height
    );
  };

  const processAndUpload = async (uri?: string, w?: number, h?: number) => {
    if (!uri) return;
    try {
      setUploading(true);
      const manip = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: Math.min(w ?? 1600, 1600) } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const [{ data: sess }, { data: userData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.auth.getUser(),
      ]);
      const accessToken = sess.session?.access_token;
      const uid = userData.user?.id;
      if (!accessToken || !uid || !task) {
        Toast.show({
          type: 'error',
          text1: 'Oturum yok',
          text2: 'Lütfen tekrar giriş yapın.',
          position: 'top',
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      const filename = `${Date.now()}.jpg`;
      const storagePath = `${uid}/${task.id}/${filename}`;
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const uploadUrl = `${supabaseUrl}/storage/v1/object/task-media/${encodeURI(
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
        Toast.show({
          type: 'error',
          text1: 'Yükleme hatası',
          text2: `Durum: ${resp.status}`,
          position: 'top',
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      const { error: dbErr } = await supabase
        .from('task_media')
        .insert({
          task_id: task.id,
          storage_path: storagePath,
          url: storagePath,
        });
      if (dbErr) {
        Toast.show({
          type: 'error',
          text1: 'Kayıt hatası',
          text2: dbErr.message,
          position: 'top',
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      Toast.show({
        type: 'success',
        text1: 'Yüklendi',
        text2: 'Fotoğraf eklendi.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadMedia();
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: e?.message || 'Yükleme başarısız',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploading(false);
    }
  };

  /** ----- Foto Silme ----- */
  const openConfirm = (row: MediaRow) => setConfirm({ visible: true, row });
  const closeConfirm = () => setConfirm({ visible: false, row: undefined });
  const deleteMedia = async (row: MediaRow) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    closeConfirm();
    setMedia((prev) => prev.filter((m) => m.id !== row.id));
    const { error: sErr } = await supabase.storage
      .from('task-media')
      .remove([row.storage_path]);
    if (sErr) {
      setMedia((prev) => [row, ...prev]);
      Toast.show({
        type: 'error',
        text1: 'Silme hatası',
        text2: sErr.message,
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    const { error: dErr } = await supabase
      .from('task_media')
      .delete()
      .eq('id', row.id);
    if (dErr) {
      Toast.show({
        type: 'error',
        text1: 'Kayıt silinemedi',
        text2: dErr.message,
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      await loadMedia();
      return;
    }
    Toast.show({
      type: 'success',
      text1: 'Silindi',
      text2: 'Fotoğraf kaldırıldı.',
      position: 'top',
    });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  /** ----- Harcama: menü, düzenle, sil ----- */
  const openExpenseActions = (row: ExpenseWithMedia) =>
    setExpActions({ visible: true, row });
  const startEditExpense = (row: ExpenseWithMedia) => {
    setExpActions({ visible: false });
    setExpEdit({
      visible: true,
      id: row.id,
      amount: String(row.amount).replace('.', ','),
      dateStr: row.spent_at,
      description: row.description ?? '',
      saving: false,
    });
  };
  const saveEditExpense = async () => {
    try {
      setExpEdit((e) => ({ ...e, saving: true }));
      const amt = Number((expEdit.amount ?? '').replace(',', '.'));
      if (!Number.isFinite(amt)) throw new Error('Tutar hatalı.');
      const { error, data } = await supabase
        .from('expenses')
        .update({
          amount: Math.round(amt * 100) / 100,
          description: expEdit.description?.trim() || null,
          spent_at: expEdit.dateStr,
        })
        .eq('id', expEdit.id!)
        .select()
        .single();
      if (error) throw error;
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === expEdit.id
            ? {
                ...e,
                amount: data.amount,
                description: data.description,
                spent_at: data.spent_at,
              }
            : e
        )
      );
      Toast.show({
        type: 'success',
        text1: 'Kaydedildi',
        text2: 'Harcama güncellendi.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setExpEdit({ visible: false });
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: e?.message ?? 'Güncelleme başarısız.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setExpEdit((x) => ({ ...x, saving: false }));
    }
  };
  const deleteExpense = async (row: ExpenseWithMedia) => {
    setExpActions({ visible: false });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { data: medias, error: mErr } = await supabase
        .from('expense_media')
        .select('storage_path')
        .eq('expense_id', row.id);
      if (mErr) throw mErr;
      const paths = (medias ?? []).map((m) => m.storage_path);
      if (paths.length > 0) {
        const { error: sErr } = await supabase.storage
          .from('expense-media')
          .remove(paths);
        if (sErr) throw sErr;
      }
      const { error: dErr } = await supabase
        .from('expenses')
        .delete()
        .eq('id', row.id);
      if (dErr) throw dErr;
      setExpenses((prev) => prev.filter((e) => e.id !== row.id));
      Toast.show({
        type: 'success',
        text1: 'Silindi',
        text2: 'Harcama kaldırıldı.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: e?.message ?? 'Silme başarısız.',
        position: 'top',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const titleText = task
    ? `${projectName ? projectName + ' • ' : ''}${task.title}`
    : projectName
    ? `${projectName} • Görev`
    : 'Görev';

  return (
    <Screen title={titleText}>
      {loading || !task ? (
        <View style={styles.center}>
          {loading ? (
            <>
              <ActivityIndicator />
              <Text style={styles.muted}>Yükleniyor…</Text>
            </>
          ) : (
            <Text style={styles.errorText}>Görev bulunamadı.</Text>
          )}
        </View>
      ) : (
        <>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              gap: spacing.x4,
              paddingBottom: spacing.x20,
            }} // daha fazla alt boşluk
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {/* Meta */}
            <AnimatedCard
              delay={40}
              style={styles.card}
            >
              <View style={{ gap: 6 }}>
                {task.due_date ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.meta}>
                      Bitiş:{' '}
                      {format(new Date(task.due_date), 'd MMM yyyy', {
                        locale: tr,
                      })}
                    </Text>
                  </View>
                ) : null}

                <AnimatedScalePressable
                  onPress={() => setPrioOpen(true)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <View style={[styles.prioTrigger, { alignItems: 'center' }]}>
                    <Ionicons
                      name="flag-outline"
                      size={18}
                      color={taskPriorityColor(task.priority)}
                    />
                    <Text style={[styles.meta, { marginLeft: 6 }]}>
                      Öncelik:{' '}
                    </Text>
                    <Text
                      style={{
                        color: taskPriorityColor(task.priority),
                        fontWeight: '800',
                      }}
                    >
                      {priorityLabel(task.priority)}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={16}
                      style={{ marginLeft: 6 }}
                    />
                  </View>
                </AnimatedScalePressable>

                <View
                  style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                >
                  <StatusPill status={task.status} />
                  <Text style={styles.metaMuted}>
                    Güncellendi:{' '}
                    {format(new Date(task.updated_at), 'd MMM yyyy HH:mm', {
                      locale: tr,
                    })}
                  </Text>
                </View>
              </View>
            </AnimatedCard>

            {/* Durum */}
            <AnimatedCard
              delay={90}
              style={styles.card}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={colors.text}
                  />
                  <Text style={styles.sectionTitle}>Durum</Text>
                </View>
                <AnimatedScalePressable
                  onPress={() => setStatusOpen(true)}
                  hitSlop={8}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>
                    Seç
                  </Text>
                </AnimatedScalePressable>
              </View>
              <View style={styles.rowWrap}>
                {STATUS_OPTIONS.map((st) => {
                  const active = st === task.status;
                  return (
                    <AnimatedScalePressable
                      key={st}
                      onPress={() => setStatus(st)}
                    >
                      <View
                        style={[
                          styles.chip,
                          active && {
                            backgroundColor: '#F2F4FF',
                            borderColor: taskStatusColor(st),
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: active ? taskStatusColor(st) : '#6B7280',
                            fontWeight: '600',
                          }}
                        >
                          {labelOf(st)}
                        </Text>
                      </View>
                    </AnimatedScalePressable>
                  );
                })}
              </View>
            </AnimatedCard>

            {/* Açıklama */}
            <AnimatedCard
              delay={140}
              style={styles.card}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: spacing.x1,
                }}
              >
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={colors.text}
                />
                <Text style={styles.sectionTitle}>Açıklama</Text>
              </View>
              <TextInput
                placeholder="Görev açıklaması..."
                value={desc}
                onChangeText={setDesc}
                style={styles.textarea}
                multiline
              />
              <View style={styles.actions}>
                <AnimatedScalePressable
                  style={[styles.btn, styles.btnOutline]}
                  onPress={() => setDesc(task.description ?? '')}
                >
                  <Text style={[styles.btnText, { color: colors.primary }]}>
                    Geri Al
                  </Text>
                </AnimatedScalePressable>
                <AnimatedScalePressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={saveDesc}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.btnText,
                      { color: '#fff', fontWeight: '700' },
                    ]}
                  >
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                  </Text>
                </AnimatedScalePressable>
              </View>
            </AnimatedCard>

            {/* Fotoğraflar */}
            <AnimatedCard
              delay={180}
              style={styles.card}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: spacing.x2,
                }}
              >
                <Ionicons
                  name="images-outline"
                  size={18}
                  color={colors.text}
                />
                <Text style={styles.sectionTitle}>Fotoğraflar</Text>
              </View>

              {mediaLoading ? (
                <View style={styles.centerRow}>
                  <ActivityIndicator />
                  <Text style={[styles.muted, { marginLeft: 8 }]}>
                    Yükleniyor…
                  </Text>
                </View>
              ) : media.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons
                    name="image-outline"
                    size={22}
                    color="#9CA3AF"
                  />
                  <Text style={styles.emptyText}>Henüz fotoğraf yok</Text>
                  <AnimatedScalePressable onPress={() => setFabSheet(true)}>
                    <View style={styles.emptyCta}>
                      <Text style={styles.emptyCtaText}>Foto ekle</Text>
                    </View>
                  </AnimatedScalePressable>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12 }}
                >
                  {media.map((m) => (
                    <View
                      key={m.id}
                      style={styles.thumbWrap}
                    >
                      <AnimatedScalePressable
                        onPress={() => {
                          setPreviewUrl(m.signedUrl || '');
                          resetZoom();
                        }}
                      >
                        <Image
                          source={{ uri: m.signedUrl ?? '' }}
                          style={styles.thumb}
                        />
                      </AnimatedScalePressable>
                      <AnimatedScalePressable
                        onPress={() => openConfirm(m)}
                        style={styles.trashBtn}
                        hitSlop={8}
                      >
                        <Ionicons
                          name="trash"
                          size={16}
                          color="#fff"
                        />
                      </AnimatedScalePressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </AnimatedCard>

            {/* Harcamalar */}
            <AnimatedCard
              delay={220}
              style={styles.card}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <Ionicons
                    name="cash-outline"
                    size={18}
                    color={colors.text}
                  />
                  <Text style={styles.sectionTitle}>Harcamalar</Text>
                </View>
                <Text style={{ fontWeight: '800', color: colors.text }}>
                  {expenses.length > 0
                    ? tl.format(
                        expenses.reduce(
                          (sum, e) => sum + (Number(e.amount) || 0),
                          0
                        )
                      )
                    : '₺0,00'}
                </Text>
              </View>

              {expensesLoading ? (
                <View style={styles.centerRow}>
                  <ActivityIndicator />
                  <Text style={[styles.muted, { marginLeft: 8 }]}>
                    Yükleniyor…
                  </Text>
                </View>
              ) : expenses.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons
                    name="receipt-outline"
                    size={22}
                    color="#9CA3AF"
                  />
                  <Text style={styles.emptyText}>
                    Bu göreve ait harcama yok
                  </Text>
                  <AnimatedScalePressable
                    onPress={() =>
                      task &&
                      navigate('ExpenseAdd', {
                        projectId: task.project_id,
                        taskId: task.id,
                      })
                    }
                  >
                    <View style={styles.emptyCta}>
                      <Text style={styles.emptyCtaText}>₺ Harcama ekle</Text>
                    </View>
                  </AnimatedScalePressable>
                </View>
              ) : (
                <View style={{ marginTop: spacing.x3, gap: 12 }}>
                  {expenses.map((e) => (
                    <AnimatedScalePressable
                      key={e.id}
                      onLongPress={() => openExpenseActions(e)}
                      delayLongPress={300}
                      onPress={() => {
                        if (e.signedUrl) {
                          setPreviewUrl(e.signedUrl);
                          resetZoom();
                        }
                      }}
                    >
                      <View style={styles.expItem}>
                        <View style={styles.expThumbWrap}>
                          {e.signedUrl ? (
                            <Image
                              source={{ uri: e.signedUrl }}
                              style={styles.expThumb}
                            />
                          ) : (
                            <View
                              style={[
                                styles.expThumb,
                                {
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                },
                              ]}
                            >
                              <Ionicons
                                name="receipt-outline"
                                size={18}
                                color="#9CA3AF"
                              />
                            </View>
                          )}
                        </View>

                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text
                            numberOfLines={1}
                            style={{ fontWeight: '700', color: colors.text }}
                          >
                            {e.description?.trim() || 'Harcama'}
                          </Text>
                          <Text style={styles.muted}>
                            {format(new Date(e.spent_at), 'd MMM yyyy', {
                              locale: tr,
                            })}
                          </Text>
                        </View>

                        <Text style={{ fontWeight: '800', color: colors.text }}>
                          {tl.format(Number(e.amount) || 0)}
                        </Text>
                      </View>
                    </AnimatedScalePressable>
                  ))}
                </View>
              )}
            </AnimatedCard>
          </ScrollView>

          {/* Tek “+” FAB (sağ altta) */}
          <AnimatedScalePressable
            style={styles.fabFloat}
            onPress={() => setFabSheet(true)}
            scaleTo={0.95}
            hitSlop={8}
          >
            <View style={styles.fabCircle}>
              <Ionicons
                name="add"
                size={24}
                color="#fff"
              />
            </View>
          </AnimatedScalePressable>
        </>
      )}

      {/* Tam ekran önizleme (pinch-to-zoom) */}
      <Modal
        visible={!!previewUrl}
        transparent
        onRequestClose={() => setPreviewUrl(null)}
        animationType="fade"
      >
        <GestureHandlerRootView
          pointerEvents="box-none"
          style={styles.previewBackdrop}
        >
          <Pressable
            onPress={() => setPreviewUrl(null)}
            hitSlop={16}
            style={styles.previewClose}
          >
            <Ionicons
              name="close"
              size={26}
              color="#fff"
            />
          </Pressable>
          <PinchGestureHandler
            onGestureEvent={onPinchEvent}
            onHandlerStateChange={onPinchStateChange}
            minPointers={2}
          >
            <Animated.View
              style={styles.previewArea}
              collapsable={false}
            >
              <Animated.Image
                source={{ uri: previewUrl ?? '' }}
                style={[styles.previewImage, { transform: [{ scale }] }]}
                resizeMode="contain"
              />
            </Animated.View>
          </PinchGestureHandler>
          <Pressable
            style={styles.resetBtn}
            onPress={resetZoom}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Sıfırla</Text>
          </Pressable>
        </GestureHandlerRootView>
      </Modal>

      {/* Foto sil onayı */}
      <Modal
        visible={confirm.visible}
        transparent
        animationType="fade"
        onRequestClose={closeConfirm}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmCard}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <View style={styles.confirmIconWrap}>
                <Ionicons
                  name="trash"
                  size={20}
                  color="#fff"
                />
              </View>
              <Text style={styles.confirmTitle}>Fotoğrafı sil</Text>
            </View>
            <Text style={styles.confirmText}>
              Bu fotoğrafı silmek istediğinize emin misiniz?
            </Text>
            <View style={styles.confirmActions}>
              <AnimatedScalePressable
                onPress={closeConfirm}
                style={[styles.confirmBtn, styles.confirmCancel]}
              >
                <Text style={styles.confirmCancelText}>İptal</Text>
              </AnimatedScalePressable>
              <AnimatedScalePressable
                onPress={() => confirm.row && deleteMedia(confirm.row)}
                style={[styles.confirmBtn, styles.confirmDelete]}
              >
                <Text style={styles.confirmDeleteText}>Sil</Text>
              </AnimatedScalePressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Öncelik seçimi */}
      <SelectModal
        visible={prioOpen}
        title="Öncelik seç"
        options={[
          { value: 'low', label: 'Düşük', color: taskPriorityColor('low') },
          {
            value: 'medium',
            label: 'Orta',
            color: taskPriorityColor('medium'),
          },
          { value: 'high', label: 'Yüksek', color: taskPriorityColor('high') },
        ]}
        selected={task?.priority}
        onClose={() => setPrioOpen(false)}
        onSelect={(v) => updatePriority(v as TaskPriority)}
      />

      {/* Durum seçimi */}
      <SelectModal
        visible={statusOpen}
        title="Durum seç"
        options={(
          ['yapılacak', 'yapılıyor', 'tamamlandı', 'iptal'] as TaskStatus[]
        ).map((s) => ({
          value: s,
          label: labelOf(s),
          color: taskStatusColor(s),
        }))}
        selected={task?.status}
        onClose={() => setStatusOpen(false)}
        onSelect={(v) => {
          setStatus(v as TaskStatus);
          setStatusOpen(false);
        }}
      />

      {/* Harcama aksiyon sheet */}
      <Modal
        visible={expActions.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setExpActions({ visible: false })}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Harcama</Text>
            <AnimatedScalePressable
              style={styles.sheetBtn}
              onPress={() => expActions.row && startEditExpense(expActions.row)}
            >
              <Ionicons
                name="create-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.sheetBtnText}>Düzenle</Text>
            </AnimatedScalePressable>
            <AnimatedScalePressable
              style={styles.sheetBtn}
              onPress={() => expActions.row && deleteExpense(expActions.row)}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color="#EF4444"
              />
              <Text style={[styles.sheetBtnText, { color: '#EF4444' }]}>
                Sil
              </Text>
            </AnimatedScalePressable>
            <AnimatedScalePressable
              style={[styles.sheetBtn, { justifyContent: 'center' }]}
              onPress={() => setExpActions({ visible: false })}
            >
              <Text style={[styles.sheetBtnText, { color: '#111827' }]}>
                İptal
              </Text>
            </AnimatedScalePressable>
          </View>
        </View>
      </Modal>

      {/* FAB action sheet (₺ Harcama, Kamera, Galeri) */}
      <Modal
        visible={fabSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setFabSheet(false)}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheetCard}>
            <Text style={styles.sheetTitle}>Ekle</Text>

            <AnimatedScalePressable
              style={styles.sheetBtn}
              onPress={() => {
                setFabSheet(false);
                task &&
                  navigate('ExpenseAdd', {
                    projectId: task.project_id,
                    taskId: task.id,
                  });
              }}
            >
              <Ionicons
                name="cash-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.sheetBtnText}>₺ Harcama Ekle</Text>
            </AnimatedScalePressable>

            <AnimatedScalePressable
              style={styles.sheetBtn}
              onPress={async () => {
                setFabSheet(false);
                await captureWithCamera();
              }}
            >
              <Ionicons
                name="camera-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.sheetBtnText}>Foto: Kameradan</Text>
            </AnimatedScalePressable>

            <AnimatedScalePressable
              style={styles.sheetBtn}
              onPress={async () => {
                setFabSheet(false);
                await pickFromLibrary();
              }}
            >
              <Ionicons
                name="image-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.sheetBtnText}>Foto: Galeriden</Text>
            </AnimatedScalePressable>

            <AnimatedScalePressable
              style={[styles.sheetBtn, { justifyContent: 'center' }]}
              onPress={() => setFabSheet(false)}
            >
              <Text style={[styles.sheetBtnText, { color: '#111827' }]}>
                İptal
              </Text>
            </AnimatedScalePressable>
          </View>
        </View>
      </Modal>

      {/* Harcama düzenle modal */}
      <Modal
        visible={expEdit.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setExpEdit({ visible: false })}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.editCard}>
            <Text style={styles.prioTitle}>Harcamayı düzenle</Text>

            <Text style={styles.label}>Tutar (₺)</Text>
            <TextInput
              value={expEdit.amount}
              onChangeText={(t) => setExpEdit((e) => ({ ...e, amount: t }))}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: spacing.x3 }]}>Tarih</Text>
            <TextInput
              value={expEdit.dateStr}
              onChangeText={(t) => setExpEdit((e) => ({ ...e, dateStr: t }))}
              placeholder="YYYY-AA-GG"
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: spacing.x3 }]}>
              Açıklama
            </Text>
            <TextInput
              value={expEdit.description}
              onChangeText={(t) =>
                setExpEdit((e) => ({ ...e, description: t }))
              }
              multiline
              style={[
                styles.input,
                { minHeight: 90, textAlignVertical: 'top' },
              ]}
            />

            <View
              style={{ flexDirection: 'row', gap: 12, marginTop: spacing.x3 }}
            >
              <AnimatedScalePressable
                style={[styles.confirmBtn, styles.confirmCancel, { flex: 1 }]}
                onPress={() => setExpEdit({ visible: false })}
              >
                <Text style={styles.confirmCancelText}>İptal</Text>
              </AnimatedScalePressable>
              <AnimatedScalePressable
                style={[
                  styles.confirmBtn,
                  styles.btnPrimary,
                  { flex: 1, borderColor: colors.primary },
                ]}
                onPress={saveEditExpense}
                disabled={!!expEdit.saving}
              >
                <Text
                  style={[styles.btnText, { color: '#fff', fontWeight: '800' }]}
                >
                  {expEdit.saving ? 'Kaydediliyor…' : 'Kaydet'}
                </Text>
              </AnimatedScalePressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

/** --------------------------- SelectModal --------------------------- */
type SelectOption = { value: string; label: string; color?: string };
function SelectModal({
  visible,
  title,
  options,
  selected,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selected?: string | null;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.prioBackdrop}>
        <View style={styles.prioCard}>
          <Text style={styles.prioTitle}>{title}</Text>
          {options.map((opt) => {
            const active = selected === opt.value;
            return (
              <AnimatedScalePressable
                key={opt.value}
                onPress={() => onSelect(opt.value)}
              >
                <View
                  style={[
                    styles.prioOption,
                    active && { backgroundColor: '#F8FAFF', borderRadius: 10 },
                  ]}
                >
                  <View
                    style={[
                      styles.prioDot,
                      {
                        backgroundColor: active
                          ? opt.color ?? colors.primary
                          : '#E5E7EB',
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.prioText,
                      active && {
                        color: opt.color ?? colors.primary,
                        fontWeight: '800',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </View>
              </AnimatedScalePressable>
            );
          })}
          <AnimatedScalePressable
            onPress={onClose}
            style={styles.prioCancel}
          >
            <Text style={styles.prioCancelText}>İptal</Text>
          </AnimatedScalePressable>
        </View>
      </View>
    </Modal>
  );
}

/** --------------------------- Yardımcılar --------------------------- */
function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <View
      style={[
        styles.pill,
        { borderColor: taskStatusColor(status), backgroundColor: '#F8F9FF' },
      ]}
    >
      <Text style={{ color: taskStatusColor(status), fontWeight: '700' }}>
        {labelOf(status)}
      </Text>
    </View>
  );
}
function labelOf(st: TaskStatus): string {
  switch (st) {
    case 'yapılacak':
      return 'Yapılacak';
    case 'yapılıyor':
      return 'Yapılıyor';
    case 'tamamlandı':
      return 'Tamamlandı';
    case 'iptal':
      return 'İptal';
  }
}
function priorityLabel(p: TaskPriority): string {
  switch (p) {
    case 'high':
      return 'Yüksek';
    case 'low':
      return 'Düşük';
    default:
      return 'Orta';
  }
}

/** ------------------------------ STYLES ------------------------------ */
const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.x6,
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.x4,
  },
  muted: { color: '#6B7280', marginTop: spacing.x2 },
  errorText: { color: '#DC2626' },

  card: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.x4,
    borderWidth: 1,
    borderColor: '#EDEDED',
    ...shadow.sm,
  },
  sectionTitle: {
    fontSize: font.sizes.md,
    fontWeight: '700',
    color: colors.text,
  },

  meta: { color: colors.text },
  metaMuted: { color: '#6B7280' },

  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.x2,
    marginTop: spacing.x3,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E3E3E3',
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  textarea: {
    borderWidth: 1,
    borderColor: '#E3E3E3',
    borderRadius: radius.lg,
    minHeight: 110,
    padding: spacing.x3,
    color: colors.text,
    textAlignVertical: 'top',
    marginTop: spacing.x3,
  },

  actions: { flexDirection: 'row', gap: spacing.x3, marginTop: spacing.x3 },
  btn: {
    flex: 1,
    paddingVertical: spacing.x4,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  btnPrimary: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  btnText: { fontSize: font.sizes.md },

  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },

  // boş durum
  emptyCard: {
    borderWidth: 1,
    borderColor: '#EDEDED',
    backgroundColor: '#FAFAFF',
    borderRadius: radius.lg,
    padding: spacing.x4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: { color: '#6B7280' },
  emptyCta: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800' },

  thumbWrap: { position: 'relative' },
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

  // Önizleme modal
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewArea: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '100%' },
  previewClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    padding: 8,
    zIndex: 20,
    elevation: 20,
  },
  resetBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
  },

  // Sheet / edit modal
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    ...shadow.md,
  },
  sheetTitle: {
    fontSize: font.sizes.md,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  sheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  sheetBtnText: { fontWeight: '700', color: colors.primary },

  editCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    ...shadow.md,
  },
  label: { fontSize: font.sizes.md, fontWeight: '700', color: '#111827' },
  input: {
    marginTop: spacing.x2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: '#111827',
  },

  // “+” FAB
  fabFloat: { position: 'absolute', right: 18, bottom: 24 },
  fabCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },

  // ekstra alt boşluk
  paddingBottomGrow: { paddingBottom: spacing.x20 },
});
