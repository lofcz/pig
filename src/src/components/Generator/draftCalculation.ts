import { useMemo, MutableRefObject } from 'react';
import { Config } from '../../types';
import { absMonth, getMonthDates, monthFromAbs, yearFromAbs } from '../../utils/logic';
import { InvoiceDraft, DraftUserEdits } from './types';
import { isBillingMonth, getInvoiceLabel } from './utils';

interface UseBaseDraftsOptions {
  config: Config;
  currentDate: Date;
  lastInvoicedMonthAbs: number | null;
  lastInvoicedMonthLoading: boolean;
  totalOverrides: Map<string, number>;
  calculatedTotalsRef: MutableRefObject<Map<string, number>>;
  computedBaseTotalsRef: MutableRefObject<Map<string, number>>;
}

/**
 * Hook that calculates base invoice drafts from config and rulesets.
 * This handles the complex billing logic including:
 * - Multi-period accumulation
 * - Invoice splitting based on maxValue
 * - Minimize invoices mode (carry forward)
 * - Override handling
 */
export function useBaseDrafts({
  config,
  currentDate,
  lastInvoicedMonthAbs,
  lastInvoicedMonthLoading,
  totalOverrides,
  calculatedTotalsRef,
  computedBaseTotalsRef,
}: UseBaseDraftsOptions): InvoiceDraft[] {
  return useMemo(() => {
    if (lastInvoicedMonthLoading) return [];

    const newDrafts: InvoiceDraft[] = [];
    const currentMonthAbs = absMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);

    // Rebuild calculated totals each run (used for effective override detection + reset UI)
    calculatedTotalsRef.current.clear();
    computedBaseTotalsRef.current.clear();

    for (const ruleset of config.rulesets) {
      const cutoffDay = ruleset.entitlementDay;
      // End of billable range: previous full month (or two months back if we
      // haven't passed the entitlement cutoff yet this month).
      const endMonthAbs = currentDate.getDate() > cutoffDay
        ? currentMonthAbs - 1
        : currentMonthAbs - 2;

      // Start of billable range: month after the last invoiced one. When no
      // invoices exist anywhere, fall back to January of the year endMonthAbs
      // lives in — preserves the "fresh install in early January catches up
      // the whole previous year" behavior.
      const startMonthAbs = lastInvoicedMonthAbs !== null
        ? lastInvoicedMonthAbs + 1
        : absMonth(yearFromAbs(endMonthAbs), 1);

      if (startMonthAbs > endMonthAbs) continue;

      const maxValue = ruleset.maxInvoiceValue;

      // Compute the last billing month in-range; "flush" means "last billing period", not "endMonthAbs"
      let lastBillingMonthAbs: number | null = null;
      for (let mAbs = startMonthAbs; mAbs <= endMonthAbs; mAbs++) {
        if (isBillingMonth(monthFromAbs(mAbs), ruleset)) lastBillingMonthAbs = mAbs;
      }
      if (lastBillingMonthAbs === null) continue;

      // PASS 1: calculate baseline (no override) totals for each billing period (used for UI reset + effective override)
      {
        let accum = 0;
        for (let mAbs = startMonthAbs; mAbs <= endMonthAbs; mAbs++) {
          const billingYear = yearFromAbs(mAbs);
          const m = monthFromAbs(mAbs);
          const dateStr = `${billingYear}-${m.toString().padStart(2, '0')}`;
          const salaryRule = ruleset.salaryRules.find(r => dateStr >= r.startDate && dateStr <= r.endDate)
            || { value: 0, deduction: 0 };
          accum += salaryRule.value - salaryRule.deduction;

          if (!isBillingMonth(m, ruleset)) continue;

          const periodKey = `${ruleset.id}-${billingYear}-${m}`;
          calculatedTotalsRef.current.set(periodKey, accum);

          let remaining = accum;
          while (maxValue && remaining >= maxValue) remaining -= maxValue;

          const isFlush = mAbs === lastBillingMonthAbs;
          if (remaining > 0 && ruleset.minimizeInvoices && maxValue && !isFlush) {
            accum = remaining;
          } else {
            accum = 0;
          }
        }
      }

      // PASS 2: generate drafts, applying overrides (overrides affect carryover, but still follow minimize+flush rules)
      {
        let accum = 0;
        let periodOwnSalary = 0;
        for (let mAbs = startMonthAbs; mAbs <= endMonthAbs; mAbs++) {
          const billingYear = yearFromAbs(mAbs);
          const m = monthFromAbs(mAbs);
          const dateStr = `${billingYear}-${m.toString().padStart(2, '0')}`;
          const salaryRule = ruleset.salaryRules.find(r => dateStr >= r.startDate && dateStr <= r.endDate)
            || { value: 0, deduction: 0 };

          const monthContribution = salaryRule.value - salaryRule.deduction;
          accum += monthContribution;
          periodOwnSalary += monthContribution;

          if (!isBillingMonth(m, ruleset)) continue;

          const periodKey = `${ruleset.id}-${billingYear}-${m}`;
          const currentPeriodBaseSalary = periodOwnSalary;
          computedBaseTotalsRef.current.set(periodKey, currentPeriodBaseSalary);

          const overrideValue = totalOverrides.get(periodKey);
          const hasEffectiveOverride = overrideValue !== undefined && overrideValue !== currentPeriodBaseSalary;

          const carryover = accum - currentPeriodBaseSalary;
          const effectivePeriodSalary = hasEffectiveOverride ? overrideValue! : currentPeriodBaseSalary;
          const periodTotal = carryover + effectivePeriodSalary;
          accum = periodTotal;

          const isFlush = mAbs === lastBillingMonthAbs;

          // Generate maxValue chunks
          // In flush period: generate ALL chunks (labeled as "Remainder 1/N", etc.)
          // In non-flush with minimizeInvoices: generate only ONE chunk, carry rest forward
          let partIndex = 0;
          while (maxValue && accum >= maxValue) {
            if (ruleset.minimizeInvoices && !isFlush && partIndex > 0) {
              break;
            }

            const amount = maxValue;
            accum -= amount;

            const { invoiceNo } = getMonthDates(billingYear, m, partIndex);
            const desc = ruleset.descriptions && ruleset.descriptions.length > 0
              ? ruleset.descriptions[Math.floor(Math.random() * ruleset.descriptions.length)]
              : "Služby";

            const periodLabel = getInvoiceLabel(billingYear, m, ruleset);
            let label = `${periodLabel} (${ruleset.name})`;

            if (isFlush) {
              const totalParts = maxValue ? Math.ceil(periodTotal / maxValue) : 1;
              if (totalParts > 1 && partIndex > 0) {
                const remCount = totalParts - 1;
                label += remCount === 1 ? " Remainder" : ` Remainder ${partIndex}/${remCount}`;
              }
            } else if (partIndex > 0) {
              label += ` Part ${partIndex + 1}`;
            }

            newDrafts.push({
              id: `${ruleset.id}-${billingYear}-${m}-${partIndex}`,
              rulesetId: ruleset.id,
              year: billingYear,
              month: m,
              index: partIndex,
              amount,
              description: desc,
              invoiceNoOverride: invoiceNo,
              variableSymbolOverride: invoiceNo,
              status: 'pending',
              label,
              periodLabel,
              monthSalary: periodTotal,
              periodBaseSalary: currentPeriodBaseSalary,
              extraValue: undefined
            });
            partIndex++;
          }

          if (accum > 0) {
            const overrideBelowMax = hasEffectiveOverride && maxValue && periodTotal < maxValue;
            const shouldCarry = !overrideBelowMax && ruleset.minimizeInvoices && maxValue && !isFlush;
            if (shouldCarry) {
              periodOwnSalary = 0;
              continue;
            }

            const amount = Math.round(accum);
            accum = 0;

            const { invoiceNo } = getMonthDates(billingYear, m, partIndex);
            const desc = ruleset.descriptions && ruleset.descriptions.length > 0
              ? ruleset.descriptions[Math.floor(Math.random() * ruleset.descriptions.length)]
              : "Služby";

            const periodLabel = getInvoiceLabel(billingYear, m, ruleset);
            let label = `${periodLabel} (${ruleset.name})`;

            if (isFlush) {
              const totalParts = maxValue ? Math.ceil(periodTotal / maxValue) : 1;
              if (totalParts > 1 && partIndex > 0) {
                const remCount = totalParts - 1;
                label += remCount === 1 ? " Remainder" : ` Remainder ${partIndex}/${remCount}`;
              }
            } else if (partIndex > 0) {
              label += ` Part ${partIndex + 1}`;
            }

            newDrafts.push({
              id: `${ruleset.id}-${billingYear}-${m}-${partIndex}`,
              rulesetId: ruleset.id,
              year: billingYear,
              month: m,
              index: partIndex,
              amount,
              description: desc,
              invoiceNoOverride: invoiceNo,
              variableSymbolOverride: invoiceNo,
              status: 'pending',
              label,
              periodLabel,
              monthSalary: periodTotal,
              periodBaseSalary: currentPeriodBaseSalary,
              extraValue: undefined
            });
            periodOwnSalary = 0;
          } else {
            accum = 0;
            periodOwnSalary = 0;
          }
        }
      }
    }

    return newDrafts;
  }, [lastInvoicedMonthLoading, lastInvoicedMonthAbs, config, currentDate, totalOverrides]);
}

