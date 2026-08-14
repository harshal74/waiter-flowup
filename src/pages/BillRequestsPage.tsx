import { useEffect, useState, useCallback } from 'react';
import { Receipt, Loader2, ChevronDown, ChevronUp, CheckCircle, XCircle, MessageCircle } from 'lucide-react';
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

function buildWhatsAppMessage(bill: Bill, customerName: string, restaurantName: string): string {
  const date = new Date(bill.createdAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const itemLines = bill.items
    .map(i => `  • ${i.quantity}× ${i.name} — ₹${i.total.toFixed(2)}`)
    .join('\n');
  const tableInfo   = bill.tableNumber ? `Table: ${bill.tableNumber}\n` : '';
  const discountLine = bill.discount > 0 ? `Discount: −₹${bill.discount.toFixed(2)}\n` : '';

  return (
    `🧾 *Bill from ${restaurantName}*\n` +
    `Invoice: ${bill.invoiceNumber}\n` +
    `Date: ${date}\n` +
    `${tableInfo}` +
    `\n*Items:*\n${itemLines}\n\n` +
    `Subtotal: ₹${bill.subtotal.toFixed(2)}\n` +
    `GST (5%): ₹${bill.gst.toFixed(2)}\n` +
    `${discountLine}` +
    `*Total: ₹${bill.grandTotal.toFixed(2)}*\n\n` +
    `Payment: ${bill.paymentMethod}\n\n` +
    `Thank you for dining with us! 🙏`
  );
}

interface BillDetail {
  bill: Bill;
  customer: { name: string; mobile: string };
}

export default function BillRequestsPage() {
  const [orders,        setOrders]        = useState<Order[]>([]);
  const [loading,       setLoading]       = useState(true);
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

  const fetchOrders = useCallback(async () => {
    try {
      const res = await API.get('/billing/orders');
      setOrders(res.data.orders || []);
    } catch { toast.error('Failed to load orders'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const toggleOrder = (id: string) =>
    setSelected(p => ({ ...p, [id]: !p[id] }));

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);

  const subtotal   = orders.filter(o => selected[o._id]).reduce((s, o) => s + o.totalAmount, 0);
  const gst        = Math.round(subtotal * 0.05 * 100) / 100;
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
      toast.success('Bill generated!');
      setSelected({});
      fetchOrders();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to generate bill');
    } finally { setGenLoad(false); }
  };

  const handleConfirmPayment = async () => {
    if (!activeBill) return;
    setConfirmLoad(true);
    try {
      await API.patch(`/billing/${activeBill.bill._id}/confirm`);
      toast.success('Payment confirmed! Bill closed.');
      setActiveBill(null);
      fetchOrders();
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
      fetchOrders();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to cancel bill');
    } finally { setCancelLoad(false); }
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center">
          <Receipt className="w-5 h-5 text-primary-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Bill Requests</h1>
          <p className="text-xs text-gray-400">{orders.length} unpaid order{orders.length !== 1 ? 's' : ''}</p>
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
                  <div className="flex justify-between text-gray-300">
                    <span>GST (5%)</span><span>₹{bill.gst.toFixed(2)}</span>
                  </div>
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
                    href={`https://wa.me/${mobile.replace(/\D/g, '').replace(/^0/, '91')}?text=${encodeURIComponent(buildWhatsAppMessage(bill, activeBill.customer.name, restaurantName))}`}
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

      {/* ── Orders + Summary grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Orders list */}
        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            [...Array(3)].map((_, i) => <div key={i} className="skeleton h-20 rounded-2xl" />)
          ) : orders.length === 0 ? (
            <div className="card py-12 text-center">
              <Receipt className="w-10 h-10 mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400">No unpaid orders</p>
            </div>
          ) : orders.map(order => (
            <div
              key={order._id}
              className={`card p-4 transition-all cursor-pointer ${
                selected[order._id] ? 'border-primary-500' : 'border-gray-700'
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
              <span>GST (5%)</span><span>₹{gst.toFixed(2)}</span>
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
