export type StrategyId = "high_risk" | "medium_risk" | "low_risk" | "dividend";

export type StrategyStock = {
  symbol: string;
  name: string;
  thesis: string;
  methodology: string;
};

export type StrategyPortfolio = {
  id: StrategyId;
  title: string;
  subtitle: string;
  riskLabel: "High" | "Medium" | "Low" | "Income";
  summary: string;
  researchNotes: string[];
  stocks: StrategyStock[];
};

export const STRATEGY_PORTFOLIOS: StrategyPortfolio[] = [
  {
    id: "high_risk",
    title: "High risk - growth & cyclical alpha",
    subtitle: "Momentum, revisions, and higher-beta sectors",
    riskLabel: "High",
    summary: "Higher-volatility basket focused on growth, cyclicals, and platform-led businesses.",
    researchNotes: [
      "Momentum + earnings visibility tilt.",
      "Cyclical exposure via metals, autos, and infrastructure.",
      "Platform optionality carries valuation risk.",
    ],
    stocks: [
      { symbol: "ZOMATO.NS", name: "Zomato", thesis: "Operating leverage in food delivery.", methodology: "Growth platform" },
      { symbol: "PAYTM.NS", name: "One97 (Paytm)", thesis: "Payments-to-credit optionality.", methodology: "Fintech optionality" },
      { symbol: "POLICYBZR.NS", name: "PB Fintech", thesis: "Insurance marketplace leadership.", methodology: "Marketplace growth" },
      { symbol: "TRENT.NS", name: "Trent", thesis: "Retail scale and private labels.", methodology: "Consumer growth" },
      { symbol: "DIXON.NS", name: "Dixon", thesis: "EMS tailwinds and PLI.", methodology: "Manufacturing growth" },
      { symbol: "CDSL.NS", name: "CDSL", thesis: "Capital market participation proxy.", methodology: "Asset-light platform" },
      { symbol: "ADANIENT.NS", name: "Adani Enterprises", thesis: "Incubation optionality.", methodology: "High beta thematic" },
      { symbol: "ADANIPORTS.NS", name: "Adani Ports", thesis: "Logistics throughput growth.", methodology: "Cyclical infra" },
      { symbol: "JSWSTEEL.NS", name: "JSW Steel", thesis: "Steel cycle upside.", methodology: "Commodity cyclical" },
      { symbol: "TATASTEEL.NS", name: "Tata Steel", thesis: "Global steel spreads.", methodology: "Commodity cyclical" },
      { symbol: "HINDALCO.NS", name: "Hindalco", thesis: "Metals + downstream mix.", methodology: "Commodity mix" },
      { symbol: "VEDL.NS", name: "Vedanta", thesis: "Cash generation with volatility.", methodology: "High-yield cyclical" },
      { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", thesis: "Retail lending scale.", methodology: "Financial growth" },
      { symbol: "M&M.NS", name: "M&M", thesis: "Auto and farm cycle.", methodology: "Cyclical demand" },
      { symbol: "TITAN.NS", name: "Titan", thesis: "Brand-led premiumization.", methodology: "Quality growth" },
      { symbol: "NAUKRI.NS", name: "Info Edge", thesis: "Classifieds and internet optionality.", methodology: "Platform holdings" },
      { symbol: "INDIGO.NS", name: "InterGlobe Aviation", thesis: "Air travel demand recovery.", methodology: "Cyclical operating leverage" },
      { symbol: "PIIND.NS", name: "PI Industries", thesis: "Export-oriented agchem growth.", methodology: "Specialty growth" },
      { symbol: "KEI.NS", name: "KEI Industries", thesis: "Cables and infra demand.", methodology: "Capex linkage" },
      { symbol: "ASTRAL.NS", name: "Astral", thesis: "Building products compounding.", methodology: "Quality compounder" },
      { symbol: "LALPATHLAB.NS", name: "Dr Lal PathLabs", thesis: "Diagnostics expansion.", methodology: "Healthcare growth" },
      { symbol: "IRCTC.NS", name: "IRCTC", thesis: "Travel and services monetization.", methodology: "Consumer cyclical" },
    ],
  },
  {
    id: "medium_risk",
    title: "Medium risk - core quality blend",
    subtitle: "Large-cap quality and GARP balance",
    riskLabel: "Medium",
    summary: "Diversified core basket with financials, IT, consumer, and industrial leaders.",
    researchNotes: [
      "ROE/ROIC-aware quality bias.",
      "Reasonable growth at reasonable valuations.",
      "Sector diversification for lower concentration risk.",
    ],
    stocks: [
      { symbol: "HDFCBANK.NS", name: "HDFC Bank", thesis: "Retail franchise strength.", methodology: "Quality financial" },
      { symbol: "ICICIBANK.NS", name: "ICICI Bank", thesis: "Sustained ROE expansion.", methodology: "Quality financial" },
      { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", thesis: "Conservative balance sheet.", methodology: "Quality financial" },
      { symbol: "SBIN.NS", name: "SBI", thesis: "Scale and credit cycle.", methodology: "Turnaround + scale" },
      { symbol: "AXISBANK.NS", name: "Axis Bank", thesis: "Retailization and operating leverage.", methodology: "GARP financial" },
      { symbol: "INFY.NS", name: "Infosys", thesis: "Cash generation consistency.", methodology: "Quality IT" },
      { symbol: "TCS.NS", name: "TCS", thesis: "Scale, margins, and stability.", methodology: "Quality IT" },
      { symbol: "HCLTECH.NS", name: "HCL Tech", thesis: "Services + software profile.", methodology: "Cash-rich IT" },
      { symbol: "TECHM.NS", name: "Tech Mahindra", thesis: "Comms/enterprise recovery.", methodology: "Cyclical IT" },
      { symbol: "WIPRO.NS", name: "Wipro", thesis: "Turnaround optionality.", methodology: "Value IT" },
      { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", thesis: "ARPU expansion.", methodology: "Oligopoly telecom" },
      { symbol: "RELIANCE.NS", name: "Reliance", thesis: "Energy + retail + digital mix.", methodology: "Conglomerate quality" },
      { symbol: "HINDUNILVR.NS", name: "HUL", thesis: "FMCG moat.", methodology: "Defensive quality" },
      { symbol: "ITC.NS", name: "ITC", thesis: "Cash returns + FMCG optionality.", methodology: "Value + yield" },
      { symbol: "ASIANPAINT.NS", name: "Asian Paints", thesis: "Pricing power leadership.", methodology: "Quality compounder" },
      { symbol: "MARUTI.NS", name: "Maruti", thesis: "Passenger vehicle cycle.", methodology: "Cyclical leader" },
      { symbol: "ULTRACEMCO.NS", name: "UltraTech", thesis: "Cement scale economics.", methodology: "Infra cycle" },
      { symbol: "LT.NS", name: "L&T", thesis: "Orderbook visibility.", methodology: "Capex proxy" },
      { symbol: "NTPC.NS", name: "NTPC", thesis: "Power demand and transition.", methodology: "Utility anchor" },
      { symbol: "POWERGRID.NS", name: "Power Grid", thesis: "Regulated return model.", methodology: "Utility yield" },
      { symbol: "ONGC.NS", name: "ONGC", thesis: "Commodity-linked earnings.", methodology: "Energy cyclical" },
      { symbol: "TATACONSUM.NS", name: "Tata Consumer", thesis: "Brand and distribution growth.", methodology: "Consumer growth" },
    ],
  },
  {
    id: "low_risk",
    title: "Low risk - defensive quality",
    subtitle: "Staples, utilities, pharma, and stable cash flows",
    riskLabel: "Low",
    summary: "Lower-beta profile with resilient demand sectors and strong franchises.",
    researchNotes: [
      "Demand stability over cyclicality.",
      "Balance-sheet durability first.",
      "Quality and payout consistency bias.",
    ],
    stocks: [
      { symbol: "NESTLEIND.NS", name: "Nestle India", thesis: "Premium staples resilience.", methodology: "Defensive staple" },
      { symbol: "DABUR.NS", name: "Dabur", thesis: "Home and personal care demand.", methodology: "Defensive staple" },
      { symbol: "COLPAL.NS", name: "Colgate", thesis: "Oral care category leadership.", methodology: "Defensive staple" },
      { symbol: "BRITANNIA.NS", name: "Britannia", thesis: "Packaged foods scale.", methodology: "Defensive staple" },
      { symbol: "PIDILITIND.NS", name: "Pidilite", thesis: "Adhesives moat.", methodology: "Quality compounder" },
      { symbol: "BERGEPAINT.NS", name: "Berger Paints", thesis: "Paint demand consistency.", methodology: "Defensive quality" },
      { symbol: "POWERGRID.NS", name: "Power Grid", thesis: "Regulated utility cash flows.", methodology: "Utility low beta" },
      { symbol: "NTPC.NS", name: "NTPC", thesis: "Utility stability.", methodology: "Utility anchor" },
      { symbol: "COALINDIA.NS", name: "Coal India", thesis: "Cash generation and payout.", methodology: "Yield defensive" },
      { symbol: "DRREDDY.NS", name: "Dr Reddy's", thesis: "Pharma defensiveness.", methodology: "Healthcare defensive" },
      { symbol: "SUNPHARMA.NS", name: "Sun Pharma", thesis: "Scale in domestic and US.", methodology: "Healthcare defensive" },
      { symbol: "CIPLA.NS", name: "Cipla", thesis: "Respiratory strength.", methodology: "Healthcare defensive" },
      { symbol: "DIVISLAB.NS", name: "Divi's", thesis: "API scale and margins.", methodology: "Quality pharma" },
      { symbol: "APOLLOHOSP.NS", name: "Apollo Hospitals", thesis: "Healthcare structural demand.", methodology: "Healthcare growth defensive" },
      { symbol: "HDFCBANK.NS", name: "HDFC Bank", thesis: "Stable franchise quality.", methodology: "Quality anchor" },
      { symbol: "KOTAKBANK.NS", name: "Kotak", thesis: "Conservative underwriting.", methodology: "Quality anchor" },
      { symbol: "INFY.NS", name: "Infosys", thesis: "Cash-rich IT stability.", methodology: "Quality anchor" },
      { symbol: "TCS.NS", name: "TCS", thesis: "Earnings resilience.", methodology: "Quality anchor" },
      { symbol: "CONCOR.NS", name: "CONCOR", thesis: "Logistics moat.", methodology: "Infra defensive" },
      { symbol: "MCDOWELL-N.NS", name: "United Spirits", thesis: "Consumer premiumization.", methodology: "Consumer defensive" },
      { symbol: "GODREJCP.NS", name: "Godrej Consumer", thesis: "Household category breadth.", methodology: "Defensive staple" },
      { symbol: "ASIANPAINT.NS", name: "Asian Paints", thesis: "Long-duration brand moat.", methodology: "Quality compounder" },
    ],
  },
  {
    id: "dividend",
    title: "Dividend income tilt",
    subtitle: "Cash-return focused basket",
    riskLabel: "Income",
    summary: "Blend of PSU yield plays and cash-rich private franchises.",
    researchNotes: [
      "Dividend yield and payout consistency focus.",
      "Balances high-yield cyclicals with stable cash generators.",
      "Still equity risk; not a fixed-income replacement.",
    ],
    stocks: [
      { symbol: "COALINDIA.NS", name: "Coal India", thesis: "High payout policy.", methodology: "PSU yield" },
      { symbol: "IOC.NS", name: "IOC", thesis: "Scale and payout profile.", methodology: "Energy yield" },
      { symbol: "BPCL.NS", name: "BPCL", thesis: "Marketing + yield support.", methodology: "PSU yield" },
      { symbol: "ONGC.NS", name: "ONGC", thesis: "Upstream cash generation.", methodology: "Energy yield" },
      { symbol: "OIL.NS", name: "Oil India", thesis: "Cash returns.", methodology: "Energy yield" },
      { symbol: "GAIL.NS", name: "GAIL", thesis: "Transmission cash flows.", methodology: "Utility-like yield" },
      { symbol: "POWERGRID.NS", name: "Power Grid", thesis: "Stable dividends.", methodology: "Utility yield" },
      { symbol: "NTPC.NS", name: "NTPC", thesis: "Utility payouts.", methodology: "Utility yield" },
      { symbol: "REC.NS", name: "REC", thesis: "Financial yield profile.", methodology: "PSU finance yield" },
      { symbol: "PFC.NS", name: "PFC", thesis: "Power project financing payouts.", methodology: "PSU finance yield" },
      { symbol: "ITC.NS", name: "ITC", thesis: "Consistent payout track.", methodology: "Dividend growth" },
      { symbol: "VEDL.NS", name: "Vedanta", thesis: "High but volatile dividends.", methodology: "Cyclical yield" },
      { symbol: "HINDZINC.NS", name: "Hindustan Zinc", thesis: "Strong cash generation.", methodology: "Commodity yield" },
      { symbol: "NHPC.NS", name: "NHPC", thesis: "Hydro utility yield.", methodology: "Utility yield" },
      { symbol: "SJVN.NS", name: "SJVN", thesis: "Hydro and project cash flow.", methodology: "Utility yield" },
      { symbol: "NMDC.NS", name: "NMDC", thesis: "Mining payout profile.", methodology: "Commodity yield" },
      { symbol: "HINDUNILVR.NS", name: "HUL", thesis: "Stable FMCG payouts.", methodology: "Dividend growth" },
      { symbol: "INFY.NS", name: "Infosys", thesis: "Buyback + dividend consistency.", methodology: "IT cash return" },
      { symbol: "TCS.NS", name: "TCS", thesis: "High cash conversion payouts.", methodology: "IT cash return" },
      { symbol: "WIPRO.NS", name: "Wipro", thesis: "Recurring shareholder returns.", methodology: "IT cash return" },
      { symbol: "TECHM.NS", name: "Tech Mahindra", thesis: "Payout support.", methodology: "IT cash return" },
      { symbol: "HCLTECH.NS", name: "HCL Tech", thesis: "Consistent payout history.", methodology: "IT cash return" },
    ],
  },
];
