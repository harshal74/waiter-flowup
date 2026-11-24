/**
 * Split Bill UI — shared by the Admin app and the Waiter app (same file in both).
 *
 *  <SplitEditor>    choose Equal / By Item / Custom and build the split request.
 *                   Numbers shown here are a preview; the server computes the
 *                   final amounts (in paise) and they always add up to the bill.
 *  <SplitPayments>  one card per person: items, tax, amount, their own UPI QR
 *                   (am = that person's amount), payment method, "Mark Split Paid",
 *                   plus a Paid ₹X / ₹Total progress bar.
 */

import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Users, ListChecks, IndianRupee, Plus, Minus, Trash2, Loader2, CheckCircle, X, Split } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────

export type SplitType = 'NONE' | 'EQUAL' | 'BY_ITEM' | 'CUSTOM';
export type PayMethod = 'Cash' | 'UPI' | 'Card';

export interface BillSplit {
  _id: string;
  label: string;
  items: { menuItemId?: string; name: string; quantity: number; price: number; total: number }[];
  subtotal: number;
  sgst: number;
  cgst: number;
  gst: number;
  discount: number;
  amount: number;
  paymentMethod: PayMethod;
  paymentStatus: 'Pending' | 'Paid';
  paidAt: string | null;
}

export interface SplittableBill {
  _id: string;
  subtotal: number;
  sgst?: number;
  cgst?: number;
  gst: number;
  discount: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  items: { menuItemId?: string; name: string; quantity: number; price: number; total: number }[];
  splitType?: SplitType;
  splits?: BillSplit[];
  paidAmount?: number;
  remainingAmount?: number;
}

export type SplitRequest =
  | { splitType: 'EQUAL'; splitCount: number }
  | { splitType: 'BY_ITEM'; splits: { label: string; items: { key: string; quantity: number }[] }[] }
  | { splitType: 'CUSTOM'; splits: { label: string; amount: number }[] }
  | { splitType: 'NONE' };

export const isSplitBill = (b: SplittableBill) => !!b.splitType && b.splitType !== 'NONE' && (b.splits?.length ?? 0) > 0;

// ── Helpers ───────────────────────────────────────────────────────

const MAX_PEOPLE = 20;
const toP = (n: number) => Math.round((Number(n) || 0) * 100);
const fromP = (p: number) => p / 100;
const money = (n: number) => `₹${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
/** Must match backend billSplit.service itemKey(): menuItemId + unit price in paise. */
const itemKey = (menuItemId: string | undefined, price: number) => `${String(menuItemId ?? '')}|${toP(price)}`;

/** Floor-allocate totalP over weights, remainder on the last (mirrors the server). */
function allocate(totalP: number, weights: number[]): number[] {
  const W = weights.reduce((s, w) => s + w, 0);
  if (weights.length === 0) return [];
  if (W <= 0) return allocate(totalP, weights.map(() => 1));
  const out = weights.map((w) => Math.floor((totalP * w) / W));
  out[out.length - 1] = totalP - out.slice(0, -1).reduce((s, v) => s + v, 0);
  return out;
}

export function buildUpiUrl(upiId: string, amount: number, name: string, note = 'Restaurant Bill Payment') {
  const params = new URLSearchParams({ pa: upiId, pn: name, am: amount.toFixed(2), cu: 'INR', tn: note });
  return `upi://pay?${params.toString()}`;
}

interface Line { key: string; name: string; price: number; quantity: number }

function groupLines(items: SplittableBill['items']): Line[] {
  const map = new Map<string, Line>();
  for (const it of items) {
    const key = itemKey(it.menuItemId, it.price);
    const cur = map.get(key);
    if (cur) cur.quantity += it.quantity;
    else map.set(key, { key, name: it.name, price: it.price, quantity: it.quantity });
  }
  return [...map.values()];
}

const tabBtn = (active: boolean) =>
  `flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
    active ? 'bg-primary-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
  }`;
const inputCls =
  'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 ' +
  'text-gray-900 dark:text-white focus:outline-none focus:border-primary-500';
const stepBtn =
  'w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 ' +
  'hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40';

// ── Editor ────────────────────────────────────────────────────────

interface EditorProps {
  bill: SplittableBill;
  saving: boolean;
  onSubmit: (req: SplitRequest) => void;
  onClose: () => void;
}

