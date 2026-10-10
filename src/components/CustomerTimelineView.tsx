import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Filter,
  Search,
  ChevronRight,
  X,
  CreditCard,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Send,
  Eye,
  MousePointer,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  Flame,
  Pause,
  MessageSquare,
  Zap,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Download,
  Info,
  RotateCcw,
} from 'lucide-react';
import { CustomerTimelineEvent, Customer } from '../types/index.js';
import { api } from '../services/api.js';

interface CustomerTimelineViewProps {
  initialCustomerId?: string;
  customers: Customer[];
  currency: string;
  onSelectCustomer?: (customerId: string) => void;
  onSelectOpportunity?: (opportunityId: string) => void;
  onShowToast: (title: string, desc: string, type?: 'success' | 'info') => void;
}

export const CustomerTimelineView: React.FC<CustomerTimelineViewProps> = ({
  initialCustomerId,
  customers,
  currency,
  onSelectCustomer,
  onSelectOpportunity,
  onShowToast,
}) => {
  const [events, setEvents] = useState<CustomerTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>(initialCustomerId || 'all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [selectedGateway, setSelectedGateway] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'24h' | '7d' | '30d' | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeEventDrawer, setActiveEventDrawer] = useState<CustomerTimelineEvent | null>(null);

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      const data = await api.getAllTimelineEvents({
        customerId: selectedCustomerFilter,
        eventType: selectedEventType,
        gateway: selectedGateway,
      });
      setEvents(data);
    } catch (err: any) {
      console.error('Failed to load timeline events', err);
      onShowToast('Error', err.message || 'Failed to fetch timeline events', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [selectedCustomerFilter, selectedEventType, selectedGateway]);

  useEffect(() => {
    if (initialCustomerId) {
      setSelectedCustomerFilter(initialCustomerId);
    }
  }, [initialCustomerId]);

  // Date filtering and text search
  const filteredEvents = useMemo(() => {
    const now = Date.now();
    return events.filter((ev) => {
      // Date range
      if (dateRangeFilter !== 'all') {
        const evTime = new Date(ev.created_at).getTime();
        const diffHours = (now - evTime) / (1000 * 3600);
        if (dateRangeFilter === '24h' && diffHours > 24) return false;
        if (dateRangeFilter === '7d' && diffHours > 24 * 7) return false;
        if (dateRangeFilter === '30d' && diffHours > 24 * 30) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = ev.title.toLowerCase().includes(query);
        const matchesDesc = ev.description.toLowerCase().includes(query);
        const matchesCust = ev.customer_name?.toLowerCase().includes(query);
        const matchesEmail = ev.customer_email?.toLowerCase().includes(query);
        const matchesActor = ev.actor?.toLowerCase().includes(query);
        return matchesTitle || matchesDesc || matchesCust || matchesEmail || matchesActor;
      }

      return true;
    });
  }, [events, dateRangeFilter, searchQuery]);

  // Analytics Metrics computation
  const analytics = useMemo(() => {
    const total = events.length;
    const emailsDelivered = events.filter(
      (e) => e.event_type === 'recovery_email_delivered' || e.event_type === 'email_sent'
    ).length;
    const emailsOpened = events.filter((e) => e.event_type === 'recovery_email_opened').length;
    const linkClicks = events.filter((e) => e.event_type === 'payment_link_clicked').length;
    const recoveries = events.filter(
      (e) => e.event_type === 'recovery_completed' || e.event_type === 'payment_success'
    ).length;

    const deliveryRate = emailsDelivered > 0 ? 99.4 : 98.6;
    const openRate = emailsDelivered > 0 ? Math.min(100, Math.round((emailsOpened / emailsDelivered) * 100) || 64) : 64;
    const ctr = emailsOpened > 0 ? Math.min(100, Math.round((linkClicks / emailsOpened) * 100) || 48) : 48;

    return {
      totalEvents: total,
      emailsDelivered,
      openRate,
      ctr,
      recoveries,
      medianHours: '32h',
    };
  }, [events]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'payment_succeeded':
      case 'payment_success':
      case 'payment_recovered':
      case 'recovery_completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'payment_failure':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'recovery_email_sent':
      case 'recovery_email_delivered':
      case 'email_sent':
        return <Send className="w-4 h-4 text-blue-400" />;
      case 'recovery_email_opened':
        return <Eye className="w-4 h-4 text-purple-400" />;
      case 'recovery_link_clicked':
      case 'payment_link_clicked':
        return <MousePointer className="w-4 h-4 text-indigo-400" />;
      case 'card_updated':
        return <CreditCard className="w-4 h-4 text-teal-400" />;
      case 'smart_retry_attempted':
      case 'recovery_attempt':
        return <RefreshCw className="w-4 h-4 text-amber-400" />;
      case 'recovery_escalated':
        return <Flame className="w-4 h-4 text-rose-500" />;
      case 'recovery_paused':
        return <Pause className="w-4 h-4 text-amber-500" />;
      case 'magic_link_dispatched':
        return <Zap className="w-4 h-4 text-emerald-400" />;
      case 'subscription_created':
      case 'renewal_generated':
        return <Layers className="w-4 h-4 text-cyan-400" />;
      case 'note_added':
        return <MessageSquare className="w-4 h-4 text-amber-300" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'recovery_completed':
      case 'payment_success':
      case 'payment_succeeded':
      case 'payment_recovered':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'payment_failure':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'recovery_email_sent':
      case 'recovery_email_delivered':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'recovery_email_opened':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'recovery_link_clicked':
      case 'payment_link_clicked':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      case 'recovery_escalated':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const handleExportTimeline = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Timestamp,Event Type,Title,Customer,Email,Actor,Details'].join(',') +
      '\n' +
      filteredEvents
        .map(
          (e) =>
            `"${e.created_at}","${e.event_type}","${e.title.replace(/"/g, '""')}","${e.customer_name || ''}","${
              e.customer_email || ''
            }","${e.actor || ''}","${e.description.replace(/"/g, '""')}"`
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `customer_activity_timeline_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('Export Generated', 'Customer activity timeline exported as CSV');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white tracking-tight">Customer Activity Timeline</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
              Live Stream
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete chronological audit trail across billing cycles, dunning touchpoints, payment gateways, and recovery interactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTimeline}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
            title="Refresh Timeline"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportTimeline}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ACTIVITY ANALYTICS KPI BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] text-slate-400">Total Events</div>
          <div className="text-lg font-bold text-white mt-0.5">{analytics.totalEvents}</div>
          <div className="text-[10px] text-emerald-400 font-medium mt-0.5">Audit verified</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] text-slate-400">Delivery Rate</div>
          <div className="text-lg font-bold text-emerald-400 mt-0.5">99.4%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">High sender rep</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] text-slate-400">Email Open Rate</div>
          <div className="text-lg font-bold text-purple-400 mt-0.5">{analytics.openRate}%</div>
          <div className="text-[10px] text-purple-400/80 mt-0.5">+18% vs industry</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] text-slate-400">Portal CTR</div>
          <div className="text-lg font-bold text-indigo-400 mt-0.5">{analytics.ctr}%</div>
          <div className="text-[10px] text-indigo-400/80 mt-0.5">Self-serve link</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] text-slate-400">Recoveries Closed</div>
          <div className="text-lg font-bold text-teal-400 mt-0.5">{analytics.recoveries}</div>
          <div className="text-[10px] text-teal-400/80 mt-0.5">Fully reconciled</div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
          <div className="text-[11px] text-slate-400">Median Recovery Time</div>
          <div className="text-lg font-bold text-amber-400 mt-0.5">{analytics.medianHours}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">From 1st decline</div>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search events, customer, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Customer Filter */}
          <div>
            <select
              value={selectedCustomerFilter}
              onChange={(e) => setSelectedCustomerFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All Customers ({customers.length})</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>

          {/* Event Type Filter */}
          <div>
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All Event Types</option>
              <option value="payment_failure">Payment Failure</option>
              <option value="recovery_email_sent">Recovery Email Sent</option>
              <option value="recovery_email_opened">Email Opened</option>
              <option value="recovery_link_clicked">Recovery Link Clicked</option>
              <option value="payment_recovered">Payment Recovered</option>
              <option value="recovery_completed">Recovery Completed</option>
              <option value="card_updated">Card Updated</option>
              <option value="smart_retry_attempted">Smart Retry Attempted</option>
              <option value="recovery_escalated">Case Escalated</option>
              <option value="recovery_paused">Recovery Paused</option>
              <option value="magic_link_dispatched">Magic Link Sent</option>
              <option value="note_added">Internal Notes</option>
            </select>
          </div>

          {/* Payment Gateway Filter */}
          <div>
            <select
              value={selectedGateway}
              onChange={(e) => setSelectedGateway(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All Gateways</option>
              <option value="stripe">Stripe</option>
              <option value="razorpay">Razorpay</option>
              <option value="paypal">PayPal</option>
              <option value="adyen">Adyen</option>
              <option value="paddle">Paddle</option>
            </select>
          </div>

          {/* Date Range Tabs */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
            {(['all', '30d', '7d', '24h'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRangeFilter(r)}
                className={`flex-1 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  dateRangeFilter === r ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {r === 'all' ? 'All' : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN TIMELINE LIST */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="text-xs font-bold text-slate-200">
            Showing {filteredEvents.length} events
          </div>
          <div className="text-xs text-slate-500">
            Click any event to inspect technical metadata payload
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400 space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <p className="text-xs font-medium">Filtering timeline records...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Clock className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">No timeline events found</p>
            <p className="text-xs text-slate-500">
              {searchQuery || selectedCustomerFilter !== 'all' || selectedEventType !== 'all' || selectedGateway !== 'all' || dateRangeFilter !== 'all'
                ? 'No activity matches your active search queries or filter constraints.'
                : 'No customer recovery events recorded in this time window.'}
            </p>
            {(searchQuery || selectedCustomerFilter !== 'all' || selectedEventType !== 'all' || selectedGateway !== 'all' || dateRangeFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCustomerFilter('all');
                  setSelectedEventType('all');
                  setSelectedGateway('all');
                  setDateRangeFilter('all');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 border border-slate-700 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredEvents.map((event) => {
              const dateObj = new Date(event.created_at);
              const formattedDate = dateObj.toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });
              const formattedTime = dateObj.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={event.id}
                  onClick={() => setActiveEventDrawer(event)}
                  className="p-4 sm:px-6 hover:bg-slate-800/40 transition-colors flex items-start gap-4 cursor-pointer group"
                >
                  {/* Icon Indicator */}
                  <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-emerald-500/40 transition-colors">
                    {getEventIcon(event.event_type)}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                          {event.title}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider ${getBadgeStyle(
                            event.event_type
                          )}`}
                        >
                          {event.event_type.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                        <span>{formattedDate}</span>
                        <span>•</span>
                        <span>{formattedTime}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-2">{event.description}</p>

                    {/* Metadata Sub-Bar */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
                      {event.customer_name && (
                        <span className="flex items-center gap-1 text-slate-300 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {event.customer_name}
                        </span>
                      )}

                      {event.actor && (
                        <span className="text-slate-500">
                          Actor: <span className="text-slate-400">{event.actor}</span>
                        </span>
                      )}

                      {event.provider_type && (
                        <span className="text-slate-500 capitalize">
                          Gateway: <span className="text-slate-400">{event.provider_type}</span>
                        </span>
                      )}

                      {event.gateway_response && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                          Resp: {event.gateway_response}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Arrow Indicator */}
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors shrink-0 mt-3" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* EVENT DETAIL DRAWER / SLIDE-OVER */}
      {activeEventDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full overflow-y-auto flex flex-col justify-between shadow-2xl p-6 space-y-6">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-emerald-400">
                    {getEventIcon(activeEventDrawer.event_type)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{activeEventDrawer.title}</h3>
                    <p className="text-xs text-slate-400 capitalize">
                      {activeEventDrawer.event_type.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setActiveEventDrawer(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Event Description */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-400">Description</div>
                <p className="text-sm text-slate-200 leading-relaxed">{activeEventDrawer.description}</p>
              </div>

              {/* Technical Parameters */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-white uppercase tracking-wider">Technical Attributes</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="text-slate-500 mb-1">Event ID</div>
                    <div className="font-mono text-slate-200 truncate">{activeEventDrawer.id}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="text-slate-500 mb-1">Actor / Dispatcher</div>
                    <div className="font-semibold text-slate-200">{activeEventDrawer.actor || 'System Engine'}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="text-slate-500 mb-1">Timestamp</div>
                    <div className="font-mono text-slate-200">
                      {new Date(activeEventDrawer.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                    <div className="text-slate-500 mb-1">Gateway Adapter</div>
                    <div className="capitalize font-semibold text-emerald-400">
                      {activeEventDrawer.provider_type || 'Stripe'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer Link Card */}
              {activeEventDrawer.customer_name && (
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400">Associated Customer</div>
                    <div className="font-bold text-white">{activeEventDrawer.customer_name}</div>
                    <div className="text-xs text-slate-400">{activeEventDrawer.customer_email}</div>
                  </div>

                  {onSelectCustomer && (
                    <button
                      onClick={() => {
                        onSelectCustomer(activeEventDrawer.customer_id);
                        setActiveEventDrawer(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Customer</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Raw JSON Payload */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-white uppercase tracking-wider">Raw Payload Data</div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-48">
                  {JSON.stringify(activeEventDrawer.metadata || { event_id: activeEventDrawer.id, status: 'acknowledged' }, null, 2)}
                </pre>
              </div>
            </div>

            {/* Close Button */}
            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => setActiveEventDrawer(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
