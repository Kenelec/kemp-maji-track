import { cn } from "@/lib/utils";

type StatusKind = string | null | undefined;

const STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800 border-green-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  partial: "bg-amber-100 text-amber-800 border-amber-300",
  pending: "bg-blue-100 text-blue-800 border-blue-300",
  pending_verification: "bg-orange-100 text-orange-800 border-orange-300",
  awaiting_verification: "bg-orange-100 text-orange-800 border-orange-300",
  open: "bg-slate-100 text-slate-700 border-slate-300",
  unpaid: "bg-slate-100 text-slate-700 border-slate-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  failed: "bg-red-100 text-red-800 border-red-300",
  credit: "bg-violet-100 text-violet-800 border-violet-300",
  cash: "bg-emerald-100 text-emerald-800 border-emerald-300",
  mpesa: "bg-teal-100 text-teal-800 border-teal-300",
  bank: "bg-indigo-100 text-indigo-800 border-indigo-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  resolved: "bg-green-100 text-green-800 border-green-300",
};

const LABELS: Record<string, string> = {
  pending_verification: "Awaiting Verification",
  awaiting_verification: "Awaiting Verification",
};

export function StatusBadge({
  status,
  className,
}: {
  status: StatusKind;
  className?: string;
}) {
  const key = (status || "unknown").toLowerCase();
  const style = STYLES[key] ?? "bg-slate-100 text-slate-700 border-slate-300";
  const label = LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap",
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}

export default StatusBadge;
