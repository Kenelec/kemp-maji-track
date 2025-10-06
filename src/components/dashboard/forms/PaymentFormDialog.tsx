import { useEffect } from "react";
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
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("customer_name");
      
      if (error) throw error;
      return data;
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

  // Auto-calculate status based on payment amount vs delivery amount
  useEffect(() => {
    if (selectedDeliveryId && paymentAmount && deliveries) {
      const selectedDelivery = deliveries.find(d => d.id === selectedDeliveryId);
      if (selectedDelivery) {
        const deliveryTotal = Number(selectedDelivery.total_amount);
        const payment = parseFloat(paymentAmount);
        
        if (payment >= deliveryTotal) {
          form.setValue("status", "paid");
        } else if (payment > 0 && payment < deliveryTotal) {
          form.setValue("status", "pending");
        }
      }
    }
  }, [selectedDeliveryId, paymentAmount, deliveries, form]);

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
                  <Popover>
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
                        onSelect={field.onChange}
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
                       <SelectItem value="overdue">Overdue</SelectItem>
                     </SelectContent>
                  </Select>
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
