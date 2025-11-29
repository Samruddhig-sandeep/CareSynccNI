import "./global.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { useAuth } from "@/contexts/AuthContext";
import { Chatbot } from "./components/Chatbot";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import Index from "./pages/Index";
import CodeMapping from "./pages/CodeMapping";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Router = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      {!isAuthenticated && (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}

      {/* Protected Routes */}
      {isAuthenticated && (
        <>
{/* Redirect / to /dashboard after login */}
<Route path="/" element={<Navigate to="/dashboard" replace />} />

<Route
  path="/dashboard"
  element={
    <ProtectedRoute>
      <Index />
    </ProtectedRoute>
  }
/>

          <Route
            path="/mapping"
            element={
              <ProtectedRoute>
                <CodeMapping />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients"
            element={
              <ProtectedRoute>
                <Patients />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients/:patientId"
            element={
              <ProtectedRoute>
                <PatientDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </>
      )}
    </Routes>
  );
};

const AppWithProviders = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Layout>
                <Router />
              </Layout>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

createRoot(document.getElementById("root")!).render(<AppWithProviders />);

function App() {
  return (
    <>
      {/* Your app UI */}
      <Chatbot />
    </>
  );
}