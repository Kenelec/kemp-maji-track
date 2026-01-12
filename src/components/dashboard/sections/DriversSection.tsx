import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { DriverFormDialog } from "../forms/DriverFormDialog";
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

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  vehicle_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function DriversSection() {
  const { toast } = useToast();
  const { userRole } = useAuth();
  const isMasterAdmin = userRole === 'MasterAdmin';
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<string | null>(null);

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data as Driver[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("drivers")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({
        title: "Driver deleted",
        description: "Driver has been removed successfully.",
      });
      setDeleteDialogOpen(false);
      setDriverToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete driver: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (driver: Driver) => {
    setEditingDriver(driver);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setDriverToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (driverToDelete) {
      deleteMutation.mutate(driverToDelete);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Drivers</h2>
          <p className="text-muted-foreground">Manage your delivery drivers</p>
        </div>
        <Button className="bg-gradient-primary" onClick={() => setIsFormOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Driver
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            All Drivers
          </CardTitle>
          <CardDescription>View and manage delivery drivers</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : !drivers || drivers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No drivers found. Add your first driver to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Vehicle Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">{driver.name}</TableCell>
                    <TableCell>{driver.phone || "—"}</TableCell>
                    <TableCell>{driver.vehicle_number || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={driver.is_active ? "default" : "secondary"}>
                        {driver.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isMasterAdmin && (
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(driver)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(driver.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DriverFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) setEditingDriver(null);
        }}
        editData={editingDriver}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Driver</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this driver? This action cannot be undone.
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
