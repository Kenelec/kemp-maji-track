import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Upload, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { CustomerFormDialog } from "../forms/CustomerFormDialog";
import { ExcelUploadDialog } from "../ExcelUploadDialog";
import { CustomerPaymentHistoryDialog } from "./CustomerPaymentHistoryDialog";
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

export function CustomersSection() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const isMasterAdmin = userRole === 'MasterAdmin';
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isExcelUploadOpen, setIsExcelUploadOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<any>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({
        title: "Customer deleted",
        description: "Customer has been removed successfully.",
      });
      setDeletingId(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete customer: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (customer: any) => {
    setEditingCustomer(customer);
    setIsFormOpen(true);
  };

  const handleAdd = () => {
    setEditingCustomer(null);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Customers</h2>
          <p className="text-muted-foreground">Manage customer information</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsExcelUploadOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Excel
          </Button>
          <Button className="bg-gradient-secondary" onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Customer Database</CardTitle>
          <CardDescription>View and manage customer profiles</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !customers || customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No customers found. Add your first customer to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.customer_name}</TableCell>
                    <TableCell>{customer.email || "—"}</TableCell>
                    <TableCell>{customer.phone || "—"}</TableCell>
                    <TableCell>{customer.area || "—"}</TableCell>
                    <TableCell>{customer.address || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setHistoryCustomer(customer)}
                        title="View History"
                      >
                        <History className="w-4 h-4" />
                      </Button>
                      {isMasterAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(customer)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingId(customer.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CustomerFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        editData={editingCustomer}
      />

      <ExcelUploadDialog
        open={isExcelUploadOpen}
        onOpenChange={setIsExcelUploadOpen}
        type="customers"
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["customers"] })}
      />

      <CustomerPaymentHistoryDialog
        open={!!historyCustomer}
        onOpenChange={(open) => !open && setHistoryCustomer(null)}
        customer={historyCustomer}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && deleteMutation.mutate(deletingId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
