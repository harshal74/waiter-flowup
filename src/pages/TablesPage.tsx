import { useEffect, useState, useCallback } from 'react';
import { Table2 } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../lib/api';
import { socket } from '../context/SocketContext';
import type { Order, WaiterRequest } from '../types';

type TableStatus = 'Available' | 'Occupied' | 'Bill Requested' | 'Waiter Requested' | 'Reserved' | 'Cleaning';

interface TableInfo {
  number: number;
  status: TableStatus;
}

const STATUS_STYLE: Record<TableStatus, { bg: string; text: string; border: string }> = {
  'Available':        { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/40'  },
  'Occupied':         { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/40'  },
  'Bill Requested':   { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/40' },
  'Waiter Requested': { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/40'    },
  'Reserved':         { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/40'   },
  'Cleaning':         { bg: 'bg-gray-500/10',   text: 'text-gray-400',   border: 'border-gray-500/40'   },
};

const ACTIVE_ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'];

/**
 * Build a full table list from 1..totalTables, overlaying active statuses from
 * orders and waiter requests. All configured tables are always shown.
 */
function buildTableList(
  totalTables: number,
  orders: Order[],
  waiterReqs: WaiterRequest[],
): TableInfo[] {
  // Start with all tables as Available
  const tableMap = new Map<number, TableStatus>();
  for (let i = 1; i <= totalTables; i++) {
    tableMap.set(i, 'Available');
  }

  // Overlay order statuses (process in priority order — lower priority first)
  orders.forEach(o => {
    if (!o.tableNumber) return;
    const t = o.tableNumber;
    const current = tableMap.get(t);

    if (ACTIVE_ORDER_STATUSES.includes(o.status)) {
      // Active order → Occupied (only upgrade from Available)
      if (current === 'Available') {
        tableMap.set(t, 'Occupied');
      }
    }
    // Bill requested = order is completed/ready but payment is still pending
    if ((o.status === 'READY' || o.status === 'COMPLETED') && o.paymentStatus === 'PENDING') {
      tableMap.set(t, 'Bill Requested');
    }
  });

  // Waiter requests override everything (highest priority)
  waiterReqs.forEach(r => {
    if (!r.tableNumber) return;
    tableMap.set(r.tableNumber, 'Waiter Requested');
  });

  return Array.from(tableMap.entries())
    .map(([number, status]) => ({ number, status }))
    .sort((a, b) => a.number - b.number);
}

export default function TablesPage() {
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [waiter,      setWaiter]      = useState<WaiterRequest[]>([]);
  const [totalTables, setTotalTables] = useState<number>(10);
  const [loading,     setLoading]     = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [oRes, wRes, sRes] = await Promise.all([
        API.get('/staff/orders'),
        API.get('/waiter-requests'),
        API.get('/settings'),
      ]);
      setOrders(oRes.data.data || []);
      setWaiter(wRes.data.data || []);
      setTotalTables(sRes?.data?.data?.totalTables ?? 10);
    } catch (err) {
      console.error('[Tables] fetch error:', err);
      toast.error('Failed to load table data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();

    const onOrderUpdate = (p: { orderId: string; status: string; paymentStatus?: string }) =>
      setOrders(prev => prev.map(o =>
        o._id === p.orderId ? { ...o, status: p.status as any } : o
      ));

    const onNewOrder = (order: Order) =>
      setOrders(p => p.some(o => o._id === order._id) ? p : [order, ...p]);

    const onWaiter = (req: any) => {
      if (!req.tableNumber) return;
      const item: WaiterRequest = {
        _id: String(req._id), restaurantId: req.restaurantId,
        tableNumber: req.tableNumber, customerName: req.customerName || '',
        status: 'PENDING', createdAt: req.createdAt || new Date().toISOString(),
      };
      setWaiter(p => p.some(r => r._id === item._id) ? p : [item, ...p]);
    };

    const onWaiterUpdate = (p: { _id: string; status: string }) => {
      if (p.status === 'COMPLETED') {
        setWaiter(prev => prev.filter(r => r._id !== p._id));
      }
    };

    socket.on('new_order',              onNewOrder);
    socket.on('order_status_updated',   onOrderUpdate);
    socket.on('waiter_requested',       onWaiter);
    socket.on('waiter_request_updated', onWaiterUpdate);

    return () => {
      socket.off('new_order',              onNewOrder);
      socket.off('order_status_updated',   onOrderUpdate);
      socket.off('waiter_requested',       onWaiter);
      socket.off('waiter_request_updated', onWaiterUpdate);
    };
  }, [fetchAll]);

  const tables  = buildTableList(totalTables, orders, waiter);
  const occupied = tables.filter(t => t.status !== 'Available').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Table2 className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Tables</h1>
          <p className="text-xs text-gray-400">
            {totalTables} total · {occupied} occupied · {totalTables - occupied} available
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_STYLE).map(([status, style]) => (
          <span key={status} className={`badge ${style.bg} ${style.text} border ${style.border} text-xs`}>
            {status}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[...Array(12)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {tables.map(table => {
            const style = STATUS_STYLE[table.status];
            return (
              <div
                key={table.number}
                className={`card p-4 flex flex-col items-center justify-center gap-2 aspect-square
                            ${style.bg} border ${style.border}`}
              >
                <p className="text-2xl font-black text-white">{table.number}</p>
                <p className={`text-[10px] font-semibold text-center ${style.text} leading-tight`}>
                  {table.status}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
