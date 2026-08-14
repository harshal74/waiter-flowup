/**
 * Waiter Notification Context
 *
 * Tracks ready-order and waiter-call counts by maintaining the full
 * list of IDs in state — never incrementing/decrementing counters
 * which drift when socket events arrive out of order or are missed.
 *
 * Audio chimes:
 *  • new READY order  → ascending two-tone chime
 *  • new waiter call  → urgent triple-beep
 */

import React, {
  createContext, useContext, useEffect,
  useRef, useState, useCallback,
} from 'react';
import API from '../lib/api';
import { socket } from './SocketContext';
import type { Order, WaiterRequest, OrderStatus } from '../types';

interface NotificationContextType {
  readyOrderCount: number;
  waiterCallCount: number;
}

const NotificationContext = createContext<NotificationContextType>({
  readyOrderCount: 0,
  waiterCallCount: 0,
});

// ── Web Audio helpers ────────────────────────────────────────────

function createAudioCtx(): AudioContext {
  return new (window.AudioContext || (window as any).webkitAudioContext)();
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  gain = 0.18,
) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.frequency.value = freq;
  g.gain.value        = gain;
  osc.start(startAt);
  osc.stop(startAt + duration);
}

/** Two ascending tones — "order ready to serve" */
function playReadyChime(ctx: AudioContext) {
  const t = ctx.currentTime;
  playTone(ctx, 880,  t,        0.22);
  playTone(ctx, 1100, t + 0.25, 0.22);
}

/** Three short urgent beeps — "customer needs waiter" */
function playWaiterBeep(ctx: AudioContext) {
  const t = ctx.currentTime;
  playTone(ctx, 1000, t,        0.18, 0.22);
  playTone(ctx, 1000, t + 0.22, 0.18, 0.22);
  playTone(ctx, 1000, t + 0.44, 0.18, 0.22);
}

// ── Provider ─────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  // Store full sets of IDs so the count is always exact — never drifts
  const [readyOrderIds,  setReadyOrderIds]  = useState<Set<string>>(new Set());
  const [waiterCallIds,  setWaiterCallIds]  = useState<Set<string>>(new Set());

  const audioCtxRef = useRef<AudioContext | null>(null);

  // ── Unlock AudioContext on first user interaction ──────────────
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('click',      unlock, { once: true });
    window.addEventListener('keydown',    unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click',      unlock);
      window.removeEventListener('keydown',    unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  const playReady = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
      const ctx = audioCtxRef.current;
      const go  = () => playReadyChime(ctx);
      ctx.state === 'suspended' ? ctx.resume().then(go).catch(() => {}) : go();
    } catch { /* audio is best-effort */ }
  }, []);

  const playWaiter = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
      const ctx = audioCtxRef.current;
      const go  = () => playWaiterBeep(ctx);
      ctx.state === 'suspended' ? ctx.resume().then(go).catch(() => {}) : go();
    } catch { /* audio is best-effort */ }
  }, []);

  // ── Initial data load (source of truth) ───────────────────────
  useEffect(() => {
    API.get('/staff/orders').then(res => {
      const orders: Order[] = res.data.data || [];
      const ids = new Set(
        orders.filter(o => o.status === 'READY').map(o => o._id),
      );
      setReadyOrderIds(ids);
    }).catch(() => {});

    API.get('/waiter-requests').then(res => {
      const reqs: WaiterRequest[] = res.data.data || [];
      setWaiterCallIds(new Set(reqs.map(r => r._id)));
    }).catch(() => {});
  }, []);

  // ── Socket listeners ───────────────────────────────────────────
  useEffect(() => {
    // Order status changed
    const onStatusUpdated = (payload: { orderId: string; status: OrderStatus }) => {
      setReadyOrderIds(prev => {
        const next = new Set(prev);
        if (payload.status === 'READY') {
          if (!next.has(payload.orderId)) {
            // Genuinely new READY order → chime
            next.add(payload.orderId);
            playReady();
          }
        } else {
          next.delete(payload.orderId);
        }
        return next;
      });
    };

    // Brand-new order arriving (edge case: already READY on create)
    const onNewOrder = (order: Order) => {
      if (order.status === 'READY') {
        setReadyOrderIds(prev => {
          if (prev.has(order._id)) return prev;
          playReady();
          return new Set([...prev, order._id]);
        });
      }
    };

    // New waiter call
    const onWaiterRequested = (req: any) => {
      const id = String(req._id);
      setWaiterCallIds(prev => {
        if (prev.has(id)) return prev;
        playWaiter();
        return new Set([...prev, id]);
      });
    };

    // Waiter call resolved / dismissed
    const onWaiterUpdated = (payload: { _id: string; status: string }) => {
      if (payload.status === 'COMPLETED') {
        setWaiterCallIds(prev => {
          const next = new Set(prev);
          next.delete(payload._id);
          return next;
        });
      }
    };

    socket.on('order_status_updated',   onStatusUpdated);
    socket.on('new_order',              onNewOrder);
    socket.on('waiter_requested',       onWaiterRequested);
    socket.on('waiter_request_updated', onWaiterUpdated);

    return () => {
      socket.off('order_status_updated',   onStatusUpdated);
      socket.off('new_order',              onNewOrder);
      socket.off('waiter_requested',       onWaiterRequested);
      socket.off('waiter_request_updated', onWaiterUpdated);
    };
  }, [playReady, playWaiter]);

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
