import 'react-native-gesture-handler'; // navigasyon için gerekli
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { supabase } from './src/lib/supabase';
import LoginScreen from './src/screens/Login';

type RootStackParamList = {
  Login: undefined;
  Home: undefined; // Şirketler ekranı yerine şimdilik basit "Home"
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({}: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const [companyCount, setCompanyCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchCompanies = async () => {
      const { count, error } = await supabase
        .from('companies')
        .select('*', { count: 'exact', head: true });
      if (!error) setCompanyCount(count ?? 0);
    };
    fetchCompanies();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Şirketler</Text>
      {companyCount === null ? (
        <ActivityIndicator />
      ) : (
        <Text style={{ marginTop: 8 }}>Toplam şirket: {companyCount}</Text>
      )}
      <TouchableOpacity
        onPress={async () => {
          await supabase.auth.signOut();
        }}
        style={styles.logoutBtn}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Çıkış Yap</Text>
      </TouchableOpacity>
      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      setIsAuthed(!!data.session);
      setReady(true);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });
    init();
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <View style={styles.container}>
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
        {!isAuthed ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ title: 'Giriş' }}
          />
        ) : (
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'İlka' }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#000089' },
  logoutBtn: {
    marginTop: 16,
    backgroundColor: '#000089',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
});
