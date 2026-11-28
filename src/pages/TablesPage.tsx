/**
 * Waiter/Assistant Table Page — V2
 *
 * Role-aware:
 *   ADMIN, ASSISTANT → can create, edit, cancel, mark arrived/completed/no-show
 *   WAITER, CHEF     → view-only
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Table2, CalendarCheck, Pencil, Trash2, X, Loader2,
  Users, User, Phone, Clock, CheckCircle, UserCheck, UserX, ShoppingCart, Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import API from '../lib/api';
import { socket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import type { Order, WaiterRequest } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ──────────────────────────────────────────────────────────

type ReservationStatus =
  | 'RESERVED' | 'ACTIVE' | 'ARRIVED'
  | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

interface TableReservation {
  _id: string;
  restaurantId: string;
  tableNumber: number;
  guestName: string;
  mobileNumber: string | null;
  numberOfPeople: number;
  reservationStart: string | null;
  reservationEnd: string | null;
  notes: string;
  reservedById: string;
  reservedByName: string;
  reservedByRole: 'ADMIN' | 'ASSISTANT';
  status: ReservationStatus;
  createdAt: string;
  updatedAt: string;
}

type TableStatus =
  | 'Available' | 'Occupied' | 'Bill Requested'
  | 'Waiter Requested' | 'Reserved' | 'Dirty' | 'Cleaning';

interface StaffRef { staffId: string | null; name: string; role: string }

interface TableClean {
  _id: string;
  tableNumber: number;
  status: 'DIRTY' | 'CLEANING' | 'CLEAN';
  active: boolean;
  dirtyAt: string | null;
  cleaningBy: StaffRef | null;
  cleaningStartedAt: string | null;
  cleanedBy: StaffRef | null;
  cleanedAt: string | null;
}

interface TableInfo {
  number: number;
  status: TableStatus;
  reservations: TableReservation[];
  clean?: TableClean;
  seatedAt?: string | null;    // when the table was first occupied (for time display)
}

// ── Styles ─────────────────────────────────────────────────────────

const TABLE_STATUS_STYLE: Record<TableStatus, { bg: string; text: string; border: string }> = {
  'Available':        { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/40'  },
  'Occupied':         { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/40'  },
  'Bill Requested':   { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/40' },
  'Waiter Requested': { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/40'    },
  'Reserved':         { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/40'   },
  'Dirty':            { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/40' },
  'Cleaning':         { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/40'   },
};

const RES_STATUS_STYLE: Record<ReservationStatus, { badge: string; label: string }> = {
  RESERVED:  { badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',     label: 'Reserved'   },
  ACTIVE:    { badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',     label: 'Reserved'   },
  ARRIVED:   { badge: 'bg-purple-500/20 text-purple-400 border-purple-500/40', label: 'Arrived'  },
  COMPLETED: { badge: 'bg-green-500/20 text-green-400 border-green-500/40',  label: 'Completed'  },
  CANCELLED: { badge: 'bg-red-500/20 text-red-400 border-red-500/40',        label: 'Cancelled'  },
  NO_SHOW:   { badge: 'bg-gray-500/20 text-gray-400 border-gray-500/40',     label: 'No Show'    },
};

const ACTIVE_ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
const ACTIVE_RES_STATUSES: ReservationStatus[] = ['RESERVED', 'ACTIVE', 'ARRIVED'];

// ── IST helpers ────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTDateString(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

function toISTTimeString(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const h = String(ist.getUTCHours()).padStart(2, '0');
  const m = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatTimeSlot(start: string | null, end: string | null): string {
  if (!start) return '';
  const fmt = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
    const h = d.getUTCHours(); const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

function formatDateIST(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function todayISTString(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

function tomorrowISTString(): string {
  const ist = new Date(Date.now() + IST_OFFSET_MS + 86400000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr); const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// ── Table list builder ─────────────────────────────────────────────

function buildTableList(total: number, orders: Order[], waiterReqs: WaiterRequest[], reservations: TableReservation[], cleans: TableClean[]): TableInfo[] {
  const map = new Map<number, TableStatus>();
  for (let i = 1; i <= total; i++) map.set(i, 'Available');

  orders.forEach(o => {
    if (!o.tableNumber || o.orderType === 'DELIVERY' || o.orderType === 'TAKE_AWAY' || o.paymentStatus === 'PAID') return;
    const t = o.tableNumber; const cur = map.get(t);
    if (ACTIVE_ORDER_STATUSES.includes(o.status) && (cur === 'Available' || cur === 'Reserved')) map.set(t, 'Occupied');
    if (o.status === 'COMPLETED' && o.paymentStatus === 'PENDING' && !o.billId && isToday(o.createdAt) && (cur === 'Available' || cur === 'Reserved')) map.set(t, 'Occupied');
    if (o.status === 'COMPLETED' && isToday(o.createdAt) && o.billId && o.paymentStatus === 'PENDING') map.set(t, 'Bill Requested');
  });

  // Dirty / Cleaning outrank Available and Reserved, but never hide an active order.
  const cleanMap = new Map<number, TableClean>();
  cleans.forEach(c => {
    if (!c.active) return;
    cleanMap.set(c.tableNumber, c);
    if (map.get(c.tableNumber) === 'Available') map.set(c.tableNumber, c.status === 'CLEANING' ? 'Cleaning' : 'Dirty');
  });

  // Bill request → "Bill Requested"; a waiter call outranks it.
  waiterReqs.forEach(r => { if (r.tableNumber && r.requestType === 'BILL') map.set(r.tableNumber, 'Bill Requested'); });
  waiterReqs.forEach(r => { if (r.tableNumber && r.requestType !== 'BILL') map.set(r.tableNumber, 'Waiter Requested'); });

  const resMap = new Map<number, TableReservation[]>();
  reservations.forEach(r => {
    if (!ACTIVE_RES_STATUSES.includes(r.status)) return;
    const arr = resMap.get(r.tableNumber) || []; arr.push(r); resMap.set(r.tableNumber, arr);
  });
  resMap.forEach((_, t) => { if (map.get(t) === 'Available') map.set(t, 'Reserved'); });

  // Occupancy tracking — earliest seatedAt among active dine-in orders per table
  const seatedMap = new Map<number, string>();
  orders.forEach(o => {
    if (!o.tableNumber || o.orderType !== 'DINE_IN' || !o.seatedAt) return;
    if (o.paymentStatus === 'PAID') return;
    const cur = seatedMap.get(o.tableNumber);
    if (!cur || new Date(o.seatedAt) < new Date(cur)) seatedMap.set(o.tableNumber, o.seatedAt);
  });

  return Array.from(map.entries())
    .map(([number, status]) => ({
      number,
      status,
      reservations: resMap.get(number) || [],
      clean: cleanMap.get(number),
      seatedAt: seatedMap.get(number) || null,
    }))
    .sort((a, b) => a.number - b.number);
}

/** "1h 23m" elapsed time display for table occupancy. */
function occupiedSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Ticking clock that updates every minute. */
function OccupancyClock({ seatedAt }: { seatedAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const label = occupiedSince(seatedAt);
  if (!label) return null;
  return <span className="text-[10px] text-amber-400 opacity-80">⏱ {label}</span>;
}

// ── Reserve/Edit Modal ─────────────────────────────────────────────

interface ReserveModalProps {
  tableNumber: number;
  existing?: TableReservation;
  onClose: () => void;
  onSaved: (r: TableReservation) => void;
}

function ReserveModal({ tableNumber, existing, onClose, onSaved }: ReserveModalProps) {
  const isEdit = !!existing;
  const initDate  = existing?.reservationStart ? toISTDateString(new Date(existing.reservationStart)) : tomorrowISTString();
  const initStart = existing?.reservationStart ? toISTTimeString(new Date(existing.reservationStart)) : '19:00';
  const initEnd   = existing?.reservationEnd   ? toISTTimeString(new Date(existing.reservationEnd))   : '20:30';

  const [guestName,      setGuestName]      = useState(existing?.guestName ?? '');
  const [mobileNumber,   setMobileNumber]   = useState(existing?.mobileNumber ?? '');
  const [numberOfPeople, setNumberOfPeople] = useState(existing?.numberOfPeople?.toString() ?? '');
  const [resDate,        setResDate]        = useState(initDate);
  const [startTime,      setStartTime]      = useState(initStart);
  const [endTime,        setEndTime]        = useState(initEnd);
  const [notes,          setNotes]          = useState(existing?.notes ?? '');
  const [saving,         setSaving]         = useState(false);

  const inputCls = 'w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 placeholder-gray-600';
  const labelCls = 'label text-gray-400';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = guestName.trim();
    if (!name) { toast.error('Guest name is required.'); return; }
    const n = Number(numberOfPeople);
    if (!Number.isInteger(n) || n < 1) { toast.error('Number of people must be at least 1.'); return; }
    if (n > 100) { toast.error('Number of people cannot exceed 100.'); return; }
    if (!resDate) { toast.error('Reservation date is required.'); return; }
    if (!startTime || !endTime) { toast.error('Start and end time are required.'); return; }
    if (endTime <= startTime) { toast.error('End time must be after start time.'); return; }

    setSaving(true);
    try {
      const payload = {
        tableNumber,
        guestName: name,
        mobileNumber: mobileNumber.trim() || undefined,
        numberOfPeople: n,
        reservationDate: resDate,
        startTime,
        endTime,
        notes: notes.trim(),
      };
      const res = isEdit
        ? await API.patch(`/table-reservations/${existing!._id}`, payload)
        : await API.post('/table-reservations', payload);
      toast.success(isEdit ? 'Reservation updated.' : `Table ${tableNumber} reserved.`);
      onSaved(res.data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save reservation.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="card w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-white">{isEdit ? 'Edit Reservation' : `Reserve Table ${tableNumber}`}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-700">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={labelCls}>Guest Name <span className="text-red-400">*</span></label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)}
                placeholder="Rahul Patil" maxLength={120} className={`${inputCls} pl-9`} autoFocus required />
            </div>
          </div>

          <div>
            <label className={labelCls}>Mobile Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="tel" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)}
                placeholder="9876543210" maxLength={15} className={`${inputCls} pl-9`} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Number of People <span className="text-red-400">*</span></label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="number" min={1} max={100} value={numberOfPeople}
                onChange={e => setNumberOfPeople(e.target.value)} placeholder="4"
                className={`${inputCls} pl-9`} required />
            </div>
          </div>

          <div>
            <label className={labelCls}>Reservation Date <span className="text-red-400">*</span></label>
            <input type="date" value={resDate} min={todayISTString()}
              onChange={e => setResDate(e.target.value)} className={inputCls} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Start Time <span className="text-red-400">*</span></label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className={`${inputCls} pl-9`} required />
              </div>
            </div>
            <div>
              <label className={labelCls}>End Time <span className="text-red-400">*</span></label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className={`${inputCls} pl-9`} required />
              </div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Birthday dinner, window preference…" maxLength={500} rows={2}
              className={`${inputCls} resize-none`} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={saving}>Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : isEdit ? 'Update' : 'Reserve Table'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function TablesPage() {
  const { staff }  = useAuth();
  const navigate   = useNavigate();
  const [cleans,       setCleans]       = useState<TableClean[]>([]);
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [waiter,       setWaiter]       = useState<WaiterRequest[]>([]);
  const [reservations, setReservations] = useState<TableReservation[]>([]);
  const [totalTables,  setTotalTables]  = useState<number>(10);
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState<string | null>(null);

  const [reserveModal, setReserveModal] = useState<{ tableNumber: number; existing?: TableReservation } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TableReservation | null>(null);
  const [cancelling,   setCancelling]   = useState(false);

  const canMutate = staff?.role === 'ADMIN' || staff?.role === 'ASSISTANT';

  const fetchAll = useCallback(async () => {
    try {
      const [oRes, wRes, sRes, rRes, cRes] = await Promise.all([
        API.get('/staff/orders'),
        API.get('/waiter-requests'),
        API.get('/settings'),
        API.get('/table-reservations?status=ACTIVE'),
        API.get('/table-cleaning'),
      ]);
      setCleans(cRes.data.data || []);
      setOrders(oRes.data.data || []);
      setWaiter(wRes.data.data || []);
      setTotalTables(sRes?.data?.data?.totalTables ?? 10);
      setReservations(rRes.data.data || []);
    } catch (err) {
      console.error('[Tables] fetch error:', err);
      toast.error('Failed to load table data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll();

    const onOrderUpdate = (p: { orderId: string; status: string; paymentStatus?: string; billId?: string }) =>
      setOrders(prev => prev.map(o => o._id === p.orderId
        ? { ...o, status: p.status as Order['status'], ...(p.paymentStatus ? { paymentStatus: p.paymentStatus as Order['paymentStatus'] } : {}), ...(p.billId !== undefined ? { billId: p.billId } : {}) }
        : o));
    const onNewOrder = (order: Order) =>
      setOrders(p => p.some(o => o._id === order._id) ? p : [order, ...p]);
    const onWaiter = (req: any) => {
      if (!req.tableNumber) return;
      const item: WaiterRequest = { _id: String(req._id), restaurantId: req.restaurantId, tableNumber: req.tableNumber, customerName: req.customerName || '', status: 'PENDING', requestType: req.requestType === 'BILL' ? 'BILL' : 'WAITER', createdAt: req.createdAt || new Date().toISOString() };
      setWaiter(p => p.some(r => r._id === item._id) ? p : [item, ...p]);
    };
    // Bills generated / split / paid / cancelled on any screen → reload table states.
    const onBillUpdated = () => { fetchAll(); };
    const onWaiterUpdate = (p: { _id: string; status: string }) => {
      if (p.status === 'COMPLETED') setWaiter(prev => prev.filter(r => r._id !== p._id));
    };
    const onResCreated = (r: TableReservation) =>
      setReservations(prev => prev.some(x => x._id === r._id) ? prev : [r, ...prev]);
    const onResUpdated = (r: TableReservation) =>
      setReservations(prev => prev.map(x => x._id === r._id ? { ...x, ...r } : x));
    const onResCancelled = (p: { _id: string }) =>
      setReservations(prev => prev.filter(x => x._id !== p._id));

    const onClean = (c: TableClean) =>
      setCleans(prev => c.active
        ? (prev.some(x => x._id === c._id) ? prev.map(x => x._id === c._id ? c : x) : [...prev, c])
        : prev.filter(x => x._id !== c._id));

    socket.on('table_clean_updated',         onClean);
    socket.on('bill_updated',                onBillUpdated);
    socket.on('new_order',                   onNewOrder);
    socket.on('order_status_updated',        onOrderUpdate);
    socket.on('waiter_requested',            onWaiter);
    socket.on('waiter_request_updated',      onWaiterUpdate);
    socket.on('table_reservation_created',   onResCreated);
    socket.on('table_reservation_updated',   onResUpdated);
    socket.on('table_reservation_cancelled', onResCancelled);

    return () => {
      socket.off('table_clean_updated',         onClean);
      socket.off('bill_updated',                onBillUpdated);
      socket.off('new_order',                   onNewOrder);
      socket.off('order_status_updated',        onOrderUpdate);
      socket.off('waiter_requested',            onWaiter);
      socket.off('waiter_request_updated',      onWaiterUpdate);
      socket.off('table_reservation_created',   onResCreated);
      socket.off('table_reservation_updated',   onResUpdated);
      socket.off('table_reservation_cancelled', onResCancelled);
    };
  }, [fetchAll]);

  const doTransition = async (id: string, endpoint: string, successMsg: string) => {
    setActing(id);
    try {
      const res = await API.patch(`/table-reservations/${id}/${endpoint}`);
      setReservations(prev => prev.map(x => x._id === id ? { ...x, ...res.data.data } : x));
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed.');
    } finally { setActing(null); }
  };

  const doClean = async (c: TableClean, action: 'start' | 'complete') => {
    setActing(c._id);
    try {
      const res = await API.patch(`/table-cleaning/${c._id}/${action}`);
      const u: TableClean = res.data.data;
      setCleans(prev => u.active ? prev.map(x => x._id === u._id ? u : x) : prev.filter(x => x._id !== u._id));
      toast.success(action === 'start' ? `Cleaning Table ${c.tableNumber}.` : `Table ${c.tableNumber} is clean.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Action failed.');
      fetchAll();
    } finally { setActing(null); }
  };

  const handleReservationSaved = (r: TableReservation) => {
    if (reserveModal?.existing) {
      setReservations(prev => prev.map(x => x._id === r._id ? r : x));
    } else {
      // Guard against duplicate: socket event may have already added this reservation
      setReservations(prev => prev.some(x => x._id === r._id) ? prev.map(x => x._id === r._id ? r : x) : [r, ...prev]);
    }
    setReserveModal(null);
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await API.delete(`/table-reservations/${cancelTarget._id}`);
      setReservations(prev => prev.map(x => x._id === cancelTarget._id ? { ...x, status: 'CANCELLED' as ReservationStatus } : x));
      toast.success(`Reservation for Table ${cancelTarget.tableNumber} cancelled.`);
      setCancelTarget(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to cancel reservation.');
    } finally { setCancelling(false); }
  };

  const tables  = buildTableList(totalTables, orders, waiter, reservations, cleans);
  const occupied = tables.filter(t => t.status !== 'Available').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Table2 className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Tables</h1>
          <p className="text-xs text-gray-400">{totalTables} total · {occupied} occupied · {totalTables - occupied} available</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(TABLE_STATUS_STYLE) as [TableStatus, typeof TABLE_STATUS_STYLE[TableStatus]][]).map(([s, st]) => (
          <span key={s} className={`badge ${st.bg} ${st.text} border ${st.border} text-xs`}>{s}</span>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[...Array(12)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {tables.map(table => {
            const style = TABLE_STATUS_STYLE[table.status];
            const isAvailable = table.status === 'Available';
            const activeRes = table.reservations.filter(r => ACTIVE_RES_STATUSES.includes(r.status));

            return (
              <div key={table.number}
                className={`card p-3 flex flex-col items-center gap-1 ${style.bg} border ${style.border}`}>
                <p className="text-2xl font-black text-white">{table.number}</p>
                <p className={`text-[10px] font-semibold text-center ${style.text} leading-tight`}>{table.status}</p>

                {/* Show how long the table has been occupied */}
                {table.seatedAt && (table.status === 'Occupied' || table.status === 'Bill Requested' || table.status === 'Waiter Requested') && (
                  <OccupancyClock seatedAt={table.seatedAt} />
                )}

                {(isAvailable || (table.status === 'Reserved' && table.reservations.some(r => r.status === 'ARRIVED'))) && (
                  <button onClick={() => navigate(`/tables/${table.number}/order`)}
                    className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg
                               bg-green-500/20 hover:bg-green-500/30 text-green-400 text-[10px] font-medium transition-colors">
                    <ShoppingCart className="w-3 h-3" /> Take Order
                  </button>
                )}

                {table.clean && table.clean.status === 'DIRTY' && (
                  <div className="w-full space-y-1">
                    <p className="text-[10px] text-gray-500 text-center">
                      Dirty since {table.clean.dirtyAt ? new Date(table.clean.dirtyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </p>
                    <button onClick={() => doClean(table.clean!, 'start')} disabled={acting === table.clean._id}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg
                                 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-[10px] font-medium transition-colors disabled:opacity-50">
                      {acting === table.clean._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Start Cleaning
                    </button>
                  </div>
                )}

                {table.clean && table.clean.status === 'CLEANING' && (
                  <div className="w-full space-y-1">
                    <p className="text-[10px] text-gray-400 text-center truncate">
                      By {table.clean.cleaningBy?.name || 'staff'}
                      {table.clean.cleaningStartedAt ? ` · ${new Date(table.clean.cleaningStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </p>
                    <button onClick={() => doClean(table.clean!, 'complete')} disabled={acting === table.clean._id}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg
                                 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-[10px] font-medium transition-colors disabled:opacity-50">
                      {acting === table.clean._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Mark Clean
                    </button>
                  </div>
                )}

                {isAvailable && canMutate && (
                  <button onClick={() => setReserveModal({ tableNumber: table.number })}
                    className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg
                               bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[10px] font-medium transition-colors">
                    <CalendarCheck className="w-3 h-3" /> Reserve
                  </button>
                )}

                {activeRes.map(res => {
                  const ss = RES_STATUS_STYLE[res.status] ?? RES_STATUS_STYLE['RESERVED'];
                  const isActive  = res.status === 'RESERVED' || res.status === 'ACTIVE';
                  const isArrived = res.status === 'ARRIVED';
                  const busy      = acting === res._id;

                  return (
                    <div key={res._id} className="mt-2 pt-2 border-t border-gray-700/60 w-full space-y-1 text-left">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${ss.badge}`}>
                        {ss.label}
                      </span>
                      <p className="text-[11px] font-semibold text-white truncate">{res.guestName}</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Users className="w-3 h-3 shrink-0" />
                        {res.numberOfPeople} {res.numberOfPeople === 1 ? 'person' : 'people'}
                      </p>
                      {res.mobileNumber && (
                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Phone className="w-3 h-3 shrink-0" />{res.mobileNumber}
                        </p>
                      )}
                      {res.reservationStart && (
                        <>
                          <p className="text-[10px] text-gray-500">📅 {formatDateIST(res.reservationStart)}</p>
                          <p className="text-[10px] text-gray-500">🕐 {formatTimeSlot(res.reservationStart, res.reservationEnd)}</p>
                        </>
                      )}
                      {res.notes && <p className="text-[10px] text-gray-600 italic truncate">"{res.notes}"</p>}
                      <p className="text-[10px] text-gray-600 truncate">By: {res.reservedByName}</p>

                      {/* ADMIN / ASSISTANT action buttons */}
                      {canMutate && (
                        <div className="space-y-1 pt-0.5">
                          {isActive && (
                            <button onClick={() => doTransition(res._id, 'arrive', 'Guest marked as arrived.')}
                              disabled={busy}
                              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg
                                         bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-[10px] font-medium transition-colors disabled:opacity-50">
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                              Mark Arrived
                            </button>
                          )}
                          {isArrived && (
                            <button onClick={() => doTransition(res._id, 'complete', 'Reservation completed.')}
                              disabled={busy}
                              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg
                                         bg-green-500/20 hover:bg-green-500/30 text-green-400 text-[10px] font-medium transition-colors disabled:opacity-50">
                              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                              Mark Completed
                            </button>
                          )}
                          {(isActive || isArrived) && (
                            <div className="flex gap-1">
                              {isActive && (
                                <>
                                  <button onClick={() => setReserveModal({ tableNumber: table.number, existing: res })}
                                    className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-lg
                                               bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-[10px] transition-colors">
                                    <Pencil className="w-3 h-3" /> Edit
                                  </button>
                                  <button onClick={() => doTransition(res._id, 'no-show', 'Marked as no-show.')}
                                    disabled={busy}
                                    className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-lg
                                               bg-gray-500/20 hover:bg-gray-500/30 text-gray-400 text-[10px] transition-colors">
                                    <UserX className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              <button onClick={() => setCancelTarget(res)}
                                className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-lg
                                           bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] transition-colors">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Reserve/Edit modal */}
      <AnimatePresence>
        {reserveModal && (
          <ReserveModal
            tableNumber={reserveModal.tableNumber}
            existing={reserveModal.existing}
            onClose={() => setReserveModal(null)}
            onSaved={handleReservationSaved}
          />
        )}
      </AnimatePresence>

      {/* Cancel confirmation */}
      <AnimatePresence>
        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => !cancelling && setCancelTarget(null)}>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="card w-full max-w-sm p-6 shadow-2xl">
              <h3 className="font-bold text-white mb-2">Cancel Reservation</h3>
              <p className="text-sm text-gray-400 mb-4">
                Cancel reservation for <strong className="text-white">{cancelTarget.guestName}</strong> at Table {cancelTarget.tableNumber}
                {cancelTarget.reservationStart ? ` on ${formatDateIST(cancelTarget.reservationStart)} at ${formatTimeSlot(cancelTarget.reservationStart, cancelTarget.reservationEnd)}` : ''}?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setCancelTarget(null)} className="btn-secondary flex-1" disabled={cancelling}>Keep</button>
                <button onClick={handleCancelConfirm} disabled={cancelling} className="btn-danger flex-1">
                  {cancelling ? <><Loader2 className="w-4 h-4 animate-spin" /> Cancelling…</> : 'Cancel Reservation'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
