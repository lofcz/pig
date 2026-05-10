import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import { enableMapSet } from 'immer';
import type { InvoiceDraft, DraftUserEdits } from '../components/Generator/types';
import { mergeDraftsWithUserEdits } from '../components/Generator/draftCalculation';

// Immer ships Map/Set support as an opt-in plugin. We rely on Maps for
// totalOverrides and userEdits inside drafts, so enable it once at module load.
enableMapSet();

// Single source of truth for everything that participates in the high-traffic
// "edit a card" code path. By moving this state out of Generator.tsx and into
// a zustand store, each InvoiceDraftCard can subscribe to ONLY its own draft
// (plus its own override / editing flag), so a keystroke in one card no longer
// re-renders every other card or the surrounding chrome (header, cauldron).
interface GeneratorState {
  // --- draft slice (data) ---
  drafts: InvoiceDraft[];
  totalOverrides: Map<string, number>;
  userEdits: Map<string, DraftUserEdits>;

  // --- ui slice (per-session UI flags) ---
  editingAmountId: string | null;
  lastInvoicedMonthAbs: number | null;
  lastInvoicedMonthLoading: boolean;

  // --- actions ---
  mergeBaseDrafts: (base: InvoiceDraft[]) => void;
  updateDraft: (id: string, patch: Partial<InvoiceDraft>) => void;
  markDraftDone: (id: string) => void;

  setOverride: (key: string, value: number | null | undefined) => void;
  clearOverrides: () => void;

  trackUserEdit: (id: string, edits: Partial<DraftUserEdits>) => void;
  removeUserEdit: (id: string) => void;
  clearUserEdits: () => void;

  setEditingAmountId: (id: string | null) => void;
  setLastInvoicedMonthAbs: (value: number | null) => void;
  setLastInvoicedMonthLoading: (loading: boolean) => void;

  resetGeneratorState: () => void;
}

const initialState = {
  drafts: [] as InvoiceDraft[],
  totalOverrides: new Map<string, number>(),
  userEdits: new Map<string, DraftUserEdits>(),
  editingAmountId: null as string | null,
  lastInvoicedMonthAbs: null as number | null,
  lastInvoicedMonthLoading: true,
};

export const useGeneratorStore = create<GeneratorState>()(
  immer((set) => ({
    ...initialState,

    mergeBaseDrafts: (base) =>
      set((state) => {
        // mergeDraftsWithUserEdits returns a fresh array; assigning it replaces
        // the slot wholesale. Per-draft identity isn't preserved here (the
        // recalculation path is rare — runs only when config / overrides /
        // last-invoiced changes), so a one-time cascade re-render is fine.
        state.drafts = mergeDraftsWithUserEdits(base, state.drafts, state.userEdits);
      }),

    updateDraft: (id, patch) =>
      set((state) => {
        const draft = state.drafts.find((d) => d.id === id);
        if (!draft) return;
        // Object.assign inside immer mutates only this draft proxy, so other
        // drafts retain their identity and their subscribers don't re-render.
        Object.assign(draft, patch);
      }),

    markDraftDone: (id) =>
      set((state) => {
        const draft = state.drafts.find((d) => d.id === id);
        if (draft) draft.status = 'done';
      }),

    setOverride: (key, value) =>
      set((state) => {
        if (value == null) state.totalOverrides.delete(key);
        else state.totalOverrides.set(key, value);
      }),

    clearOverrides: () =>
      set((state) => {
        state.totalOverrides.clear();
      }),

    trackUserEdit: (id, edits) =>
      set((state) => {
        const existing = state.userEdits.get(id) ?? {};
        state.userEdits.set(id, { ...existing, ...edits });
      }),

    removeUserEdit: (id) =>
      set((state) => {
        state.userEdits.delete(id);
      }),

    clearUserEdits: () =>
      set((state) => {
        state.userEdits.clear();
      }),

    setEditingAmountId: (id) =>
      set((state) => {
        state.editingAmountId = id;
      }),

    setLastInvoicedMonthAbs: (value) =>
      set((state) => {
        state.lastInvoicedMonthAbs = value;
      }),

    setLastInvoicedMonthLoading: (loading) =>
      set((state) => {
        state.lastInvoicedMonthLoading = loading;
      }),

    resetGeneratorState: () =>
      set((state) => {
        state.drafts = [];
        state.totalOverrides = new Map();
        state.userEdits = new Map();
        state.editingAmountId = null;
        state.lastInvoicedMonthAbs = null;
        state.lastInvoicedMonthLoading = true;
      }),
  }))
);

// ============================================
// Selector hooks
// ============================================
// These keep subscribing components subscribed to the smallest possible slice.
// A card calling `useDraft(id)` only re-renders when that one draft's identity
// changes — sibling edits leave it untouched.

export const useDraft = (id: string) =>
  useGeneratorStore((s) => s.drafts.find((d) => d.id === id));

export const useSortedDraftIds = () =>
  useGeneratorStore(
    useShallow((s) =>
      [...s.drafts]
        .sort((a, b) => {
          const aAbs = a.year * 12 + (a.month - 1);
          const bAbs = b.year * 12 + (b.month - 1);
          if (aAbs !== bAbs) return aAbs - bAbs;
          if (a.rulesetId !== b.rulesetId) return a.rulesetId.localeCompare(b.rulesetId);
          return a.index - b.index;
        })
        .map((d) => d.id)
    )
  );

export const useDraftSiblingsInPeriod = (
  rulesetId: string,
  year: number,
  month: number
) =>
  useGeneratorStore(
    useShallow((s) =>
      s.drafts.filter(
        (d) => d.rulesetId === rulesetId && d.year === year && d.month === month
      )
    )
  );

export const useOverride = (key: string) =>
  useGeneratorStore((s) => s.totalOverrides.get(key));

export const useTotalOverrides = () => useGeneratorStore((s) => s.totalOverrides);

export const useIsEditingAmount = (id: string) =>
  useGeneratorStore((s) => s.editingAmountId === id);

export const useDraftCount = () => useGeneratorStore((s) => s.drafts.length);

export const useHasActiveInvoices = () =>
  useGeneratorStore((s) => s.drafts.some((d) => d.status !== 'done'));

export const useDraftsTotalValue = () =>
  useGeneratorStore((s) => s.drafts.reduce((sum, d) => sum + d.amount, 0));

export const useBillingPeriods = () =>
  useGeneratorStore(
    useShallow((s) => {
      // Pick the earliest (year, month) per periodLabel so labels sort
      // chronologically regardless of the order rulesets emitted them in.
      const order = new Map<string, number>();
      for (const d of s.drafts) {
        const key = d.year * 12 + (d.month - 1);
        const existing = order.get(d.periodLabel);
        if (existing === undefined || key < existing) order.set(d.periodLabel, key);
      }
      return Array.from(order.keys()).sort(
        (a, b) => order.get(a)! - order.get(b)!
      );
    })
  );

export const useLastInvoicedMonthAbs = () =>
  useGeneratorStore((s) => s.lastInvoicedMonthAbs);

export const useLastInvoicedMonthLoading = () =>
  useGeneratorStore((s) => s.lastInvoicedMonthLoading);
