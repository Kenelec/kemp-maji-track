import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const paymentSchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  delivery_id: z.string().optional(),
  product_id: z.string().optional(),
  amount: z.string().min(1, "Amount is required"),
  due_date: z.date({
    required_error: "Due date is required",
  }),
  payment_method: z.string().default("cash"),
  mpesa_code: z.string().optional(),
  status: z.string().default("paid"),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: any;
}

export function PaymentFormDialog({ open, onOpenChange, editData }: PaymentFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      customer_id: "",
      delivery_id: "",
      product_id: "",
      amount: "",
      payment_method: "cash",
      mpesa_code: "",
      status: "paid",
    },
  });

  const paymentMethod = form.watch("payment_method");
  const selectedDeliveryId = form.watch("delivery_id");
  const paymentAmount = form.watch("amount");

  // Controlled popover for the date picker to auto-close on select
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    if (editData && open) {
      form.reset({
        customer_id: editData.customer_id,
        delivery_id: editData.delivery_id || "",
        product_id: "",
        amount: editData.amount.toString(),
        due_date: new Date(editData.due_date),
        payment_method: editData.payment_method,
        mpesa_code: editData.mpesa_code || "",
        status: editData.status,
      });
    } else if (!open) {
      form.reset({
        customer_id: "",
        delivery_id: "",
        product_id: "",
        amount: "",
        payment_method: "cash",
        mpesa_code: "",
        status: "paid",
      });
    }
  }, [editData, open, form]);

  const { data: customers } = useQuery({
    queryKey: ["customers-with-pending", editData?.id],
    queryFn: async () => {
      // When editing, show all customers. When adding, show only customers with pending/overdue payments
      if (editData) {
        const { data: custRows, error: custErr } = await supabase
          .from("customers")
          .select("*")
          .order("customer_name");
        if (custErr) throw custErr;
        return custRows;
      } else {
        // 1) Find customers that have pending or overdue payments
        const { data: pendingPays, error: payErr } = await supabase
          .from("payments")
          .select("customer_id")
          .in("status", ["pending", "overdue"]);
        if (payErr) throw payErr;

        const ids = Array.from(new Set((pendingPays || []).map((p: any) => p.customer_id).filter(Boolean)));
        if (ids.length === 0) return [] as any[];

        // 2) Fetch only those customers
        const { data: custRows, error: custErr } = await supabase
          .from("customers")
          .select("*")
          .in("id", ids)
          .order("customer_name");
        if (custErr) throw custErr;
        return custRows;
      }
    },
  });

  const selectedCustomerId = form.watch("customer_id");

  const { data: deliveries } = useQuery({
    queryKey: ["customer-deliveries", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      const { data, error } = await supabase
        .from("deliveries")
        .select("*, delivery_items(product_name, quantity, product_id)")
        .eq("customer_id", selectedCustomerId)
        .order("delivery_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCustomerId,
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Derivations for selected delivery
  const selectedDelivery = useMemo(() => {
    return deliveries?.find((d: any) => d.id === selectedDeliveryId);
  }, [deliveries, selectedDeliveryId]);

  const totalDeliveryQty = useMemo(() => {
    if (!selectedDelivery?.delivery_items) return 0;
    return selectedDelivery.delivery_items.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
  }, [selectedDelivery]);

  // Auto-populate product and calculate status when delivery is selected
  useEffect(() => {
    if (selectedDeliveryId && deliveries) {
      const selectedDelivery = deliveries.find(d => d.id === selectedDeliveryId);
      if (selectedDelivery && selectedDelivery.delivery_items?.[0]) {
        // Auto-select the first product from delivery items
        form.setValue("product_id", selectedDelivery.delivery_items[0].product_id);
      }
    }
  }, [selectedDeliveryId, deliveries, form]);

  // Fetch existing payments for the selected delivery to calculate cumulative amount
  const { data: existingPayments } = useQuery({
    queryKey: ["existing-payments", selectedDeliveryId],
    queryFn: async () => {
      if (!selectedDeliveryId) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("delivery_id", selectedDeliveryId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedDeliveryId,
  });

  // Auto-calculate status based on cumulative payments vs delivery total
  useEffect(() => {
    if (!selectedDeliveryId || !deliveries || !existingPayments) return;
    const sel = deliveries.find((d: any) => d.id === selectedDeliveryId);
    const deliveryTotal = sel ? Number(sel.total_amount) : NaN;
    const currentPayment = paymentAmount ? parseFloat(paymentAmount) : 0;

    if (isNaN(deliveryTotal)) return;

    // Calculate total of other payments (excluding current edit if editing)
    const otherPaymentsTotal = existingPayments
      .filter((p: any) => !editData || p.id !== editData.id)
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    const totalPaid = otherPaymentsTotal + currentPayment;
    const diff = totalPaid - deliveryTotal; // >0 => credit, <0 => pending

    if (diff > 0) {
      form.setValue("status", "credit");
    } else if (diff === 0) {
      form.setValue("status", "paid");
    } else {
      form.setValue("status", "pending");
    }
  }, [selectedDeliveryId, paymentAmount, deliveries, existingPayments, editData, form]);

  const mutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      if (editData) {
        const { error } = await supabase
          .from("payments")
          .update({
            customer_id: data.customer_id,
            delivery_id: data.delivery_id || null,
            amount: parseFloat(data.amount),
            due_date: format(data.due_date, "yyyy-MM-dd"),
            payment_method: data.payment_method,
            mpesa_code: data.mpesa_code || null,
            status: data.status,
          })
          .eq("id", editData.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("payments")
          .insert([{
            customer_id: data.customer_id,
            delivery_id: data.delivery_id || null,
            amount: parseFloat(data.amount),
            due_date: format(data.due_date, "yyyy-MM-dd"),
            payment_method: data.payment_method,
            mpesa_code: data.mpesa_code || null,
            status: data.status,
          }]);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({
        title: editData ? "Payment updated" : "Payment created",
        description: editData 
          ? "Payment has been updated successfully."
          : "New payment record has been added successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${editData ? "update" : "create"} payment: ` + error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PaymentFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Payment" : "Add Payment"}</DialogTitle>
          <DialogDescription>
            {editData ? "Update payment information" : "Record a new payment"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a customer" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers?.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.customer_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="delivery_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a delivery" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {deliveries?.map((delivery) => (
                        <SelectItem key={delivery.id} value={delivery.id}>
                          {format(new Date(delivery.delivery_date), "MMM dd, yyyy")} - KSh {Number(delivery.total_amount).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="product_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products?.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Read-only quantity from the selected delivery */}
            {selectedDeliveryId && (
              <div>
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input value={totalDeliveryQty} readOnly disabled />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>
            )}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (KES)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="due_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Due Date</FormLabel>
                  <Popover open={dateOpen} onOpenChange={setDateOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(d) => {
                          field.onChange(d);
                          setDateOpen(false);
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mpesa">M-Pesa</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {paymentMethod === "mpesa" && (
              <FormField
                control={form.control}
                name="mpesa_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>M-Pesa Code</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. QA12BC34DE" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Dynamic pending/credit helper */}
                  {selectedDelivery && paymentAmount && existingPayments && (
                    (() => {
                      const deliveryTotal = Number(selectedDelivery.total_amount || 0);
                      const currentPayment = parseFloat(paymentAmount || "0");
                      
                      // Calculate total of other payments (excluding current edit if editing)
                      const otherPaymentsTotal = existingPayments
                        .filter((p: any) => !editData || p.id !== editData.id)
                        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
                      
                      const totalPaid = otherPaymentsTotal + currentPayment;
                      
                      if (!isNaN(deliveryTotal) && !isNaN(totalPaid)) {
                        const diff = totalPaid - deliveryTotal;
                        if (diff > 0) {
                          return <p className="text-sm text-muted-foreground mt-1">KSh {Math.abs(diff).toLocaleString()} credit</p>;
                        }
                        if (diff < 0) {
                          return <p className="text-sm text-muted-foreground mt-1">KSh {Math.abs(diff).toLocaleString()} pending</p>;
                        }
                        return <p className="text-sm text-muted-foreground mt-1">Fully paid</p>;
                      }
                      return null;
                    })()
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending 
                  ? (editData ? "Updating..." : "Creating...") 
                  : (editData ? "Update Payment" : "Create Payment")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