export function SplitEditor({ bill, saving, onSubmit, onClose }: EditorProps) {
  const [tab, setTab] = useState<'EQUAL' | 'BY_ITEM' | 'CUSTOM'>('EQUAL');
  const grandP = toP(bill.grandTotal);

  // Equal
  const [people, setPeople] = useState(2);
  const equalShares = useMemo(() => allocate(grandP, new Array(people).fill(1)), [grandP, people]);

  // By item: assign[personIdx][lineKey] = qty
  const lines = useMemo(() => groupLines(bill.items), [bill.items]);
  const [itemPeople, setItemPeople] = useState<string[]>(['Guest 1', 'Guest 2']);
  const [assign, setAssign] = useState<Record<string, number>[]>([{}, {}]);
  const assignedQty = (key: string) => assign.reduce((s, a) => s + (a[key] || 0), 0);
  const unassigned = lines.reduce((s, l) => s + (l.quantity - assignedQty(l.key)), 0);
  const setQty = (pi: number, key: string, qty: number) =>
    setAssign((prev) => prev.map((a, i) => (i === pi ? { ...a, [key]: Math.max(0, qty) } : a)));
  const addItemPerson = () => {
    if (itemPeople.length >= MAX_PEOPLE) return;
    setItemPeople((p) => [...p, `Guest ${p.length + 1}`]);
    setAssign((a) => [...a, {}]);
  };
  const removeItemPerson = (pi: number) => {
    if (itemPeople.length <= 2) return;
    setItemPeople((p) => p.filter((_, i) => i !== pi));
    setAssign((a) => a.filter((_, i) => i !== pi));
  };
  const byItemPreview = useMemo(() => {
    const subs = assign.map((a) => lines.reduce((s, l) => s + toP(l.price) * (a[l.key] || 0), 0));
    const sg = allocate(toP(bill.sgst ?? 0), subs), cg = allocate(toP(bill.cgst ?? 0), subs), dc = allocate(toP(bill.discount), subs);
    return subs.map((s, i) => s + sg[i] + cg[i] - dc[i]);
  }, [assign, lines, bill.sgst, bill.cgst, bill.discount]);

  // Custom
  const [custom, setCustom] = useState<{ label: string; amount: string }[]>([
    { label: 'Guest 1', amount: '' }, { label: 'Guest 2', amount: '' },
  ]);
  const customP = custom.map((c) => toP(Number(c.amount)));
  const customRemainingP = grandP - customP.reduce((s, v) => s + v, 0);

  // Validation per tab
  let error = '';
  if (tab === 'BY_ITEM') {
    if (unassigned > 0) error = `${unassigned} item${unassigned === 1 ? '' : 's'} not assigned yet`;
    else if (lines.some((l) => assignedQty(l.key) > l.quantity)) error = 'Some items are assigned more times than ordered';
    else if (assign.some((a) => Object.values(a).every((q) => !q))) error = 'Every person needs at least one item';
  } else if (tab === 'CUSTOM') {
    if (customP.some((p) => !(p > 0))) error = 'Enter an amount above ₹0 for each person';
    else if (Math.abs(customRemainingP) > 1) error = customRemainingP > 0 ? `${money(fromP(customRemainingP))} still to allocate` : `${money(fromP(-customRemainingP))} over the bill total`;
  }

  const submit = () => {
    if (error || saving) return;
    if (tab === 'EQUAL') onSubmit({ splitType: 'EQUAL', splitCount: people });
    else if (tab === 'BY_ITEM') onSubmit({
      splitType: 'BY_ITEM',
      splits: itemPeople.map((label, i) => ({
        label: label.trim() || `Guest ${i + 1}`,
        items: Object.entries(assign[i]).filter(([, q]) => q > 0).map(([key, quantity]) => ({ key, quantity })),
      })),
    });
    else onSubmit({
      splitType: 'CUSTOM',
      splits: custom.map((c, i) => ({ label: c.label.trim() || `Guest ${i + 1}`, amount: Number(c.amount) })),
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-4 bg-gray-50 dark:bg-gray-800/60">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Split className="w-4 h-4 text-primary-500" /> Split Bill · {money(bill.grandTotal)}
        </p>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700" aria-label="Close split">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <button className={tabBtn(tab === 'EQUAL')} onClick={() => setTab('EQUAL')}><Users className="w-3.5 h-3.5" /> Equally</button>
        <button className={tabBtn(tab === 'BY_ITEM')} onClick={() => setTab('BY_ITEM')} disabled={lines.length === 0}><ListChecks className="w-3.5 h-3.5" /> By Item</button>
        <button className={tabBtn(tab === 'CUSTOM')} onClick={() => setTab('CUSTOM')}><IndianRupee className="w-3.5 h-3.5" /> Custom</button>
      </div>

      {/* ── Equal ── */}
      {tab === 'EQUAL' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-300">Number of people</span>
            <div className="flex items-center gap-2">
              <button className={stepBtn} onClick={() => setPeople((p) => Math.max(2, p - 1))} disabled={people <= 2}><Minus className="w-4 h-4" /></button>
              <span className="w-8 text-center font-bold text-gray-900 dark:text-white">{people}</span>
              <button className={stepBtn} onClick={() => setPeople((p) => Math.min(MAX_PEOPLE, p + 1))} disabled={people >= MAX_PEOPLE}><Plus className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="text-center p-3 rounded-xl bg-white dark:bg-gray-900">
            <p className="text-xs text-gray-500">Each person pays</p>
            <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{money(fromP(equalShares[0]))}</p>
            {equalShares[people - 1] !== equalShares[0] && (
              <p className="text-xs text-gray-500 mt-1">Last person pays {money(fromP(equalShares[people - 1]))} (rounding)</p>
            )}
          </div>
        </div>
      )}

      {/* ── By item ── */}
      {tab === 'BY_ITEM' && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Unassigned:{' '}
            {lines.filter((l) => l.quantity - assignedQty(l.key) !== 0).map((l) => (
              <span key={l.key} className={`inline-block mr-2 ${assignedQty(l.key) > l.quantity ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>
                {l.quantity - assignedQty(l.key)} × {l.name}
              </span>
            ))}
            {unassigned === 0 && lines.every((l) => assignedQty(l.key) === l.quantity) && <span className="text-green-600">none, all items assigned ✓</span>}
          </div>

          {itemPeople.map((label, pi) => (
            <div key={pi} className="rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={label}
                  onChange={(e) => setItemPeople((p) => p.map((x, i) => (i === pi ? e.target.value : x)))}
                  maxLength={40}
                  className={`${inputCls} py-1.5`}
                />
                <span className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{money(fromP(byItemPreview[pi] || 0))}</span>
                {itemPeople.length > 2 && (
                  <button onClick={() => removeItemPerson(pi)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" aria-label="Remove person">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {lines.map((l) => {
                const mine = assign[pi][l.key] || 0;
                const left = l.quantity - assignedQty(l.key);
                return (
                  <div key={l.key} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300 truncate">{l.name} <span className="text-gray-400">· {money(l.price)}</span></span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button className={stepBtn} onClick={() => setQty(pi, l.key, mine - 1)} disabled={mine <= 0}><Minus className="w-3.5 h-3.5" /></button>
                      <span className="w-6 text-center text-gray-900 dark:text-white">{mine}</span>
                      <button className={stepBtn} onClick={() => setQty(pi, l.key, mine + 1)} disabled={left <= 0}><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <button onClick={addItemPerson} disabled={itemPeople.length >= MAX_PEOPLE}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40">
            <Plus className="w-4 h-4" /> Add Person
          </button>
        </div>
      )}

      {/* ── Custom ── */}
      {tab === 'CUSTOM' && (
        <div className="space-y-2">
          {custom.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={c.label} maxLength={40}
                onChange={(e) => setCustom((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className={`${inputCls} flex-1`} />
              <div className="relative w-32">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input type="number" min={0} step="0.01" inputMode="decimal" value={c.amount} placeholder="0.00"
                  onChange={(e) => setCustom((p) => p.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                  className={`${inputCls} pl-6`} />
              </div>
              {custom.length > 2 && (
                <button onClick={() => setCustom((p) => p.filter((_, j) => j !== i))} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" aria-label="Remove person">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button onClick={() => custom.length < MAX_PEOPLE && setCustom((p) => [...p, { label: `Guest ${p.length + 1}`, amount: '' }])}
              disabled={custom.length >= MAX_PEOPLE}
              className="flex items-center gap-1 text-sm text-primary-600 dark:text-primary-400 disabled:opacity-40">
              <Plus className="w-4 h-4" /> Add Person
            </button>
            <button
              onClick={() => {
                const last = custom.length - 1;
                const othersP = customP.slice(0, -1).reduce((s, v) => s + v, 0);
                if (grandP - othersP > 0) setCustom((p) => p.map((x, j) => (j === last ? { ...x, amount: fromP(grandP - othersP).toFixed(2) } : x)));
              }}
              className="text-xs text-gray-500 underline">
              Put the rest on the last person
            </button>
          </div>
          <p className={`text-sm font-semibold ${Math.abs(customRemainingP) <= 1 ? 'text-green-600' : 'text-amber-600 dark:text-amber-400'}`}>
            Remaining to allocate: {money(fromP(customRemainingP))}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      <button onClick={submit} disabled={!!error || saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-semibold disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Split className="w-4 h-4" />} Split Bill
      </button>
    </div>
  );
}

// ── Payments ──────────────────────────────────────────────────────

interface PaymentsProps {
  bill: SplittableBill;
  upiId: string;
  restaurantName: string;
  onConfirmSplit: (splitId: string, method: PayMethod) => Promise<void>;
  /** Undo the split (only offered while nobody has paid). */
  onRemoveSplit?: () => Promise<void>;
}

export function SplitPayments({ bill, upiId, restaurantName, onConfirmSplit, onRemoveSplit }: PaymentsProps) {
  const splits = bill.splits || [];
  const [methods, setMethods] = useState<Record<string, PayMethod>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const paidP = splits.filter((s) => s.paymentStatus === 'Paid').reduce((t, s) => t + toP(s.amount), 0);
  const totalP = toP(bill.grandTotal);
  const pct = totalP > 0 ? Math.min(100, Math.round((paidP / totalP) * 100)) : 0;
  const nobodyPaid = splits.every((s) => s.paymentStatus !== 'Paid');
  const paidCount = splits.filter((s) => s.paymentStatus === 'Paid').length;

  const confirm = async (s: BillSplit) => {
    setBusy(s._id);
    try { await onConfirmSplit(s._id, methods[s._id] || s.paymentMethod || 'Cash'); }
    catch { /* caller shows the error */ }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="font-semibold text-gray-900 dark:text-white">Paid {money(fromP(paidP))} / {money(bill.grandTotal)}</span>
          <span className="text-gray-500">{paidCount}/{splits.length} people</span>
        </div>
        <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {paidP < totalP && (
          <p className="text-xs text-gray-500 mt-1">Remaining {money(fromP(totalP - paidP))}. The table stays in Bill Requested until everyone has paid.</p>
        )}
      </div>

      {splits.map((s) => {
        const paid = s.paymentStatus === 'Paid';
        const method = methods[s._id] || s.paymentMethod || 'Cash';
        return (
          <div key={s._id}
            className={`rounded-2xl border p-4 space-y-3 ${paid
              ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900 dark:text-white">{s.label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{money(s.amount)}</p>
            </div>

            {s.items.length > 0 && (
              <div className="space-y-0.5">
                {s.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
                    <span>{it.quantity}× {it.name}</span><span>{money(it.total)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-3">
              <span>Subtotal {money(s.subtotal)}</span>
              {s.sgst > 0 && <span>SGST {money(s.sgst)}</span>}
              {s.cgst > 0 && <span>CGST {money(s.cgst)}</span>}
              {s.discount > 0 && <span className="text-green-600">Discount −{money(s.discount)}</span>}
            </div>

            {paid ? (
              <p className="text-sm font-semibold text-green-600 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Paid by {s.paymentMethod}
                {s.paidAt ? ` · ${new Date(s.paidAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}
              </p>
            ) : (
              <>
                <div className="flex gap-1">
                  {(['Cash', 'UPI', 'Card'] as PayMethod[]).map((m) => (
                    <button key={m} onClick={() => setMethods((p) => ({ ...p, [s._id]: m }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border ${method === m
                        ? 'bg-primary-500 border-primary-500 text-white'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>
                      {m}
                    </button>
                  ))}
                </div>

                {method === 'UPI' && upiId && (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="p-2 bg-white rounded-xl shadow">
                      <QRCodeSVG value={buildUpiUrl(upiId, s.amount, restaurantName, `${s.label} share`)} size={150} level="M" />
                    </div>
                    <p className="text-xs text-gray-500">Scan to pay {money(s.amount)}</p>
                  </div>
                )}
                {method === 'UPI' && !upiId && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-center">UPI ID not configured in Settings.</p>
                )}

                <button onClick={() => confirm(s)} disabled={busy !== null}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-semibold disabled:opacity-50">
                  {busy === s._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Mark Split Paid
                </button>
              </>
            )}
          </div>
        );
      })}

      {onRemoveSplit && nobodyPaid && (
        <button
          onClick={async () => {
            setRemoving(true);
            try { await onRemoveSplit(); } catch { /* caller shows the error */ } finally { setRemoving(false); }
          }}
          disabled={removing}
          className="w-full text-xs text-gray-500 underline disabled:opacity-50">
          {removing ? 'Removing split…' : 'Undo split (pay as one bill)'}
        </button>
      )}
    </div>
  );
}
