import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, Scale, Phone, Mail, MapPin, CalendarIcon, FileSpreadsheet, Printer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface CustomerPaymentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: {
    id: string;
    customer_name: string;
    phone?: string | null;
    email?: string | null;
    area?: string | null;
  } | null;
}

interface Transaction {
  date: string;
  type: "delivery" | "payment";
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export function CustomerPaymentHistoryDialog({
  open,
  onOpenChange,
  customer,
}: CustomerPaymentHistoryDialogProps) {
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: undefined, to: undefined });

  // Fetch deliveries for this customer
  const { data: deliveries } = useQuery({
    queryKey: ["customer-deliveries", customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];
      const { data, error } = await supabase
        .from("deliveries")
        .select(`
          id,
          delivery_date,
          total_amount,
          delivery_items (
            product_name,
            quantity
          )
        `)
        .eq("customer_id", customer.id)
        .order("delivery_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customer?.id,
  });

  // Fetch payments for this customer
  const { data: payments } = useQuery({
    queryKey: ["customer-payments", customer?.id],
    queryFn: async () => {
      if (!customer?.id) return [];
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customer?.id,
  });

  // Calculate running balance and build transaction history
  const { transactions, totalDelivered, totalPaid, currentBalance } = useMemo(() => {
    if (!deliveries || !payments) {
      return { transactions: [], totalDelivered: 0, totalPaid: 0, currentBalance: 0 };
    }

    // Combine deliveries and payments into a unified list
    const allTransactions: (Transaction & { sortDate: Date })[] = [
      ...deliveries.map((d) => ({
        date: d.delivery_date,
        sortDate: new Date(d.delivery_date),
        type: "delivery" as const,
        description: d.delivery_items?.map((i: any) => `${i.product_name} x${i.quantity}`).join(", ") || "Delivery",
        debit: Number(d.total_amount),
        credit: 0,
        balance: 0,
      })),
      ...payments.map((p) => ({
        date: p.created_at || p.due_date,
        sortDate: new Date(p.created_at || p.due_date),
        type: "payment" as const,
        description: p.mpesa_code ? `M-Pesa: ${p.mpesa_code}` : `${p.payment_method || "Cash"} Payment`,
        debit: 0,
        credit: Number(p.amount),
        balance: 0,
      })),
    ];

    // Sort by date
    allTransactions.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());

    // Calculate running balance
    let runningBalance = 0;
    const transactionsWithBalance = allTransactions.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: runningBalance };
    });

    const totalDelivered = deliveries.reduce((sum, d) => sum + Number(d.total_amount), 0);
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      transactions: transactionsWithBalance,
      totalDelivered,
      totalPaid,
      currentBalance: totalDelivered - totalPaid,
    };
  }, [deliveries, payments]);

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return transactions;

    return transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      transactionDate.setHours(0, 0, 0, 0);
      
      if (dateRange.from) {
        const fromDate = new Date(dateRange.from);
        fromDate.setHours(0, 0, 0, 0);
        if (transactionDate < fromDate) return false;
      }
      if (dateRange.to) {
        const toDate = new Date(dateRange.to);
        toDate.setHours(23, 59, 59, 999);
        if (transactionDate > toDate) return false;
      }
      return true;
    });
  }, [transactions, dateRange]);

  // Recalculate summaries based on filtered transactions
  const filteredSummary = useMemo(() => {
    const delivered = filteredTransactions
      .filter((t) => t.type === "delivery")
      .reduce((sum, t) => sum + t.debit, 0);
    const paid = filteredTransactions
      .filter((t) => t.type === "payment")
      .reduce((sum, t) => sum + t.credit, 0);
    return {
      totalDelivered: delivered,
      totalPaid: paid,
      balance: delivered - paid,
    };
  }, [filteredTransactions]);

  // Export to Excel
  const exportToExcel = () => {
    if (!customer) return;

    const worksheetData = [
      [`Payment History - ${customer.customer_name}`],
      [`Generated: ${format(new Date(), "PPP")}`],
      dateRange.from || dateRange.to
        ? [`Date Range: ${dateRange.from ? format(dateRange.from, "MMM d, yyyy") : "Start"} to ${dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "End"}`]
        : [],
      [],
      ["Date", "Type", "Description", "Debit (KSh)", "Credit (KSh)", "Balance (KSh)"],
      ...filteredTransactions.map((t) => [
        format(new Date(t.date), "MMM d, yyyy"),
        t.type === "delivery" ? "Delivery" : "Payment",
        t.description,
        t.debit > 0 ? t.debit : "",
        t.credit > 0 ? t.credit : "",
        t.balance,
      ]),
      [],
      ["Summary"],
      [`Total Delivered: KSh ${filteredSummary.totalDelivered.toLocaleString()}`],
      [`Total Paid: KSh ${filteredSummary.totalPaid.toLocaleString()}`],
      [`Current Balance: KSh ${filteredSummary.balance.toLocaleString()}`],
    ].filter((row) => row.length > 0);

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    worksheet["!cols"] = [
      { wch: 15 }, { wch: 10 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Payment History");
    XLSX.writeFile(workbook, `${customer.customer_name.replace(/\s+/g, "_")}_payment_history.xlsx`);
  };

  // Export to PDF (print)
  const exportToPDF = () => {
    window.print();
  };

  const clearDateRange = () => {
    setDateRange({ from: undefined, to: undefined });
  };

  if (!customer) return null;

  const hasDateFilter = dateRange.from || dateRange.to;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto payment-history-print">
        <DialogHeader>
          <DialogTitle className="text-xl">Payment History - {customer.customer_name}</DialogTitle>
        </DialogHeader>

        {/* Customer Info */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
          {customer.phone && (
            <div className="flex items-center gap-1">
              <Phone className="w-4 h-4" />
              {customer.phone}
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-1">
              <Mail className="w-4 h-4" />
              {customer.email}
            </div>
          )}
          {customer.area && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {customer.area}
            </div>
          )}
        </div>

        {/* Filters and Export Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
          {/* Date From */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !dateRange.from && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange.from ? format(dateRange.from, "MMM d, yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.from}
                onSelect={(date) => setDateRange((prev) => ({ ...prev, from: date }))}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Date To */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !dateRange.to && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateRange.to}
                onSelect={(date) => setDateRange((prev) => ({ ...prev, to: date }))}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Clear Filters */}
          {hasDateFilter && (
            <Button variant="ghost" size="sm" onClick={clearDateRange}>
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Export Buttons */}
          <Button variant="outline" size="sm" onClick={exportToExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportToPDF}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-destructive" />
                Total Delivered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">KSh {filteredSummary.totalDelivered.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-green-600" />
                Total Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">KSh {filteredSummary.totalPaid.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Scale className="w-4 h-4" />
                Current Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${
                filteredSummary.balance > 0 ? "text-destructive" : 
                filteredSummary.balance < 0 ? "text-green-600" : "text-muted-foreground"
              }`}>
                KSh {Math.abs(filteredSummary.balance).toLocaleString()}
                {filteredSummary.balance < 0 && " (Credit)"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Transaction History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Transaction History
              {hasDateFilter && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredTransactions.length} of {transactions.length} records)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredTransactions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {hasDateFilter ? "No transactions found in selected date range." : "No transactions found."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((t, index) => (
                    <TableRow key={index}>
                      <TableCell>{format(new Date(t.date), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={t.type === "delivery" ? "outline" : "secondary"}>
                          {t.type === "delivery" ? "Delivery" : "Payment"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{t.description}</TableCell>
                      <TableCell className="text-right text-destructive">
                        {t.debit > 0 ? `KSh ${t.debit.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {t.credit > 0 ? `KSh ${t.credit.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${
                        t.balance > 0 ? "text-destructive" : 
                        t.balance < 0 ? "text-green-600" : "text-muted-foreground"
                      }`}>
                        KSh {Math.abs(t.balance).toLocaleString()}
                        {t.balance < 0 && " CR"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
