import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChefHat, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../lib/api';
import { socket } from '../context/SocketContext';
import type { Order, OrderStatus } from '../types';

const KDS_COLS: { status: OrderStatus; label: string; color: string; border: string; btn?: string; btnLabel?: string; nextStatus?: OrderStatus }[] = [
  { status: 'PENDING',   label: 'Pending',   color: 'text-amber-400',  border: 'border-amber-500',  btn: 'bg-amber-500 hover:bg-amber-600',   btnLabel: 'Accept',       nextStatus: 'ACCEPTED'  },
  { status: 'ACCEPTED',  label: 'Accepted',  color: 'text-blue-400',   border: 'border-blue-500',   btn: 'bg-blue-500 hover:bg-blue-600',     btnLabel: 'Start Cooking', nextStatus: 'PREPARING' },
  { status: 'PREPARING', label: 'Preparing', color: 'text-orange-400', border: 'border-orange-500', btn: 'bg-orange-500 hover:bg-orange-600', btnLabel: 'Mark Ready',   nextStatus: 'READY'     },
  { status: 'READY',     label: 'Ready',     color: 'text-green-400',  border: 'border-green-500'  },
];

const ENDPOINT: Record<string, string> = {
  ACCEPTED:  'accept',
  PREPARING: 'preparing',
  READY:     'ready',
};

function elapsed(createdAt: string): string {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function isPriority(createdAt: string): boolean {
  return (Date.now() - new Date(createdAt).getTime()) > 15 * 60 * 1000;
}

function OrderCard({ order, onAction }: { order: Order; onAction: (id: string, next: OrderStatus) => void }) {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const col = KDS_COLS.find(c => c.status === order.status)!;

  // Tick every 60 s to refresh elapsed time
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const high = isPriority(order.createdAt);

  const handleBtn = async () => {
    if (busy || !col.nextStatus) return;
    setBusy(true);
    try {
      await API.patch(`/staff/orders/${order._id}/${ENDPOINT[col.nextStatus]}`);
      onAction(order._id, col.nextStatus);
      toast.success(`Order #${order.orderNumber} → ${col.nextStatus}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`rounded-2xl border p-4 space-y-3 ${
        high ? 'border-red-500 bg-red-500/5' : `${col.border} bg-gray-800/60`
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-white text-sm">#{order.orderNumber}</p>
          <p className="text-xs text-gray-400 mt-0.5">{order.customerId?.name || 'Guest'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {order.tableNumber && (
            <span className="badge bg-teal-500/20 text-teal-400 text-[10px]">T-{order.tableNumber}</span>
          )}
          <span className={`flex items-center gap-1 text-[10px] font-medium ${high ? 'text-red-400' : 'text-gray-500'}`}>
            <Clock className="w-3 h-3" />{elapsed(order.createdAt)}
            {high && ' ⚠'}
          </span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1">
        {order.items.map((item, i) => (
          <div key={i} className="flex justify-between text-xs">
            <span className="text-gray-200">
              <span className="font-bold text-white">{item.quantity}×</span> {item.name}
            </span>
          </div>
        ))}
        {order.items.some(i => i.itemNote) && (
          <div className="pt-1">
            {order.items.filter(i => i.itemNote).map((i, idx) => (
              <p key={idx} className="text-[10px] text-amber-400 italic">"{i.itemNote}"</p>
            ))}
          </div>
        )}
      </div>

      {order.note && (
        <p className="text-[11px] text-gray-400 italic border-t border-gray-700 pt-2">📝 {order.note}</p>
      )}

      {/* Action button */}
      {col.btn && col.nextStatus ? (
        <button
          onClick={handleBtn}
          disabled={busy}
          className={`w-full ${col.btn} text-white text-sm font-semibold rounded-xl py-3 min-h-[48px]
                      flex items-center justify-center gap-2 disabled:opacity-50 transition-colors`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : col.btnLabel}
        </button>
      ) : col.status === 'READY' ? (
        <div className="w-full text-center py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-semibold">
          ✓ Waiting for Waiter
        </div>
      ) : null}
    </motion.div>
  );
}

export default function KitchenPage() {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await API.get('/staff/orders');
      if (mountedRef.current) setOrders(res.data.data || []);
    } catch { toast.error('Failed to load orders'); }
    finally { if (mountedRef.current) setLoading(false); }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchOrders();

    const KDS_STATUSES = new Set(['PENDING', 'ACCEPTED', 'PREPARING', 'READY']);

    const onNew = (order: Order) =>
      setOrders(p => p.some(o => o._id === order._id) ? p : [order, ...p]);

    const onUpdate = (payload: { orderId: string; status: OrderStatus }) => {
      if (!KDS_STATUSES.has(payload.status)) {
        // Order left the kitchen (COMPLETED, REJECTED, CANCELLED) — remove from board
        setOrders(p => p.filter(o => o._id !== payload.orderId));
      } else {
        setOrders(p => p.map(o =>
          o._id === payload.orderId ? { ...o, status: payload.status } : o
        ));
      }
    };

    socket.on('new_order',            onNew);
    socket.on('order_status_updated', onUpdate);

    return () => {
      mountedRef.current = false;
      socket.off('new_order',            onNew);
      socket.off('order_status_updated', onUpdate);
    };
  }, [fetchOrders]);

  const handleAction = (id: string, next: OrderStatus) =>
    setOrders(p => p.map(o => o._id === id ? { ...o, status: next } : o));

  const byStatus = (s: OrderStatus) =>
    orders.filter(o => o.status === s).sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  return (
    <div className="space-y-4 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Kitchen Display</h1>
            <p className="text-xs text-gray-400">{orders.filter(o => ['PENDING','ACCEPTED','PREPARING','READY'].includes(o.status)).length} active orders</p>
          </div>
        </div>
        <button onClick={fetchOrders} className="btn-ghost p-2" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-10 rounded-xl" />
              {[...Array(2)].map((_, j) => <div key={j} className="skeleton h-40 rounded-2xl" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-start">
          {KDS_COLS.map(col => {
            const colOrders = byStatus(col.status);
            return (
              <div key={col.status} className="space-y-3">
                {/* Column header */}
                <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${col.border} bg-gray-900`}>
                  <span className={`font-bold text-sm ${col.color}`}>{col.label}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${col.border} ${col.color} bg-gray-950`}>
                    {colOrders.length}
                  </span>
                </div>

                {/* Cards */}
                <AnimatePresence mode="popLayout">
                  {colOrders.length === 0 ? (
                    <div className={`rounded-2xl border-2 border-dashed border-gray-700 py-8 text-center`}>
                      <p className="text-xs text-gray-600">No {col.label.toLowerCase()} orders</p>
                    </div>
                  ) : (
                    colOrders.map(order => (
                      <OrderCard key={order._id} order={order} onAction={handleAction} />
                    ))
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
