export type RootStackParamList = {
  // Guest
  Login: undefined;

  // Authenticated
  Companies: undefined;
  Projects: { companyId: number; companyName?: string };
  Tasks: { projectId: number; projectName?: string };
  TaskDetail: { taskId: number; projectName?: string };
  ExpenseAdd: { projectId: number; taskId?: number | null };
};
