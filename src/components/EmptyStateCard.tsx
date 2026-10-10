import React from 'react';
import { HelpCircle, ArrowRight, Sparkles, Layers, Info } from 'lucide-react';

interface EmptyStateCardProps {
  title: string;
  whatItDoes: string;
  whyItMatters: string;
  whatToClickNext: string;
  actionLabel: string;
  onAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  title,
  whatItDoes,
  whyItMatters,
  whatToClickNext,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  icon: Icon = Info,
}) => {
  return (
    <div className="p-8 sm:p-10 rounded-2xl bg-gradient-to-br from-slate-900/90 via-slate-900/80 to-slate-950 border border-slate-800 shadow-xl max-w-3xl mx-auto text-left space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
          <Icon className="w-6 h-6 stroke-[2]" />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
            Empty State Guidance
          </span>
          <h3 className="text-xl font-bold text-white font-display">{title}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
          <div className="text-xs font-mono font-bold text-emerald-400 uppercase">1. What this page does</div>
          <p className="text-xs text-slate-300 leading-relaxed">{whatItDoes}</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
          <div className="text-xs font-mono font-bold text-cyan-300 uppercase">2. Why it matters</div>
          <p className="text-xs text-slate-300 leading-relaxed">{whyItMatters}</p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
          <div className="text-xs font-mono font-bold text-amber-400 uppercase">3. What to click next</div>
          <p className="text-xs text-slate-300 leading-relaxed">{whatToClickNext}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
        <div className="text-xs text-slate-400 font-mono">
          Ready to discover revenue opportunities for your workspace?
        </div>
        <div className="flex items-center gap-3">
          {secondaryActionLabel && onSecondaryAction && (
            <button
              onClick={onSecondaryAction}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
            >
              {secondaryActionLabel}
            </button>
          )}
          <button
            onClick={onAction}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-lg shadow-emerald-500/10 cursor-pointer flex items-center gap-2"
          >
            <span>{actionLabel}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
