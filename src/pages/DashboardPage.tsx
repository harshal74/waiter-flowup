import { useEffect, useState } from 'react';
import { ShoppingBag, Clock, CheckCircle, BellRing, ChefHat } from 'lucide-react';
import API from '../lib/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import type { Order, WaiterRequest } from '../types';

const ACTIVE = ['PENDING','ACCEPTED','PREPARING','READY'];

export default function DashboardPage() {
  const { staff } = useAuth();
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [waiter,  setWaiter]  = useState<WaiterRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API.get('/staff/orders'),
      API.get('/waiter-requests'),
    ]).then(([oRes, wRes]) => {
      setOrders(oRes.data.data || []);
      setWaiter(wRes.data.data || []);
    }).catch((err) => {
      console.error('[Dashboard] fetch error:', err);
      toast.error('Failed to load dashboard data');
    }).finally(() => setLoading(false));
  }, []);

  const active    = orders.filter(o => ACTIVE.includes(o.status));
  const pending   = orders.filter(o => o.status === 'PENDING');
  const preparing = orders.filter(o => o.status === 'PREPARING');
  const ready     = orders.filter(o => o.status === 'READY');

  const stats = [
    { label: 'Active Orders',  value: active.length,    icon: ShoppingBag, color: 'text-blue-400',   bg: 'bg-blue-500/10'   },
    { label: 'Pending',        value: pending.length,   icon: Clock,       color: 'text-amber-400',  bg: 'bg-amber-500/10'  },
    { label: 'Preparing',      value: preparing.length, icon: ChefHat,     color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Ready to Serve', value: ready.length,     icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-500/10'  },
    { label: 'Waiter Calls',   value: waiter.length,    icon: BellRing,    color: 'text-red-400',    bg: 'bg-red-500/10'    },
  ];

  if (loading) return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Welcome back, <span className="text-primary-400 font-semibold">{staff?.name}</span>
          <span className="ml-2 badge bg-primary-500/20 text-primary-400">{staff?.role}</span>
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card p-5 flex flex-col gap-3">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent active orders */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-white">Active Orders</h2>
        </div>
        {active.length === 0 ? (
          <div className="py-12 text-center text-gray-500">No active orders</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {active.slice(0, 8).map(order => (
              <div key={order._id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-800/50">
                <div>
                  <p className="font-semibold text-white text-sm">#{order.orderNumber}</p>
                  <p className="text-xs text-gray-400">{order.customerId?.name || 'Guest'}{order.tableNumber ? ` · T-${order.tableNumber}` : ''}</p>
                </div>
                <span className={`badge text-xs ${
                  order.status === 'PENDING'   ? 'bg-amber-500/20 text-amber-400' :
                  order.status === 'ACCEPTED'  ? 'bg-blue-500/20 text-blue-400' :
                  order.status === 'PREPARING' ? 'bg-orange-500/20 text-orange-400' :
                  'bg-green-500/20 text-green-400'
                }`}>{order.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
