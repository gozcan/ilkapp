// src/screens/Tasks.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Screen from '../ui/Screen';
import { supabase } from '../lib/supabase';
import {
  colors,
  font,
  radius,
  s,
  shadow,
  spacing,
  taskPriorityColor,
  taskStatusColor,
} from '../ui/theme';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';

export type TaskStatus = 'yapılacak' | 'yapılıyor' | 'tamamlandı' | 'iptal';
export type TaskPriority = 'low' | 'medium' | 'high';

export type Task = {
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

type Props = {
  projectId: number;
  projectName?: string;
  onSelectTask?: (t: Task) => void;
};

const STATUS_TABS: TaskStatus[] = [
  'yapılacak',
  'yapılıyor',
  'tamamlandı',
  'iptal',
];

export default function TasksScreen({
  projectId,
  projectName,
  onSelectTask,
}: Props) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<TaskStatus | 'tümü'>('yapılacak');
  const [data, setData] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [due, setDue] = useState('');

  const titleTxt = projectName ? `${projectName} • Görevler` : 'Görevler';

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    let query = supabase
      .from('tasks')
      .select(
        'id, project_id, title, description, status, priority, due_date, created_by, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false });

    if (tab !== 'tümü') query = query.eq('status', tab);

    const { data, error } = await query;
    if (error) setError(error.message);
    setData(data ?? []);
    setLoading(false);
  }, [projectId, tab]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter(
      (t) =>
        t.title.toLowerCase().includes(term) ||
        (t.description ?? '').toLowerCase().includes(term)
    );
  }, [q, data]);

  const renderItem = ({ item }: { item: Task }) => (
    <TaskCard
      task={item}
      onPress={() => onSelectTask?.(item)}
    />
  );

  const resetForm = () => {
    setTitle('');
    setDesc('');
    setPriority('medium');
    setDue('');
  };

  const createTask = async () => {
    if (!title.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Uyarı',
        text2: 'Başlık gerekli.',
        position: 'top',
      });
      return;
    }
    const tempId = -Date.now();
    const optimistic: Task = {
      id: tempId as unknown as number,
      project_id: projectId,
      title: title.trim(),
      description: desc.trim() || null,
      status: 'yapılacak',
      priority,
      due_date: due.trim() || null,
      created_by: 'me',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setData((prev) => [optimistic, ...prev]);
    setShowNew(false);

    const { data: inserted, error } = await supabase
      .from('tasks')
      .insert({
        project_id: projectId,
        title: optimistic.title,
        description: optimistic.description,
        status: 'yapılacak',
        priority: optimistic.priority,
        due_date: optimistic.due_date,
      })
      .select(
        'id, project_id, title, description, status, priority, due_date, created_by, created_at, updated_at'
      )
      .single();

    if (error) {
      setData((prev) => prev.filter((t) => t.id !== tempId));
      Toast.show({
        type: 'error',
        text1: 'Hata',
        text2: error.message,
        position: 'top',
      });
      return;
    }

    setData((prev) => [
      inserted as Task,
      ...prev.filter((t) => t.id !== tempId),
    ]);
    Toast.show({
      type: 'success',
      text1: 'Başarılı',
      text2: 'Görev eklendi.',
      position: 'top',
    });
    resetForm();
  };

  return (
    <Screen title={titleTxt}>
      <TextInput
        placeholder="Görev ara..."
        value={q}
        onChangeText={setQ}
        style={styles.search}
        autoCapitalize="none"
        returnKeyType="search"
      />

      <View style={styles.tabsRow}>
        <Chip
          label="Tümü"
          active={tab === 'tümü'}
          onPress={() => setTab('tümü')}
          color={colors.text}
        />
        {STATUS_TABS.map((st) => (
          <Chip
            key={st}
            label={labelOf(st)}
            active={tab === st}
            onPress={() => setTab(st)}
            color={taskStatusColor(st)}
          />
        ))}
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Bir hata oluştu: {error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={load}
          >
            <Text style={styles.retryText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Yükleniyor…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState onRetry={load} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: s('x10') }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
            />
          }
        />
      )}

      {/* FAB */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.9 }]}
        onPress={() => setShowNew(true)}
      >
        <Ionicons
          name="add"
          size={26}
          color="#fff"
        />
      </Pressable>

      {/* Yeni Görev Modal */}
      <Modal
        visible={showNew}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNew(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', android: 'height' })}
          style={styles.modalWrap}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Yeni Görev</Text>
              <Pressable
                onPress={() => setShowNew(false)}
                hitSlop={8}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={colors.text}
                />
              </Pressable>
            </View>

            <TextInput
              placeholder="Başlık *"
              value={title}
              onChangeText={setTitle}
              style={styles.input}
            />
            <TextInput
              placeholder="Açıklama"
              value={desc}
              onChangeText={setDesc}
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              multiline
            />

            {/* Öncelik seçimi */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Öncelik</Text>
              <View style={styles.rowChips}>
                {(['low', 'medium', 'high'] as TaskPriority[]).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setPriority(p)}
                    style={[
                      styles.pill,
                      {
                        borderColor: taskPriorityColor(p),
                        backgroundColor:
                          priority === p ? '#F8F9FF' : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={{ color: taskPriorityColor(p), fontWeight: '600' }}
                    >
                      {priorityLabel(p)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <TextInput
              placeholder="Bitiş tarihi (YYYY-AA-GG, opsiyonel)"
              value={due}
              onChangeText={setDue}
              style={styles.input}
            />

            <View style={styles.actions}>
              <Pressable
                style={[styles.actionBtn, { borderColor: colors.border }]}
                onPress={() => setShowNew(false)}
              >
                <Text style={[styles.actionText, { color: '#6B7280' }]}>
                  İptal
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.actionBtn,
                  {
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  },
                ]}
                onPress={createTask}
              >
                <Text
                  style={[
                    styles.actionText,
                    { color: '#fff', fontWeight: '700' },
                  ]}
                >
                  Kaydet
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

function TaskCard({ task, onPress }: { task: Task; onPress?: () => void }) {
  const due = task.due_date
    ? new Date(task.due_date).toLocaleDateString('tr-TR')
    : null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text
          style={styles.cardTitle}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        {task.description ? (
          <Text
            style={styles.cardSubtitle}
            numberOfLines={2}
          >
            {task.description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <Pill
            text={labelOf(task.status)}
            color={taskStatusColor(task.status)}
          />
          <Pill
            text={priorityLabel(task.priority)}
            color={taskPriorityColor(task.priority)}
            outline
          />
          {due ? <Text style={styles.metaText}>Bitiş: {due}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

function Chip({
  label,
  active,
  onPress,
  color,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && {
          backgroundColor: '#F2F4FF',
          borderColor: color || colors.primary,
        },
        pressed && { opacity: 0.9 },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? color || colors.primary : '#6B7280' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Pill({
  text,
  color,
  outline = false,
}: {
  text: string;
  color?: string;
  outline?: boolean;
}) {
  return (
    <View
      style={[
        styles.pill,
        outline
          ? {
              backgroundColor: 'transparent',
              borderColor: color || colors.border,
              borderWidth: 1,
            }
          : { backgroundColor: '#F8F9FF' },
      ]}
    >
      <Text style={{ color: color || colors.text, fontWeight: '600' }}>
        {text}
      </Text>
    </View>
  );
}

function EmptyState({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Bu projede görev yok</Text>
      <Text style={styles.muted}>
        Sağ alttaki + ile görev ekleyebilirsiniz.
      </Text>
      <Pressable
        style={styles.retryBtn}
        onPress={onRetry}
      >
        <Text style={styles.retryText}>Yenile</Text>
      </Pressable>
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

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.x3,
    paddingHorizontal: spacing.x4,
    marginBottom: spacing.x3,
    fontSize: font.sizes.md,
    color: colors.text,
  },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.x2,
    marginBottom: spacing.x3,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  chipText: { fontSize: font.sizes.sm, fontWeight: '600' },

  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.x6,
  },
  muted: { color: '#6B7280', marginTop: spacing.x2 },

  errorText: {
    color: '#DC2626',
    textAlign: 'center',
    marginBottom: spacing.x3,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.x3,
    paddingHorizontal: spacing.x5,
    borderRadius: radius.lg,
  },
  retryText: { color: colors.primary, fontWeight: '700' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.x4,
    marginBottom: spacing.x3,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardTitle: { fontSize: font.sizes.lg, fontWeight: '700', color: colors.text },
  cardSubtitle: { fontSize: font.sizes.sm, color: '#6B7280' },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    marginTop: spacing.x2,
  },
  metaText: { fontSize: font.sizes.sm, color: '#6B7280' },

  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.x8,
    gap: spacing.x3,
  },
  emptyTitle: {
    fontSize: font.sizes.md,
    fontWeight: '700',
    color: colors.text,
  },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
  },

  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.x5,
    paddingTop: spacing.x4,
    paddingBottom: spacing.x6,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.x3,
  },
  sheetTitle: {
    fontSize: font.sizes.lg,
    fontWeight: '700',
    color: colors.text,
  },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.x4,
    paddingVertical: spacing.x3,
    marginBottom: spacing.x3,
    color: colors.text,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.x3,
  },
  rowLabel: { fontSize: font.sizes.md, color: colors.text, fontWeight: '600' },
  rowChips: { flexDirection: 'row', gap: spacing.x2 },

  actions: { flexDirection: 'row', gap: spacing.x3, marginTop: spacing.x2 },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.x4,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: font.sizes.md },
});
