import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";

interface DeliveryData {
  id: string;
  delivery_date: string;
  total_amount: number;
  qty: number;
  delivery_items?: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

interface CustomerDeliveryDiscrepancyDialogProps {
  delivery: DeliveryData | null;
  onClose: () => void;
  onSuccess: () => void;
}

const queryTypes = [
  { value: "wrong_quantity", label: "Wrong Quantity" },
  { value: "wrong_product", label: "Wrong Product" },
  { value: "missing_items", label: "Missing Items" },
  { value: "damaged_goods", label: "Damaged Goods" },
  { value: "wrong_price", label: "Wrong Price" },
  { value: "other", label: "Other Issue" },
];

export function CustomerDeliveryDiscrepancyDialog({
  delivery,
  onClose,
  onSuccess,
}: CustomerDeliveryDiscrepancyDialogProps) {
  const [queryType, setQueryType] = useState("");
  const [message, setMessage] = useState("");

  // Get current customer
  const { data: customer } = useQuery({
    queryKey: ["current-customer"],
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
    enabled: !!delivery,
  });

  const submitQueryMutation = useMutation({
    mutationFn: async () => {
      if (!delivery || !customer) throw new Error("Missing required data");
      if (!queryType) throw new Error("Please select a query type");
      if (!message.trim()) throw new Error("Please describe the issue");

      const { error } = await supabase
        .from("delivery_queries")
        .insert({
          delivery_id: delivery.id,
          customer_id: customer.id,
          query_type: queryType,
          message: message.trim(),
          status: "pending",
          requires_approval: true,
        });

      if (error) throw error;

      // Mark delivery as having a discrepancy
      await supabase
        .from("deliveries")
        .update({
          discrepancy_flag: true,
          discrepancy_notes: `Customer reported: ${queryType} - ${message.trim()}`,
        })
        .eq("id", delivery.id);
    },
    onSuccess: () => {
      toast({
        title: "Query Submitted",
        description: "Your concern has been submitted. Our team will review it shortly.",
      });
      setQueryType("");
      setMessage("");
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit query. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (!delivery) return null;

  return (
    <Dialog open={!!delivery} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-destructive" />
            Report Delivery Issue
          </DialogTitle>
          <DialogDescription>
            Report a problem with your delivery. Our team will review and resolve it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Delivery Info */}
          <div className="p-3 bg-muted rounded-lg space-y-1">
            <p className="text-sm font-medium">
              Delivery: {format(new Date(delivery.delivery_date), "MMM d, yyyy")}
            </p>
            <p className="text-sm text-muted-foreground">
              Amount: KSh {Number(delivery.total_amount).toLocaleString()}
            </p>
            {delivery.delivery_items && delivery.delivery_items.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Items: {delivery.delivery_items.map(i => `${i.product_name} x${i.quantity}`).join(", ")}
              </p>
            )}
          </div>

          {/* Query Type */}
          <div className="space-y-2">
            <Label htmlFor="query-type">Issue Type *</Label>
            <Select value={queryType} onValueChange={setQueryType}>
              <SelectTrigger id="query-type">
                <SelectValue placeholder="Select the type of issue" />
              </SelectTrigger>
              <SelectContent>
                {queryTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="message">Description *</Label>
            <Textarea
              id="message"
              placeholder="Please describe the issue in detail. For example: 'I ordered 5 bottles but received only 3' or 'The product was damaged upon delivery'"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/1000 characters
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => submitQueryMutation.mutate()}
            disabled={submitQueryMutation.isPending || !queryType || !message.trim()}
            className="bg-destructive hover:bg-destructive/90"
          >
            {submitQueryMutation.isPending ? "Submitting..." : "Submit Query"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
