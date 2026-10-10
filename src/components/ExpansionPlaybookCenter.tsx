import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Send,
  Zap,
  Award,
  ArrowRight,
} from 'lucide-react';
import { api } from '../services/api.js';

interface ExpansionOpportunity {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  playbookType: 'annual_conversion' | 'tier_upgrade' | 'seat_expansion' | 'add_on';
  title: string;
  recommendedAction: string;
  expectedExpansionValueCents: number;
  expectedExpansionValueFormatted: string;
  currency: string;
  currentPlanName: string;
  targetPlanName: string;
  supportingEvidence: string[];
  status: 'identified' | 'action_ready' | 'converted' | 'dismissed';
}

interface ExpansionPlaybookCenterProps {
  currency: string;
}

export const ExpansionPlaybookCenter: React.FC<ExpansionPlaybookCenterProps> = ({ currency }) => {
  const [opportunities, setOpportunities] = useState<ExpansionOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isINR = currency.toUpperCase() === 'INR';
  const sym = isINR ? '₹' : '$';

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.getExpansionPlaybooks();
      if (res && Array.isArray(res.opportunities)) {
        setOpportunities(res.opportunities);
      }
    } catch (err: any) {
      console.error('Failed to load expansion playbooks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExecute = async (opp: ExpansionOpportunity) => {
    setExecutingId(opp.id);
    try {
      const res = await api.executeExpansionPlaybook(opp.id);
      setFeedback(res.message || `Dispatched expansion proposal to ${opp.customerName}`);
      setTimeout(() => setFeedback(null), 4000);
      await loadData();
    } catch (err: any) {
      setFeedback(`Failed to execute: ${err.message || 'Error'}`);
    } finally {
      setExecutingId(null);
    }
  };

  const totalExpansionValueCents = opportunities.reduce(
    (sum, o) => sum + (o.status !== 'converted' ? o.expectedExpansionValueCents : 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <span>Expansion Playbook Engine</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic revenue expansion playbooks: annual prepay conversions, tier upgrades, and account add-ons derived from verified billing tenure.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-slate-900 border border-white/[0.08] text-right">
            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Identified Expansion ARR</div>
            <div className="text-sm font-bold text-emerald-400 font-mono">
              {sym}{(totalExpansionValueCents / 100).toLocaleString('en-US')}
            </div>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/[0.08] text-slate-300 transition-colors cursor-pointer"
            title="Rescan Expansion Opportunities"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-mono">
          Scanning account tenure, payment reliability, and plan saturation limits...
        </div>
      ) : opportunities.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/40 rounded-2xl border border-white/[0.06] space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No Expansion Plays Identified Yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Customers qualify for annual prepayment or tier expansion once they sustain 3+ consecutive successful billing cycles with zero disputes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {opportunities.map((opp) => {
            const isConverted = opp.status === 'converted';

            return (
              <div
                key={opp.id}
                className={`bg-slate-900/90 border rounded-2xl p-5 transition-all flex flex-col justify-between space-y-4 ${
                  isConverted
                    ? 'border-emerald-500/40 bg-emerald-950/10'
                    : 'border-white/[0.08] hover:border-slate-700'
                }`}
              >
                <div className="space-y-3">
                  {/* Badge & Target */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {opp.playbookType.replace('_', ' ')}
                      </span>
                      <h3 className="text-sm font-bold text-white mt-1.5">{opp.title}</h3>
                      <div className="text-xs text-slate-400 font-mono">
                        {opp.customerName} <span className="text-slate-500">({opp.customerEmail})</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-400 font-mono">Incremental ARR:</div>
                      <div className="text-sm font-bold text-emerald-400 font-mono">
                        +{opp.expectedExpansionValueFormatted}
                      </div>
                    </div>
                  </div>

                  {/* Plan Shift */}
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-white/[0.04] flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 truncate">{opp.currentPlanName}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 mx-2" />
                    <span className="text-emerald-300 font-semibold truncate">{opp.targetPlanName}</span>
                  </div>

                  {/* Supporting Evidence */}
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Verified Supporting Evidence:
                    </div>
                    <ul className="text-xs text-slate-300 space-y-1 pl-4 list-disc marker:text-slate-500">
                      {opp.supportingEvidence.map((ev, idx) => (
                        <li key={idx}>{ev}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-400 line-clamp-1">{opp.recommendedAction}</div>

                  {isConverted ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Proposal Dispatched</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleExecute(opp)}
                      disabled={executingId === opp.id}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-sm shadow-emerald-500/20 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {executingId === opp.id ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Launch Playbook</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
