import { useEffect, useState, useCallback } from 'react';
import { BellRing, Clock, Check, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../lib/api';
import { socket } from '../context/SocketContext';
import type { WaiterRequest } from '../types';

function elapsed(date: string) {
  const m = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  return m < 1 ? 'Just now' : m < 60 ? `${m}m ago` : `${Math.floor(m/60)}h ago`;
}

export default function WaiterCallsPage() {
  const [requests, setRequests] = useState<WaiterRequest[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState<string | null>(null);

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

    const onUpdate = (payload: { _id: string; status: string }) => {
      if (payload.status === 'COMPLETED') {
        setRequests(p => p.filter(r => r._id !== payload._id));
      }
    };

    socket.on('waiter_requested',      onNew);
    socket.on('waiter_request_updated', onUpdate);
    return () => {
      socket.off('waiter_requested',      onNew);
      socket.off('waiter_request_updated', onUpdate);
    };
  }, [fetchRequests]);

  const resolve = async (req: WaiterRequest) => {
    setActing(req._id);
    try {
      await API.patch(`/waiter-requests/${req._id}/status`, { status: 'COMPLETED' });
      setRequests(p => p.filter(r => r._id !== req._id));
      toast.success(`Table ${req.tableNumber} resolved`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to resolve');
    } finally { setActing(null); }
  };

  const dismiss = async (req: WaiterRequest) => {
    setActing(req._id + '_d');
    try {
      await API.delete(`/waiter-requests/${req._id}`);
      setRequests(p => p.filter(r => r._id !== req._id));
      toast('Dismissed');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to dismiss');
    } finally { setActing(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
          <BellRing className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Waiter Calls</h1>
          <p className="text-xs text-gray-400">{requests.length} active call{requests.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      ) : requests.length === 0 ? (
        <div className="card py-16 text-center">
          <BellRing className="w-10 h-10 mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">No active waiter calls</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req._id} className="card p-4 border-orange-500/30 flex items-center gap-4">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <BellRing className="w-6 h-6 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white">Table {req.tableNumber}</p>
                <p className="text-sm text-gray-400">{req.customerName || 'Customer needs assistance'}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />{elapsed(req.createdAt)}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => resolve(req)}
                  disabled={!!acting}
                  className="btn-success px-3 py-2.5 text-xs"
                  title="Resolve"
                >
                  {acting === req._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Resolve</>}
                </button>
                <button
                  onClick={() => dismiss(req)}
                  disabled={!!acting}
                  className="btn-secondary px-3 py-2.5 text-xs"
                  title="Dismiss"
                >
                  {acting === req._id + '_d' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><X className="w-4 h-4" /> Dismiss</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
