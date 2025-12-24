import { useState, useEffect, ReactNode, ComponentType } from 'react';
import { createPortal } from 'react-dom';

export type ModalComponent<TProps, TResult> = ComponentType<TProps & { resolve: (result: TResult) => void }>;

interface ActiveModal {
  id: number;
  Component: ModalComponent<any, any>;
  props: any;
  resolve: (result: any) => void;
}

type Listener = (modals: ActiveModal[]) => void;

class ModalManager {
  private listeners = new Set<Listener>();
  private modals: ActiveModal[] = [];
  private idCounter = 0;

  open<P, R>(Component: ModalComponent<P, R>, props: P): Promise<R> {
    return new Promise((resolve) => {
      const id = ++this.idCounter;
      this.modals = [...this.modals, { id, Component, props, resolve }];
      this.notify();
    });
  }

  close(id: number, result: unknown) {
    const modal = this.modals.find(m => m.id === id);
    if (modal) {
      modal.resolve(result);
      this.modals = this.modals.filter(m => m.id !== id);
      this.notify();
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.modals);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    this.listeners.forEach(l => l(this.modals));
  }
}

const modalManager = new ModalManager();

export function ModalProvider({ children }: { children: ReactNode }) {
  const [activeModals, setActiveModals] = useState<ActiveModal[]>([]);

  useEffect(() => {
    return modalManager.subscribe(setActiveModals);
  }, []);

  return (
    <>
      {children}
      {activeModals.map(({ id, Component, props }) =>
        createPortal(
          <Component
            key={id}
            {...props}
            resolve={(result: unknown) => modalManager.close(id, result)}
          />,
          document.body
        )
      )}
    </>
  );
}

export const modal = {
  open: <TProps, TResult>(
    Component: ModalComponent<TProps, TResult>,
    props: TProps
  ): Promise<TResult> => {
    return modalManager.open(Component, props);
  }
};