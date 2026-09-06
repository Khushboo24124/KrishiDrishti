import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Grow from "./pages/Grow";
import Protect from "./pages/Protect";
import Sell from "./pages/Sell";
import Advisory from "./pages/Advisory";
import History from "./pages/History";
import ReviewDashboard from "./pages/ReviewDashboard";

function RequireFarmer({ children }) {
  const { farmer, checking } = useAuth();
  if (checking) return <div className="text-center py-10 text-soil-400">Checking session...</div>;
  if (!farmer) return <Navigate to="/login" replace />;
  return children;
}

function Shell() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <RequireFarmer>
                <Dashboard />
              </RequireFarmer>
            }
          />
          <Route
            path="/grow"
            element={
              <RequireFarmer>
                <Grow />
              </RequireFarmer>
            }
          />
          <Route
            path="/protect"
            element={
              <RequireFarmer>
                <Protect />
              </RequireFarmer>
            }
          />
          <Route
            path="/sell"
            element={
              <RequireFarmer>
                <Sell />
              </RequireFarmer>
            }
          />
          <Route
            path="/history"
            element={
              <RequireFarmer>
                <History />
              </RequireFarmer>
            }
          />
          <Route path="/advisory" element={<Advisory />} />
          <Route path="/advisory/:id" element={<Advisory />} />
          {/* Review dashboard is intentionally NOT gated behind farmer auth -
              reviewers/agri-officers are a separate user type per Phase 1 §4 */}
          <Route path="/review" element={<ReviewDashboard />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
