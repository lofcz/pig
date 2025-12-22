import { useEffect, useRef } from 'react';

type EventMap = WindowEventMap & DocumentEventMap & HTMLElementEventMap;

interface UseEventListenerOptions<K extends keyof EventMap> {
  /** Event type */
  type: K;
  /** Event handler */
  handler: (event: EventMap[K]) => void;
  /** Target element (defaults to window) */
  target?: EventTarget | null;
  /** Whether the listener is active */
  enabled?: boolean;
  /** Event listener options */
  options?: AddEventListenerOptions;
}

/**
 * Hook for managing event listeners with automatic cleanup via AbortController.
 * 
 * @example
 * useEventListener({
 *   type: 'keydown',
 *   handler: (e) => { if (e.key === 'Escape') onClose(); },
 *   enabled: isOpen
 * });
 */
export function useEventListener<K extends keyof EventMap>({
  type,
  handler,
  target,
  enabled = true,
  options
}: UseEventListenerOptions<K>) {
  // Keep handler ref stable to avoid re-attaching listeners
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const targetElement = target ?? window;
    const controller = new AbortController();

    targetElement.addEventListener(
      type,
      ((e: Event) => handlerRef.current(e as EventMap[K])) as EventListener,
      { ...options, signal: controller.signal }
    );

    return () => controller.abort();
  }, [type, target, enabled, options?.capture, options?.passive]);
}

/**
 * Hook for multiple event listeners with shared cleanup.
 */
export function useEventListeners(
  listeners: Array<Omit<UseEventListenerOptions<keyof EventMap>, 'enabled'>>,
  enabled: boolean = true
) {
  const listenersRef = useRef(listeners);
  listenersRef.current = listeners;

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();

    for (const { type, handler, target, options } of listenersRef.current) {
      const targetElement = target ?? window;
      targetElement.addEventListener(
        type,
        handler as EventListener,
        { ...options, signal: controller.signal }
      );
    }

    return () => controller.abort();
  }, [enabled]);
}

