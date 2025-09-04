import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { supabase } from './src/lib/supabase';
import LoginScreen from './src/screens/Login';
import CompaniesScreen from './src/screens/Companies';
import ProjectsScreen, { Project } from './src/screens/Projects';
import TasksScreen, { Task } from './src/screens/Tasks';
import TaskDetailScreen from './src/screens/TaskDetail';
import Toast from 'react-native-toast-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ExpenseAdd from './src/screens/ExpenseAdd';
import type { RootStackParamList } from './src/navigation/types';
import { navRef } from './src/navigation/nav';

const Stack = createNativeStackNavigator<RootStackParamList>();

function CompaniesRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Companies'>) {
  return (
    <CompaniesScreen
      onSelectCompany={(c) =>
        navigation.navigate('Projects', {
          companyId: c.id,
          companyName: c.name,
        })
      }
    />
  );
}

function ProjectsRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Projects'>) {
  const { companyId, companyName } = route.params;
  return (
    <ProjectsScreen
      companyId={companyId}
      companyName={companyName}
      onSelectProject={(p: Project) =>
        navigation.navigate('Tasks', { projectId: p.id, projectName: p.name })
      }
    />
  );
}

function TasksRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Tasks'>) {
  const { projectId, projectName } = route.params;
  return (
    <TasksScreen
      projectId={projectId}
      projectName={projectName}
      onSelectTask={(t: Task) =>
        navigation.navigate('TaskDetail', { taskId: t.id, projectName })
      }
    />
  );
}

function TaskDetailRoute({
  route,
}: NativeStackScreenProps<RootStackParamList, 'TaskDetail'>) {
  const { taskId, projectName } = route.params;
  return (
    <TaskDetailScreen
      taskId={taskId}
      projectName={projectName}
    />
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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.center}>
          <Text>Yükleniyor...</Text>
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer ref={navRef}>
        <Stack.Navigator screenOptions={{ headerTitleAlign: 'center' }}>
          {!isAuthed ? (
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ title: 'Giriş' }}
            />
          ) : (
            <>
              <Stack.Screen
                name="Companies"
                component={CompaniesRoute}
                options={{ title: 'Şirketler' }}
              />
              <Stack.Screen
                name="Projects"
                component={ProjectsRoute}
                options={({ route }) => ({
                  title: route.params.companyName
                    ? `${route.params.companyName} • Projeler`
                    : 'Projeler',
                })}
              />
              <Stack.Screen
                name="Tasks"
                component={TasksRoute}
                options={({ route }) => ({
                  title: route.params.projectName
                    ? `${route.params.projectName} • Görevler`
                    : 'Görevler',
                })}
              />
              <Stack.Screen
                name="TaskDetail"
                component={TaskDetailRoute}
                options={({ route }) => ({
                  title: route.params.projectName
                    ? `${route.params.projectName} • Görev`
                    : 'Görev',
                })}
              />
              <Stack.Screen
                name="ExpenseAdd"
                component={ExpenseAddRoute}
                options={{ headerShown: false }} // Screen bileşenimiz kendi başlığını çiziyor
              />
            </>
          )}
        </Stack.Navigator>

        {/* Toast container tek yerde (root) */}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', inset: 0 }}
        >
          <Toast
            topOffset={60}
            bottomOffset={80}
          />
        </View>
        <StatusBar style="auto" />
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

function ExpenseAddRoute({
  route,
}: NativeStackScreenProps<RootStackParamList, 'ExpenseAdd'>) {
  const { projectId, taskId } = route.params;
  return (
    <ExpenseAdd
      projectId={projectId}
      taskId={taskId}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
