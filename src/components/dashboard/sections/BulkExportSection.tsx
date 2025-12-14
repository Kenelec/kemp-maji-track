import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CalendarIcon, Download, FileSpreadsheet, Loader2, Users } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
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

interface CustomerData {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  area: string | null;
  transactions: Transaction[];
  totalDelivered: number;
  totalPaid: number;
  currentBalance: number;
}

export function BulkExportSection() {
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [exportFormat, setExportFormat] = useState<"multiple" | "single">("multiple");
  const [isExporting, setIsExporting] = useState(false);

  const fetchAllCustomersData = async (): Promise<CustomerData[]> => {
    // Fetch all customers
    const { data: customers, error: customersError } = await supabase
      .from("customers")
      .select("id, customer_name, phone, email, area")
      .order("customer_name");

    if (customersError) throw customersError;

    const customersData: CustomerData[] = [];

    for (const customer of customers || []) {
      // Fetch deliveries for this customer
      let deliveriesQuery = supabase
        .from("deliveries")
        .select(`
          id,
          delivery_date,
          total_amount,
          delivery_note_no,
          delivery_items (product_name, quantity, unit_price, total_price)
        `)
        .eq("customer_id", customer.id)
        .order("delivery_date", { ascending: true });

      if (dateRange.from) {
        deliveriesQuery = deliveriesQuery.gte("delivery_date", format(dateRange.from, "yyyy-MM-dd"));
      }
      if (dateRange.to) {
        deliveriesQuery = deliveriesQuery.lte("delivery_date", format(dateRange.to, "yyyy-MM-dd"));
      }

      const { data: deliveries } = await deliveriesQuery;

      // Fetch payments for this customer
      let paymentsQuery = supabase
        .from("payments")
        .select("id, amount, due_date, payment_method, mpesa_code, status")
        .eq("customer_id", customer.id)
        .order("due_date", { ascending: true });

      if (dateRange.from) {
        paymentsQuery = paymentsQuery.gte("due_date", format(dateRange.from, "yyyy-MM-dd"));
      }
      if (dateRange.to) {
        paymentsQuery = paymentsQuery.lte("due_date", format(dateRange.to, "yyyy-MM-dd"));
      }

      const { data: payments } = await paymentsQuery;

      // Build transactions list
      const transactions: Transaction[] = [];
      let runningBalance = 0;

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
          const itemsDesc = item.data.delivery_items
            ?.map((i: any) => `${i.product_name} x${i.quantity}`)
            .join(", ") || "Delivery";
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

      customersData.push({
        ...customer,
        transactions,
        totalDelivered,
        totalPaid,
        currentBalance: totalDelivered - totalPaid,
      });
    }

    return customersData;
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const customersData = await fetchAllCustomersData();
      const workbook = XLSX.utils.book_new();

      if (exportFormat === "multiple") {
        // Create a sheet for each customer
        for (const customer of customersData) {
          if (customer.transactions.length === 0) continue;

          const sheetData: any[][] = [
            [`Payment History - ${customer.customer_name}`],
            [`Phone: ${customer.phone || "N/A"} | Email: ${customer.email || "N/A"} | Area: ${customer.area || "N/A"}`],
            dateRange.from || dateRange.to
              ? [`Date Range: ${dateRange.from ? format(dateRange.from, "MMM d, yyyy") : "Start"} to ${dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "End"}`]
              : [`Generated: ${format(new Date(), "PPP")}`],
            [],
            ["Date", "Type", "Description", "Debit (KSh)", "Credit (KSh)", "Balance (KSh)"],
            ...customer.transactions.map((t) => [
              format(new Date(t.date), "MMM d, yyyy"),
              t.type === "delivery" ? "Delivery" : "Payment",
              t.description,
              t.debit > 0 ? t.debit : "",
              t.credit > 0 ? t.credit : "",
              t.balance,
            ]),
            [],
            ["Summary"],
            [`Total Delivered: KSh ${customer.totalDelivered.toLocaleString()}`],
            [`Total Paid: KSh ${customer.totalPaid.toLocaleString()}`],
            [`Current Balance: KSh ${customer.currentBalance.toLocaleString()}`],
          ];

          const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
          worksheet["!cols"] = [{ wch: 15 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
          
          // Sanitize sheet name (max 31 chars, no special chars)
          const sheetName = customer.customer_name.substring(0, 28).replace(/[\\/*?[\]:]/g, "");
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }

        // Add summary sheet
        const summaryData: any[][] = [
          ["All Customers Summary"],
          [`Generated: ${format(new Date(), "PPP")}`],
          dateRange.from || dateRange.to
            ? [`Date Range: ${dateRange.from ? format(dateRange.from, "MMM d, yyyy") : "Start"} to ${dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "End"}`]
            : [],
          [],
          ["Customer", "Total Delivered (KSh)", "Total Paid (KSh)", "Balance (KSh)"],
          ...customersData.map((c) => [c.customer_name, c.totalDelivered, c.totalPaid, c.currentBalance]),
          [],
          [
            "TOTAL",
            customersData.reduce((sum, c) => sum + c.totalDelivered, 0),
            customersData.reduce((sum, c) => sum + c.totalPaid, 0),
            customersData.reduce((sum, c) => sum + c.currentBalance, 0),
          ],
        ];

        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        summarySheet["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
      } else {
        // Single consolidated sheet
        const allData: any[][] = [
          ["All Customers Payment History"],
          [`Generated: ${format(new Date(), "PPP")}`],
          dateRange.from || dateRange.to
            ? [`Date Range: ${dateRange.from ? format(dateRange.from, "MMM d, yyyy") : "Start"} to ${dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "End"}`]
            : [],
          [],
          ["Customer", "Date", "Type", "Description", "Debit (KSh)", "Credit (KSh)", "Balance (KSh)"],
        ];

        for (const customer of customersData) {
          for (const t of customer.transactions) {
            allData.push([
              customer.customer_name,
              format(new Date(t.date), "MMM d, yyyy"),
              t.type === "delivery" ? "Delivery" : "Payment",
              t.description,
              t.debit > 0 ? t.debit : "",
              t.credit > 0 ? t.credit : "",
              t.balance,
            ]);
          }
        }

        allData.push([]);
        allData.push(["Summary by Customer"]);
        allData.push(["Customer", "Total Delivered", "Total Paid", "Balance"]);
        for (const c of customersData) {
          allData.push([c.customer_name, c.totalDelivered, c.totalPaid, c.currentBalance]);
        }

        const worksheet = XLSX.utils.aoa_to_sheet(allData);
        worksheet["!cols"] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(workbook, worksheet, "All Customers");
      }

      const filename = `all_customers_payment_history_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      XLSX.writeFile(workbook, filename);

      toast({
        title: "Export Complete",
        description: `Downloaded ${filename}`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "Failed to export customer data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportSimpleCSV = async (type: "deliveries" | "payments" | "customers") => {
    try {
      if (type === "deliveries") {
        const { data, error } = await supabase
          .from("deliveries")
          .select("*, customers(customer_name), delivery_items(product_name, quantity, unit_price, total_price)")
          .order("delivery_date", { ascending: false });
        if (error) throw error;

        const csv = [
          ["Date", "Customer", "Items", "Total Amount", "Payment Status", "Note No"],
          ...(data || []).map((d) => [
            d.delivery_date,
            d.customers?.customer_name || "",
            d.delivery_items?.map((i: any) => `${i.product_name} x${i.quantity}`).join("; ") || "",
            d.total_amount,
            d.payment_status,
            d.delivery_note_no || "",
          ]),
        ]
          .map((row) => row.map((cell) => `"${cell}"`).join(","))
          .join("\n");

        downloadCSV(csv, "deliveries.csv");
      } else if (type === "payments") {
        const { data, error } = await supabase
          .from("payments")
          .select("*, customers(customer_name)")
          .order("due_date", { ascending: false });
        if (error) throw error;

        const csv = [
          ["Customer", "Amount", "Due Date", "Method", "M-Pesa Code", "Status"],
          ...(data || []).map((p) => [
            p.customers?.customer_name || "",
            p.amount,
            p.due_date,
            p.payment_method || "",
            p.mpesa_code || "",
            p.status,
          ]),
        ]
          .map((row) => row.map((cell) => `"${cell}"`).join(","))
          .join("\n");

        downloadCSV(csv, "payments.csv");
      } else {
        const { data, error } = await supabase.from("customers").select("*").order("customer_name");
        if (error) throw error;

        const csv = [
          ["Name", "Phone", "Email", "Area", "Address"],
          ...(data || []).map((c) => [c.customer_name, c.phone || "", c.email || "", c.area || "", c.address || ""]),
        ]
          .map((row) => row.map((cell) => `"${cell}"`).join(","))
          .join("\n");

        downloadCSV(csv, "customers.csv");
      }

      toast({ title: "Export Complete", description: `${type}.csv downloaded` });
    } catch (error) {
      toast({ title: "Export Failed", variant: "destructive" });
    }
  };

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Export Data</h2>
        <p className="text-muted-foreground">Download comprehensive reports and data exports</p>
      </div>

      {/* Bulk Export Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Customers Payment History
          </CardTitle>
          <CardDescription>Download payment histories for all customers in a single Excel file</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Date Range Filter */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[150px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? format(dateRange.from, "MMM d, yyyy") : "From Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => setDateRange((prev) => ({ ...prev, from: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[150px] justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "To Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => setDateRange((prev) => ({ ...prev, to: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {(dateRange.from || dateRange.to) && (
                <Button variant="ghost" size="sm" onClick={() => setDateRange({ from: undefined, to: undefined })}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Export Format Selection */}
          <div className="space-y-3">
            <Label>Export Format</Label>
            <RadioGroup value={exportFormat} onValueChange={(v) => setExportFormat(v as "multiple" | "single")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="multiple" id="multiple" />
                <Label htmlFor="multiple" className="font-normal cursor-pointer">
                  Multiple Sheets (one sheet per customer + summary)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="single" id="single" />
                <Label htmlFor="single" className="font-normal cursor-pointer">
                  Single Sheet (all customers combined)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Button onClick={exportToExcel} disabled={isExporting} className="w-full sm:w-auto">
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Download All Customers Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Quick Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Deliveries Report</CardTitle>
            <CardDescription>Export all delivery records</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => exportSimpleCSV("deliveries")}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payments Report</CardTitle>
            <CardDescription>Export all payment records</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => exportSimpleCSV("payments")}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customers Report</CardTitle>
            <CardDescription>Export customer database</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => exportSimpleCSV("customers")}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
