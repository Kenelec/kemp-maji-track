import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Printer, Loader2, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

interface Transaction {
  date: string;
  type: "delivery" | "payment";
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export function CustomerStatementsSection() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [isExporting, setIsExporting] = useState(false);

  // Generate last 12 months for selection
  const monthOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const date = subMonths(new Date(), i);
      options.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy"),
      });
    }
    return options;
  }, []);

  // Fetch customer profile
  const { data: customerProfile } = useQuery({
    queryKey: ["customer-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, customer_name, phone, email, area")
        .eq("user_id", user?.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch statement data
  const { data: statementData, isLoading } = useQuery({
    queryKey: ["customer-statement", customerProfile?.id, selectedMonth],
    queryFn: async () => {
      if (!customerProfile?.id) return null;

      const [year, month] = selectedMonth.split("-").map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      // Fetch all deliveries before end of selected month (for opening balance)
      const { data: allDeliveriesBefore } = await supabase
        .from("deliveries")
        .select("total_amount")
        .eq("customer_id", customerProfile.id)
        .lt("delivery_date", format(startDate, "yyyy-MM-dd"));

      const { data: allPaymentsBefore } = await supabase
        .from("payments")
        .select("amount")
        .eq("customer_id", customerProfile.id)
        .lt("due_date", format(startDate, "yyyy-MM-dd"));

      const openingBalance =
        (allDeliveriesBefore || []).reduce((sum, d) => sum + Number(d.total_amount || 0), 0) -
        (allPaymentsBefore || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

      // Fetch deliveries for selected month
      const { data: deliveries } = await supabase
        .from("deliveries")
        .select(`
          id,
          delivery_date,
          total_amount,
          delivery_note_no,
          delivery_items (product_name, quantity)
        `)
        .eq("customer_id", customerProfile.id)
        .gte("delivery_date", format(startDate, "yyyy-MM-dd"))
        .lte("delivery_date", format(endDate, "yyyy-MM-dd"))
        .order("delivery_date", { ascending: true });

      // Fetch payments for selected month
      const { data: payments } = await supabase
        .from("payments")
        .select("id, amount, due_date, payment_method, mpesa_code")
        .eq("customer_id", customerProfile.id)
        .gte("due_date", format(startDate, "yyyy-MM-dd"))
        .lte("due_date", format(endDate, "yyyy-MM-dd"))
        .order("due_date", { ascending: true });

      // Build transactions list
      const transactions: Transaction[] = [];
      let runningBalance = openingBalance;

      // Combine and sort by date
      const allItems: { date: string; type: "delivery" | "payment"; data: any }[] = [];

      (deliveries || []).forEach((d) => {
        allItems.push({ date: d.delivery_date, type: "delivery", data: d });
      });

      (payments || []).forEach((p) => {
        allItems.push({ date: p.due_date, type: "payment", data: p });
      });

      allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (const item of allItems) {
        if (item.type === "delivery") {
          const amount = Number(item.data.total_amount) || 0;
          runningBalance += amount;
          const itemsDesc = item.data.delivery_items?.map((i: any) => `${i.product_name} x${i.quantity}`).join(", ") || "Delivery";
          transactions.push({
            date: item.date,
            type: "delivery",
            description: item.data.delivery_note_no ? `DN#${item.data.delivery_note_no}: ${itemsDesc}` : itemsDesc,
            debit: amount,
            credit: 0,
            balance: runningBalance,
          });
        } else {
          const amount = Number(item.data.amount) || 0;
          runningBalance -= amount;
          transactions.push({
            date: item.date,
            type: "payment",
            description: item.data.mpesa_code
              ? `M-Pesa: ${item.data.mpesa_code}`
              : `${item.data.payment_method || "Cash"} Payment`,
            debit: 0,
            credit: amount,
            balance: runningBalance,
          });
        }
      }

      const totalDelivered = transactions.filter((t) => t.type === "delivery").reduce((sum, t) => sum + t.debit, 0);
      const totalPaid = transactions.filter((t) => t.type === "payment").reduce((sum, t) => sum + t.credit, 0);

      return {
        openingBalance,
        closingBalance: runningBalance,
        transactions,
        totalDelivered,
        totalPaid,
        deliveryCount: deliveries?.length || 0,
        paymentCount: payments?.length || 0,
      };
    },
    enabled: !!customerProfile?.id,
  });

  const exportToExcel = async () => {
    if (!statementData || !customerProfile) return;

    setIsExporting(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const monthName = format(new Date(year, month - 1), "MMMM yyyy");

      const sheetData: any[][] = [
        ["KEMP MAJI TRACK"],
        [`Monthly Statement - ${monthName}`],
        [],
        [`Customer: ${customerProfile.customer_name}`],
        [`Phone: ${customerProfile.phone || "N/A"}`],
        [`Area: ${customerProfile.area || "N/A"}`],
        [],
        [`Opening Balance: KSh ${statementData.openingBalance.toLocaleString()}`],
        [],
        ["Date", "Type", "Description", "Debit (KSh)", "Credit (KSh)", "Balance (KSh)"],
        ...statementData.transactions.map((t) => [
          format(new Date(t.date), "MMM d, yyyy"),
          t.type === "delivery" ? "Delivery" : "Payment",
          t.description,
          t.debit > 0 ? t.debit : "",
          t.credit > 0 ? t.credit : "",
          t.balance,
        ]),
        [],
        [`Closing Balance: KSh ${statementData.closingBalance.toLocaleString()}`],
        [],
        ["Summary"],
        [`Total Deliveries: ${statementData.deliveryCount} (KSh ${statementData.totalDelivered.toLocaleString()})`],
        [`Total Payments: ${statementData.paymentCount} (KSh ${statementData.totalPaid.toLocaleString()})`],
        [`Net Movement: KSh ${(statementData.totalDelivered - statementData.totalPaid).toLocaleString()}`],
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
      worksheet["!cols"] = [{ wch: 15 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Statement");

      const filename = `statement_${format(new Date(year, month - 1), "MMM_yyyy")}.xlsx`;
      XLSX.writeFile(workbook, filename);

      toast({
        title: "Statement Downloaded",
        description: `${monthName} statement saved`,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const printStatement = () => {
    window.print();
  };

  if (!customerProfile) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading your account...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">My Statements</h2>
        <p className="text-sm text-muted-foreground">Download your monthly delivery and payment statements</p>
      </div>

      <Card className="statement-print-area">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Monthly Statement
          </CardTitle>
          <CardDescription>Select a month to view and download your statement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Month Selector */}
          <div className="flex flex-wrap items-center gap-4 print:hidden">
            <div className="w-full sm:w-[200px]">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button onClick={exportToExcel} disabled={isExporting || isLoading}>
                {isExporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                )}
                Download Excel
              </Button>
              <Button variant="outline" onClick={printStatement}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Loading statement...</p>
            </div>
          ) : statementData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Opening Balance</div>
                  <div className="text-lg font-bold">KSh {statementData.openingBalance.toLocaleString()}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-red-500" />
                    Total Delivered
                  </div>
                  <div className="text-lg font-bold text-red-600">KSh {statementData.totalDelivered.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{statementData.deliveryCount} deliveries</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3 w-3 text-green-500" />
                    Total Paid
                  </div>
                  <div className="text-lg font-bold text-green-600">KSh {statementData.totalPaid.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{statementData.paymentCount} payments</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground">Closing Balance</div>
                  <div className={`text-lg font-bold ${statementData.closingBalance > 0 ? "text-orange-600" : "text-green-600"}`}>
                    KSh {statementData.closingBalance.toLocaleString()}
                  </div>
                </Card>
              </div>

              {/* Transactions Table */}
              {statementData.transactions.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Date</th>
                        <th className="px-4 py-2 text-left font-medium">Type</th>
                        <th className="px-4 py-2 text-left font-medium">Description</th>
                        <th className="px-4 py-2 text-right font-medium">Debit</th>
                        <th className="px-4 py-2 text-right font-medium">Credit</th>
                        <th className="px-4 py-2 text-right font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.transactions.map((t, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-4 py-2">{format(new Date(t.date), "MMM d")}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${t.type === "delivery" ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>
                              {t.type === "delivery" ? "Delivery" : "Payment"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{t.description}</td>
                          <td className="px-4 py-2 text-right text-red-600">{t.debit > 0 ? `KSh ${t.debit.toLocaleString()}` : "-"}</td>
                          <td className="px-4 py-2 text-right text-green-600">{t.credit > 0 ? `KSh ${t.credit.toLocaleString()}` : "-"}</td>
                          <td className="px-4 py-2 text-right font-medium">KSh {t.balance.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  No transactions found for this month
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
