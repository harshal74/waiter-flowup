/**
 * Staff dine-in ordering — ADMIN / ASSISTANT / WAITER.
 * Route: /tables/:tableNumber/order
 *
 * Reuses the existing menu + category APIs and posts to /table-orders, which
 * runs the same order pipeline as customer orders. The server re-validates the
 * table, prices and availability; nothing here is trusted.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, Search, ShoppingCart, Trash2, Loader2, User, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../lib/api';

interface Category { _id: string; name: string; isActive?: boolean }
interface MenuItem {
  _id: string;
  name: string;
  price: number;
  discountedPrice?: number | null;
  image?: string;
  isAvailable: boolean;
  categoryId?: string | { _id: string };
}

const unitPrice = (m: MenuItem) => (m.discountedPrice || m.price);
const catId = (m: MenuItem) => (typeof m.categoryId === 'object' && m.categoryId ? m.categoryId._id : (m.categoryId as string | undefined));
const MOBILE_RE = /^[6-9]\d{9}$/;

function normalizeMobile(v: string): string {
  let d = v.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

const newKey = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function StaffOrderPage() {
  const { tableNumber } = useParams();
  const table = Number(tableNumber);
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const idemKey = useRef(newKey());

  useEffect(() => {
    if (!Number.isInteger(table) || table < 1) { navigate('/tables', { replace: true }); return; }
    (async () => {
      try {
        const [cRes, mRes] = await Promise.all([API.get('/categories'), API.get('/menu')]);
        setCategories((cRes.data.data || []).filter((c: Category) => c.isActive !== false));
        setMenu(mRes.data.data || []);
      } catch {
        toast.error('Failed to load menu');
      } finally { setLoading(false); }
    })();
  }, [table, navigate]);

  const byId = useMemo(() => new Map(menu.map(m => [m._id, m])), [menu]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter(m =>
      (activeCat === 'all' || catId(m) === activeCat) &&
      (!q || m.name.toLowerCase().includes(q)));
  }, [menu, activeCat, search]);

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: byId.get(id), qty }))
    .filter((l): l is { item: MenuItem; qty: number } => !!l.item && l.qty > 0);
  const totalItems = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + unitPrice(l.item) * l.qty, 0);

  const setQty = (id: string, qty: number) => {
    idemKey.current = newKey(); // cart changed → this is a different order
    setCart(prev => {
      const next = { ...prev };
      if (qty <= 0) delete next[id]; else next[id] = Math.min(qty, 99);
      return next;
    });
  };

  const submit = async () => {
    if (submitting) return;
    if (lines.length === 0) { toast.error('Add at least one item.'); return; }
    if (!name.trim()) { toast.error('Customer name is required.'); return; }
    if (!MOBILE_RE.test(normalizeMobile(mobile))) { toast.error('Enter a valid 10-digit mobile number.'); return; }

    setSubmitting(true);
    try {
      await API.post('/table-orders', {
        tableNumber: table,
        customer: { name: name.trim(), mobile: normalizeMobile(mobile) },
        items: lines.map(l => ({ menuId: l.item._id, quantity: l.qty })),
        note: note.trim(),
        idempotencyKey: idemKey.current,
      });
      toast.success(`Order placed for Table ${table}.`);
      navigate('/tables', { replace: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to place order.');
    } finally { setSubmitting(false); }
  };

  const inputCls = 'w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-primary-500 placeholder-gray-600';

  const cartPanel = (
    <div className="card p-4 space-y-3">
      <h2 className="font-bold text-white flex items-center gap-2">
        <ShoppingCart className="w-4 h-4" /> Order · Table {table}
      </h2>

      {lines.length === 0 ? (
        <p className="text-sm text-gray-500">No items yet. Tap + on a menu item.</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {lines.map(({ item, qty }) => (
            <li key={item._id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-white truncate">{item.name}</span>
              <button onClick={() => setQty(item._id, qty - 1)} className="p-1 rounded bg-gray-700"><Minus className="w-3 h-3" /></button>
              <span className="w-6 text-center text-white">{qty}</span>
              <button onClick={() => setQty(item._id, qty + 1)} className="p-1 rounded bg-gray-700"><Plus className="w-3 h-3" /></button>
              <span className="w-16 text-right text-gray-300">₹{(unitPrice(item) * qty).toFixed(0)}</span>
              <button onClick={() => setQty(item._id, 0)} className="p-1 text-red-400"><Trash2 className="w-3 h-3" /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between font-semibold text-white border-t border-gray-700 pt-2">
        <span>{totalItems} item{totalItems === 1 ? '' : 's'}</span>
        <span>₹{total.toFixed(2)}</span>
      </div>

      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name *" maxLength={100} className={`${inputCls} pl-9`} />
      </div>
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Mobile number *" inputMode="tel" maxLength={15} className={`${inputCls} pl-9`} />
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)" rows={2} maxLength={500} className={`${inputCls} resize-none`} />

      <button onClick={submit} disabled={submitting || lines.length === 0} className="btn-primary w-full">
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing…</> : 'Place Order'}
      </button>
    </div>
  );

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/tables')} className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700">
          <ArrowLeft className="w-4 h-4 text-gray-300" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">New Order · Table {table}</h1>
          <p className="text-xs text-gray-400">Dine-in order placed by staff</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu" className={`${inputCls} pl-9`} />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {[{ _id: 'all', name: 'All' }, ...categories].map(c => (
              <button key={c._id} onClick={() => setActiveCat(c._id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border
                  ${activeCat === c._id ? 'bg-primary-500/20 text-primary-400 border-primary-500/40' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                {c.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-gray-500">No menu items found.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visible.map(m => {
                const qty = cart[m._id] || 0;
                return (
                  <div key={m._id} className={`card p-3 flex flex-col gap-2 ${m.isAvailable ? '' : 'opacity-50'}`}>
                    {m.image && <img src={m.image} alt={m.name} className="w-full h-20 object-cover rounded-lg" loading="lazy" />}
                    <p className="text-sm font-semibold text-white leading-tight">{m.name}</p>
                    <p className="text-xs text-gray-400">
                      ₹{unitPrice(m)}
                      {m.discountedPrice ? <span className="line-through ml-1 text-gray-600">₹{m.price}</span> : null}
                    </p>
                    {!m.isAvailable ? (
                      <span className="text-[10px] text-red-400">Unavailable</span>
                    ) : qty === 0 ? (
                      <button onClick={() => setQty(m._id, 1)} className="btn-secondary text-xs py-1.5">Add</button>
                    ) : (
                      <div className="flex items-center justify-between">
                        <button onClick={() => setQty(m._id, qty - 1)} className="p-1.5 rounded bg-gray-700"><Minus className="w-3 h-3" /></button>
                        <span className="text-white text-sm">{qty}</span>
                        <button onClick={() => setQty(m._id, qty + 1)} className="p-1.5 rounded bg-gray-700"><Plus className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop cart */}
        <div className="hidden lg:block">{cartPanel}</div>
      </div>

      {/* Mobile cart bar + sheet */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 p-3 bg-gray-900/95 border-t border-gray-800">
        <button onClick={() => setShowCart(true)} className="btn-primary w-full">
          <ShoppingCart className="w-4 h-4" /> View order · {totalItems} item{totalItems === 1 ? '' : 's'} · ₹{total.toFixed(0)}
        </button>
      </div>
      {showCart && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/70 flex items-end" onClick={() => setShowCart(false)}>
          <div className="w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>{cartPanel}</div>
        </div>
      )}
    </div>
  );
}
