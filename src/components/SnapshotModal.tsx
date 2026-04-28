import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, RefreshCw, Sparkles } from "lucide-react";
import Markdown from "react-markdown";
import type { CompanySnapshotData } from "../../shared/reportTypes";

type SnapshotModalProps = {
  open: boolean;
  loading: boolean;
  snapshotData: CompanySnapshotData | null;
  onClose: () => void;
};

export default function SnapshotModal({ open, loading, snapshotData, onClose }: SnapshotModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200"
          >
            <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Sparkles className="h-5 w-5" />
                <h3 className="font-bold">Quick Result Snapshot</h3>
              </div>
              <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                <RefreshCw className="h-5 w-5 rotate-45" />
              </button>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="py-12 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-indigo-600 mb-4" />
                  <p className="text-gray-500 font-medium">Analyzing latest results...</p>
                </div>
              ) : snapshotData ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xl font-bold text-gray-900">{snapshotData.name}</h4>
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase">Latest Insight</span>
                  </div>
                  <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                    <Markdown>{snapshotData.snapshot}</Markdown>
                  </div>
                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-gray-800 transition-colors">
                      Got it
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  <AlertCircle className="h-8 w-8 mx-auto text-red-400 mb-3" />
                  <p>Failed to generate snapshot. Please try again.</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
