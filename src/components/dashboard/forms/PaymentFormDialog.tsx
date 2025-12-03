import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { NotificationService } from "@/services/notificationService";

interface Customer {
  id: string;
  customer_name: string;
}

interface Delivery {
  id: string;
  delivery_date: string;
  total_amount: number;
  qty: number;
  unit_rate: number;
  customer_id: string;
}

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: any;
}

export function PaymentFormDialog({ open, onOpenChange, editData }: PaymentFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [allDeliveries, setAllDeliveries] = useState<Delivery[]>([]);
  const [formData, setFormData] = useState({
    customer_id: "",
    delivery_id: "",
    amount: "",
    due_date: "",
    payment_method: "cash",
    mpesa_code: "",
  });
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (open) {
      setDataLoaded(false);
      fetchFormData().then(() => {
        setDataLoaded(true);
      });
    }
  }, [open]);

  // Populate form when editing and data is loaded
  useEffect(() => {
    if (open && dataLoaded && editData) {
      setFormData({
        customer_id: editData.customer_id || "",
        delivery_id: editData.delivery_id || "",
        amount: editData.amount?.toString() || "",
        due_date: editData.due_date?.split('T')[0] || "",
        payment_method: editData.payment_method || "cash",
        mpesa_code: editData.mpesa_code || "",
      });
    } else if (open && !editData) {
      resetForm();
    }
  }, [open, dataLoaded, editData]);

  const fetchFormData = async () => {
    try {
      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, customer_name')
        .order('customer_name', { ascending: true });

      if (customersError) throw customersError;

      // Fetch all deliveries
      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('deliveries')
        .select('id, delivery_date, total_amount, qty, unit_rate, customer_id')
        .order('delivery_date', { ascending: false });

      if (deliveriesError) throw deliveriesError;

      setCustomers(customersData || []);
      setAllDeliveries(deliveriesData || []);
      setDeliveries(deliveriesData || []);
    } catch (error) {
      console.error('Error fetching form data', error);
    }
  };

  const resetForm = () => {
    setFormData({
      customer_id: "",
      delivery_id: "",
      amount: "",
      due_date: "",
      payment_method: "cash",
      mpesa_code: "",
    });
  };

  // Returns only valid database status values: 'paid' or 'pending'
  const calculatePaymentStatus = (deliveryId: string, paymentAmount: number): 'paid' | 'pending' => {
    const delivery = allDeliveries.find(d => d.id === deliveryId);
    if (!delivery) return 'pending';

    const deliveryAmount = Number(delivery.total_amount);
    
    if (paymentAmount >= deliveryAmount) {
      return 'paid';
    } else {
      return 'pending';
    }
  };

  // Calculate display info for status preview
  const getPaymentStatusInfo = (deliveryId: string, paymentAmount: number) => {
    const delivery = allDeliveries.find(d => d.id === deliveryId);
    if (!delivery) return { status: 'pending', label: 'Pending', difference: 0 };

    const deliveryAmount = Number(delivery.total_amount);
    const diff = paymentAmount - deliveryAmount;

    if (diff > 0) {
      return { status: 'paid', label: `Paid (Credit: KSh ${diff.toLocaleString()})`, difference: diff };
    } else if (diff < 0) {
      return { status: 'pending', label: `Pending (Balance: KSh ${Math.abs(diff).toLocaleString()})`, difference: diff };
    } else {
      return { status: 'paid', label: 'Fully Paid', difference: 0 };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const paymentAmount = Number(formData.amount);
      const status = calculatePaymentStatus(formData.delivery_id, paymentAmount);

      if (editData) {
        // Update existing payment
        const { error } = await supabase
          .from('payments')
          .update({
            customer_id: formData.customer_id,
            delivery_id: formData.delivery_id,
            amount: paymentAmount,
            due_date: formData.due_date,
            payment_method: formData.payment_method,
            mpesa_code: formData.payment_method === 'mpesa' ? formData.mpesa_code : null,
            status: status,
            updated_at: new Date().toISOString()
          })
          .eq('id', editData.id);

        if (error) throw error;

        toast({
          title: "Payment updated",
          description: "Payment has been updated successfully.",
        });
      } else {
        // Create new payment
        const { data: paymentData, error } = await supabase
          .from('payments')
          .insert([{
            customer_id: formData.customer_id,
            delivery_id: formData.delivery_id,
            amount: paymentAmount,
            due_date: formData.due_date,
            payment_method: formData.payment_method,
            mpesa_code: formData.payment_method === 'mpesa' ? formData.mpesa_code : null,
            status: status,
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) throw error;

        // Send payment notification to admins
        try {
          await NotificationService.sendPaymentNotification(paymentData.id);
          console.log('Payment notification sent to admins successfully');
        } catch (notifError) {
          console.error('Failed to send payment notification:', notifError);
        }

        toast({
          title: "Payment created",
          description: "Payment has been created successfully and notification sent to admins.",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["payments"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving payment:', error);
      toast({
        title: "Error",
        description: "Failed to save payment: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get filtered deliveries for dropdown - show customer's deliveries OR the currently selected delivery
  const filteredDeliveries = allDeliveries.filter(delivery => 
    delivery.customer_id === formData.customer_id || 
    (editData && delivery.id === editData.delivery_id)
  );

  const selectedDelivery = allDeliveries.find(d => d.id === formData.delivery_id);
  const statusInfo = formData.delivery_id && formData.amount 
    ? getPaymentStatusInfo(formData.delivery_id, Number(formData.amount))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Payment" : "Add Payment"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="customer">Customer *</Label>
            <Select 
              value={formData.customer_id} 
              onValueChange={(value) => setFormData({...formData, customer_id: value, delivery_id: ""})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map(customer => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.customer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="delivery">Delivery *</Label>
            <Select 
              value={formData.delivery_id} 
              onValueChange={(value) => setFormData({...formData, delivery_id: value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select delivery" />
              </SelectTrigger>
              <SelectContent>
                {filteredDeliveries.map(delivery => (
                  <SelectItem key={delivery.id} value={delivery.id}>
                    {delivery.delivery_date} - KSh {Number(delivery.total_amount).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDelivery && (
            <div className="p-3 bg-muted rounded-md text-sm">
              <div className="font-medium">Delivery Amount: KSh {Number(selectedDelivery.total_amount).toLocaleString()}</div>
              <div>Quantity: {selectedDelivery.qty}</div>
              <div>Unit Rate: KSh {Number(selectedDelivery.unit_rate).toLocaleString()}</div>
            </div>
          )}

          <div>
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({...formData, amount: e.target.value})}
              placeholder="Enter payment amount"
              required
            />
          </div>

          <div>
            <Label htmlFor="dueDate">Due Date *</Label>
            <Input
              id="dueDate"
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({...formData, due_date: e.target.value})}
              required
            />
          </div>

          <div>
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select 
              value={formData.payment_method} 
              onValueChange={(value) => setFormData({...formData, payment_method: value})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.payment_method === 'mpesa' && (
            <div>
              <Label htmlFor="mpesaCode">M-Pesa Code</Label>
              <Input
                id="mpesaCode"
                value={formData.mpesa_code}
                onChange={(e) => setFormData({...formData, mpesa_code: e.target.value})}
                placeholder="Enter M-Pesa code"
              />
            </div>
          )}

          {/* Show calculated status */}
          {statusInfo && (
            <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
              <div className="font-medium text-blue-800">Payment Status:</div>
              <div className="text-blue-700">{statusInfo.label}</div>
              <div className="text-xs text-blue-600 mt-1">
                Delivery: KSh {selectedDelivery?.total_amount?.toLocaleString() || 0} | 
                Payment: KSh {Number(formData.amount).toLocaleString()}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : editData ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
