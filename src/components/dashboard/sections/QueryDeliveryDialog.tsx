import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Truck, Calendar, DollarSign, MessageCircle } from "lucide-react";

interface DeliveryQuery {
  id: string;
  customer_id: string;
  delivery_id: string;
  message: string;
  query_type: string;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  status: string;
  requires_approval: boolean | null;
  approval_request_id: string | null;
  created_at: string | null;
  customers?: {
    customer_name: string;
    email: string | null;
    phone: string | null;
    user_id: string | null;
  } | null;
  deliveries?: {
    delivery_date: string;
    total_amount: number;
  } | null;
}

interface QueryDeliveryDialogProps {
  query: DeliveryQuery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (queryId: string, resolutionNote: string) => void;
  onReject: (queryId: string, rejectionReason: string) => void;
}

export function QueryDeliveryDialog({ 
  query, 
  open, 
  onOpenChange, 
  onResolve, 
  onReject 
}: QueryDeliveryDialogProps) {
  const [resolutionNote, setResolutionNote] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleResolve = async () => {
    if (!query) return;
    setIsProcessing(true);
    try {
      await onResolve(query.id, resolutionNote || "Resolved by Master Admin");
      setResolutionNote("");
      onOpenChange(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!query) return;
    setIsProcessing(true);
    try {
      await onReject(query.id, resolutionNote || "Rejected by Master Admin");
      setResolutionNote("");
      onOpenChange(false);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!query) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-600" />
            Review Customer Query
          </DialogTitle>
          <DialogDescription>
            Review the delivery details and resolve or reject this query
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Query Type Badge */}
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
              {query.query_type.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline">
              {query.status}
            </Badge>
          </div>

          {/* Customer Info */}
          <div className="rounded-lg border p-3 space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Customer</h4>
            <p className="font-semibold">{query.customers?.customer_name || 'Unknown'}</p>
            {query.customers?.phone && (
              <p className="text-sm text-muted-foreground">{query.customers.phone}</p>
            )}
          </div>

          {/* Delivery Info */}
          <div className="rounded-lg border p-3 space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Delivery Details</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  {query.deliveries?.delivery_date 
                    ? format(new Date(query.deliveries.delivery_date), 'MMM dd, yyyy')
                    : 'N/A'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">
                  KSh {query.deliveries?.total_amount?.toLocaleString() || '0'}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Message */}
          <div className="rounded-lg border p-3 space-y-2 bg-muted/50">
            <h4 className="font-medium text-sm text-muted-foreground">Customer Message</h4>
            <p className="text-sm">{query.message}</p>
          </div>

          {/* Resolution Note Input */}
          <div className="space-y-2">
            <Label htmlFor="resolution-note">Resolution Note (optional)</Label>
            <Textarea
              id="resolution-note"
              placeholder="Add a note about how this query was resolved..."
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            className="text-destructive border-destructive hover:bg-destructive/10"
            onClick={handleReject}
            disabled={isProcessing}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Reject
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700"
            onClick={handleResolve}
            disabled={isProcessing}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}