/**
 * Applies extra value to base drafts by modifying the last month's drafts.
 * Extra value is only applied to the first ruleset.
 */
export function applyExtraValueToDrafts(
  base: InvoiceDraft[],
  extraValue: number,
  config: Config
): InvoiceDraft[] {
  if (base.length === 0) return [];
  
  // Find drafts for first ruleset (extra value only applies to first ruleset)
  const firstRulesetId = config.rulesets[0]?.id;
  if (!firstRulesetId) return base;
  
  // Separate first ruleset drafts from others
  const firstRulesetDrafts = base.filter(d => d.rulesetId === firstRulesetId);
  const otherDrafts = base.filter(d => d.rulesetId !== firstRulesetId);
  
  if (firstRulesetDrafts.length === 0) return base;
  
  // Find the last month's drafts in first ruleset (where extra value applies)
  const lastMonth = Math.max(...firstRulesetDrafts.map(d => d.month));
  const lastMonthDrafts = firstRulesetDrafts.filter(d => d.month === lastMonth);
  const earlierDrafts = firstRulesetDrafts.filter(d => d.month < lastMonth);
  
  if (lastMonthDrafts.length === 0) return base;
  
  // Calculate total base value for last month
  const baseTotal = lastMonthDrafts.reduce((sum, d) => sum + d.amount, 0);
  const newTotal = baseTotal + extraValue;
  
  // Get template from first draft for creating new ones
  const template = lastMonthDrafts[0];
  const year = template.year;
  const month = template.month;
  const ruleset = config.rulesets.find(r => r.id === firstRulesetId)!;
  const maxValue = ruleset.maxInvoiceValue; // undefined means no splitting
  
  const newLastMonthDrafts: InvoiceDraft[] = [];
  
  // If no maxValue set, create a single invoice with the total
  if (!maxValue) {
    const { invoiceNo } = getMonthDates(year, month, 0);
    const periodLabel = getInvoiceLabel(year, month, ruleset);
    const label = `${periodLabel} (${ruleset.name})`;
    
    newLastMonthDrafts.push({
      id: `${firstRulesetId}-${year}-${month}-0`,
      rulesetId: firstRulesetId,
      year,
      month,
      index: 0,
      amount: Math.round(newTotal),
      description: template.description,
      invoiceNoOverride: invoiceNo,
      variableSymbolOverride: invoiceNo,
      status: 'pending',
      label,
      periodLabel,
      monthSalary: template.monthSalary,
      periodBaseSalary: template.periodBaseSalary,
      extraValue: extraValue > 0 ? extraValue : undefined
    });
  } else {
    // Determine how many full invoices and remainder
    const fullInvoiceCount = Math.floor(newTotal / maxValue);
    const remainder = newTotal % maxValue;
    const totalParts = fullInvoiceCount + (remainder > 0 ? 1 : 0);
    const remCount = totalParts - 1; // Number of invoices after the first one
    
    let extraRemaining = extraValue;
    let baseRemaining = baseTotal;
    
    // Create full invoices
    for (let i = 0; i < fullInvoiceCount; i++) {
      const amount = maxValue;
      
      // Calculate how much extra is in this invoice
      let draftExtra = 0;
      if (baseRemaining >= amount) {
        draftExtra = 0;
        baseRemaining -= amount;
      } else {
        draftExtra = amount - Math.max(0, baseRemaining);
        baseRemaining = 0;
        extraRemaining -= draftExtra;
      }
      
      const { invoiceNo } = getMonthDates(year, month, i);
      const periodLabel = getInvoiceLabel(year, month, ruleset);
      
      // This is the flush period, use "Remainder X/Y" labeling
      let label = `${periodLabel} (${ruleset.name})`;
      if (i > 0 && remCount > 0) {
        label += remCount === 1 ? " Remainder" : ` Remainder ${i}/${remCount}`;
      }
      
      newLastMonthDrafts.push({
        id: `${firstRulesetId}-${year}-${month}-${i}`,
        rulesetId: firstRulesetId,
        year,
        month,
        index: i,
        amount,
        description: template.description,
        invoiceNoOverride: invoiceNo,
        variableSymbolOverride: invoiceNo,
        status: 'pending',
        label,
        periodLabel,
        monthSalary: template.monthSalary,
        periodBaseSalary: template.periodBaseSalary,
        extraValue: draftExtra > 0 ? draftExtra : undefined
      });
    }
    
    // Create remainder invoice if any
    if (remainder > 0) {
      const partIndex = fullInvoiceCount;
      const { invoiceNo } = getMonthDates(year, month, partIndex);
      const periodLabel = getInvoiceLabel(year, month, ruleset);
      
      // This is the flush period, use "Remainder X/Y" labeling
      let label = `${periodLabel} (${ruleset.name})`;
      if (partIndex > 0 && remCount > 0) {
        label += remCount === 1 ? " Remainder" : ` Remainder ${partIndex}/${remCount}`;
      }
      
      // All remaining extra goes to remainder
      const draftExtra = extraRemaining > 0 ? Math.min(extraRemaining, remainder) : undefined;
      
      newLastMonthDrafts.push({
        id: `${firstRulesetId}-${year}-${month}-${partIndex}`,
        rulesetId: firstRulesetId,
        year,
        month,
        index: partIndex,
        amount: Math.round(remainder),
        description: template.description,
        invoiceNoOverride: invoiceNo,
        variableSymbolOverride: invoiceNo,
        status: 'pending',
        label,
        periodLabel,
        monthSalary: template.monthSalary,
        periodBaseSalary: template.periodBaseSalary,
        extraValue: draftExtra
      });
    }
  }
  
  return [...earlierDrafts, ...newLastMonthDrafts, ...otherDrafts];
}

/**
 * Merges new drafts with existing drafts, preserving user edits and status.
 */
export function mergeDraftsWithUserEdits(
  newDrafts: InvoiceDraft[],
  existingDrafts: InvoiceDraft[],
  userEdits: Map<string, DraftUserEdits>
): InvoiceDraft[] {
  const existingMap = new Map(existingDrafts.map(d => [d.id, d]));
  
  return newDrafts.map(newDraft => {
    const existing = existingMap.get(newDraft.id);
    const edits = userEdits.get(newDraft.id);
    
    if (existing) {
      return {
        ...newDraft,
        invoiceNoOverride: edits?.invoiceNoOverride ?? existing.invoiceNoOverride,
        variableSymbolOverride: edits?.variableSymbolOverride ?? existing.variableSymbolOverride,
        description: edits?.description ?? existing.description,
        status: existing.status
      };
    } else if (edits) {
      return {
        ...newDraft,
        invoiceNoOverride: edits.invoiceNoOverride ?? newDraft.invoiceNoOverride,
        variableSymbolOverride: edits.variableSymbolOverride ?? newDraft.variableSymbolOverride,
        description: edits.description ?? newDraft.description
      };
    }
    
    return newDraft;
  });
}
