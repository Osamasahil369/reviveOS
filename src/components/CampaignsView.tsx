import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Play,
  Pause,
  Clock,
  Mail,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Shield,
  Trash2,
} from 'lucide-react';
import { RecoveryCampaign, DunningStep } from '../types/index.js';
import { EmptyStateCard } from './EmptyStateCard.js';

interface CampaignsViewProps {
  campaigns: RecoveryCampaign[];
  onToggleCampaign: (id: string) => void;
  onCreateCampaign: (campaign: Partial<RecoveryCampaign>) => void;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  campaigns,
  onToggleCampaign,
  onCreateCampaign,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('payment.failed');
  const [description, setDescription] = useState('');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onCreateCampaign({
      name: name.trim(),
      description: description.trim() || 'Standard recovery sequence',
      trigger_event: triggerEvent,
      is_active: true,
      steps: [
        {
          step_number: 1,
          delay_hours: 0,
          action_type: 'smart_retry',
          metadata: { provider: 'auto' },
        },
        {
          step_number: 2,
          delay_hours: 4,
          action_type: 'send_email',
          email_subject_template: 'Action Needed: Update payment method for {{business_name}}',
          email_body_template:
            'Hello {{customer_name}}, your subscription payment of {{amount}} could not be processed. Please update your card securely here: {{recovery_link}}',
        },
        {
          step_number: 3,
          delay_hours: 72,
          action_type: 'send_email',
          email_subject_template: 'Urgent: Avoid subscription interruption',
          email_body_template:
            'Hi {{customer_name}}, your service will be paused soon unless your payment method is refreshed: {{recovery_link}}',
        },
      ],
    });

    setName('');
    setDescription('');
    setShowCreateModal(false);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Recovery Campaigns</h1>
          <p className="text-xs text-slate-400">
            Multi-channel dunning workflows and intelligent retries executing on failed payment events.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Recovery Workflow</span>
        </button>
      </div>

      {/* Campaigns Grid */}
      <div className="space-y-6">
        {campaigns.length === 0 ? (
          <div className="py-4">
            <EmptyStateCard
              title="No Recovery Workflows Configured"
              whatItDoes="Executes multi-step automated dunning sequences, smart retry schedules, and email notices when payment failures occur."
              whyItMatters="Automates recovery on autopilot without requiring manual team follow-ups for every failed invoice."
              whatToClickNext="Click 'New Recovery Workflow' to create an automated recovery campaign for your workspace."
              actionLabel="New Recovery Workflow"
              onAction={() => setShowCreateModal(true)}
              icon={Layers}
            />
          </div>
        ) : (
          campaigns.map((camp) => (
          <div
            key={camp.id}
            className={`bg-slate-900/90 border rounded-2xl p-6 transition-all ${
              camp.is_active ? 'border-slate-800' : 'border-slate-800/50 opacity-75'
            }`}
          >
            {/* Campaign Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl ${
                    camp.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-white">{camp.name}</h3>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        camp.is_active
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {camp.is_active ? 'Active & Enforcing' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{camp.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
                  Trigger: {camp.trigger_event}
                </span>

                <button
                  onClick={() => onToggleCampaign(camp.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    camp.is_active
                      ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                  }`}
                >
                  {camp.is_active ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Activate</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Visual Step Sequence Workflow */}
            <div className="pt-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Execution Timeline & Channel Steps</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {camp.steps.map((step, idx) => (
                  <div
                    key={step.step_number}
                    className="relative p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold text-emerald-400 font-mono">
                        STEP 0{step.step_number}
                      </span>
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                        +{step.delay_hours} Hours
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      {step.action_type === 'smart_retry' ? (
                        <div className="p-1.5 rounded bg-amber-500/10 text-amber-300">
                          <Zap className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="p-1.5 rounded bg-blue-500/10 text-blue-400">
                          <Mail className="w-4 h-4" />
                        </div>
                      )}
                      <span className="font-semibold text-xs text-white capitalize">
                        {step.action_type.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 leading-relaxed">
                      {step.action_type === 'smart_retry' ? (
                        'Algorithmic gateway re-attempt timing optimal network window.'
                      ) : (
                        <div className="truncate">
                          Subject: <span className="text-slate-300">{step.email_subject_template}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )))}
      </div>

      {/* New Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Create Recovery Campaign</h3>
            <p className="text-xs text-slate-400 mb-4">
              Configure how our engine automatically responds when an invoice or card charge fails.
            </p>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Campaign Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise Tier Dunning Sequence"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Trigger Event</label>
                <select
                  value={triggerEvent}
                  onChange={(e) => setTriggerEvent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="payment.failed">Payment Failed (Webhook from Stripe/Razorpay)</option>
                  <option value="invoice.past_due">Invoice Past Due</option>
                  <option value="card.expiring">Card Expiring in 14 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description / Strategy</label>
                <textarea
                  rows={2}
                  placeholder="Describe target customers or retry intervals..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-400">
                <div className="font-semibold text-white mb-1">Default 3-Step Strategy Pre-Configured:</div>
                <div>1. Immediate smart retry at T+0</div>
                <div>2. Friendly card update magic link at T+4h</div>
                <div>3. Final grace period urgency notice at T+72h</div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                >
                  Create Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
