import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Receipt, Loader2, ChevronDown, ChevronUp, CheckCircle, XCircle, MessageCircle, Search, RefreshCw, X, AlertCircle, CalendarCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import API from '../lib/api';
import type { Order, Bill } from '../types';

// UPI deep-link builder — data comes from DB via API, never from env
function buildUpiUrl(upiId: string, amount: number, restaurantName: string): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: restaurantName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: 'Restaurant Bill Payment',
  });
  return `upi://pay?${params.toString()}`;
}

function buildWhatsAppMessage(
  bill: Bill,
  customerName: string,
  restaurantName: string,
  gstSettings?: { sgstRate: number; cgstRate: number },
): string {
  const date = new Date(bill.createdAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const itemLines = bill.items
    .map(i => `  • ${i.quantity}× ${i.name} — ₹${i.total.toFixed(2)}`)
    .join('\n');
  const tableInfo    = bill.tableNumber ? `Table: ${bill.tableNumber}\n` : '';
  const discountLine = bill.discount > 0 ? `Discount: −₹${bill.discount.toFixed(2)}\n` : '';

  // Build GST lines from bill values — never recalculate from subtotal
  const sgst = bill.sgst ?? 0;
  const cgst = bill.cgst ?? 0;
  let gstLines = '';
  if (sgst > 0 || cgst > 0) {
    // New bill: show SGST + CGST separately
    const sgstLabel = gstSettings?.sgstRate ? `(${gstSettings.sgstRate}%)` : '';
    const cgstLabel = gstSettings?.cgstRate ? `(${gstSettings.cgstRate}%)` : '';
    gstLines = `SGST ${sgstLabel}: ₹${sgst.toFixed(2)}\nCGST ${cgstLabel}: ₹${cgst.toFixed(2)}\n`;
  } else if (bill.gst > 0) {
    // Legacy bill: only combined gst, no sgst/cgst stored
    gstLines = `GST: ₹${bill.gst.toFixed(2)}\n`;
  }
  // GST disabled: gstLines = '' → nothing shown

  return (
    `🧾 *Bill from ${restaurantName}*\n` +
    `Invoice: ${bill.invoiceNumber}\n` +
    `Date: ${date}\n` +
    `${tableInfo}` +
    `\n*Items:*\n${itemLines}\n\n` +
    `Subtotal: ₹${bill.subtotal.toFixed(2)}\n` +
    gstLines +
    discountLine +
    `*Total: ₹${bill.grandTotal.toFixed(2)}*\n\n` +
    `Payment: ${bill.paymentMethod}\n\n` +
    `Thank you for dining with us! 🙏`
  );
}

interface BillDetail {
  bill: Bill;
  customer: { name: string; mobile: string };
}

interface RemainingOrder {
  _id: string;
  orderNumber: string;
  totalAmount: number;
  subtotalAmount?: number;
  tableNumber: number;
  customerName: string;
  items?: { name: string; quantity: number; price: number; subtotal: number }[];
  createdAt: string;
}

/** Navigation state passed from ReadyOrdersPage after a COD delivery is completed. */
type BillingNavigationState = {
  preselectOrderId?: string;
};

export default function BillRequestsPage() {
  const location = useLocation();
  // Read the preselect ID once — it is only present when navigated from delivery completion.
  const preselectOrderId =
    (location.state as BillingNavigationState | null)?.preselectOrderId ?? null;

  const [orders,        setOrders]        = useState<Order[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [selected,      setSelected]      = useState<Record<string, boolean>>({});
  const [discount,      setDiscount]      = useState(0);
  const [payment,       setPayment]       = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [genLoad,       setGenLoad]       = useState(false);
  const [confirmLoad,   setConfirmLoad]   = useState(false);
  const [cancelLoad,    setCancelLoad]    = useState(false);
  const [activeBill,    setActiveBill]    = useState<BillDetail | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  // Payment settings from DB via API — never from env
  const [upiId,          setUpiId]          = useState('');
  const [restaurantName, setRestaurantName] = useState('FlowUp Restaurant');
  // GST settings from backend bill response — never calculated independently
  const [gstSettings,    setGstSettings]    = useState<{ gstEnabled: boolean; sgstRate: number; cgstRate: number }>({ gstEnabled: false, sgstRate: 0, cgstRate: 0 });
  // Remaining unpaid orders at the same table after payment confirmed
  const [remainingOrders, setRemainingOrders] = useState<RemainingOrder[]>([]);
  // Reservation auto-completed after dine-in billing
  interface ReservationCompletedInfo {
    reservationId: string;
    tableNumber: number;
    guestName: string;
    numberOfPeople: number;
  }
  const [reservationCompletedInfo, setReservationCompletedInfo] = useState<ReservationCompletedInfo | null>(null);
  // Search / filter
  const [customerSearch, setCustomerSearch] = useState('');
  const [tableSearch,    setTableSearch]    = useState('');

  const fetchOrders = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else              setLoading(true);
    try {
      const params = new URLSearchParams();
      if (customerSearch.trim()) params.append('customer', customerSearch.trim());
      if (tableSearch.trim())    params.append('table',    tableSearch.trim());
      const res = await API.get(`/billing/orders?${params.toString()}`);
      setOrders(res.data.orders || []);
    } catch { toast.error('Failed to load orders'); }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerSearch, tableSearch]);

  // Reload when filters change (debounced 400ms — same as admin)
  useEffect(() => {
    const t = setTimeout(() => fetchOrders(), 400);
    return () => clearTimeout(t);
  }, [customerSearch, tableSearch, fetchOrders]);

  // Initial load
  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Preselect a specific order when navigated here from COD delivery completion.
  // Waits until `orders` is populated so the ID can be verified against the fetched list.
  // Only selects if the order actually exists in the billing list (backend is the authority).
  // Runs at most once per navigation event — preselectOrderId is stable (from location.state).
  useEffect(() => {
    if (!preselectOrderId) return;
    if (orders.some(o => o._id === preselectOrderId)) {
      setSelected(prev => ({ ...prev, [preselectOrderId]: true }));
    }
  }, [orders, preselectOrderId]);

  const handleRefresh = () => fetchOrders({ silent: true });

  const toggleOrder = (id: string) =>
    setSelected(p => ({ ...p, [id]: !p[id] }));

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);

  const subtotal   = orders.filter(o => selected[o._id]).reduce((s, o) => s + o.totalAmount, 0);
  // GST is calculated by the backend — do NOT compute it in the frontend.
  // Show 0 in the pre-generation preview; actual value comes from backend bill response.
  const gst        = 0; // preview only
  const grandTotal = Math.max(0, subtotal + gst - discount);

  const handleGenerate = async () => {
    if (selectedIds.length === 0) { toast.error('Select at least one order'); return; }
    setGenLoad(true);
    try {
      const res = await API.post('/billing/generate', {
        orderIds: selectedIds, discount, paymentMethod: payment,
      });
      setActiveBill({ bill: res.data.bill, customer: res.data.customer });
      // Store UPI settings from DB — do NOT use env vars
      setUpiId(res.data.paymentSettings?.upiId || '');
      setRestaurantName(res.data.paymentSettings?.restaurantName || 'FlowUp Restaurant');
      setGstSettings({
        gstEnabled: res.data.paymentSettings?.gstEnabled ?? false,
        sgstRate:   res.data.paymentSettings?.sgstRate   ?? 0,
        cgstRate:   res.data.paymentSettings?.cgstRate   ?? 0,
      });
      toast.success('Bill generated!');
      setSelected({});
      fetchOrders({ silent: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to generate bill');
    } finally { setGenLoad(false); }
  };

  const handleConfirmPayment = async () => {
    if (!activeBill) return;
    setConfirmLoad(true);
    try {
      const res = await API.patch(`/billing/${activeBill.bill._id}/confirm`);
      toast.success('Payment confirmed! Bill closed.');
      setActiveBill(null);
      fetchOrders({ silent: true });
      // Show popup if there are still unpaid orders at the same table
      const remaining: RemainingOrder[] = res.data?.remainingOrders || [];
      if (remaining.length > 0) {
        setRemainingOrders(remaining);
      }
      // Show reservation-completed notification if an ARRIVED reservation was auto-completed
      if (res.data?.reservationCompleted) {
        setReservationCompletedInfo(res.data.reservationCompleted);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to confirm payment');
    } finally { setConfirmLoad(false); }
  };

  const handleCancelBill = async () => {
    if (!activeBill) return;
    setCancelLoad(true);
    try {
      await API.delete(`/billing/${activeBill.bill._id}`);
      toast('Bill cancelled. Orders returned to unpaid list.');
      setActiveBill(null);
      fetchOrders({ silent: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to cancel bill');
    } finally { setCancelLoad(false); }
  };

  return (
    <div className="space-y-5">
      {/* Page header + search/filter/refresh */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Bill Requests</h1>
              <p className="text-xs text-gray-400">{orders.length} unpaid order{orders.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl
                       bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white
                       text-sm font-medium transition-colors disabled:opacity-50"
            title="Refresh orders"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Search & filter bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Customer name search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder="Search customer…"
              className="input pl-9 text-sm py-2 w-full"
            />
            {customerSearch && (
              <button
                onClick={() => setCustomerSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Table number search */}
          <div className="relative sm:w-36">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-semibold pointer-events-none">
              T-
            </span>
            <input
              type="number"
              min={1}
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              placeholder="Table No."
              className="input pl-8 text-sm py-2 w-full"
            />
            {tableSearch && (
              <button
                onClick={() => setTableSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Bill Preview Modal ──────────────────────────────────────── */}
      {activeBill && (() => {
        const bill    = activeBill.bill;
        const isUPI   = bill.paymentMethod === 'UPI';
        const upiUrl  = buildUpiUrl(upiId, bill.grandTotal, restaurantName);
        const mobile  = activeBill.customer?.mobile || '';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="card w-full max-w-sm max-h-[90vh] overflow-y-auto flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-700 shrink-0">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary-400" />
                  <h2 className="font-bold text-white">Bill Preview</h2>
                </div>
                <span className="text-xs text-gray-500 font-mono">{bill.invoiceNumber}</span>
              </div>

              <div className="px-5 py-4 space-y-4 flex-1">

                {/* UPI QR Code — shown only when UPI + upiId configured in restaurant settings */}
                {isUPI && upiId && (
                  <div className="flex flex-col items-center gap-3 p-4 rounded-2xl
                                  bg-orange-500/10 border border-orange-500/30">
                    <p className="text-sm font-semibold text-orange-400">Scan to Pay via UPI</p>
                    <div className="p-3 bg-white rounded-xl shadow-md">
                      <QRCodeSVG value={upiUrl} size={180} level="M" />
                    </div>
                    <p className="text-xs text-gray-400 font-mono">{upiId}</p>
                    <p className="text-2xl font-bold text-green-400">₹{bill.grandTotal.toFixed(2)}</p>
                  </div>
                )}

                {/* UPI selected but no UPI ID in restaurant settings */}
                {isUPI && !upiId && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs text-center">
                    UPI ID not configured. Set it in Admin → Settings → UPI ID.
                  </div>
                )}

                {/* Bill breakdown */}
                <div className="space-y-2 text-sm">
                  {bill.tableNumber != null && (
                    <div className="flex justify-between text-gray-400">
                      <span>Table</span><span>T-{bill.tableNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-300">
                    <span>Customer</span><span>{activeBill.customer.name || '—'}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Subtotal</span><span>₹{bill.subtotal.toFixed(2)}</span>
                  </div>
                  {/* GST rows — use backend bill values; never recalculate */}
                  {(() => {
                    const sgst = bill.sgst ?? 0;
                    const cgst = bill.cgst ?? 0;
                    if (sgst > 0 || cgst > 0) {
                      // New bill: SGST + CGST stored separately
                      const sgstLabel = gstSettings.sgstRate > 0 ? ` (${gstSettings.sgstRate}%)` : '';
                      const cgstLabel = gstSettings.cgstRate > 0 ? ` (${gstSettings.cgstRate}%)` : '';
                      return (
                        <>
                          <div className="flex justify-between text-gray-300">
                            <span>SGST{sgstLabel}</span><span>₹{sgst.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-gray-300">
                            <span>CGST{cgstLabel}</span><span>₹{cgst.toFixed(2)}</span>
                          </div>
                        </>
                      );
                    }
                    if (bill.gst > 0) {
                      // Legacy bill: only combined gst — show without hardcoded "5%"
                      return (
                        <div className="flex justify-between text-gray-300">
                          <span>GST</span><span>₹{bill.gst.toFixed(2)}</span>
                        </div>
                      );
                    }
                    // GST disabled or zero — show nothing
                    return null;
                  })()}
                  {bill.discount > 0 && (
                    <div className="flex justify-between text-green-400">
                      <span>Discount</span><span>−₹{bill.discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-white text-base border-t border-gray-700 pt-2">
                    <span>Grand Total</span><span>₹{bill.grandTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Payment</span>
                    <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${
                      isUPI
                        ? 'bg-orange-500/20 text-orange-400'
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {bill.paymentMethod}
                    </span>
                  </div>
                </div>

                {/* Items list */}
                {bill.items.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</p>
                    {bill.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-gray-300">
                        <span>{item.quantity}× {item.name}</span>
                        <span>₹{item.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* UPI instruction */}
                {isUPI && (
                  <p className="text-xs text-gray-500 text-center">
                    Ask the customer to scan the QR code, then click <strong className="text-white">Payment Received</strong>.
                  </p>
                )}

                {/* WhatsApp share */}
                {mobile && (
                  <a
                    href={`https://wa.me/${mobile.replace(/\D/g, '').replace(/^0/, '91')}?text=${encodeURIComponent(buildWhatsAppMessage(bill, activeBill.customer.name, restaurantName, gstSettings))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl
                               bg-green-500/10 border border-green-500/30
                               text-green-400 text-sm font-medium
                               hover:bg-green-500/20 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Send Bill on WhatsApp
                  </a>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 px-5 pb-5 shrink-0">
                <button
                  onClick={handleCancelBill}
                  disabled={cancelLoad || confirmLoad}
                  className="btn-secondary flex-1"
                >
                  {cancelLoad
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><XCircle className="w-4 h-4" /> Cancel</>
                  }
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={confirmLoad || cancelLoad}
                  className="btn-success flex-1"
                >
                  {confirmLoad
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><CheckCircle className="w-4 h-4" /> {isUPI ? 'Payment Received' : 'Confirm Paid'}</>
                  }
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Remaining unpaid orders popup ──────────────────────── */}
      {remainingOrders.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="card w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    Table {remainingOrders[0].tableNumber} — Still Unpaid
                  </h3>
                  <p className="text-xs text-gray-400">
                    {remainingOrders.length} order{remainingOrders.length !== 1 ? 's' : ''} remaining
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRemainingOrders([])}
                className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Orders */}
            <div className="px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
              {remainingOrders.map(order => (
                <div key={order._id}
                  className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
                  {/* Order header */}
                  <div className="flex items-center justify-between px-3 py-2.5
                                  bg-gray-700/80 border-b border-gray-700">
                    <div>
                      <p className="text-sm font-bold text-white">#{order.orderNumber}</p>
                      <p className="text-xs text-gray-400">{order.customerName}</p>
                    </div>
                    <span className="font-bold text-sm text-green-400">₹{order.totalAmount.toFixed(2)}</span>
                  </div>
                  {/* Items */}
                  <div className="px-3 py-2 space-y-1">
                    {order.items && order.items.length > 0 ? (
                      <>
                        {order.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-gray-300 flex-1 min-w-0 pr-2 truncate">
                              <span className="font-semibold text-white">{item.quantity}×</span>{' '}{item.name}
                            </span>
                            <span className="font-medium text-white shrink-0">
                              ₹{item.subtotal.toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs pt-1.5
                                        border-t border-gray-700 mt-1">
                          <span className="text-gray-400 font-medium">Order Total</span>
                          <span className="font-bold text-white">₹{order.totalAmount.toFixed(2)}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 italic py-1">Order details unavailable</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => setRemainingOrders([])}
                className="btn-secondary flex-1 text-sm"
              >
                Later
              </button>
              <button
                onClick={() => {
                  // Pre-select all remaining orders
                  const newSelected: Record<string, boolean> = {};
                  remainingOrders.forEach(o => { newSelected[o._id] = true; });
                  setSelected(newSelected);
                  setRemainingOrders([]);
                }}
                className="btn-primary flex-1 text-sm"
              >
                <Receipt className="w-4 h-4" />
                Create Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reservation Completed popup ──────────────────────── */}
      {reservationCompletedInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setReservationCompletedInfo(null)}>
          <div className="card w-full max-w-sm p-6 shadow-2xl text-center space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <CalendarCheck className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base mb-1">Reservation Completed</h3>
              <p className="text-sm text-gray-400">
                <span className="font-semibold text-white">{reservationCompletedInfo.guestName}</span>
                {`'s reservation for Table ${reservationCompletedInfo.tableNumber}`}
                {reservationCompletedInfo.numberOfPeople > 0 &&
                  ` (${reservationCompletedInfo.numberOfPeople} ${reservationCompletedInfo.numberOfPeople === 1 ? 'person' : 'people'})`
                }
                {' '}has been completed after dine-in billing.
              </p>
            </div>
            <button
              onClick={() => setReservationCompletedInfo(null)}
              className="btn-success w-full"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* ── Orders + Summary grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Orders list */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)
          ) : orders.length === 0 ? (
            <div className="card py-12 text-center">
              <Receipt className="w-10 h-10 mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400">
                {customerSearch || tableSearch
                  ? 'No orders match your search'
                  : 'No unpaid orders'
                }
              </p>
              {(customerSearch || tableSearch) && (
                <button
                  onClick={() => { setCustomerSearch(''); setTableSearch(''); }}
                  className="mt-3 text-sm text-primary-400 hover:text-primary-300"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : orders.map(order => (
            <div
              key={order._id}
              className={`card p-4 transition-all cursor-pointer ${
                selected[order._id]
                  ? '!bg-orange-500/20 border-orange-400 ring-1 ring-orange-400/40'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!selected[order._id]}
                  onChange={() => toggleOrder(order._id)}
                  className="w-5 h-5 accent-orange-500 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-white text-sm">#{order.orderNumber}</p>
                    <p className="font-bold text-green-400 text-sm">₹{order.totalAmount.toFixed(2)}</p>
                  </div>
                  <p className="text-xs text-gray-400">
                    {order.customerId?.name || 'Guest'}
                    {order.tableNumber ? ` · T-${order.tableNumber}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                  className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {expandedOrder === order._id
                    ? <ChevronUp className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />
                  }
                </button>
              </div>
              {expandedOrder === order._id && (
                <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-300">
                      <span>{item.quantity}× {item.name}</span>
                      <span>₹{item.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bill summary panel */}
        <div className="card p-5 space-y-4 sticky top-6 h-fit">
          <h2 className="font-bold text-white">Bill Summary</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Selected</span>
              <span>{selectedIds.length} order{selectedIds.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>GST (preview)</span><span>₹{gst.toFixed(2)}</span>
            </div>
          </div>

          <div>
            <label className="label">Discount (₹)</label>
            <input
              type="number" min={0} value={discount}
              onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
              className="input"
            />
          </div>

          <div>
            <label className="label">Payment Method</label>
            <select
              value={payment}
              onChange={e => setPayment(e.target.value as 'Cash' | 'UPI' | 'Card')}
              className="input"
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
            </select>
          </div>

          <div className="border-t border-gray-700 pt-3 flex justify-between font-bold text-white">
            <span>Grand Total</span>
            <span className="text-green-400">₹{grandTotal.toFixed(2)}</span>
          </div>

          <button
            onClick={handleGenerate}
            disabled={genLoad || selectedIds.length === 0}
            className="btn-primary w-full"
          >
            {genLoad
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : 'Generate Bill'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
