import test from "node:test";
import assert from "node:assert/strict";
import { assessReportQuality, parseScreenerFinancials } from "../reportUtils";
import type { CompanyReportData } from "../shared/reportTypes";

const screenerFixture = `
<html>
  <body>
    <h1>Example Industries Ltd</h1>
    <section id="profit-loss">
      <table>
      <thead><tr><th>Particulars</th><th>2022</th><th>2023</th></tr></thead>
      <tbody>
        <tr><td>Sales</td><td>1,200</td><td>1,450</td></tr>
        <tr><td>Net Profit</td><td>140</td><td>190</td></tr>
        <tr><td>EPS in Rs</td><td>12.1</td><td>15.6</td></tr>
      </tbody>
      </table>
    </section>
    <section id="quarters">
      <table>
      <thead><tr><th>Particulars</th><th>Dec 2024</th><th>Mar 2025</th></tr></thead>
      <tbody>
        <tr><td>Sales</td><td>380</td><td>410</td></tr>
        <tr><td>PAT</td><td>52</td><td>57</td></tr>
        <tr><td>EPS in Rs</td><td>3.9</td><td>4.2</td></tr>
      </tbody>
      </table>
    </section>
  </body>
</html>
`;

test("parseScreenerFinancials parses annual + quarterly rows", () => {
  const parsed = parseScreenerFinancials(screenerFixture);
  assert.equal(parsed.name, "Example Industries Ltd");
  assert.equal(parsed.chartData.length, 2);
  assert.equal(parsed.quarterlyData.length, 2);
  assert.equal(parsed.chartData[1].sales, 1450);
  assert.equal(parsed.quarterlyData[1].netProfit, 57);
});

test("parseScreenerFinancials supports section-id drift layouts", () => {
  const driftFixture = `
  <html>
    <body>
      <h1>Drift Co</h1>
      <section id="profit-and-loss-alt">
        <h2>Profit & Loss</h2>
        <table>
          <thead><tr><th>Particulars</th><th>2023</th><th>2024</th></tr></thead>
          <tbody>
            <tr><td>Sales</td><td>500</td><td>600</td></tr>
            <tr><td>Profit After Tax</td><td>60</td><td>72</td></tr>
          </tbody>
        </table>
      </section>
      <section id="quarterly-results-alt">
        <h2>Quarterly Results</h2>
        <table>
          <thead><tr><th>Particulars</th><th>Dec 2025</th><th>Mar 2026</th></tr></thead>
          <tbody>
            <tr><td>Sales</td><td>140</td><td>155</td></tr>
            <tr><td>PAT</td><td>18</td><td>22</td></tr>
          </tbody>
        </table>
      </section>
    </body>
  </html>`;
  const parsed = parseScreenerFinancials(driftFixture);
  assert.equal(parsed.chartData.length, 2);
  assert.equal(parsed.chartData[1].netProfit, 72);
  assert.equal(parsed.quarterlyData.length, 2);
  assert.equal(parsed.quarterlyData[1].netProfit, 22);
});

test("assessReportQuality passes for complete report", () => {
  const parsed = parseScreenerFinancials(screenerFixture);
  const report: CompanyReportData = {
    name: parsed.name,
    chartData: parsed.chartData,
    quarterlyData: parsed.quarterlyData,
    recentAnnouncements: [{ subject: "Q4 Results", date: "2026-03-31" }],
    aiReport: "A".repeat(180),
    reportType: "standard",
  };
  const gate = assessReportQuality(report, "2026-03-31T00:00:00.000Z");
  assert.equal(gate.passed, true);
  assert.equal(gate.completenessScore >= 60, true);
});

