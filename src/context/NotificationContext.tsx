/**
 * Waiter Notification Context
 *
 * Tracks:
 *  • readyOrderCount  — orders with status READY (shown in sidebar badge)
 *  • waiterCallCount  — active waiter requests    (shown in sidebar badge)
 *
 * Plays audio chimes:
 *  • new READY order  → ascending two-tone chime  (order is ready to serve)
 *  • new waiter call  → urgent triple-beep         (customer needs waiter)
 *
 * Audio is created via Web Audio API — no external files needed.
 * Browsers require a user gesture before audio can play; the context
 * is unlocked on the first click/keydown after the user logs in.
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

function playTone(ctx: AudioContext, freq: number, startAt: number, duration: number, gain = 0.18) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g);
  g.connect(ctx.destination);
  osc.frequency.value = freq;
  g.gain.value        = gain;
  osc.start(startAt);
  osc.stop(startAt + duration);
}

/** Two ascending tones — "order ready" */
function playReadyChime(ctx: AudioContext) {
  const t = ctx.currentTime;
  playTone(ctx, 880, t,        0.22);
  playTone(ctx, 1100, t + 0.25, 0.22);
}

/** Three short urgent beeps — "waiter needed" */
function playWaiterBeep(ctx: AudioContext) {
  const t = ctx.currentTime;
  playTone(ctx, 1000, t,        0.18, 0.22);
  playTone(ctx, 1000, t + 0.22, 0.18, 0.22);
  playTone(ctx, 1000, t + 0.44, 0.18, 0.22);
}

// ── Provider ─────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [readyOrderCount, setReadyOrderCount] = useState(0);
  const [waiterCallCount, setWaiterCallCount] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Unlock AudioContext on first user interaction (browser requirement)
  useEffect(() => {
    const unlock = () => {
      if (!audioCtxRef.current) {
        audioCtxRef.current = createAudioCtx();
      }
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
      const go = () => playReadyChime(ctx);
      ctx.state === 'suspended' ? ctx.resume().then(go).catch(() => {}) : go();
    } catch { /* ignore — audio is best-effort */ }
  }, []);

  const playWaiter = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = createAudioCtx();
      const ctx = audioCtxRef.current;
      const go = () => playWaiterBeep(ctx);
      ctx.state === 'suspended' ? ctx.resume().then(go).catch(() => {}) : go();
    } catch { /* ignore */ }
  }, []);

  // ── Initial data load ──────────────────────────────────────────
  useEffect(() => {
    // Load ready orders count
    API.get('/staff/orders').then(res => {
      const orders: Order[] = res.data.data || [];
      setReadyOrderCount(orders.filter(o => o.status === 'READY').length);
    }).catch(() => {});

    // Load waiter calls count
    API.get('/waiter-requests').then(res => {
      setWaiterCallCount((res.data.data || []).length);
    }).catch(() => {});
  }, []);

  // ── Socket listeners ───────────────────────────────────────────
  useEffect(() => {
    // Order status updated — recalculate ready count
    const onStatusUpdated = (payload: { orderId: string; status: OrderStatus }) => {
      if (payload.status === 'READY') {
        // A new order just became ready — chime + increment
        setReadyOrderCount(c => c + 1);
        playReady();
      } else {
        // Order left READY (served / cancelled) — decrement, floor at 0
        setReadyOrderCount(c => Math.max(0, c - 1));
      }
    };

    // New order arriving already as READY (edge case)
    const onNewOrder = (order: Order) => {
      if (order.status === 'READY') {
        setReadyOrderCount(c => c + 1);
        playReady();
      }
    };

    // New waiter call
    const onWaiterRequested = () => {
      setWaiterCallCount(c => c + 1);
      playWaiter();
    };

    // Waiter call resolved / dismissed
    const onWaiterUpdated = (payload: { _id: string; status: string }) => {
      if (payload.status === 'COMPLETED') {
        setWaiterCallCount(c => Math.max(0, c - 1));
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
    <NotificationContext.Provider value={{ readyOrderCount, waiterCallCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
