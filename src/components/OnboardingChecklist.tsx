import React, { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Sparkles,
  CreditCard,
  Sliders,
  Mail,
  Palette,
  Zap,
  ChevronDown,
  ChevronUp,
  X,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { Workspace, ProviderConnection } from '../types/index.js';

interface OnboardingChecklistProps {
  workspace: Workspace | null;
  connections: ProviderConnection[];
  hasScanned?: boolean;
  hasReviewedBrain?: boolean;
  hasGeneratedPlan?: boolean;
  onNavigateTab: (tab: string, subTab?: string) => void;
  onOpenScanner?: () => void;
  onOpenSimulator?: () => void;
  onDismiss?: () => void;
}

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  workspace,
  connections,
  hasScanned = false,
  hasReviewedBrain = false,
  hasGeneratedPlan = false,
  onNavigateTab,
  onOpenScanner,
  onOpenSimulator,
  onDismiss,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, boolean>>({});

  // Dynamic Milestone calculation based on zero-setup onboarding requirements
  const hasWorkspace = Boolean(workspace?.id);
  const hasConnectedGateway = connections.some((c) => c.status === 'connected');

  const milestones = [
    {
      id: 'create_workspace',
      title: '1. Create Workspace',
      description: 'Set up your business workspace and select your business type.',
      isDone: hasWorkspace,
      tag: 'Step 1',
      icon: ShieldCheck,
      actionLabel: 'Workspace Active',
      onClick: () => {},
    },
    {
      id: 'connect_provider',
      title: '2. Connect Provider',
      description: 'Connect Stripe, Razorpay, Paddle, or quick demo data provider.',
      isDone: hasConnectedGateway || completedOverrides['connect_provider'] || false,
      tag: 'Step 2',
      icon: CreditCard,
      actionLabel: hasConnectedGateway ? 'Connected' : 'Connect Provider',
      onClick: () => onNavigateTab('settings', 'providers'),
    },
    {
      id: 'run_scan',
      title: '3. Run First Scan',
      description: 'Scan your payment processor to find failed charges and customers at risk.',
      isDone: hasScanned || completedOverrides['run_scan'] || false,
      tag: 'Step 3',
      icon: Zap,
      actionLabel: 'Run Scan',
      onClick: () => {
        if (onOpenScanner) onOpenScanner();
        setCompletedOverrides((prev) => ({ ...prev, run_scan: true }));
      },
    },
    {
      id: 'review_brain',
      title: '4. Check Revenue Dashboard',
      description: 'Review your prioritized list of failed payments, customers at risk, and growth opportunities.',
      isDone: hasReviewedBrain || completedOverrides['review_brain'] || false,
      tag: 'Step 4',
      icon: Sparkles,
      actionLabel: 'View Dashboard',
      onClick: () => {
        onNavigateTab('revenue_brain');
        setCompletedOverrides((prev) => ({ ...prev, review_brain: true }));
      },
    },
    {
      id: 'first_plan',
      title: '5. Review Recovery Plan',
      description: 'Review the step-by-step recovery actions recommended for your top failed payment.',
      isDone: hasGeneratedPlan || completedOverrides['first_plan'] || false,
      tag: 'Step 5',
      icon: Sliders,
      actionLabel: 'View Actions',
      onClick: () => {
        onNavigateTab('revenue');
        setCompletedOverrides((prev) => ({ ...prev, first_plan: true }));
      },
    },
  ];

  const completedCount = milestones.filter((m) => m.isDone).length;
  const progressPercent = Math.round((completedCount / milestones.length) * 100);

  const toggleManualCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCompletedOverrides((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-800/90 border border-slate-700/80 p-5 shadow-xl transition-all">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Revenue Recovery Setup
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {completedCount} / {milestones.length} Completed ({progressPercent}%)
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Complete these 5 quick steps to start recovering lost payments for {workspace?.name || 'your business'}.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              title="Dismiss checklist"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Track */}
      <div className="mt-4">
        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700/50">
          <div
            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Milestone Items */}
      {isExpanded && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {milestones.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                  item.isDone
                    ? 'bg-slate-900/60 border-emerald-500/30 text-slate-300'
                    : 'bg-slate-900/90 border-slate-700/80 hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-1.5 rounded-lg ${
                          item.isDone ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
                        {item.tag}
                      </span>
                    </div>

                    <button
                      onClick={(e) => toggleManualCheck(item.id, e)}
                      title={item.isDone ? 'Mark as incomplete' : 'Mark as complete'}
                      className="cursor-pointer text-slate-400 hover:text-emerald-400"
                    >
                      {item.isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-400/20" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-500 hover:text-slate-400" />
                      )}
                    </button>
                  </div>

                  <h3
                    className={`text-xs font-bold leading-snug ${
                      item.isDone ? 'text-slate-200 line-through decoration-slate-500' : 'text-white'
                    }`}
                  >
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {item.isDone ? 'Status: Complete' : 'Status: Action Required'}
                  </span>
                  <button
                    onClick={item.onClick}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                      item.isDone
                        ? 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm shadow-emerald-500/20'
                    }`}
                  >
                    <span>{item.actionLabel}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
