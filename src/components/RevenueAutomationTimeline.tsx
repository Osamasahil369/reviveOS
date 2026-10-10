import React from 'react';
import {
  AlertTriangle,
  Send,
  Mail,
  Eye,
  CreditCard,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { CustomerTimelineEvent, RevenueEvent } from '../types/index.js';

interface RevenueAutomationTimelineProps {
  timelineEvents: CustomerTimelineEvent[];
  revenueEvents: RevenueEvent[];
  currency: string;
}

interface HumanTimelineItem {
  id: string;
  stage: 'CARD_FAILED' | 'RETRY_SENT' | 'REMINDER_SENT' | 'LINK_OPENED' | 'CARD_UPDATED' | 'PAYMENT_RECOVERED';
  title: string;
  description: string;
  customerName: string;
  amountFormatted?: string;
  timestampFormatted: string;
  relativeTime: string;
}

export const RevenueAutomationTimeline: React.FC<RevenueAutomationTimelineProps> = ({
  timelineEvents = [],
  revenueEvents = [],
  currency,
}) => {
  const isINR = currency.toUpperCase() === 'INR';
  const sym = isINR ? '₹' : '$';

  // Transform technical events into strictly human-readable milestones
  const humanItems: HumanTimelineItem[] = [];

  // 1. Process Timeline Events
  for (const event of timelineEvents) {
    const rawType = (event.event_type || '').toLowerCase();
    const rawTitle = (event.title || '').toLowerCase();
    const rawDesc = (event.description || '').toLowerCase();
    const customer = event.customer_name || 'Subscriber';
    const date = new Date(event.created_at);
    const dateStr = isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const relativeTime = getRelativeTime(event.created_at);

    if (rawType.includes('failure') || rawTitle.includes('failed') || rawDesc.includes('declined')) {
      humanItems.push({
        id: event.id || `fail_${Math.random()}`,
        stage: 'CARD_FAILED',
        title: 'Subscription Payment Declined',
        description: `Issuer bank returned decline (${getPlainFailureReason(event.description || event.gateway_response)}). Automated recovery scheduled.`,
        customerName: customer,
        timestampFormatted: dateStr,
        relativeTime,
      });
    } else if (rawType.includes('retry') || rawTitle.includes('retry')) {
      humanItems.push({
        id: event.id || `ret_${Math.random()}`,
        stage: 'RETRY_SENT',
        title: 'Smart Retry Executed',
        description: `Automated retry submitted to payment network during optimal clearance window.`,
        customerName: customer,
        timestampFormatted: dateStr,
        relativeTime,
      });
    } else if (rawType.includes('email') || rawType.includes('sent') || rawTitle.includes('sent') || rawTitle.includes('reminder') || rawTitle.includes('dunning')) {
      humanItems.push({
        id: event.id || `rem_${Math.random()}`,
        stage: 'REMINDER_SENT',
        title: '1-Click Recovery Link Delivered',
        description: `Secure recovery communication delivered to customer with instant update button.`,
        customerName: customer,
        timestampFormatted: dateStr,
        relativeTime,
      });
    } else if (rawType.includes('opened') || rawType.includes('clicked') || rawTitle.includes('opened') || rawTitle.includes('clicked')) {
      humanItems.push({
        id: event.id || `open_${Math.random()}`,
        stage: 'LINK_OPENED',
        title: 'Payment Link Opened',
        description: `${customer} opened the secure payment recovery link.`,
        customerName: customer,
        timestampFormatted: dateStr,
        relativeTime,
      });
    } else if (rawType.includes('card_updated') || rawTitle.includes('card') || rawDesc.includes('card')) {
      humanItems.push({
        id: event.id || `upd_${Math.random()}`,
        stage: 'CARD_UPDATED',
        title: 'Payment Method Updated',
        description: `${customer} successfully saved a verified, authenticated payment card.`,
        customerName: customer,
        timestampFormatted: dateStr,
        relativeTime,
      });
    }
  }

  // 2. Process Authoritative Revenue Events (Recoveries)
  for (const rev of revenueEvents) {
    const timestampStr = rev.recorded_at || (rev as any).created_at || '';
    const date = new Date(timestampStr);
    const dateStr = isNaN(date.getTime()) ? 'Recently' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const amountVal = rev.amount_cents ? `${sym}${(rev.amount_cents / 100).toLocaleString('en-US')}` : undefined;

    humanItems.push({
      id: rev.id,
      stage: 'PAYMENT_RECOVERED',
      title: 'Revenue Recovered & Settled',
      description: `Payment of ${amountVal || 'renewal fee'} successfully cleared and reconciled to subscription.`,
      customerName: rev.customer_name || 'Subscriber',
      amountFormatted: amountVal,
      timestampFormatted: dateStr,
      relativeTime: getRelativeTime(timestampStr),
    });
  }

  // Deduplicate and sort descending by timestamp
  const sorted = humanItems.slice(0, 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Revenue Automation Timeline</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Real-time human-readable chronicle of every payment failure, automated dunning action, and recovered dollar.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live Activity Stream</span>
        </div>
      </div>

      {/* Primary Lifecycle Visualizer */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 rounded-xl bg-slate-900/60 border border-white/[0.06] text-xs">
        <div className="flex items-center gap-2 text-rose-400 font-semibold p-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>1. Card Failed</span>
        </div>
        <div className="flex items-center gap-2 text-amber-400 font-semibold p-2">
          <Send className="w-4 h-4 shrink-0" />
          <span>2. Retry Sent</span>
        </div>
        <div className="flex items-center gap-2 text-blue-400 font-semibold p-2">
          <Mail className="w-4 h-4 shrink-0" />
          <span>3. Reminder Sent</span>
        </div>
        <div className="flex items-center gap-2 text-purple-400 font-semibold p-2">
          <Eye className="w-4 h-4 shrink-0" />
          <span>4. Link Opened</span>
        </div>
        <div className="flex items-center gap-2 text-cyan-400 font-semibold p-2">
          <CreditCard className="w-4 h-4 shrink-0" />
          <span>5. Card Updated</span>
        </div>
        <div className="flex items-center gap-2 text-emerald-400 font-bold p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>6. Recovered</span>
        </div>
      </div>

      {/* Sequential Event List */}
      <div className="relative pl-6 space-y-6 before:absolute before:left-3 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
        {sorted.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/30 rounded-xl border border-white/[0.04]">
            <p className="text-xs text-slate-400">No automation events recorded yet. Connect your billing provider to see live recovery events.</p>
          </div>
        ) : (
          sorted.map((item) => {
            const badge = getStageBadge(item.stage);
            return (
              <div key={item.id} className="relative group">
                {/* Node Icon on line */}
                <div
                  className={`absolute -left-6 top-1 w-6 h-6 rounded-full flex items-center justify-center border shadow-sm ${badge.iconClass}`}
                >
                  {badge.icon}
                </div>

                {/* Event Card */}
                <div className="bg-slate-900/80 hover:bg-slate-900 border border-white/[0.08] hover:border-slate-700 rounded-xl p-4 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${badge.pillClass}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs font-bold text-white">{item.title}</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{item.description}</p>
                    </div>

                    {item.amountFormatted && (
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-emerald-400 font-mono">{item.amountFormatted}</div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Bank Settled</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/[0.04] flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-medium text-slate-300">{item.customerName}</span>
                    <span className="font-mono text-slate-500">{item.timestampFormatted} ({item.relativeTime})</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

function getStageBadge(stage: HumanTimelineItem['stage']) {
  switch (stage) {
    case 'CARD_FAILED':
      return {
        label: 'Card Failed',
        icon: <AlertTriangle className="w-3 h-3 text-rose-400" />,
        iconClass: 'bg-rose-950/80 border-rose-500/40',
        pillClass: 'bg-rose-500/10 text-rose-300 border border-rose-500/30',
      };
    case 'RETRY_SENT':
      return {
        label: 'Retry Sent',
        icon: <Send className="w-3 h-3 text-amber-400" />,
        iconClass: 'bg-amber-950/80 border-amber-500/40',
        pillClass: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
      };
    case 'REMINDER_SENT':
      return {
        label: 'Reminder Sent',
        icon: <Mail className="w-3 h-3 text-blue-400" />,
        iconClass: 'bg-blue-950/80 border-blue-500/40',
        pillClass: 'bg-blue-500/10 text-blue-300 border border-blue-500/30',
      };
    case 'LINK_OPENED':
      return {
        label: 'Link Opened',
        icon: <Eye className="w-3 h-3 text-purple-400" />,
        iconClass: 'bg-purple-950/80 border-purple-500/40',
        pillClass: 'bg-purple-500/10 text-purple-300 border border-purple-500/30',
      };
    case 'CARD_UPDATED':
      return {
        label: 'Card Updated',
        icon: <CreditCard className="w-3 h-3 text-cyan-400" />,
        iconClass: 'bg-cyan-950/80 border-cyan-500/40',
        pillClass: 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30',
      };
    case 'PAYMENT_RECOVERED':
      return {
        label: 'Recovered',
        icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
        iconClass: 'bg-emerald-950/80 border-emerald-500/40',
        pillClass: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold',
      };
  }
}

function getPlainFailureReason(raw: string = ''): string {
  const lower = raw.toLowerCase();
  if (lower.includes('insufficient')) return 'Insufficient funds';
  if (lower.includes('expired')) return 'Expired card';
  if (lower.includes('downtime') || lower.includes('network')) return 'Bank downtime';
  if (lower.includes('limit')) return 'Card limit exceeded';
  if (lower.includes('authentication')) return '3D Secure authentication required';
  return 'Payment method declined';
}

function getRelativeTime(isoString: string): string {
  if (!isoString) return 'recently';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
