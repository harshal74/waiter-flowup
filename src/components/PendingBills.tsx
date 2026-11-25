/**
 * "Bills awaiting payment" — generated bills that are not fully paid yet,
 * including part-paid split bills. Lets staff reopen a bill after a reload or
 * from another device. Shared by the Admin and Waiter apps (same file in both).
 */

import { Receipt, ChevronRight, Split } from 'lucide-react';

export interface PendingBill {
  _id: string;
  invoiceNumber: string;
  tableNumber: number | null;
  grandTotal: number;
  paidAmount?: number;
  remainingAmount?: number;
  splitType?: string;
  splits?: { paymentStatus: string }[];
  createdAt: string;
  orderNumbers?: string[];
  customer?: { name: string; mobile: string };
  // remaining bill fields are passed through to the receipt
  [key: string]: unknown;
}

const money = (n: number) => `₹${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

export function PendingBills({ bills, onOpen }: { bills: PendingBill[]; onOpen: (bill: PendingBill) => void }) {
  if (bills.length === 0) return null;
  return (
    <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Receipt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
          Bills awaiting payment ({bills.length})
        </p>
      </div>
      <div className="space-y-2">
        {bills.map((b) => {
          const isSplit = !!b.splitType && b.splitType !== 'NONE' && (b.splits?.length ?? 0) > 0;
          const paidCount = (b.splits || []).filter((s) => s.paymentStatus === 'Paid').length;
          const paid = b.paidAmount ?? 0;
          const remaining = b.remainingAmount ?? b.grandTotal - paid;
          return (
            <button
              key={b._id}
              onClick={() => onOpen(b)}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-left hover:border-amber-400 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {b.tableNumber != null ? `Table ${b.tableNumber}` : 'Counter'}
                  {b.customer?.name ? ` · ${b.customer.name}` : ''}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {b.invoiceNumber}
                  {isSplit && (
                    <span className="inline-flex items-center gap-1 ml-2 text-amber-700 dark:text-amber-400">
                      <Split className="w-3 h-3" /> {paidCount}/{b.splits!.length} paid
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white">{money(remaining)}</p>
                <p className="text-[11px] text-gray-500">{paid > 0 ? `of ${money(b.grandTotal)} due` : 'due'}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
