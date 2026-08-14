/**
 * Waiter Notification Context
 *
 * Counts:
 *  • readyOrderCount  — orders with status READY  (sidebar badge)
 *  • waiterCallCount  — active waiter requests     (sidebar badge)
 *
 * Sounds (Web Audio API — no external files):
 *  • new READY order  → ascending two-tone chime
 *  • new waiter call  → triple urgent beep
 *
 * Audio strategy:
 *  - AudioContext is created eagerly on mount and stored in a ref.
 *  - It starts in "suspended" state (browser policy).
 *  - The first user click/keydown/touchstart resumes it permanently.
 *  - All sound calls go through a single helper that auto-resumes
 *    before playing, so sounds work even if the gesture happened
 *    after the context was constructed.
 *  - Sound functions are plain module-level functions that receive
 *    the context ref — no useCallback dependency issues.
 */

import React, {
  createContext, useContext, useEffect,
  useRef, useState,
} from 'react';
import API from '../lib/api';
import { socket } from './SocketContext';
import type { Order, WaiterRequest, OrderStatus } from '../types';

// ── Types ────────────────────────────────────────────────────────

interface NotificationContextType {
  readyOrderCount: number;
  waiterCallCount: number;
}

const NotificationContext = createContext<NotificationContextType>({
  readyOrderCount: 0,
  waiterCallCount: 0,
});

// ── Audio helpers (plain functions, no hooks) ────────────────────

function tone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  dur: number,
  gain = 0.2,
) {
  try {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type            = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, startAt);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.01);
  } catch { /* ignore */ }
}

/**
 * Resume the context if needed, then run the play callback.
 * This is the only entry point for playing sounds.
 */
function withAudio(ctx: AudioContext | null, play: (ctx: AudioContext) => void) {
  if (!ctx) return;
  if (ctx.state === 'running') {
    play(ctx);
  } else {
    ctx.resume().then(() => play(ctx)).catch(() => {});
  }
}

function doPlayReady(ctx: AudioContext) {
  const t = ctx.currentTime;
  tone(ctx, 880,  t,        0.28);
  tone(ctx, 1320, t + 0.32, 0.28);
}

function doPlayWaiter(ctx: AudioContext) {
  const t = ctx.currentTime;
  tone(ctx, 1050, t,        0.18, 0.25);
  tone(ctx, 1050, t + 0.23, 0.18, 0.25);
  tone(ctx, 1050, t + 0.46, 0.18, 0.25);
}

// ── Provider ─────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  // Full ID sets — count = set.size, never drifts
  const [readyOrderIds, setReadyOrderIds] = useState<Set<string>>(new Set());
  const [waiterCallIds, setWaiterCallIds] = useState<Set<string>>(new Set());

  // Single AudioContext for the lifetime of the provider
  const ctxRef = useRef<AudioContext | null>(null);

  // ── Create AudioContext once on mount ──────────────────────────
  useEffect(() => {
    try {
      ctxRef.current = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
    } catch {
      ctxRef.current = null;
    }

    return () => {
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── Resume AudioContext on first user gesture ──────────────────
  useEffect(() => {
    const resume = () => {
      if (ctxRef.current && ctxRef.current.state === 'suspended') {
        ctxRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('click',      resume, { once: true });
    window.addEventListener('keydown',    resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
    return () => {
      window.removeEventListener('click',      resume);
      window.removeEventListener('keydown',    resume);
      window.removeEventListener('touchstart', resume);
    };
  }, []);

  // ── Initial data load ──────────────────────────────────────────
  useEffect(() => {
    API.get('/staff/orders').then(res => {
      const orders: Order[] = res.data.data || [];
      setReadyOrderIds(
        new Set(orders.filter(o => o.status === 'READY').map(o => o._id)),
      );
    }).catch(() => {});

    API.get('/waiter-requests').then(res => {
      const reqs: WaiterRequest[] = res.data.data || [];
      setWaiterCallIds(new Set(reqs.map(r => r._id)));
    }).catch(() => {});
  }, []);

  // ── Socket listeners ───────────────────────────────────────────
  useEffect(() => {
    const onStatusUpdated = (payload: { orderId: string; status: OrderStatus }) => {
      if (payload.status === 'READY') {
        setReadyOrderIds(prev => {
          if (prev.has(payload.orderId)) return prev;          // already counted
          withAudio(ctxRef.current, doPlayReady);
          return new Set([...prev, payload.orderId]);
        });
      } else {
        // Order left READY (served / cancelled / rejected)
        setReadyOrderIds(prev => {
          if (!prev.has(payload.orderId)) return prev;
          const next = new Set(prev);
          next.delete(payload.orderId);
          return next;
        });
      }
    };

    const onNewOrder = (order: Order) => {
      if (order.status === 'READY') {
        setReadyOrderIds(prev => {
          if (prev.has(order._id)) return prev;
          withAudio(ctxRef.current, doPlayReady);
          return new Set([...prev, order._id]);
        });
      }
    };

    const onWaiterRequested = (req: any) => {
      const id = String(req._id);
      setWaiterCallIds(prev => {
        if (prev.has(id)) return prev;                        // duplicate guard
        withAudio(ctxRef.current, doPlayWaiter);
        return new Set([...prev, id]);
      });
    };

    const onWaiterUpdated = (payload: { _id: string; status: string }) => {
      if (payload.status === 'COMPLETED') {
        setWaiterCallIds(prev => {
          if (!prev.has(payload._id)) return prev;
          const next = new Set(prev);
          next.delete(payload._id);
          return next;
        });
      }
    };

    socket.on('order_status_updated',    onStatusUpdated);
    socket.on('new_order',               onNewOrder);
    socket.on('waiter_requested',        onWaiterRequested);
    socket.on('waiter_request_updated',  onWaiterUpdated);

    return () => {
      socket.off('order_status_updated',   onStatusUpdated);
      socket.off('new_order',              onNewOrder);
      socket.off('waiter_requested',       onWaiterRequested);
      socket.off('waiter_request_updated', onWaiterUpdated);
    };
  // ctxRef is stable — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NotificationContext.Provider value={{
      readyOrderCount: readyOrderIds.size,
      waiterCallCount: waiterCallIds.size,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
