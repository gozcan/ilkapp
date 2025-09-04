// src/screens/Projects.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import Screen from '../ui/Screen';
import { supabase } from '../lib/supabase';
import { colors, font, radius, shadow, spacing, s } from '../ui/theme';

export type Project = {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: 'active' | 'archived';
  created_at: string;
};

type Props = {
  companyId: number; // Zorunlu: hangi şirketin projeleri
  companyName?: string; // Başlıkta göstermek için opsiyonel
  onSelectProject?: (p: Project) => void; // Tıklamada geri çağrı (navigasyonda kullanacağız)
};

export default function ProjectsScreen({
  companyId,
  companyName,
  onSelectProject,
}: Props) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = companyName ? `${companyName} • Projeler` : 'Projeler';

  const fetchProjects = useCallback(async () => {
    setError(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('projects')
      .select(
        'id, company_id, name, description, start_date, end_date, status, created_at'
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setData(data ?? []);
    setLoading(false);
  }, [companyId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('projects')
      .select(
        'id, company_id, name, description, start_date, end_date, status, created_at'
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setData(data ?? []);
    setRefreshing(false);
  }, [companyId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description ?? '').toLowerCase().includes(term)
    );
  }, [q, data]);

  const renderItem = ({ item }: { item: Project }) => (
    <ProjectCard
      project={item}
      onPress={() => onSelectProject?.(item)}
    />
  );

  return (
    <Screen title={title}>
      {/* Arama */}
      <TextInput
        placeholder="Proje ara..."
        value={q}
        onChangeText={setQ}
        style={styles.search}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {/* Hata */}
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Bir hata oluştu: {error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={fetchProjects}
          >
            <Text style={styles.retryText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Yükleme / Boş / Liste */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Yükleniyor…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState onRetry={fetchProjects} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: s('x6') }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
        />
      )}
    </Screen>
  );
}

function ProjectCard({
  project,
  onPress,
}: {
  project: Project;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={styles.cardTitle}
          numberOfLines={1}
        >
          {project.name}
        </Text>
        {project.description ? (
          <Text
            style={styles.cardSubtitle}
            numberOfLines={2}
          >
            {project.description}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          <StatusPill status={project.status} />
          {project.start_date ? (
            <Text style={styles.metaText}>
              Başlangıç:{' '}
              {new Date(project.start_date).toLocaleDateString('tr-TR')}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function StatusPill({ status }: { status: Project['status'] }) {
  const isActive = status === 'active';
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: isActive ? '#E8FBEA' : '#F3F4F6',
          borderColor: isActive ? '#16A34A' : '#D1D5DB',
        },
      ]}
    >
      <Text
        style={{ color: isActive ? '#16A34A' : '#6B7280', fontWeight: '600' }}
      >
        {isActive ? 'Aktif' : 'Arşiv'}
      </Text>
    </View>
  );
}

function EmptyState({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Bu şirkete ait proje yok</Text>
      <Text style={styles.muted}>
        Yönetici panelinden proje ekleyebilirsiniz.
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

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.x3,
    paddingHorizontal: spacing.x4,
    marginBottom: spacing.x4,
    fontSize: font.sizes.md,
    color: colors.text,
  },
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
    flexDirection: 'column',
    gap: spacing.x3,
  },
  cardTitle: { fontSize: font.sizes.lg, fontWeight: '700', color: colors.text },
  cardSubtitle: { fontSize: font.sizes.sm, color: '#6B7280' },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.x3,
    marginTop: spacing.x2,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },

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
});
