import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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
  const [formData, setFormData] = useState({
    customer_id: "",
    delivery_id: "",
    amount: "",
    due_date: "",
    payment_method: "cash",
    mpesa_code: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchFormData();
      if (editData) {
        setFormData({
          customer_id: editData.customer_id || "",
          delivery_id: editData.delivery_id || "",
          amount: editData.amount?.toString() || "",
          due_date: editData.due_date?.split('T')[0] || "",
          payment_method: editData.payment_method || "cash",
          mpesa_code: editData.mpesa_code || "",
        });
      } else {
        resetForm();
      }
    }
  }, [open, editData]);

  const fetchFormData = async () => {
    try {
      // Fetch customers
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, customer_name')
        .order('customer_name', { ascending: true });

      if (customersError) throw customersError;

      // Fetch deliveries
      const {  deliveriesData, error: deliveriesError } = await supabase
        .from('deliveries')
        .select('id, delivery_date, total_amount, qty, unit_rate, customer_id')
        .order('delivery_date', { ascending: false });

      if (deliveriesError) throw deliveriesError;

      setCustomers(customersData || []);
      setDeliveries(deliveriesData || []);
    } catch (error) {
      console.error('Error fetching form ', error);
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

  const calculatePaymentStatus = (deliveryId: string, paymentAmount: number) => {
    const delivery = deliveries.find(d => d.id === deliveryId);
    if (!delivery) return 'pending';

    const deliveryAmount = Number(delivery.total_amount);
    const diff = paymentAmount - deliveryAmount;

    if (diff > 0) {
      return `${Math.abs(diff)} credit`;
    } else if (diff < 0) {
      return `${Math.abs(diff)} pending`;
    } else {
      return 'paid';
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
            status: status, // Status is calculated automatically
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
        const { error } = await supabase
          .from('payments')
          .insert([{
            customer_id: formData.customer_id,
            delivery_id: formData.delivery_id,
            amount: paymentAmount,
            due_date: formData.due_date,
            payment_method: formData.payment_method,
            mpesa_code: formData.payment_method === 'mpesa' ? formData.mpesa_code : null,
            status: status, // Status is calculated automatically
            created_at: new Date().toISOString()
          }]);

        if (error) throw error;

        toast({
          title: "Payment created",
          description: "Payment has been created successfully.",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["payments"] });
      onOpenChange(false);
    } catch (error) {
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

  const selectedDelivery = deliveries.find(d => d.id === formData.delivery_id);

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
              onValueChange={(value) => setFormData({...formData, customer_id: value})}
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
                {deliveries
                  .filter(delivery => delivery.customer_id === formData.customer_id)
                  .map(delivery => (
                    <SelectItem key={delivery.id} value={delivery.id}>
                      {delivery.delivery_date} - KSh {delivery.total_amount}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDelivery && (
            <div className="p-3 bg-muted rounded-md text-sm">
              <div className="font-medium">Delivery Amount: KSh {selectedDelivery.total_amount}</div>
              <div>Quantity: {selectedDelivery.qty}</div>
              <div>Unit Rate: KSh {selectedDelivery.unit_rate}</div>
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
          {formData.delivery_id && formData.amount && (
            <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
              <div className="font-medium text-blue-800">Calculated Status:</div>
              <div className="text-blue-700">
                {calculatePaymentStatus(formData.delivery_id, Number(formData.amount))}
              </div>
              <div className="text-xs text-blue-600 mt-1">
                Based on delivery amount: KSh {selectedDelivery?.total_amount || 0} vs payment: KSh {formData.amount}
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
