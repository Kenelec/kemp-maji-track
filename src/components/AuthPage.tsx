import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Mail, Lock, User, Phone, Facebook } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import kempLogo from "@/assets/kemp-logo.png";

interface AuthPageProps {
  onBack: () => void;
}

const AuthPage = ({ onBack }: AuthPageProps) => {
  const { signIn, signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: ""
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const email = loginForm.email.trim();
    const password = loginForm.password;
    
    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        const friendly = /Invalid login credentials/i.test(error.message)
          ? "Invalid email or password. If you just signed up, please verify your email first or reset your password."
          : error.message || "Login failed. Please try again.";
        toast({
          title: "Login Failed",
          description: friendly,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome back!",
          description: "You have been successfully logged in.",
        });
      }
    } catch (error) {
      toast({
        title: "Login Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const email = loginForm.email.trim();
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address first.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      
      if (error) {
        toast({
          title: "Failed to Send Magic Link",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Magic Link Sent!",
          description: "Check your email for a one-tap sign-in link.",
        });
        setShowMagicLink(false);
      }
    } catch (error) {
      toast({
        title: "Failed to Send Magic Link",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const email = loginForm.email.trim();
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address first.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      
      if (error) {
        toast({
          title: "Failed to Resend",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Confirmation Email Sent!",
          description: "Check your inbox for the confirmation email.",
        });
      }
    } catch (error) {
      toast({
        title: "Failed to Resend",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const email = loginForm.email.trim();
    if (!email) {
      toast({
        title: "Email Required",
        description: "Please enter your email address first.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      
      if (error) {
        toast({
          title: "Reset Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Reset Email Sent!",
          description: "Check your email for password reset instructions.",
        });
        setShowForgotPassword(false);
      }
    } catch (error) {
      toast({
        title: "Reset Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      
      if (error) {
        toast({
          title: "Facebook Login Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Facebook Login Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (registerForm.password !== registerForm.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match. Please try again.",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await signUp(registerForm.email.trim(), registerForm.password, registerForm.name.trim());
      
      if (error) {
        toast({
          title: "Registration Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Registration Successful!",
          description: "Please check your email to verify your account.",
        });
      }
    } catch (error) {
      toast({
        title: "Registration Failed", 
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={onBack}
            className="mb-4 text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          
          <div className="text-center mb-8">
            <img src={kempLogo} alt="KEMP Logo" className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-primary">KEMP Maji Track</h1>
            <p className="text-muted-foreground">Water Delivery Management</p>
          </div>
        </div>

        <Card className="shadow-card border-0">
          <CardHeader className="text-center">
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to your account or create a new one</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>


                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-primary hover:shadow-primary" 
                    disabled={isLoading}
                  >
                    {isLoading ? "Signing in..." : "Sign In"}
                  </Button>

                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-muted"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFacebookLogin}
                    disabled={isLoading}
                    className="w-full bg-[#1877F2] hover:bg-[#1877F2]/90 text-white border-0"
                  >
                    <Facebook className="w-4 h-4 mr-2" />
                    Continue with Facebook
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowMagicLink(true)}
                    disabled={isLoading}
                    className="w-full"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Sign in with Magic Link
                  </Button>

                  <div className="flex gap-2 mt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-muted-foreground hover:text-primary flex-1"
                    >
                      Forgot password?
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleResendConfirmation}
                      disabled={isLoading}
                      className="text-sm text-muted-foreground hover:text-primary flex-1"
                    >
                      Resend confirmation
                    </Button>
                  </div>

                  {showMagicLink && (
                    <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-3">
                        We'll send you a one-tap sign-in link to your email. No password needed!
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleMagicLink}
                          disabled={isLoading}
                          size="sm"
                        >
                          {isLoading ? "Sending..." : "Send Magic Link"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowMagicLink(false)}
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {showForgotPassword && (
                    <div className="mt-4 p-4 border rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-3">
                        Enter your email address to receive a password reset link.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleForgotPassword}
                          disabled={isLoading}
                          size="sm"
                        >
                          {isLoading ? "Sending..." : "Send Reset Link"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowForgotPassword(false)}
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </form>
              </TabsContent>

              <TabsContent value="register">
                <Alert className="mb-4">
                  <AlertDescription className="text-sm">
                    After signing up, use "Forgot your password?" to set your password if you can't log in immediately.
                  </AlertDescription>
                </Alert>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="Enter your full name"
                        value={registerForm.name}
                        onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="Enter your email"
                        value={registerForm.email}
                        onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="Enter your phone number"
                        value={registerForm.phone}
                        onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="Create a password"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Confirm your password"
                        value={registerForm.confirmPassword}
                        onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>


                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-secondary hover:shadow-secondary" 
                    disabled={isLoading}
                  >
                    {isLoading ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;