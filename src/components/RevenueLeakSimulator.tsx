import React, { useState, useMemo } from 'react';
import { Sliders, Sparkles, TrendingUp, AlertTriangle, ShieldCheck, ArrowRight, Activity, DollarSign } from 'lucide-react';
import { formatCurrencyAmount } from '../utils/currency.js';

interface RevenueLeakSimulatorProps {
  onLaunchRecovery?: (mrr: number, recoveredAmount: number) => void;
}

export const RevenueLeakSimulator: React.FC<RevenueLeakSimulatorProps> = ({ onLaunchRecovery }) => {
  const [mrr, setMrr] = useState<number>(150000);
  const [failureRate, setFailureRate] = useState<number>(11.5);
  const [avgCustomerValue, setAvgCustomerValue] = useState<number>(240);
  const [recoveryMethod, setRecoveryMethod] = useState<'standard_dunning' | 'manual' | 'reviveos'>('reviveos');

  const calculations = useMemo(() => {
    const monthlyFailedVolume = mrr * (failureRate / 100);
    const annualFailedVolume = monthlyFailedVolume * 12;

    // Recovery efficiency rates based on technology
    let recoveryRate = 0.84; // ReviveOS
    let dunningBurnout = 0.12; // Unrecovered secondary churn
    if (recoveryMethod === 'standard_dunning') {
      recoveryRate = 0.38;
      dunningBurnout = 0.42;
    } else if (recoveryMethod === 'manual') {
      recoveryRate = 0.22;
      dunningBurnout = 0.58;
    }

    const monthlyRecovered = monthlyFailedVolume * recoveryRate;
    const annualRecovered = monthlyRecovered * 12;
    const unrecoveredLoss = annualFailedVolume - annualRecovered;
    const rescuedCustomers = Math.round(monthlyRecovered / (avgCustomerValue || 200));

    return {
      monthlyFailedVolume,
      annualFailedVolume,
      monthlyRecovered,
      annualRecovered,
      unrecoveredLoss,
      rescuedCustomers,
      recoveryPercentage: Math.round(recoveryRate * 100),
    };
  }, [mrr, failureRate, avgCustomerValue, recoveryMethod]);

  return (
    <div className="w-full rounded-2xl bg-[#080a10] border border-white/[0.08] p-6 sm:p-8 lg:p-10 shadow-2xl relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-2">
            <Activity className="w-4 h-4" />
            <span>INTERACTIVE LEAK DIAGNOSTIC CALCULATOR</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight font-display">
            Simulate Your Revenue Leak Vector
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            See the exact mathematical disparity between generic billing retries and ReviveOS autonomous recovery.
          </p>
        </div>

        {/* Segmented Mode Switcher */}
        <div className="flex items-center p-1 rounded-xl bg-black/60 border border-white/[0.08] shrink-0">
          <button
            onClick={() => setRecoveryMethod('standard_dunning')}
            className={`px-3 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              recoveryMethod === 'standard_dunning'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Generic Stripe Dunning
          </button>
          <button
            onClick={() => setRecoveryMethod('manual')}
            className={`px-3 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer ${
              recoveryMethod === 'manual'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Manual Outreach
          </button>
          <button
            onClick={() => setRecoveryMethod('reviveos')}
            className={`px-3 py-2 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
              recoveryMethod === 'reviveos'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-emerald-400 hover:text-emerald-300'
            }`}
          >
            ★ ReviveOS Autonomous
          </button>
        </div>
      </div>

      {/* Grid: Interactive Controls & Real-Time Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8 items-center">
        {/* Left Column: Interactive Sliders */}
        <div className="lg:col-span-6 space-y-6">
          {/* Slider 1: MRR */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">MONTHLY RECURRING REVENUE (MRR)</span>
              <span className="text-emerald-400 font-bold text-sm">${mrr.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="20000"
              max="1500000"
              step="10000"
              value={mrr}
              onChange={(e) => setMrr(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 focus:outline-none"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>$20k</span>
              <span>$500k</span>
              <span>$1.5M+</span>
            </div>
          </div>

          {/* Slider 2: Failure Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">PAYMENT & INVOLUNTARY FAILURE RATE</span>
              <span className="text-rose-400 font-bold text-sm">{failureRate}%</span>
            </div>
            <input
              type="range"
              min="3"
              max="25"
              step="0.5"
              value={failureRate}
              onChange={(e) => setFailureRate(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500 focus:outline-none"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>3% (Low)</span>
              <span>11% (Industry Avg)</span>
              <span>25% (High Churn)</span>
            </div>
          </div>

          {/* Slider 3: ARPU */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">AVERAGE REVENUE PER CUSTOMER / ACCT</span>
              <span className="text-cyan-400 font-bold text-sm">${avgCustomerValue}/mo</span>
            </div>
            <input
              type="range"
              min="20"
              max="1500"
              step="20"
              value={avgCustomerValue}
              onChange={(e) => setAvgCustomerValue(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-none"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>$20</span>
              <span>$500</span>
              <span>$1,500</span>
            </div>
          </div>
        </div>

        {/* Right Column: High-Impact Output Dashboard */}
        <div className="lg:col-span-6 rounded-xl bg-black/60 border border-white/[0.08] p-6 space-y-6">
          <div className="space-y-1">
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Projected Annual Recaptured Capital
            </div>
            <div className="text-4xl sm:text-5xl font-black tracking-tight text-emerald-400 font-display tabular-nums">
              +${Math.round(calculations.annualRecovered).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400">
              Across ~{calculations.rescuedCustomers * 12} saved customer accounts annually
            </div>
          </div>

          {/* Visual Progress Ratio Bar */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">Recovery Capture Efficiency:</span>
              <span className="text-white font-bold">{calculations.recoveryPercentage}%</span>
            </div>
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${calculations.recoveryPercentage}%` }}
              />
              <div
                className="bg-rose-500/40 h-full transition-all duration-300"
                style={{ width: `${100 - calculations.recoveryPercentage}%` }}
              />
            </div>
          </div>

          {/* Comparison Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] font-mono text-slate-500 uppercase">Total At-Risk ARR</div>
              <div className="text-lg font-bold text-rose-400 tabular-nums">
                ${Math.round(calculations.annualFailedVolume).toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="text-[10px] font-mono text-slate-500 uppercase">Monthly Salvage Velocity</div>
              <div className="text-lg font-bold text-cyan-400 tabular-nums">
                +${Math.round(calculations.monthlyRecovered).toLocaleString()}/mo
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
