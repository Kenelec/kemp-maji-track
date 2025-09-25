import { useState, useEffect } from "react";
import SplashScreen from "@/components/SplashScreen";
import LandingPage from "@/components/LandingPage";
import AuthPage from "@/components/AuthPage";

const Index = () => {
  const [currentView, setCurrentView] = useState<'splash' | 'landing' | 'auth'>('splash');

  const handleSplashComplete = () => {
    setCurrentView('landing');
  };

  const handleLogin = () => {
    setCurrentView('auth');
  };

  const handleBackToLanding = () => {
    setCurrentView('landing');
  };

  if (currentView === 'splash') {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (currentView === 'auth') {
    return <AuthPage onBack={handleBackToLanding} />;
  }

  return <LandingPage onLogin={handleLogin} />;
};

export default Index;
