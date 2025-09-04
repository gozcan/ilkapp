// src/screens/Companies.tsx
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
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import { colors, font, radius, shadow, spacing, s } from '../ui/theme';

type Company = {
  id: number;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  created_at: string;
};

type Props = {
  // İleride React Navigation ile bağlayacağız
  // navigation?: any;
  // route?: any;
  onSelectCompany?: (company: Company) => void;
};

export default function CompaniesScreen({ onSelectCompany }: Props) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = useCallback(async () => {
    setError(null);
    setLoading(true);
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, description, status, created_at')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setData(data ?? []);
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, description, status, created_at')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setData(data ?? []);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.description ?? '').toLowerCase().includes(term)
    );
  }, [q, data]);

  const renderItem = ({ item }: { item: Company }) => (
    <CompanyCard
      company={item}
      onPress={() => {
        if (onSelectCompany) onSelectCompany(item);
        // Navigasyon bağlandığında buradan Projects ekranına gideceğiz
        // navigation?.navigate('Projects', { companyId: item.id });
      }}
    />
  );

  return (
    <Screen title="Şirketler">
      {/* Arama kutusu */}
      <TextInput
        placeholder="Şirket ara..."
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
            onPress={fetchCompanies}
          >
            <Text style={styles.retryText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Yükleme */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>Yükleniyor…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState onRetry={fetchCompanies} />
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

function CompanyCard({
  company,
  onPress,
}: {
  company: Company;
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
          {company.name}
        </Text>
        {company.description ? (
          <Text
            style={styles.cardSubtitle}
            numberOfLines={2}
          >
            {company.description}
          </Text>
        ) : null}
      </View>
      <StatusPill status={company.status} />
    </Pressable>
  );
}

function StatusPill({ status }: { status: Company['status'] }) {
  const isActive = status === 'active';
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: isActive ? '#E8E8FF' : '#F3F4F6',
          borderColor: isActive ? colors.primary : '#D1D5DB',
        },
      ]}
    >
      <Text
        style={{
          color: isActive ? colors.primary : '#6B7280',
          fontWeight: '600',
        }}
      >
        {isActive ? 'Aktif' : 'Arşiv'}
      </Text>
    </View>
  );
}

function EmptyState({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Henüz şirket yok</Text>
      <Text style={styles.muted}>
        Yönetici panelinden şirket ekleyebilirsiniz.
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
    flexDirection: 'row',
    gap: spacing.x4,
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: font.sizes.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  cardSubtitle: { fontSize: font.sizes.sm, color: '#6B7280' },

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
});
