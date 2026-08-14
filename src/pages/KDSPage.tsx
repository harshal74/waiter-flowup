/**
 * KDSPage — Kitchen Display System
 *
 * Read-only real-time order status board.
 * Reuses the existing socket singleton (src/lib/socket.ts) and
 * the existing REST endpoint (GET /api/staff/orders).
 * No toasts, no status mutations — display only.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Wifi, WifiOff, Clock, UtensilsCrossed, Maximize2, Minimize2 } from 'lucide-react';
import API from '../lib/api';
import socket from '../lib/socket';
import type { Order, OrderStatus } from '../types';

// ── KDS only shows these statuses ─────────────────────────────────
const KDS_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'];
const TERMINAL: OrderStatus[]      = ['COMPLETED', 'REJECTED', 'CANCELLED', 'OUT_FOR_DELIVERY'];

// ── Column definitions ────────────────────────────────────────────
interface Column {
  id:       string;
  label:    string;
  statuses: OrderStatus[];
  color:    string;
  bg:       string;
  border:   string;
  dot:      string;
}

const COLUMNS: Column[] = [
  {
    id:       'received',
    label:    'RECEIVED',
    statuses: ['PENDING', 'ACCEPTED'],
    color:    'text-amber-400',
    bg:       'bg-amber-500/10',
    border:   'border-amber-500/40',
    dot:      'bg-amber-400',
  },
  {
    id:       'preparing',
    label:    'PREPARING',
    statuses: ['PREPARING'],
    color:    'text-orange-400',
    bg:       'bg-orange-500/10',
    border:   'border-orange-500/40',
    dot:      'bg-orange-400',
  },
  {
    id:       'ready',
    label:    'READY',
    statuses: ['READY'],
    color:    'text-green-400',
    bg:       'bg-green-500/10',
    border:   'border-green-500/40',
    dot:      'bg-green-400',
  },
];

// ── Status badge colours ──────────────────────────────────────────
const STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING:          'bg-amber-500/20  text-amber-300  border border-amber-500/40',
  ACCEPTED:         'bg-blue-500/20   text-blue-300   border border-blue-500/40',
  PREPARING:        'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  READY:            'bg-green-500/20  text-green-300  border border-green-500/40',
  OUT_FOR_DELIVERY: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
  COMPLETED:        'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
  REJECTED:         'bg-red-500/20    text-red-300    border border-red-500/40',
  CANCELLED:        'bg-gray-500/20   text-gray-300   border border-gray-500/40',
};

// ── Elapsed time helper ───────────────────────────────────────────
function useElapsed(createdAt: string): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── Fullscreen hook ───────────────────────────────────────────────
function useFullscreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen on the whole page element
        const el = containerRef.current ?? document.documentElement;
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      // Fullscreen not supported or blocked — silently ignore
      console.warn('[KDS] Fullscreen error:', err);
    }
  }, []);

  return { containerRef, isFullscreen, toggleFullscreen };
}

// ── Clock helper ──────────────────────────────────────────────────
function useClock(): string {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    }, 30_000);
    return () => clearInterval(t);
  }, []);
  return time;
}

// ── Single order card ─────────────────────────────────────────────
function KDSOrderCard({ order, isNew }: { order: Order; isNew: boolean }) {
  const elapsed = useElapsed(order.createdAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: -8, scale: 0.97  }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className={`
        relative rounded-2xl border p-4 space-y-3
        ${isNew
          ? 'border-primary-500 bg-primary-500/10 shadow-lg shadow-primary-500/20'
          : 'border-gray-700 bg-gray-800/60'
        }
      `}
    >
      {/* NEW badge */}
      {isNew && (
        <span className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full
                         bg-primary-500 text-white text-[10px] font-bold tracking-wide animate-pulse">
          NEW
        </span>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-black text-white leading-none">
            #{order.orderNumber}
          </p>
          {order.tableNumber ? (
            <p className="text-sm font-semibold text-teal-400 mt-0.5">Table {order.tableNumber}</p>
          ) : (
            <p className="text-xs text-blue-400 mt-0.5">🛵 Delivery</p>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${STATUS_BADGE[order.status]}`}>
          {order.status}
        </span>
      </div>

      {/* Customer name */}
      <p className="text-sm font-medium text-gray-200 truncate">
        {order.customerId?.name || 'Guest'}
      </p>

      {/* Meta row */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <UtensilsCrossed className="w-3 h-3" />
          {order.totalItems} item{order.totalItems !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {elapsed}
        </span>
      </div>

      {/* Time placed */}
      <p className="text-[11px] text-gray-500">
        {new Date(order.createdAt).toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit',
        })}
      </p>
    </motion.div>
  );
}

// ── KDS column ────────────────────────────────────────────────────
function KDSColumn({
  column, orders, newIds,
}: { column: Column; orders: Order[]; newIds: Set<string> }) {
  return (
    <div className="flex flex-col min-h-0">
      {/* Column header */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-3 border ${column.bg} ${column.border}`}>
        <span className={`w-2.5 h-2.5 rounded-full ${column.dot} shrink-0`} />
        <span className={`font-bold text-sm tracking-widest ${column.color} flex-1`}>
          {column.label}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${column.bg} ${column.color} ${column.border}`}>
          {orders.length}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-3 flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <AnimatePresence mode="popLayout">
          {orders.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="rounded-2xl border-2 border-dashed border-gray-700/60 py-10 text-center"
            >
              <p className="text-xs text-gray-600">No orders</p>
            </motion.div>
          ) : (
            orders.map(order => (
              <KDSOrderCard
                key={order._id}
                order={order}
                isNew={newIds.has(order._id)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Main KDS page ─────────────────────────────────────────────────
export default function KDSPage() {
  const [orders,     setOrders]     = useState<Order[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [connected,  setConnected]  = useState(socket.connected);
  const [reconnecting, setReconnecting] = useState(false);
  const [newIds,     setNewIds]     = useState<Set<string>>(new Set());
  const clock = useClock();
  const { containerRef, isFullscreen, toggleFullscreen } = useFullscreen();

  // Track "new" IDs — auto-remove highlight after 5 seconds
  const highlightTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const markNew = useCallback((id: string) => {
    setNewIds(prev => new Set(prev).add(id));
    // Clear any existing timer for this id
    if (highlightTimers.current.has(id)) clearTimeout(highlightTimers.current.get(id)!);
    const t = setTimeout(() => {
      setNewIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      highlightTimers.current.delete(id);
    }, 5000);
    highlightTimers.current.set(id, t);
  }, []);

  // ── Initial REST load ─────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      const res = await API.get('/staff/orders');
      const all: Order[] = res.data.data || [];
      // Only show KDS-relevant statuses
      setOrders(all.filter(o => KDS_STATUSES.includes(o.status)));
    } catch (err) {
      console.error('[KDS] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Socket listeners ──────────────────────────────────────────
  useEffect(() => {
    fetchOrders();

    // ── new_order ──────────────────────────────────────────────
    const onNewOrder = (order: Order) => {
      if (!KDS_STATUSES.includes(order.status)) return;
      setOrders(prev => {
        if (prev.some(o => o._id === order._id)) {
          // Already exists — update it
          return prev.map(o => o._id === order._id ? order : o);
        }
        // New — prepend
        return [order, ...prev];
      });
      markNew(order._id);
    };

    // ── order_status_updated ───────────────────────────────────
    const onStatusUpdated = (payload: { orderId: string; status: OrderStatus; [k: string]: unknown }) => {
      const { orderId, status } = payload;

      if (TERMINAL.includes(status)) {
        // Order is done — remove from KDS
        setOrders(prev => prev.filter(o => o._id !== orderId));
        return;
      }

      if (KDS_STATUSES.includes(status)) {
        setOrders(prev => {
          const exists = prev.some(o => o._id === orderId);
          if (exists) {
            return prev.map(o => o._id === orderId ? { ...o, status } : o);
          }
          // Order wasn't on KDS yet — do a fresh fetch to get full data
          fetchOrders();
          return prev;
        });
      }
    };

    // ── Connection events ──────────────────────────────────────
    const onConnect    = () => { setConnected(true);  setReconnecting(false); };
    const onDisconnect = () => { setConnected(false); setReconnecting(true);  };
    const onError      = () => { setConnected(false); setReconnecting(true);  };
    const onReconnect  = () => {
      setConnected(true);
      setReconnecting(false);
      // Reload orders in case we missed updates while disconnected
      fetchOrders();
    };

    socket.on('new_order',            onNewOrder);
    socket.on('order_status_updated', onStatusUpdated);
    socket.on('connect',              onConnect);
    socket.on('disconnect',           onDisconnect);
    socket.on('connect_error',        onError);
    socket.on('reconnect',            onReconnect);

    // Sync initial connection state
    setConnected(socket.connected);

    return () => {
      socket.off('new_order',            onNewOrder);
      socket.off('order_status_updated', onStatusUpdated);
      socket.off('connect',              onConnect);
      socket.off('disconnect',           onDisconnect);
      socket.off('connect_error',        onError);
      socket.off('reconnect',            onReconnect);
      // Clear all highlight timers on unmount
      highlightTimers.current.forEach(t => clearTimeout(t));
      highlightTimers.current.clear();
    };
  }, [fetchOrders, markNew]);

  // ── Derived: orders per column ────────────────────────────────
  const getColumnOrders = (col: Column) =>
    orders
      .filter(o => col.statuses.includes(o.status))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const activeCount = orders.length;

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <div ref={containerRef} className="flex flex-col h-full bg-gray-950 p-4 gap-4">
        <div className="skeleton h-14 w-full rounded-2xl" />
        <div className="grid grid-cols-3 gap-4 flex-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-3">
              <div className="skeleton h-12 rounded-xl" />
              {[1, 2].map(j => <div key={j} className="skeleton h-36 rounded-2xl" />)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-gray-950 overflow-hidden">

      {/* ── KDS Header ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3.5
                         bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-500/20 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">FlowUp Kitchen Display</p>
            {activeCount > 0 && (
              <p className="text-xs text-gray-400">Active Orders: {activeCount}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {reconnecting ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-amber-400">Reconnecting…</span>
              </>
            ) : connected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400">Offline</span>
              </>
            )}
          </div>

          {/* Clock */}
          <span className="text-sm font-mono font-bold text-gray-300">{clock}</span>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400
                       hover:text-white transition-colors"
          >
            {isFullscreen
              ? <Minimize2 className="w-4 h-4" />
              : <Maximize2 className="w-4 h-4" />
            }
          </button>
        </div>
      </header>

      {/* ── Column grid ────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden p-4">
        {orders.length === 0 ? (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gray-800 flex items-center justify-center">
              <Monitor className="w-10 h-10 text-gray-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-400">No active orders</p>
              <p className="text-sm text-gray-600 mt-1">Waiting for new orders…</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
            {COLUMNS.map(col => (
              <KDSColumn
                key={col.id}
                column={col}
                orders={getColumnOrders(col)}
                newIds={newIds}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
