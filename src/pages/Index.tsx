import { useState, useEffect } from "react";
import SplashScreen from "@/components/SplashScreen";
import LandingPage from "@/components/LandingPage";
import AuthPage from "@/components/AuthPage";
import MasterAdminDashboard from "@/components/dashboard/MasterAdminDashboard";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import CustomerDashboard from "@/components/dashboard/CustomerDashboard";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, userRole, loading } = useAuth();
  const [currentView, setCurrentView] = useState<'splash' | 'landing' | 'auth'>('splash');
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleSplashComplete = () => {
    setCurrentView('landing');
  };

  const handleLogin = () => {
    setCurrentView('auth');
  };

  const handleBackToLanding = () => {
    setCurrentView('landing');
  };

  const handleLogout = () => {
    setCurrentView('landing');
  };

  // Show splash screen
  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  // Show loading while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated, show role-based dashboard
  if (user) {
    const role = userRole || 'Customer';
    switch (role) {
      case 'MasterAdmin':
        return <MasterAdminDashboard onLogout={handleLogout} />;
      case 'Admin':
        return <AdminDashboard onLogout={handleLogout} />;
      case 'Customer':
      default:
        return <CustomerDashboard onLogout={handleLogout} />;
    }
  }

  // Show auth page if user clicked login
  if (currentView === 'auth') {
    return <AuthPage onBack={handleBackToLanding} />;
  }

  // Show landing page for unauthenticated users
  return <LandingPage onLogin={handleLogin} />;
};

export default Index;
