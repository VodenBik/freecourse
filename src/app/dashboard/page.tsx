import { ProtectedRoute } from "@/components/providers";
import { StudentDashboard } from "@/components/dashboard/student-dashboard";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <StudentDashboard />
    </ProtectedRoute>
  );
}
