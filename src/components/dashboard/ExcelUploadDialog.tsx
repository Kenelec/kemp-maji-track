import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Download, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import { supabase } from "@/integrations/supabase/client";

interface ExcelUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'customers' | 'payments';
  onSuccess: () => void;
}

export function ExcelUploadDialog({ open, onOpenChange, type, onSuccess }: ExcelUploadDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResults(null);

    try {
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      setPreview(jsonData.slice(0, 5)); // Show first 5 rows
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to read Excel file",
        variant: "destructive",
      });
    }
  };

  const downloadTemplate = () => {
    const template = type === 'customers' 
      ? [{ 'Customer Name': 'John Doe', 'Email': 'john@example.com', 'Phone': '+254712345678', 'Area': 'Nairobi', 'Address': '123 Main St' }]
      : [{ 'Customer Name': 'John Doe', 'Amount': 5000, 'Due Date': '2024-01-15', 'Payment Method': 'mpesa', 'M-Pesa Code': 'QHK8...' }];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type === 'customers' ? 'Customers' : 'Payments');
    XLSX.writeFile(wb, `${type}_template.xlsx`);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const errors: string[] = [];
      let success = 0;

      for (let i = 0; i < jsonData.length; i++) {
        const row: any = jsonData[i];
        
        try {
          if (type === 'customers') {
            await importCustomer(row);
          } else {
            await importPayment(row);
          }
          success++;
        } catch (error: any) {
          errors.push(`Row ${i + 2}: ${error.message}`);
        }

        setProgress(Math.round(((i + 1) / jsonData.length) * 100));
      }

      setResults({
        success,
        failed: errors.length,
        errors: errors.slice(0, 10), // Show first 10 errors
      });

      if (success > 0) {
        onSuccess();
        toast({
          title: "Import completed",
          description: `Successfully imported ${success} ${type}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const importCustomer = async (row: any) => {
    const customerName = row['Customer Name'] || row['customer_name'];
    if (!customerName) throw new Error('Customer Name is required');

    const { error } = await supabase
      .from('customers')
      .insert({
        customer_name: customerName,
        email: row['Email'] || row['email'] || null,
        phone: row['Phone'] || row['phone'] || null,
        area: row['Area'] || row['area'] || null,
        address: row['Address'] || row['address'] || null,
      });

    if (error) throw error;
  };

  const importPayment = async (row: any) => {
    const customerName = row['Customer Name'] || row['customer_name'];
    const amount = row['Amount'] || row['amount'];
    const dueDate = row['Due Date'] || row['due_date'];

    if (!customerName || !amount || !dueDate) {
      throw new Error('Customer Name, Amount, and Due Date are required');
    }

    // Find customer by name
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('customer_name', customerName)
      .limit(1);

    if (customerError) throw customerError;
    if (!customers || customers.length === 0) {
      throw new Error(`Customer "${customerName}" not found`);
    }

    const { error } = await supabase
      .from('payments')
      .insert({
        customer_id: customers[0].id,
        amount: Number(amount),
        due_date: dueDate,
        payment_method: row['Payment Method'] || row['payment_method'] || 'cash',
        mpesa_code: row['M-Pesa Code'] || row['mpesa_code'] || null,
        status: row['Status'] || row['status'] || 'pending',
      });

    if (error) throw error;
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setResults(null);
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Import {type === 'customers' ? 'Customers' : 'Payments'} from Excel</DialogTitle>
          <DialogDescription>
            Upload an Excel file (.xlsx, .xls, .csv) to import multiple records at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            <Button variant="outline" onClick={downloadTemplate} disabled={uploading}>
              <Download className="w-4 h-4 mr-2" />
              Template
            </Button>
          </div>

          {preview.length > 0 && !results && (
            <>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Preview of first 5 rows. Total rows: {preview.length}+
                </AlertDescription>
              </Alert>

              <ScrollArea className="h-[300px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(preview[0]).map((key) => (
                        <TableHead key={key}>{key}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, idx) => (
                      <TableRow key={idx}>
                        {Object.values(row).map((value: any, i) => (
                          <TableCell key={i}>{String(value)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}

          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground text-center">
                Importing... {progress}%
              </p>
            </div>
          )}

          {results && (
            <Alert variant={results.failed === 0 ? "default" : "destructive"}>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold mb-2">
                  Import completed: {results.success} successful, {results.failed} failed
                </div>
                {results.errors.length > 0 && (
                  <ScrollArea className="h-[100px] mt-2">
                    <ul className="text-xs space-y-1">
                      {results.errors.map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              {results ? 'Close' : 'Cancel'}
            </Button>
            {!results && (
              <Button 
                onClick={handleUpload} 
                disabled={!file || uploading}
              >
                <Upload className="w-4 h-4 mr-2" />
                Import {preview.length > 0 ? `${preview.length}+ Records` : ''}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
