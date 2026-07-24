import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { NotificationService } from "@/services/notificationService";
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

const deliverySchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  product_id: z.string().min(1, "Product is required"),
  driver_id: z.string().optional(),
  delivery_date: z.date({
    required_error: "Delivery date is required",
  }),
  qty: z.string().min(1, "Quantity is required"),
  unit_rate: z.string().min(1, "Unit rate is required"),
  delivery_note_no: z.string().optional(),
});

type DeliveryFormData = z.infer<typeof deliverySchema>;

interface DeliveryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: any;
}

export function DeliveryFormDialog({ open, onOpenChange, editData }: DeliveryFormDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  const form = useForm<DeliveryFormData>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      customer_id: "",
      product_id: "",
      driver_id: "",
      qty: "",
      unit_rate: "",
      delivery_note_no: "",
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*");
      
      if (error) throw error;
      return (data || []).slice().sort((a: any, b: any) =>
        (a.customer_name || '').localeCompare(b.customer_name || '', undefined, { sensitivity: 'base' })
      );
    },
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

  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (editData && open) {
      const productId = editData.delivery_items?.[0]?.product_id || "";
      form.reset({
        customer_id: editData.customer_id,
        product_id: productId,
        driver_id: editData.driver_id || "",
        delivery_date: new Date(editData.delivery_date),
        qty: editData.qty.toString(),
        unit_rate: editData.unit_rate.toString(),
        delivery_note_no: editData.delivery_note_no || "",
      });
    } else if (!open) {
      form.reset({
        customer_id: "",
        product_id: "",
        driver_id: "",
        qty: "",
        unit_rate: "",
        delivery_note_no: "",
      });
    }
  }, [editData, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: DeliveryFormData) => {
      const qty = parseInt(data.qty);
      const unit_rate = parseFloat(data.unit_rate);
      const total_amount = qty * unit_rate;

      // Get product name
      const product = products?.find(p => p.id === data.product_id);
      const productName = product?.name || "";

      if (editData) {
        // Update delivery - reset confirmation fields so customer can re-confirm
        const newConfirmationDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        
        const { error: deliveryError } = await supabase
          .from("deliveries")
          .update({
            customer_id: data.customer_id,
            driver_id: data.driver_id || null,
            delivery_date: format(data.delivery_date, "yyyy-MM-dd"),
            qty,
            unit_rate,
            total_amount,
            delivery_status: "delivered",
            delivery_note_no: data.delivery_note_no,
            // Reset confirmation status so customer can re-confirm
            customer_confirmed: false,
            confirmed_at: null,
            auto_confirmed: false,
            discrepancy_flag: false,
            discrepancy_notes: null,
            confirmation_deadline: newConfirmationDeadline,
          })
          .eq("id", editData.id);
        
        if (deliveryError) throw deliveryError;

        // Mark any pending/open delivery queries as 'admin_updated'
        await supabase
          .from("delivery_queries")
          .update({ 
            status: 'admin_updated',
            resolved_by: user?.id,
            resolved_at: new Date().toISOString(),
            resolution_note: 'Delivery updated by MasterAdmin - please re-confirm'
          })
          .eq("delivery_id", editData.id)
          .in("status", ["pending", "open"]);

        // Update delivery items
        const { error: itemsError } = await supabase
          .from("delivery_items")
          .delete()
          .eq("delivery_id", editData.id);
        
        if (itemsError) throw itemsError;

        const { error: insertItemError } = await supabase
          .from("delivery_items")
          .insert([{
            delivery_id: editData.id,
            product_id: data.product_id,
            product_name: productName,
            quantity: qty,
            unit_price: unit_rate,
            total_price: total_amount,
          }]);
        
        if (insertItemError) throw insertItemError;

        // Send notification to customer about the update
        try {
          await NotificationService.sendDeliveryNotification(editData.id);
          console.log('Delivery update notification sent to customer');
        } catch (notifError) {
          console.error('Failed to send delivery update notification:', notifError);
        }
      } else {
        // Insert delivery - always set status to "delivered"
        const { data: deliveryData, error: deliveryError } = await supabase
          .from("deliveries")
          .insert([{
            customer_id: data.customer_id,
            driver_id: data.driver_id || null,
            delivery_date: format(data.delivery_date, "yyyy-MM-dd"),
            qty,
            unit_rate,
            total_amount,
            delivery_status: "delivered",
            delivery_note_no: data.delivery_note_no,
            created_by_user: user?.id,
          }])
          .select()
          .single();
        
        if (deliveryError) throw deliveryError;

        // Insert delivery items
        const { error: itemsError } = await supabase
          .from("delivery_items")
          .insert([{
            delivery_id: deliveryData.id,
            product_id: data.product_id,
            product_name: productName,
            quantity: qty,
            unit_price: unit_rate,
            total_price: total_amount,
          }]);
        
        if (itemsError) throw itemsError;

        // Create payment record for the delivery
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days
        
        const { error: paymentError } = await supabase
          .from("payments")
          .insert([{
            customer_id: data.customer_id,
            delivery_id: deliveryData.id,
            amount: 0,
            due_date: format(dueDate, "yyyy-MM-dd"),
            status: "pending",
          }]);
        
        if (paymentError) {
          console.error('Failed to create payment record:', paymentError);
        }

        // Send delivery notification to customer
        try {
          await NotificationService.sendDeliveryNotification(deliveryData.id);
          console.log('Delivery notification sent successfully');
        } catch (notifError) {
          console.error('Failed to send delivery notification:', notifError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding-payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-stats"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({
        title: editData ? "Delivery updated" : "Delivery created",
        description: editData 
          ? "Delivery has been updated successfully."
          : "New delivery created and notification sent to customer.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${editData ? "update" : "create"} delivery: ` + error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: DeliveryFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Delivery" : "New Delivery"}</DialogTitle>
          <DialogDescription>
            {editData ? "Update delivery information" : "Record a new water delivery"}
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
                  <Select onValueChange={field.onChange} value={field.value}>
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
              name="product_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product</FormLabel>
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
              name="driver_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Driver (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a driver" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {drivers?.map((driver) => (
                        <SelectItem key={driver.id} value={driver.id}>
                          {driver.name} {driver.vehicle_number ? `(${driver.vehicle_number})` : ''}
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
              name="delivery_note_no"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery Note No. (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="DN-001" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="delivery_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Delivery Date</FormLabel>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
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
                        onSelect={(date) => {
                          field.onChange(date);
                          setCalendarOpen(false);
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
              name="qty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit_rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unit Rate (KES)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
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
                  : (editData ? "Update Delivery" : "Create Delivery")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
