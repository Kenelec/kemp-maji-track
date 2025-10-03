import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DeliveryFormDialog } from "../forms/DeliveryFormDialog";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeliveriesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deliveryToDelete, setDeliveryToDelete] = useState<string | null>(null);

  const { data: deliveries, isLoading } = useQuery({
    queryKey: ["deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select(`
          *,
          customers (customer_name)
        `)
        .order("delivery_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("deliveries")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({
        title: "Delivery deleted",
        description: "Delivery has been removed successfully.",
      });
      setDeleteDialogOpen(false);
      setDeliveryToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete delivery: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (delivery: any) => {
    setEditingDelivery(delivery);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeliveryToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deliveryToDelete) {
      deleteMutation.mutate(deliveryToDelete);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-blue-500/10 text-blue-500";
      case "dispatched":
        return "bg-yellow-500/10 text-yellow-500";
      case "delivered":
        return "bg-green-500/10 text-green-500";
      case "cancelled":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Deliveries</h2>
          <p className="text-muted-foreground">Manage water deliveries</p>
        </div>
        <Button className="bg-gradient-primary" onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Delivery
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Recent Deliveries</CardTitle>
          <CardDescription>Track and manage all water deliveries</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !deliveries || deliveries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No deliveries found. Create your first delivery to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Delivery Date</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit Rate</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-medium">
                      {delivery.customers?.customer_name || "Unknown"}
                    </TableCell>
                    <TableCell>{format(new Date(delivery.delivery_date), "MMM dd, yyyy")}</TableCell>
                    <TableCell>{delivery.qty}</TableCell>
                    <TableCell>KES {Number(delivery.unit_rate).toLocaleString()}</TableCell>
                    <TableCell className="font-semibold">KES {Number(delivery.total_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(delivery.delivery_status)}>
                        {delivery.delivery_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(delivery)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(delivery.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DeliveryFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingDelivery(null);
        }}
        editData={editingDelivery}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Delivery</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this delivery? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
