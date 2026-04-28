import { format } from "date-fns";
import { ExternalLink, FileText } from "lucide-react";
import type { CompanyFundamentals } from "../services/marketDataService";

type FundamentalsPanelProps = {
  companyData: CompanyFundamentals;
};

export default function FundamentalsPanel({ companyData }: FundamentalsPanelProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Fundamentals</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(companyData.fundamentals || []).map((item, idx) => (
            <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <div className="text-sm text-gray-500 mb-1">{item.label || "Metric"}</div>
              <div className="text-lg font-semibold text-gray-900">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {companyData.about && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">About Company</h3>
          <div className="bg-gray-50 p-5 rounded-lg border border-gray-100 text-gray-700 leading-relaxed text-sm">
            {companyData.about}
          </div>
        </div>
      )}

      {companyData.recentAnnouncements && companyData.recentAnnouncements.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Recent Exchange Filings & Documents
          </h3>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Subject</th>
                  <th className="px-6 py-3 font-medium text-right">Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {companyData.recentAnnouncements.map((item, idx) => (
                  <tr key={item.id ?? idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap text-gray-500">
                      {item.date ? format(new Date(item.date), "MMM dd, yyyy") : "N/A"}
                    </td>
                    <td className="px-6 py-3">
                      <div className="font-medium text-gray-900 line-clamp-1" title={item.subject}>
                        {item.subject}
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 mt-1 uppercase">
                        {item.category || "Filing"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {item.pdfLink ? (
                        <a href={item.pdfLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1">
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
