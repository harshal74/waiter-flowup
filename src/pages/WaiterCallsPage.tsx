import { useEffect, useState, useCallback } from 'react';
import { BellRing, Clock, Check, Loader2, Table2 } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../lib/api';
import { socket } from '../context/SocketContext';
import type { WaiterRequest } from '../types';

function elapsed(date: string) {
  const m = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m}m ago` : `${Math.floor(m/60)}h ago`;
}

// Group requests by table number
function groupByTable(requests: WaiterRequest[]): Map<number, WaiterRequest[]> {
  const map = new Map<number, WaiterRequest[]>();
  for (const req of requests) {
    const existing = map.get(req.tableNumber) || [];
    existing.push(req);
    map.set(req.tableNumber, existing);
  }
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}

export default function WaiterCallsPage() {
  const [requests, setRequests] = useState<WaiterRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [resolving, setResolving] = useState<number | null>(null); // table number being resolved

  const fetchRequests = useCallback(async () => {
    try {
      const res = await API.get('/waiter-requests');
      setRequests(res.data.data || []);
    } catch { toast.error('Failed to load waiter calls'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchRequests();

    const onNew = (req: any) => {
      const item: WaiterRequest = {
        _id: String(req._id), restaurantId: req.restaurantId,
        tableNumber: req.tableNumber, customerName: req.customerName || '',
        status: req.status || 'PENDING', createdAt: req.createdAt || new Date().toISOString(),
      };
      setRequests(p => p.some(r => r._id === item._id) ? p : [item, ...p]);
      toast(`Table ${req.tableNumber} is calling for a waiter`, { icon: '🔔' });
    };

    const onUpdate = (payload: { _id: string; status: string; tableNumber?: number }) => {
      if (payload.status === 'COMPLETED') {
        setRequests(p => p.filter(r => r._id !== payload._id));
      }
    };

    socket.on('waiter_requested',       onNew);
    socket.on('waiter_request_updated', onUpdate);
    return () => {
      socket.off('waiter_requested',       onNew);
      socket.off('waiter_request_updated', onUpdate);
    };
  }, [fetchRequests]);

  const handleResolveTable = async (tableNumber: number) => {
    setResolving(tableNumber);
    try {
      await API.patch(`/waiter-requests/resolve-table/${tableNumber}`);
      // Remove all requests for this table from UI
      setRequests(p => p.filter(r => r.tableNumber !== tableNumber));
      toast.success(`Table ${tableNumber} resolved`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to resolve table');
    } finally {
      setResolving(null);
    }
  };

  const grouped = groupByTable(requests);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
          <BellRing className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Waiter Calls</h1>
          <p className="text-xs text-gray-400">{requests.length} active call{requests.length !== 1 ? 's' : ''} from {grouped.size} table{grouped.size !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
      ) : requests.length === 0 ? (
        <div className="card py-16 text-center">
          <BellRing className="w-10 h-10 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No active waiter calls</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([tableNumber, tableRequests]) => (
            <div key={tableNumber} className="card p-5 border-orange-500/30 space-y-4">
              {/* Table header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <Table2 className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-lg">Table {tableNumber}</p>
                    <p className="text-xs text-gray-400">
                      {tableRequests.length} request{tableRequests.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleResolveTable(tableNumber)}
                  disabled={resolving === tableNumber}
                  className="btn-success px-4 py-2.5 text-sm"
                >
                  {resolving === tableNumber
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Resolving…</>
                    : <><Check className="w-4 h-4" /> Resolve Table {tableNumber}</>
                  }
                </button>
              </div>

              {/* Individual requests */}
              <div className="space-y-2 pl-2 border-l-2 border-orange-500/20 ml-5">
                {tableRequests.map(req => (
                  <div key={req._id} className="flex items-center gap-3 py-2 px-3 rounded-lg
                                                bg-gray-800/50">
                    <BellRing className="w-4 h-4 text-orange-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">
                        {req.customerName || 'Customer needs assistance'}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />{elapsed(req.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
