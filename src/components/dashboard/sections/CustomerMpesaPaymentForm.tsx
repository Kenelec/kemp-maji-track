import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { CreditCard, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PendingDelivery {
  id: string;
  delivery_date: string;
  total_amount: number;
  payment_status: string;
  delivery_items?: Array<{
    product_name: string;
    quantity: number;
  }>;
}

export function CustomerMpesaPaymentForm() {
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>("");
  const [mpesaCode, setMpesaCode] = useState("");
  const [validationError, setValidationError] = useState("");
  const queryClient = useQueryClient();

  // Get current customer
  const { data: customer } = useQuery({
    queryKey: ["current-customer-for-payment"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      return data;
    },
  });

  // Fetch pending deliveries
  const { data: pendingDeliveries, isLoading } = useQuery({
    queryKey: ["pending-deliveries-for-payment", customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];
      
      const { data, error } = await supabase
        .from("deliveries")
        .select("id, delivery_date, total_amount, payment_status")
        .eq("customer_id", customer.id)
        .in("payment_status", ["unpaid", "pending"])
        .order("delivery_date", { ascending: false });
      
      if (error) throw error;

      // Fetch delivery items for each
      const deliveriesWithItems = await Promise.all(
        (data || []).map(async (delivery) => {
          const { data: items } = await supabase
            .from("delivery_items")
            .select("product_name, quantity")
            .eq("delivery_id", delivery.id);
          return { ...delivery, delivery_items: items || [] } as PendingDelivery;
        })
      );

      return deliveriesWithItems;
    },
    enabled: !!customer?.id,
  });

  // Validate M-Pesa code format
  const validateMpesaCodeFormat = (code: string): boolean => {
    // M-Pesa codes are 10 alphanumeric characters
    const mpesaRegex = /^[A-Z0-9]{10}$/i;
    return mpesaRegex.test(code);
  };

  // Check if code already exists
  const checkDuplicateCode = async (code: string): Promise<boolean> => {
    const { data } = await supabase
      .from("payments")
      .select("id")
      .eq("mpesa_code", code.toUpperCase())
      .maybeSingle();
    
    return !!data;
  };

  const submitPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDeliveryId) throw new Error("Please select a delivery to pay for");
      if (!mpesaCode.trim()) throw new Error("Please enter your M-Pesa code");
      
      const code = mpesaCode.trim().toUpperCase();
      
      // Validate format
      if (!validateMpesaCodeFormat(code)) {
        throw new Error("Invalid M-Pesa code format. Must be 10 alphanumeric characters (e.g., QJ23HGKL89)");
      }

      // Check for duplicates
      const isDuplicate = await checkDuplicateCode(code);
      if (isDuplicate) {
        throw new Error("This M-Pesa code has already been used. Please check and enter the correct code.");
      }

      // Get selected delivery
      const selectedDelivery = pendingDeliveries?.find(d => d.id === selectedDeliveryId);
      if (!selectedDelivery || !customer) throw new Error("Invalid selection");

      // Create payment record
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          customer_id: customer.id,
          delivery_id: selectedDeliveryId,
          amount: selectedDelivery.total_amount,
          due_date: new Date().toISOString().split("T")[0],
          status: "pending", // Will be verified by admin
          payment_method: "mpesa",
          mpesa_code: code,
        });

      if (paymentError) throw paymentError;

      // Update delivery payment status
      const { error: deliveryError } = await supabase
        .from("deliveries")
        .update({
          payment_status: "pending",
          mpesa_transaction_id: code,
        })
        .eq("id", selectedDeliveryId);

      if (deliveryError) throw deliveryError;
    },
    onSuccess: () => {
      toast({
        title: "Payment Submitted",
        description: "Your M-Pesa payment has been submitted for verification.",
      });
      setMpesaCode("");
      setSelectedDeliveryId("");
      setValidationError("");
      queryClient.invalidateQueries({ queryKey: ["pending-deliveries-for-payment"] });
      queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
    },
    onError: (error: Error) => {
      setValidationError(error.message);
      toast({
        title: "Payment Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Live validation on input change
  const handleCodeChange = (value: string) => {
    setMpesaCode(value);
    setValidationError("");
    
    if (value.length > 0 && value.length !== 10) {
      setValidationError(`Code should be 10 characters (currently ${value.length})`);
    } else if (value.length === 10 && !validateMpesaCodeFormat(value)) {
      setValidationError("Code should only contain letters and numbers");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-4 text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Submit M-Pesa Payment
        </CardTitle>
        <CardDescription>
          Enter your M-Pesa transaction code after making payment
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pending Deliveries Selection */}
        {pendingDeliveries && pendingDeliveries.length > 0 ? (
          <>
            <div className="space-y-3">
              <Label>Select Delivery to Pay *</Label>
              <RadioGroup
                value={selectedDeliveryId}
                onValueChange={setSelectedDeliveryId}
                className="space-y-2"
              >
                {pendingDeliveries.map((delivery) => (
                  <div
                    key={delivery.id}
                    className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedDeliveryId === delivery.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedDeliveryId(delivery.id)}
                  >
                    <RadioGroupItem value={delivery.id} id={delivery.id} />
                    <label htmlFor={delivery.id} className="flex-1 cursor-pointer">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">
                            {format(new Date(delivery.delivery_date), "MMM d, yyyy")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {delivery.delivery_items?.map(i => `${i.product_name} x${i.quantity}`).join(", ") || "Delivery items"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">
                            KSh {Number(delivery.total_amount).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground uppercase">
                            {delivery.payment_status}
                          </p>
                        </div>
                      </div>
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* M-Pesa Code Input */}
            <div className="space-y-2">
              <Label htmlFor="mpesa-code">M-Pesa Transaction Code *</Label>
              <Input
                id="mpesa-code"
                placeholder="e.g., QJ23HGKL89"
                value={mpesaCode}
                onChange={(e) => handleCodeChange(e.target.value.toUpperCase())}
                maxLength={10}
                className={validationError ? "border-destructive" : ""}
              />
              <p className="text-xs text-muted-foreground">
                Enter the 10-character code from your M-Pesa confirmation message
              </p>
            </div>

            {/* Validation Error */}
            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button
              className="w-full bg-gradient-primary"
              onClick={() => submitPaymentMutation.mutate()}
              disabled={
                submitPaymentMutation.isPending ||
                !selectedDeliveryId ||
                !mpesaCode.trim() ||
                !!validationError
              }
            >
              {submitPaymentMutation.isPending ? (
                "Submitting..."
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Submit Payment
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-muted-foreground">No pending payments</p>
            <p className="text-sm text-muted-foreground">All your deliveries have been paid!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
