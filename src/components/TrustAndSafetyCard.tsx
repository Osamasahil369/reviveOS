import React from 'react';
import { ShieldCheck, Check, Lock } from 'lucide-react';

interface TrustAndSafetyCardProps {
  variant?: 'compact' | 'detailed' | 'portal';
  className?: string;
}

export const TrustAndSafetyCard: React.FC<TrustAndSafetyCardProps> = ({
  variant = 'detailed',
  className = '',
}) => {
  const trustPoints = [
    {
      title: 'Never charges customers without authorization',
      subtitle: 'Strict adherence to cardholder permissions and zero unauthorized billing.',
    },
    {
      title: 'Never retries disputed payments',
      subtitle: 'Active chargebacks and bank inquiries are automatically halted to prevent fees.',
    },
    {
      title: 'Every recovery action is logged',
      subtitle: 'Tamper-evident audit trails record timestamps, actor IDs, and gateway responses.',
    },
    {
      title: 'Human review available when required',
      subtitle: 'VIP protection and customizable thresholds ensure operators maintain control.',
    },
  ];

  if (variant === 'portal') {
    return (
      <div
        className={`p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-2.5 ${className}`}
      >
        <div className="flex items-center gap-2 text-emerald-400 font-mono font-semibold">
          <ShieldCheck className="w-4 h-4 text-[#4ADE80]" />
          <span>Secure Payment Protected</span>
        </div>
        <div className="space-y-1.5 text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
            <span>Never charges customers without authorization</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
            <span>Never retries disputed payments</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
            <span>Every recovery action is logged</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
            <span>Human review available when required</span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`p-3.5 rounded-xl bg-[#071224] border border-slate-800 text-xs text-slate-300 space-y-2 ${className}`}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-white">
            <ShieldCheck className="w-3.5 h-3.5 text-[#4ADE80]" />
            <span>Autopilot Trust Layer</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-medium">Guaranteed</span>
        </div>
        <div className="space-y-1.5 text-[11px] font-mono text-slate-400">
          {trustPoints.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-[#4ADE80] shrink-0 stroke-[2.5]" />
              <span className="text-slate-300">{item.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-xl bg-[#071224] border border-slate-800 space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[#4ADE80] flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Autopilot Trust Layer
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Enterprise safety guardrails enforced on 100% of recovery workflows
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400">
          <Lock className="w-3 h-3" />
          <span>Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
        {trustPoints.map((item, idx) => (
          <div
            key={idx}
            className="p-2.5 rounded-lg bg-slate-900/50 border border-slate-800/80 flex items-start gap-2.5"
          >
            <div className="w-4 h-4 rounded-full bg-emerald-500/10 text-[#4ADE80] flex items-center justify-center mt-0.5 shrink-0">
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white font-mono">{item.title}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-light leading-snug">
                {item.subtitle}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
