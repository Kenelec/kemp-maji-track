import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Droplets, Truck, CreditCard, Users, BarChart3, Shield } from "lucide-react";
import kempLogo from "@/assets/kemp-logo.png";

interface LandingPageProps {
  onLogin: () => void;
}

const LandingPage = ({ onLogin }: LandingPageProps) => {
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
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src={kempLogo} alt="KEMP Logo" className="w-10 h-10" />
            <div>
              <h1 className="text-xl font-bold text-primary">KEMP</h1>
              <p className="text-sm text-muted-foreground">Maji Track</p>
            </div>
          </div>
          <Button 
            variant="default" 
            size="lg" 
            className="shadow-primary"
            onClick={onLogin}
          >
            Login
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-hero bg-clip-text text-transparent">
              Professional Water Delivery Management
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Streamline your water delivery business with our comprehensive tracking, 
              payment processing, and customer management platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-gradient-primary hover:shadow-primary transition-all duration-300"
                onClick={onLogin}
              >
                Get Started
              </Button>
              <Button variant="outline" size="lg" className="border-primary text-primary hover:bg-primary/5">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-card/30">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 text-primary">Powerful Features</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage your water delivery business efficiently and professionally.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-card transition-all duration-300 hover:scale-105 border-0 shadow-sm">
                <CardHeader className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-primary flex items-center justify-center">
                    <feature.icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-xl text-primary">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-hero">
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto text-white">
            <h2 className="text-4xl font-bold mb-6">Ready to Transform Your Business?</h2>
            <p className="text-xl mb-8 opacity-90">
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
      <footer className="bg-card border-t py-12 px-4">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <img src={kempLogo} alt="KEMP Logo" className="w-8 h-8" />
              <div>
                <h3 className="font-bold text-primary">KEMP Maji Track</h3>
                <p className="text-sm text-muted-foreground">Professional Water Delivery Management</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 KEMP Maji Track. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;