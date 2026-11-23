import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Plus, Search, Edit2, Package, X, Loader2, AlertTriangle, SlidersHorizontal, History, PackagePlus } from 'lucide-react';
import toast from 'react-hot-toast';
import API from '../lib/api';

const UNITS = ['kg', 'g', 'litre', 'ml', 'piece', 'packet'] as const;
const BASE_UNITS = ['g', 'ml', 'piece'] as const;

interface RawMaterial {
  _id: string;
  name: string;
  unit: string;
  baseUnit: string;
  currentQuantity: number;
  minimumQuantity: number;
  purchasePrice: number;
  supplier?: string;
  isActive: boolean;
}

const emptyForm = {
  name: '', unit: 'kg', baseUnit: 'g',
  currentQuantity: '', minimumQuantity: '', purchasePrice: '', supplier: '',
};

const isLow = (m: RawMaterial) => m.currentQuantity <= m.minimumQuantity;

export default function InventoryPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [adjustTarget, setAdjustTarget] = useState<RawMaterial | null>(null);
  const [adjustMode, setAdjustMode] = useState<'delta' | 'set'>('delta');
  const [adjustValue, setAdjustValue] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const [purchaseTarget, setPurchaseTarget] = useState<RawMaterial | null>(null);
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseUnitPrice, setPurchaseUnitPrice] = useState('');
  const [purchasing, setPurchasing] = useState(false);

  const openPurchase = (m: RawMaterial) => {
    setPurchaseTarget(m);
    setPurchaseQty('');
    setPurchaseUnitPrice(String(m.purchasePrice ?? ''));
  };

  const handlePurchase = async () => {
    if (!purchaseTarget || purchasing) return;
    const qty = Number(purchaseQty);
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('Quantity must be greater than 0'); return; }
    const body: any = { quantity: qty };
    if (purchaseUnitPrice !== '') {
      const p = Number(purchaseUnitPrice);
      if (!Number.isFinite(p) || p < 0) { toast.error('Unit price cannot be negative'); return; }
      body.unitPrice = p;
    }
    setPurchasing(true);
    try {
      await API.patch(`/inventory/${purchaseTarget._id}/purchase`, body);
      toast.success('Stock added');
      setPurchaseTarget(null);
      fetchMaterials();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add stock');
    } finally {
      setPurchasing(false);
    }
  };

  const [historyTarget, setHistoryTarget] = useState<RawMaterial | null>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = async (m: RawMaterial) => {
    setHistoryTarget(m);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const res = await API.get(`/inventory/${m._id}/history?limit=100`);
      setHistoryRows(res.data.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const [summary, setSummary] = useState<{ totalMaterials: number; activeMaterials: number; lowStockCount: number; inventoryValue: number } | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await API.get('/inventory/summary');
      setSummary(res.data?.data ?? null);
    } catch {
      setSummary(null);
    }
  }, []);

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: string[] = [];
      if (activeFilter === 'active') params.push('active=true');
      if (activeFilter === 'inactive') params.push('active=false');
      if (search.trim()) params.push(`search=${encodeURIComponent(search.trim())}`);
      const qs = params.length ? `?${params.join('&')}` : '';
      const res = await API.get(`/inventory${qs}`);
      setMaterials(res.data.data || []);
      fetchSummary();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, search, fetchSummary]);

  useEffect(() => {
    const t = setTimeout(fetchMaterials, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchMaterials, search]);

  const resetForm = () => { setForm({ ...emptyForm }); setEditing(null); setSaving(false); };
  const openAdd = () => { resetForm(); setShowModal(true); };
  const openEdit = (m: RawMaterial) => {
    setEditing(m);
    setForm({
      name: m.name, unit: m.unit, baseUnit: m.baseUnit,
      currentQuantity: String(m.currentQuantity),
      minimumQuantity: String(m.minimumQuantity),
      purchasePrice: String(m.purchasePrice ?? 0),
      supplier: m.supplier || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const min = Number(form.minimumQuantity || 0);
    const price = Number(form.purchasePrice || 0);
    if (min < 0) { toast.error('Minimum quantity cannot be negative'); return; }
    if (price < 0) { toast.error('Purchase price cannot be negative'); return; }

    setSaving(true);
    try {
      if (editing) {
        await API.patch(`/inventory/${editing._id}`, {
          name: form.name.trim(), unit: form.unit, baseUnit: form.baseUnit,
          minimumQuantity: min, purchasePrice: price, supplier: form.supplier.trim(),
        });
        toast.success('Raw material updated');
      } else {
        const current = Number(form.currentQuantity || 0);
        if (current < 0) { toast.error('Current quantity cannot be negative'); setSaving(false); return; }
        await API.post('/inventory', {
          name: form.name.trim(), unit: form.unit, baseUnit: form.baseUnit,
          currentQuantity: current, minimumQuantity: min, purchasePrice: price, supplier: form.supplier.trim(),
        });
        toast.success('Raw material created');
      }
      setShowModal(false);
      resetForm();
      fetchMaterials();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save raw material');
    } finally {
      setSaving(false);
    }
  };

  const openAdjust = (m: RawMaterial) => { setAdjustTarget(m); setAdjustMode('delta'); setAdjustValue(''); };
  const adjustResult = (() => {
    if (!adjustTarget) return null;
    const v = Number(adjustValue);
    if (!Number.isFinite(v)) return null;
    return adjustMode === 'set' ? v : adjustTarget.currentQuantity + v;
  })();

  const handleAdjust = async () => {
    if (!adjustTarget || adjusting) return;
    const v = Number(adjustValue);
    if (!Number.isFinite(v)) { toast.error('Enter a valid number'); return; }
    if (adjustMode === 'set' && v < 0) { toast.error('Set value cannot be negative'); return; }
    if (adjustResult !== null && adjustResult < 0) { toast.error('Resulting quantity cannot be negative'); return; }
    setAdjusting(true);
    try {
      await API.patch(`/inventory/${adjustTarget._id}/adjust`, adjustMode === 'set' ? { set: v } : { delta: v });
      toast.success('Stock adjusted');
      setAdjustTarget(null);
      fetchMaterials();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to adjust stock');
    } finally {
      setAdjusting(false);
    }
  };

  const handleToggle = async (m: RawMaterial) => {
    try {
      await API.patch(`/inventory/${m._id}/toggle-status`);
      toast.success(`Raw material ${m.isActive ? 'deactivated' : 'activated'}`);
      fetchMaterials();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update status');
    }
  };

  const lowCount = materials.filter(isLow).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-gray-400 text-sm mt-1">Raw materials — quantities stored in each item's base unit.</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4" /> Add Raw Material</button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-4"><div className="text-xs text-gray-500">Total Materials</div><div className="text-xl font-bold text-white">{summary.totalMaterials}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Active</div><div className="text-xl font-bold text-white">{summary.activeMaterials}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Low Stock</div><div className={`text-xl font-bold ${summary.lowStockCount > 0 ? 'text-amber-400' : 'text-white'}`}>{summary.lowStockCount}</div></div>
          <div className="card p-4"><div className="text-xs text-gray-500">Inventory Value</div><div className="text-xl font-bold text-white">₹{Number(summary.inventoryValue).toFixed(2)}</div></div>
        </div>
      )}

      {lowCount > 0 && (
        <div className="card p-3 flex items-center gap-2 border border-amber-500/30 bg-amber-500/10">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-300">{lowCount} material{lowCount > 1 ? 's' : ''} at or below minimum</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search raw materials..." className="input pl-11" />
        </div>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as any)} className="input sm:w-40">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="card p-4 h-20 animate-pulse" />)}</div>
      ) : error ? (
        <div className="card p-8 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-red-400 mb-3" />
          <p className="text-red-400 mb-3">{error}</p>
          <button onClick={fetchMaterials} className="btn">Retry</button>
        </div>
      ) : materials.length === 0 ? (
        <div className="card p-10 text-center">
          <Package className="w-14 h-14 mx-auto text-gray-600 mb-3" />
          <h3 className="text-lg font-semibold text-white mb-1">No raw materials</h3>
          <p className="text-gray-400 mb-4">{search ? 'Try a different search' : 'Add your first raw material'}</p>
          <button onClick={openAdd} className="btn-primary mx-auto"><Plus className="w-4 h-4" /> Add Raw Material</button>
        </div>
      ) : (
        <div className="space-y-3">
          {materials.map((m) => (
            <div key={m._id} className={`card p-4 ${!m.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-white truncate">
                    {m.name}
                    {isLow(m) && <span className="ml-2 badge bg-amber-500/20 text-amber-400 text-xs">LOW</span>}
                  </h3>
                  <p className="text-xs text-gray-400">{m.unit} → {m.baseUnit} · {m.supplier || 'No supplier'}</p>
                </div>
                <button onClick={() => handleToggle(m)} className={`badge shrink-0 text-xs ${m.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {m.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                <div><div className="text-xs text-gray-500">Current</div><div className={`font-mono ${isLow(m) ? 'text-amber-400 font-bold' : 'text-white'}`}>{m.currentQuantity} {m.baseUnit}</div></div>
                <div><div className="text-xs text-gray-500">Minimum</div><div className="font-mono text-gray-300">{m.minimumQuantity} {m.baseUnit}</div></div>
                <div><div className="text-xs text-gray-500">Price</div><div className="text-gray-300">₹{Number(m.purchasePrice ?? 0).toFixed(2)}</div></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => openPurchase(m)} className="btn flex-1 text-sm"><PackagePlus className="w-4 h-4" /> Add Stock</button>
                <button onClick={() => openAdjust(m)} className="btn flex-1 text-sm"><SlidersHorizontal className="w-4 h-4" /> Adjust</button>
                <button onClick={() => openEdit(m)} className="btn flex-1 text-sm"><Edit2 className="w-4 h-4" /> Edit</button>
                <button onClick={() => openHistory(m)} className="btn text-sm px-3" title="History"><History className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg card p-6 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{editing ? 'Edit Raw Material' : 'Add Raw Material'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="label">Name</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g., Paneer" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Display Unit</label><select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="input">{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                <div><label className="label">Base Unit</label><select value={form.baseUnit} onChange={(e) => setForm({ ...form, baseUnit: e.target.value })} className="input">{BASE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
              </div>
              <p className="text-xs text-gray-500 -mt-2">Current and minimum quantities are stored in the selected <span className="text-gray-300 font-medium">base unit</span> (e.g. grams if base unit is g).</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Current Qty ({form.baseUnit})</label>
                  <input type="number" step="0.001" min="0" value={form.currentQuantity} onChange={(e) => setForm({ ...form, currentQuantity: e.target.value })} className="input" placeholder="0" disabled={!!editing} />
                  {editing && <p className="text-[11px] text-gray-500 mt-1">Use "Adjust" to change stock.</p>}
                </div>
                <div><label className="label">Minimum Qty ({form.baseUnit})</label><input type="number" step="0.001" min="0" value={form.minimumQuantity} onChange={(e) => setForm({ ...form, minimumQuantity: e.target.value })} className="input" placeholder="0" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Purchase Price (₹)</label><input type="number" step="0.01" min="0" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="input" placeholder="0.00" /></div>
                <div><label className="label">Supplier</label><input type="text" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="input" placeholder="Optional" /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn flex-1" disabled={saving}>Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : editing ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAdjustTarget(null)}>
          <div className="w-full max-w-sm card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Adjust · {adjustTarget.name}</h2>
              <button onClick={() => setAdjustTarget(null)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="text-sm text-gray-400">Current: <span className="font-mono font-semibold text-white">{adjustTarget.currentQuantity} {adjustTarget.baseUnit}</span></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdjustMode('delta')} className={`flex-1 text-sm ${adjustMode === 'delta' ? 'btn-primary' : 'btn'}`}>Change (±)</button>
                <button type="button" onClick={() => setAdjustMode('set')} className={`flex-1 text-sm ${adjustMode === 'set' ? 'btn-primary' : 'btn'}`}>Set exact</button>
              </div>
              <div>
                <label className="label">{adjustMode === 'delta' ? `Change (${adjustTarget.baseUnit}, use - to reduce)` : `New quantity (${adjustTarget.baseUnit})`}</label>
                <input type="number" step="0.001" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} className="input" placeholder="0" />
              </div>
              {adjustResult !== null && (
                <div className={`text-sm ${adjustResult < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                  Resulting: <span className="font-mono font-semibold">{adjustResult} {adjustTarget.baseUnit}</span>{adjustResult < 0 && ' — not allowed'}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setAdjustTarget(null)} className="btn flex-1" disabled={adjusting}>Cancel</button>
                <button type="button" onClick={handleAdjust} disabled={adjusting || adjustResult === null || adjustResult < 0} className="btn-primary flex-1">{adjusting ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Apply'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Purchase / Add Stock modal (Step 8) */}
      {purchaseTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPurchaseTarget(null)}>
          <div className="w-full max-w-sm card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Add Stock · {purchaseTarget.name}</h2>
              <button onClick={() => setPurchaseTarget(null)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="text-sm text-gray-400">Current: <span className="font-mono font-semibold text-white">{purchaseTarget.currentQuantity} {purchaseTarget.baseUnit}</span></div>
              <div>
                <label className="label">Quantity to add ({purchaseTarget.baseUnit})</label>
                <input type="number" step="0.001" min="0" value={purchaseQty} onChange={(e) => setPurchaseQty(e.target.value)} className="input" placeholder="0" />
              </div>
              <div>
                <label className="label">Unit price (₹, optional)</label>
                <input type="number" step="0.01" min="0" value={purchaseUnitPrice} onChange={(e) => setPurchaseUnitPrice(e.target.value)} className="input" placeholder="Updates purchase price" />
              </div>
              {Number(purchaseQty) > 0 && (
                <div className="text-sm text-gray-300">New balance: <span className="font-mono font-semibold">{purchaseTarget.currentQuantity + Number(purchaseQty)} {purchaseTarget.baseUnit}</span></div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPurchaseTarget(null)} className="btn flex-1" disabled={purchasing}>Cancel</button>
                <button type="button" onClick={handlePurchase} disabled={purchasing || !(Number(purchaseQty) > 0)} className="btn-primary flex-1">{purchasing ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Add Stock'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History modal (Step 7) */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setHistoryTarget(null)}>
          <div className="w-full max-w-lg card p-6 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">History · {historyTarget.name}</h2>
              <button onClick={() => setHistoryTarget(null)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            {historyLoading ? (
              <div className="py-8 flex items-center justify-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
            ) : historyRows.length === 0 ? (
              <div className="py-8 text-center text-gray-400">No history yet for this material.</div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {historyRows.map((h) => (
                  <div key={h._id} className="border-b border-gray-800 pb-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`badge text-xs ${h.type === 'DEDUCTION' ? 'bg-red-500/20 text-red-400' : h.type === 'ADJUSTMENT' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>{h.type}</span>
                      <span className="text-xs text-gray-500">{new Date(h.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-gray-300">
                      <span>Change: <span className={`font-mono font-semibold ${h.quantityDelta < 0 ? 'text-red-400' : 'text-green-400'}`}>{h.quantityDelta > 0 ? '+' : ''}{h.quantityDelta} {h.baseUnit || ''}</span></span>
                      <span>Balance: <span className="font-mono">{h.balanceAfter} {h.baseUnit || ''}</span></span>
                      {h.source && <span className="text-xs text-gray-500">{h.source}</span>}
                    </div>
                    {h.orderId && <div className="text-xs text-gray-500 mt-0.5">Order: <span className="font-mono">{String(h.orderId)}</span></div>}
                    {h.shortage > 0 && (
                      <div className="text-xs text-amber-400 mt-0.5">Required: {h.requiredQuantity} · Shortage: {h.shortage} {h.baseUnit || ''}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
