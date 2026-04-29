export type ReportType = "deep" | "standard" | "quick";

export type ReportChartRow = {
  year: string;
  sales: number;
  netProfit: number;
  eps: number;
};

export type ReportQuarterlyRow = {
  quarter: string;
  sales: number;
  netProfit: number;
  eps: number;
};

export type ReportAnnouncement = {
  id?: string | number;
  symbol?: string | null;
  companyName?: string;
  subject: string;
  date?: string;
  pdfLink?: string | null;
  exchange?: string;
  category?: string;
};

export type CompanyReportSummary = {
  price?: string;
  marketCap?: string;
  pe?: string;
  source?: string;
};

export type CompanyReportData = {
  name: string;
  chartData: ReportChartRow[];
  quarterlyData: ReportQuarterlyRow[];
  recentAnnouncements: ReportAnnouncement[];
  aiReport: string;
  reportType: ReportType;
  summary?: CompanyReportSummary;
  parsingWarnings?: string[];
};

export type CompanySnapshotData = {
  name: string;
  snapshot: string;
};

export type QualityGateResult = {
  passed: boolean;
  completenessScore: number;
  missingComponents: string[];
  latestAnnouncementDate: string | null;
  checkedAt: string;
};

export type RecommendationAction = "buy" | "watch" | "avoid";

export type RecommendationData = {
  id: number;
  reportId: number | null;
  symbol: string;
  country: "IN" | "US";
  recommendationAction: RecommendationAction;
  confidencePct: number;
  horizonDays: number;
  riskClass: "low" | "medium" | "high";
  explainability: {
    positive: string[];
    negative: string[];
    caveats: string[];
  };
  scoreSnapshot: {
    totalScore: number;
    verdict: "strong" | "watch" | "weak";
    breakdown: {
      quality: number;
      valuation: number;
      momentum: number;
      risk: number;
    };
  };
  policyVersion: string;
  createdAt: string;
};
