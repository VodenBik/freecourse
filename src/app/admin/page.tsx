import { AdminPanel } from "@/components/admin/admin-panel";
import { ProtectedRoute } from "@/components/providers";

export default function AdminPage() {
  return (
    <ProtectedRoute roles={["admin", "teacher", "curator"]}>
      <AdminPanel />
    </ProtectedRoute>
  );
}
