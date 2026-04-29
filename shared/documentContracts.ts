export type SourceCheck = {
  checked: boolean;
  matched: boolean;
  detail: string;
  evidence?: string;
};

export type DocumentIntelligenceRow = {
  announcementId: string;
  symbol: string | null;
  exchange: string | null;
  pdfUrl: string | null;
  contentSha256: string | null;
  docCategory: string | null;
  textSnippet: string | null;
  status: "ok" | "no_pdf" | "fetch_error" | "parse_error";
  error: string | null;
  processedAt: string;
};

export type IntelligenceValidationResult = {
  announcementId: string;
  symbol: string;
  exchange: string;
  verdict: "pass" | "warn" | "fail";
  nse: SourceCheck;
  bse: SourceCheck;
  screener: SourceCheck;
  reasons: string[];
  checkedAt: string;
  document: DocumentIntelligenceRow | null;
};

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeSourceCheck(v: unknown): SourceCheck | null {
  const o = v as Record<string, unknown>;
  if (typeof o?.checked !== "boolean" || typeof o?.matched !== "boolean" || typeof o?.detail !== "string") return null;
  return {
    checked: o.checked,
    matched: o.matched,
    detail: o.detail,
    evidence: asString(o.evidence) || undefined,
  };
}

function normalizeDocumentRow(v: unknown): DocumentIntelligenceRow | null {
  const o = v as Record<string, unknown>;
  const announcementId = asString(o.announcementId);
  const status = o.status;
  const processedAt = asString(o.processedAt);
  if (!announcementId || !processedAt) return null;
  if (status !== "ok" && status !== "no_pdf" && status !== "fetch_error" && status !== "parse_error") return null;
  return {
    announcementId,
    symbol: asString(o.symbol),
    exchange: asString(o.exchange),
    pdfUrl: asString(o.pdfUrl),
    contentSha256: asString(o.contentSha256),
    docCategory: asString(o.docCategory),
    textSnippet: asString(o.textSnippet),
    status,
    error: asString(o.error),
    processedAt,
  };
}

export function normalizeIntelligenceValidationResult(v: unknown): IntelligenceValidationResult | null {
  const o = v as Record<string, unknown>;
  const announcementId = asString(o.announcementId);
  const symbol = asString(o.symbol);
  const exchange = asString(o.exchange);
  const verdict = o.verdict;
  if (!announcementId || !symbol || !exchange) return null;
  if (verdict !== "pass" && verdict !== "warn" && verdict !== "fail") return null;
  const nse = normalizeSourceCheck(o.nse);
  const bse = normalizeSourceCheck(o.bse);
  const screener = normalizeSourceCheck(o.screener);
  const checkedAt = asString(o.checkedAt);
  if (!nse || !bse || !screener || !checkedAt) return null;
  const reasons = Array.isArray(o.reasons) ? o.reasons.filter((x): x is string => typeof x === "string") : [];
  const document = o.document == null ? null : normalizeDocumentRow(o.document);
  if (o.document != null && !document) return null;
  return {
    announcementId,
    symbol,
    exchange,
    verdict,
    nse,
    bse,
    screener,
    reasons,
    checkedAt,
    document,
  };
}
