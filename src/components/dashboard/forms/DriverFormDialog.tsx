import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const driverSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  vehicle_number: z.string().optional(),
  is_active: z.boolean(),
});

type DriverFormData = z.infer<typeof driverSchema>;

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  vehicle_number: string | null;
  is_active: boolean;
}

interface DriverFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editData?: Driver | null;
}

export function DriverFormDialog({ open, onOpenChange, editData }: DriverFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const form = useForm<DriverFormData>({
    resolver: zodResolver(driverSchema),
    defaultValues: {
      name: "",
      phone: "",
      vehicle_number: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (editData && open) {
      form.reset({
        name: editData.name,
        phone: editData.phone || "",
        vehicle_number: editData.vehicle_number || "",
        is_active: editData.is_active,
      });
    } else if (!open) {
      form.reset({
        name: "",
        phone: "",
        vehicle_number: "",
        is_active: true,
      });
    }
  }, [editData, open, form]);

  const mutation = useMutation({
    mutationFn: async (data: DriverFormData) => {
      if (editData) {
        const { error } = await supabase
          .from("drivers")
          .update({
            name: data.name,
            phone: data.phone || null,
            vehicle_number: data.vehicle_number || null,
            is_active: data.is_active,
          })
          .eq("id", editData.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("drivers")
          .insert([{
            name: data.name,
            phone: data.phone || null,
            vehicle_number: data.vehicle_number || null,
            is_active: data.is_active,
          }]);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      toast({
        title: editData ? "Driver updated" : "Driver added",
        description: editData 
          ? "Driver has been updated successfully."
          : "New driver has been added successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${editData ? "update" : "add"} driver: ` + error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: DriverFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Driver" : "Add Driver"}</DialogTitle>
          <DialogDescription>
            {editData ? "Update driver information" : "Add a new delivery driver"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Driver name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="+254 712 345 678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vehicle_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Number (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="KBZ 123X" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Active Status</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Driver will be available for delivery assignments
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending 
                  ? (editData ? "Updating..." : "Adding...") 
                  : (editData ? "Update Driver" : "Add Driver")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
