import { useEffect, useState } from "react";
import kempLogo from "@/assets/kemp-logo.png";

interface SplashScreenProps {
  onComplete: () => void;
}

const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 300); // Allow fade out animation to complete
    }, 1000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) {
    return (
      <div className="fixed inset-0 bg-gradient-hero flex items-center justify-center z-50 transition-opacity duration-300 opacity-0">
        <div className="text-center">
          <div className="w-32 h-32 mx-auto mb-4 animate-pulse">
            <img
              src={kempLogo}
              alt="KEMP Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">KEMP</h1>
          <p className="text-white/80 text-lg">Maji Track</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-hero flex items-center justify-center z-50">
      <div className="text-center">
        <div className="w-32 h-32 mx-auto mb-4 animate-bounce">
          <img
            src={kempLogo}
            alt="KEMP Logo"
            className="w-full h-full object-contain drop-shadow-lg"
          />
        </div>
        <h1 className="text-4xl font-bold text-white mb-2 animate-fade-in">KEMP</h1>
        <p className="text-white/80 text-lg animate-fade-in">Maji Track</p>
      </div>
    </div>
  );
};

export default SplashScreen;