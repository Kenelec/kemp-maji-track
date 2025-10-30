import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Droplets, Truck, CreditCard, Users, BarChart3, Shield, Menu, X } from "lucide-react";
const kempLogo = "/kemp-logo.png";
import { useState } from "react";

interface LandingPageProps {
  onLogin: () => void;
}

const LandingPage = ({ onLogin }: LandingPageProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const features = [
    {
      icon: Droplets,
      title: "Water Delivery Management",
      description: "Track and manage water deliveries with real-time status updates and scheduling."
    },
    {
      icon: Truck,
      title: "Delivery Tracking",
      description: "Monitor delivery status from dispatch to completion with detailed reporting."
    },
    {
      icon: CreditCard,
      title: "Payment Processing",
      description: "Handle payments through multiple channels including M-Pesa, cash, and cards."
    },
    {
      icon: Users,
      title: "Customer Management",
      description: "Comprehensive customer database with delivery history and payment tracking."
    },
    {
      icon: BarChart3,
      title: "Analytics & Reports",
      description: "Generate detailed reports and export data in multiple formats (CSV, XLS, PDF)."
    },
    {
      icon: Shield,
      title: "Secure & Reliable",
      description: "Role-based access control with secure authentication and data protection."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/5">
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 right-4 z-50">
        <Button 
          variant="outline" 
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="bg-primary text-primary-foreground"
        >
          {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden" />
      )}

      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
  <img src={kempLogo} alt="KEMP Logo" className="w-8 h-8 md:w-10 md:h-10 object-contain" />
  <div>
    <h1 className="text-lg md:text-xl font-bold text-primary">KEMP</h1>
    <p className="text-xs md:text-sm text-muted-foreground">Maji Track</p>
  </div>
</div>
          
          {/* Mobile menu */}
          <div className={`fixed top-0 right-0 h-full w-64 bg-card shadow-lg z-50 transform transition-transform duration-300 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          } md:hidden`}>
            <div className="p-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold">Menu</h2>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Button 
                variant="default" 
                className="w-full mb-4"
                onClick={onLogin}
              >
                Login
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setMobileMenuOpen(false);
                  // Scroll to features section
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Learn More
              </Button>
            </div>
          </div>

          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-4">
            <Button 
              variant="default" 
              size="lg" 
              className="shadow-primary"
              onClick={onLogin}
            >
              Login
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-12 px-4"> {/* Reduced padding for mobile */}
        <div className="container mx-auto text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-4 md:mb-6 bg-gradient-hero bg-clip-text text-transparent">
              Professional Water Delivery Management
            </h1>
            <p className="text-base md:text-lg lg:text-xl text-muted-foreground mb-6 md:mb-8 max-w-2xl mx-auto">
              Streamline your water delivery business with our comprehensive tracking, 
              payment processing, and customer management platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-primary hover:shadow-primary transition-all duration-300 w-full sm:w-auto"
                onClick={onLogin}
              >
                Get Started
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="border-primary text-primary hover:bg-primary/5 w-full sm:w-auto"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-12 px-4 bg-card/30"> {/* Reduced padding for mobile */}
        <div className="container mx-auto">
          <div className="text-center mb-12"> {/* Reduced margin for mobile */}
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-3 md:mb-4 text-primary">Powerful Features</h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage your water delivery business efficiently and professionally.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8"> {/* Reduced gap for mobile */}
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="hover:shadow-card transition-all duration-300 hover:scale-105 border-0 shadow-sm p-4" // Added padding for mobile
              >
                <CardHeader className="text-center">
                  <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-primary flex items-center justify-center md:w-16 md:h-16 md:mb-4"> {/* Smaller for mobile */}
                    <feature.icon className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <CardTitle className="text-lg md:text-xl text-primary">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center text-sm md:text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 px-4 bg-gradient-hero"> {/* Reduced padding for mobile */}
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto text-white">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 md:mb-6">Ready to Transform Your Business?</h2>
            <p className="text-base md:text-lg mb-6 md:mb-8 opacity-90">
              Join hundreds of water delivery businesses that trust KEMP Maji Track 
              for their operations management.
            </p>
            <Button 
              size="lg" 
              variant="secondary" 
              className="bg-white text-primary hover:bg-white/90 shadow-lg"
              onClick={onLogin}
            >
              Start Your Free Trial
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t py-8 px-4"> {/* Reduced padding for mobile */}
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <img src={kempLogo} alt="KEMP Logo" className="w-6 h-6 md:w-8 md:h-8" />
              <div>
                <h3 className="font-bold text-primary text-sm md:text-base">KEMP Maji Track</h3>
                <p className="text-xs md:text-sm text-muted-foreground">Professional Water Delivery Management</p>
              </div>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground">
              © 2024 KEMP Maji Track. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
