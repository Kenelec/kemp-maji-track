import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Settings, Save } from "lucide-react";

export function SystemSettingsSection() {
  const queryClient = useQueryClient();
  const [reminderHours, setReminderHours] = useState<number>(48);

  const { isLoading } = useQuery({
    queryKey: ["system-settings", "payment_reminder_hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("setting_value")
        .eq("setting_key", "payment_reminder_hours")
        .single();

      if (error) throw error;
      
      const hours = (data.setting_value as { hours?: number })?.hours || 48;
      setReminderHours(hours);
      return hours;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (hours: number) => {
      const { error } = await supabase
        .from("system_settings")
        .update({ 
          setting_value: { hours },
          updated_at: new Date().toISOString()
        })
        .eq("setting_key", "payment_reminder_hours");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      toast.success("Settings updated successfully");
    },
    onError: (error) => {
      console.error("Error updating settings:", error);
      toast.error("Failed to update settings");
    },
  });

  const handleSave = () => {
    if (reminderHours < 1) {
      toast.error("Reminder hours must be at least 1");
      return;
    }
    updateMutation.mutate(reminderHours);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5" />
        <h2 className="text-2xl font-bold">System Settings</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment Reminder Configuration</CardTitle>
          <CardDescription>
            Set when payment reminders should be sent to customers after delivery
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reminderHours">
              Send payment reminders after (hours)
            </Label>
            <div className="flex gap-2 items-center">
              <Input
                id="reminderHours"
                type="number"
                min="1"
                max="168"
                value={reminderHours}
                onChange={(e) => setReminderHours(parseInt(e.target.value) || 1)}
                className="max-w-xs"
                disabled={isLoading}
              />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Current setting: {reminderHours} hours ({(reminderHours / 24).toFixed(1)} days)
            </p>
          </div>

          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending || isLoading}
          >
            <Save className="mr-2 h-4 w-4" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Notifications</CardTitle>
          <CardDescription>
            Automatic notifications are sent when deliveries are logged
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-green-500">✓</span>
              <span>SMS notification sent to customer with delivery details</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">✓</span>
              <span>Email notification with itemized delivery information</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">✓</span>
              <span>Customer can report issues via provided query link</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500">✓</span>
              <span>Payment reminders sent automatically for unpaid deliveries</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
