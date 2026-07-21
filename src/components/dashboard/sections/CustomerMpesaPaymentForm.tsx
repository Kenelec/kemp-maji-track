import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<string[]>([]);
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

  // Fetch pending deliveries - only show truly unpaid deliveries
  const { data: pendingDeliveries, isLoading } = useQuery({
    queryKey: ["pending-deliveries-for-payment", customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];
      
      // Fetch deliveries that are unpaid
      const { data, error } = await supabase
        .from("deliveries")
        .select("id, delivery_date, total_amount, payment_status")
        .eq("customer_id", customer.id)
        .eq("payment_status", "unpaid")
        .order("delivery_date", { ascending: false });
      
      if (error) throw error;

      const deliveryIds = (data || []).map(d => d.id);
      
      if (deliveryIds.length === 0) return [];

      // ✅ FIXED: Only exclude deliveries that have a COMPLETED payment
      const { data: completedPayments } = await supabase
        .from("payments")
        .select("delivery_id")
        .in("delivery_id", deliveryIds)
        .eq("status", "paid");

      const paidDeliveryIds = new Set(completedPayments?.map(p => p.delivery_id) || []);
      const unpaidDeliveries = (data || []).filter(d => !paidDeliveryIds.has(d.id));

      // Fetch delivery items for each
      const deliveriesWithItems = await Promise.all(
        unpaidDeliveries.map(async (delivery) => {
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

  // Calculate total for selected deliveries
  const selectedTotal = pendingDeliveries
    ?.filter(d => selectedDeliveryIds.includes(d.id))
    .reduce((sum, d) => sum + Number(d.total_amount), 0) || 0;

  const toggleDeliverySelection = (deliveryId: string) => {
    setSelectedDeliveryIds(prev =>
      prev.includes(deliveryId)
        ? prev.filter(id => id !== deliveryId)
        : [...prev, deliveryId]
    );
  };

  const submitPaymentMutation = useMutation({
    mutationFn: async () => {
      if (selectedDeliveryIds.length === 0) throw new Error("Please select at least one delivery to pay for");
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

      // Get selected deliveries
      const selectedDeliveries = pendingDeliveries?.filter(d => selectedDeliveryIds.includes(d.id));
      if (!selectedDeliveries?.length || !customer) throw new Error("Invalid selection");

      // Create payment records for each selected delivery — submitted for admin verification
      for (const delivery of selectedDeliveries) {
        const { data: completedPayment } = await supabase
          .from("payments")
          .select("id")
          .eq("delivery_id", delivery.id)
          .eq("status", "paid")
          .maybeSingle();

        if (completedPayment) {
          throw new Error(`This delivery has already been paid on ${format(new Date(delivery.delivery_date), "MMM d, yyyy")}`);
        }

        // Clear stale pending/failed/rejected submissions for this delivery
        await supabase
          .from("payments")
          .delete()
          .eq("delivery_id", delivery.id)
          .in("status", ["pending", "failed", "rejected"]);

        // Insert as pending_verification — admin must confirm against Safaricom SMS
        const { error: insertError } = await supabase
          .from("payments")
          .insert({
            customer_id: customer.id,
            delivery_id: delivery.id,
            amount: delivery.total_amount,
            due_date: new Date().toISOString().split("T")[0],
            status: "pending_verification",
            payment_method: "mpesa",
            mpesa_code: code,
          });

        if (insertError) throw insertError;

        // Record the code on the delivery for reference; do NOT mark paid yet
        await supabase
          .from("deliveries")
          .update({ mpesa_transaction_id: code })
          .eq("id", delivery.id);
      }
    },
    onSuccess: () => {
      toast({
        title: "Submitted for Verification",
        description: `Your M-Pesa code has been submitted. It will be marked paid once the admin verifies it against the Safaricom SMS.`,
      });
      setMpesaCode("");
      setSelectedDeliveryIds([]);
      setValidationError("");
      queryClient.invalidateQueries({ queryKey: ["pending-deliveries-for-payment"] });
      queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
      queryClient.invalidateQueries({ queryKey: ["customer-deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["last-delivery"] });
      queryClient.invalidateQueries({ queryKey: ["customer-pending-payments"] });
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
              <Label>Select Deliveries to Pay * (You can select multiple)</Label>
              <div className="space-y-2">
                {pendingDeliveries.map((delivery) => (
                  <div
                    key={delivery.id}
                    className={`flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedDeliveryIds.includes(delivery.id)
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleDeliverySelection(delivery.id)}
                  >
                    <Checkbox
                      checked={selectedDeliveryIds.includes(delivery.id)}
                      onCheckedChange={() => toggleDeliverySelection(delivery.id)}
                      id={delivery.id}
                    />
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
              </div>
            </div>

            {/* Selected Total */}
            {selectedDeliveryIds.length > 0 && (
              <div className="p-3 bg-primary/10 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Selected: {selectedDeliveryIds.length} {selectedDeliveryIds.length === 1 ? 'delivery' : 'deliveries'}</span>
                  <span className="text-lg font-bold text-primary">Total: KSh {selectedTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

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
                selectedDeliveryIds.length === 0 ||
                !mpesaCode.trim() ||
                !!validationError
              }
            >
              {submitPaymentMutation.isPending ? (
                "Submitting..."
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Submit Payment {selectedDeliveryIds.length > 1 ? `for ${selectedDeliveryIds.length} Deliveries` : ''}
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
