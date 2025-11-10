import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function DeliveryQueryPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [delivery, setDelivery] = useState<any>(null);
  const [queryType, setQueryType] = useState("missing_items");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error("Invalid query link");
      navigate("/");
      return;
    }

    fetchDeliveryDetails();
  }, [token]);

  const fetchDeliveryDetails = async () => {
    try {
      const { data, error } = await supabase
        .from("deliveries")
        .select(`
          id,
          delivery_date,
          total_amount,
          qty,
          unit_rate,
          delivery_note_no,
          payment_status,
          customers!inner (
            customer_name,
            email,
            phone
          )
        `)
        .eq("payment_link_token", token)
        .single();

      if (error) throw error;

      if (!data) {
        toast.error("Delivery not found or link expired");
        navigate("/");
        return;
      }

      setDelivery(data);
    } catch (error) {
      console.error("Error fetching delivery:", error);
      toast.error("Failed to load delivery details");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      toast.error("Please describe your query");
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("submit-delivery-query", {
        body: {
          payment_link_token: token,
          query_type: queryType,
          message: message.trim()
        }
      });

      if (error) throw error;

      toast.success("Query submitted successfully!");
      setSubmitted(true);
    } catch (error) {
      console.error("Error submitting query:", error);
      toast.error("Failed to submit query. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <CardTitle>Query Submitted</CardTitle>
            <CardDescription>
              Thank you for reporting this issue. Our team will review your query and contact you shortly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const customer = Array.isArray(delivery.customers) ? delivery.customers[0] : delivery.customers;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Report Delivery Issue
            </CardTitle>
            <CardDescription>
              If there are any discrepancies with your delivery, please let us know below
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <h3 className="font-semibold">Delivery Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <p className="font-medium">{customer.customer_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <p className="font-medium">
                    {new Date(delivery.delivery_date).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span>
                  <p className="font-medium">{delivery.qty} units</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Unit Rate:</span>
                  <p className="font-medium">KES {delivery.unit_rate}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total:</span>
                  <p className="font-medium">KES {delivery.total_amount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">DN #:</span>
                  <p className="font-medium">{delivery.delivery_note_no || 'N/A'}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <Label>What is the issue?</Label>
                <RadioGroup value={queryType} onValueChange={setQueryType}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="missing_items" id="missing" />
                    <Label htmlFor="missing" className="font-normal cursor-pointer">
                      Items not received
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="wrong_quantity" id="quantity" />
                    <Label htmlFor="quantity" className="font-normal cursor-pointer">
                      Wrong quantity delivered
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="wrong_price" id="price" />
                    <Label htmlFor="price" className="font-normal cursor-pointer">
                      Incorrect pricing
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="other" id="other" />
                    <Label htmlFor="other" className="font-normal cursor-pointer">
                      Other issue
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Describe the issue in detail</Label>
                <Textarea
                  id="message"
                  placeholder="Please provide as much detail as possible..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Query"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}