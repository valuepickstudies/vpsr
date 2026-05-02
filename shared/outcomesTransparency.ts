/** Shared copy for outcomes aggregates and reader-facing methodology (API + UI). */
export const OUTCOMES_METHODOLOGY = {
  hitDefinition:
    'A "hit" counts when forward return (status ok) is strictly positive: from the first daily close on or after the saved-report timestamp to the horizon date.',
  entryRule:
    "Entry price is the first available daily close on or after the report time (outcomes refresh). Slippage, gaps, and liquidity are not modeled.",
  benchmarkNote:
    "These aggregates are raw stock returns across saved reports, not excess return vs Nifty 50 or S&P 500. Use them as a coarse track record, not alpha attribution.",
} as const;

export type OutcomesMethodology = typeof OUTCOMES_METHODOLOGY;
