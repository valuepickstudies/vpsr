import type { CompanyReportData } from "../../shared/reportTypes";

type ReportFinancialTablesProps = {
  reportData: CompanyReportData;
};

export default function ReportFinancialTables({ reportData }: ReportFinancialTablesProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Historical Results (Annual)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="text-xs text-gray-500 uppercase bg-white border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-medium">Year</th>
                <th className="px-6 py-3 font-medium text-right">Sales (Cr)</th>
                <th className="px-6 py-3 font-medium text-right">Net Profit (Cr)</th>
                <th className="px-6 py-3 font-medium text-right">EPS (Rs)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reportData.chartData?.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{row.year}</td>
                  <td className="px-6 py-3 text-right">{row.sales}</td>
                  <td className="px-6 py-3 text-right">{row.netProfit}</td>
                  <td className="px-6 py-3 text-right">{row.eps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Latest Results (Quarterly)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="text-xs text-gray-500 uppercase bg-white border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-medium">Quarter</th>
                <th className="px-6 py-3 font-medium text-right">Sales (Cr)</th>
                <th className="px-6 py-3 font-medium text-right">Net Profit (Cr)</th>
                <th className="px-6 py-3 font-medium text-right">EPS (Rs)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reportData.quarterlyData?.slice(-6).map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{row.quarter}</td>
                  <td className="px-6 py-3 text-right">{row.sales}</td>
                  <td className="px-6 py-3 text-right">{row.netProfit}</td>
                  <td className="px-6 py-3 text-right">{row.eps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
