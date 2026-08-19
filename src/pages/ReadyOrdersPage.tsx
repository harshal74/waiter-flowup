import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Clock, Loader2, MapPin, Table2, Phone, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../lib/api';
import { socket } from '../context/SocketContext';
import type { Order, OrderStatus } from '../types';

function elapsed(date: string) {
  const m = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
}

export default function ReadyOrdersPage() {
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await API.get('/staff/orders');
      // Show READY + OUT_FOR_DELIVERY orders on this page
      setOrders((res.data.data || []).filter(
        (o: Order) => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY'
      ));
    } catch { toast.error('Failed to load ready orders'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();

    const onUpdate = (p: { orderId: string; status: OrderStatus }) => {
      if (p.status === 'READY' || p.status === 'OUT_FOR_DELIVERY') {
        fetchOrders();
      } else {
        setOrders(prev => prev.filter(o => o._id !== p.orderId));
      }
    };

    const onNew = (order: Order) => {
      if (order.status === 'READY') {
        setOrders(p => p.some(o => o._id === order._id) ? p : [order, ...p]);
      }
    };

    socket.on('order_status_updated', onUpdate);
    socket.on('new_order',            onNew);
    return () => {
      socket.off('order_status_updated', onUpdate);
      socket.off('new_order',            onNew);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dine-in: READY → COMPLETED
  const handleServe = async (order: Order) => {
    setActing(order._id);
    try {
      await API.patch(`/staff/orders/${order._id}/deliver`);
      setOrders(p => p.filter(o => o._id !== order._id));
      toast.success(`Order #${order.orderNumber} served!`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to serve order');
    } finally {
      setActing(null);
    }
  };

  // Delivery: READY → OUT_FOR_DELIVERY
  const handleDispatch = async (order: Order) => {
    setActing(order._id);
    try {
      await API.patch(`/staff/orders/${order._id}/dispatch`);
      // Update local state to reflect OUT_FOR_DELIVERY
      setOrders(p => p.map(o =>
        o._id === order._id ? { ...o, status: 'OUT_FOR_DELIVERY' as OrderStatus } : o
      ));
      toast.success(`Order #${order.orderNumber} dispatched!`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to dispatch order');
    } finally {
      setActing(null);
    }
  };

  // Delivery: OUT_FOR_DELIVERY → COMPLETED
  const handleCompleteDelivery = async (order: Order) => {
    setActing(order._id);
    try {
      await API.patch(`/staff/orders/${order._id}/deliver`);
      setOrders(p => p.filter(o => o._id !== order._id));
      toast.success(`Delivery #${order.orderNumber} completed!`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to complete delivery');
    } finally {
      setActing(null);
    }
  };

  const buildMapsUrl = (order: Order) => {
    // Use exact GPS coordinates if available (much more accurate for navigation)
    if (order.deliveryLocation?.latitude && order.deliveryLocation?.longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${order.deliveryLocation.latitude},${order.deliveryLocation.longitude}`;
    }
    // Fallback to text address
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address || '')}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center">
          <CheckSquare className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Ready Orders</h1>
          <p className="text-xs text-gray-400">{orders.length} order{orders.length !== 1 ? 's' : ''} ready to serve</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="card py-16 text-center">
          <CheckSquare className="w-10 h-10 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No orders ready to serve</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map(order => {
            const isDineIn       = order.orderType === 'DINE_IN';
            const isDelivery     = order.orderType === 'DELIVERY';
            const isDispatched   = order.status === 'OUT_FOR_DELIVERY';
            const tableNum       = order.tableNumber;
            const address        = order.address;
            const customerMobile = order.customerId?.mobile;
            const customerName   = order.customerId?.name;

            return (
            <div key={order._id} className={`card p-5 space-y-4 ${isDispatched ? 'border-blue-500/40' : 'border-green-500/40'}`}>

              {/* ── Serve destination ── */}
              {isDineIn && tableNum ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl
                                bg-teal-500/15 border border-teal-500/40">
                  <Table2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span className="font-black text-teal-300 text-lg">Table {tableNum}</span>
                </div>
              ) : (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl
                                bg-blue-500/10 border border-blue-500/30">
                  <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">
                      {isDispatched ? '🛵 Out for Delivery' : 'Delivery'}
                    </p>
                    <p className="text-sm text-white font-medium leading-snug">
                      {address || 'Address not provided'}
                    </p>
                  </div>
                </div>
              )}

              {/* Order header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-white">#{order.orderNumber}</p>
                  <p className="text-sm text-gray-400">{customerName || 'Guest'}</p>
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />{elapsed(order.createdAt)}
                </p>
              </div>

              {/* Items */}
              <div className="space-y-1 text-sm">
                {order.items.slice(0, 3).map((item, i) => (
                  <p key={i} className="text-gray-300">
                    <span className="font-semibold text-white">{item.quantity}×</span> {item.name}
                  </p>
                ))}
                {order.items.length > 3 && (
                  <p className="text-gray-500 text-xs">+{order.items.length - 3} more items</p>
                )}
              </div>

              {/* ── Actions ── */}
              {isDineIn ? (
                /* Dine-in: Serve to Table (READY → COMPLETED) */
                <button
                  onClick={() => handleServe(order)}
                  disabled={acting === order._id}
                  className="btn-success w-full"
                >
                  {acting === order._id
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Serving…</>
                    : `✓ Serve to Table ${tableNum ?? '?'}`
                  }
                </button>
              ) : isDispatched ? (
                /* Delivery: Already dispatched — show Call/Navigate + Complete */
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {customerMobile ? (
                      <a
                        href={`tel:${customerMobile}`}
                        className="btn-secondary flex items-center justify-center gap-1.5 text-sm py-2.5"
                      >
                        <Phone className="w-4 h-4" /> Call
                      </a>
                    ) : (
                      <button disabled className="btn-secondary opacity-50 text-sm py-2.5 cursor-not-allowed">
                        <Phone className="w-4 h-4" /> No Phone
                      </button>
                    )}

                    {address ? (
                      <a
                        href={buildMapsUrl(order)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary flex items-center justify-center gap-1.5 text-sm py-2.5"
                      >
                        <Navigation className="w-4 h-4" /> Navigate
                      </a>
                    ) : (
                      <button disabled className="btn-secondary opacity-50 text-sm py-2.5 cursor-not-allowed">
                        <Navigation className="w-4 h-4" /> No Address
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleCompleteDelivery(order)}
                    disabled={acting === order._id}
                    className="btn-success w-full"
                  >
                    {acting === order._id
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Completing…</>
                      : '✓ Mark Delivered'
                    }
                  </button>
                </div>
              ) : (
                /* Delivery: READY — Dispatch button */
                <button
                  onClick={() => handleDispatch(order)}
                  disabled={acting === order._id}
                  className="btn-primary w-full"
                >
                  {acting === order._id
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching…</>
                    : '🛵 Dispatch Delivery'
                  }
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
