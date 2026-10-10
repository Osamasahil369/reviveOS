import React from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Search, Zap, CheckCircle2, Clock } from 'lucide-react';

export interface EmptyWorkspacePreviewProps {
  onLoadDemoData: () => void;
  className?: string;
}

export const EmptyWorkspacePreview: React.FC<EmptyWorkspacePreviewProps> = ({
  onLoadDemoData,
  className = '',
}) => {
  return (
    <div className={`space-y-6 max-w-4xl mx-auto py-6 ${className}`}>
      {/* Main Preview Hero Card */}
      <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-br from-[#071224] via-slate-900 to-slate-950 border border-emerald-500/30 shadow-2xl space-y-6 text-center sm:text-left relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[#4ADE80] text-xs font-mono font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Revenue Recovery Preview</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display">
              We haven't found any recovery opportunities yet.
            </h1>
            <p className="text-sm text-slate-300 font-sans max-w-xl">
              Your workspace is currently connected and monitoring billing activity. As soon as a payment fails or a renewal is declined, ReviveOS will spring into action.
            </p>
          </div>

          <div className="shrink-0">
            <button
              onClick={onLoadDemoData}
              className="px-6 py-3.5 rounded-xl bg-[#4ADE80] hover:bg-[#22C55E] text-slate-950 font-bold text-xs sm:text-sm font-mono transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 cursor-pointer"
            >
              <Zap className="w-4 h-4 text-slate-950 fill-slate-950" />
              <span>Explore Demo Data</span>
            </button>
          </div>
        </div>

        {/* 4 Explanatory Pillars in Plain English */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-800/80 relative z-10 text-left">
          {/* Pillar 1 */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white font-sans">What ReviveOS scans</div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Invoices, payment gateway connection events, and recovery histories across your payment systems.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white font-sans">What ReviveOS recovers</div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Failed subscription renewals, expired credit card updates, and declined recurring payments.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white font-sans">What happens automatically</div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              Smart multi-day payment retries, secure 1-click customer update links, and automated recovery email reminders.
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white font-sans">What requires approval</div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
              High-value enterprise accounts, VIP customer relationship holds, and unusual transaction flags.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
