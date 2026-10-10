import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  User,
  CreditCard,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Edit2,
  Trash2,
  PlusCircle,
  FileText,
  Mail,
  RotateCcw,
  Coins,
  AlertCircle,
  Activity,
  Calendar,
  MessageSquare,
  Send,
  ShieldAlert,
  ShieldCheck,
  Ban,
  Check,
  History,
  Briefcase,
} from 'lucide-react';
import {
  Customer,
  RecoveryOpportunity,
  Subscription,
  Invoice,
  PaymentFailure,
  CustomerTimelineEvent,
} from '../types/index.js';
import { api } from '../services/api.js';
import { formatCurrencyAmount, CURRENCY_LIST, getCurrencySymbol } from '../utils/currency.js';
import { validateEmail, validatePhone, validateCustomerName } from '../utils/validation.js';
import { formatBillingInterval } from '../utils/subscription.js';
import {
  extractHealthScoreNumber,
  getHealthGrade,
  extractHealthReasons,
} from '../utils/healthScore.js';

interface CustomerDetailModalProps {
  customerId: string | null;
  currency: string;
  onClose: () => void;
  onIngestFailure: (customerId: string) => void;
  onRefresh: () => void;
  onOpenOpportunity?: (opp: RecoveryOpportunity) => void;
  onNavigateToTimeline?: (customerId: string) => void;
  onSelectOpportunity?: (opportunityId: string) => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  customerId,
  currency,
  onClose,
  onIngestFailure,
  onRefresh,
  onOpenOpportunity,
  onNavigateToTimeline,
  onSelectOpportunity,
}) => {
  const [details, setDetails] = useState<{
    customer: Customer;
    subscriptions: Subscription[];
    invoices: Invoice[];
    failures: PaymentFailure[];
    opportunities: RecoveryOpportunity[];
    emails: any[];
    timeline: CustomerTimelineEvent[];
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editRiskStatus, setEditRiskStatus] = useState<Customer['current_risk_status']>('healthy');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'invoices' | 'recovery' | 'subscriptions' | 'timeline'>('overview');

  // New Note state
  const [newNote, setNewNote] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    loadDetails();
  }, [customerId]);

  const loadDetails = async () => {
    if (!customerId) return;
    setIsLoading(true);
    try {
      const data = await api.getCustomerDetails(customerId);
      setDetails(data);
      if (data?.customer) {
        setEditName(data.customer.name);
        setEditEmail(data.customer.email);
        setEditPhone(data.customer.phone || '');
        setEditCurrency(data.customer.currency || currency || 'USD');
        setEditRiskStatus(data.customer.current_risk_status);
      }
    } catch (err) {
      console.error('Failed to load customer details', err);
    } finally {
      setIsLoading(false);
    }
  };

  const nameVal = useMemo(() => validateCustomerName(editName), [editName]);
  const emailVal = useMemo(() => validateEmail(editEmail), [editEmail]);
  const phoneVal = useMemo(() => validatePhone(editPhone, details?.customer?.country || 'US'), [editPhone, details?.customer?.country]);

  const isEditValid = nameVal.isValid && emailVal.isValid && (!editPhone.trim() || phoneVal.isValid);

  if (!customerId) return null;

  const formatCurrency = (cents: number, curr?: string) => {
    return formatCurrencyAmount(cents, curr || details?.customer?.currency || currency || 'USD');
  };

  const handleSaveEdit = async () => {
    if (!customerId) return;
    if (!isEditValid) {
      setEditError('Please correct validation errors in the form.');
      return;
    }
    setIsSaving(true);
    setEditError(null);
    try {
      const updated = await api.updateCustomer(customerId, {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        phone: editPhone.trim() || undefined,
        currency: editCurrency,
        current_risk_status: editRiskStatus,
      });
      setDetails((prev) => (prev ? { ...prev, customer: { ...prev.customer, ...updated } } : null));
      setIsEditing(false);
      onRefresh();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update customer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !customerId) return;
    setIsSubmittingNote(true);
    setActionFeedback(null);
    try {
      const noteEvent = await api.addCustomerNote(customerId, newNote.trim());
      setDetails((prev) => prev ? { ...prev, timeline: [noteEvent, ...(prev.timeline || [])] } : null);
      setNewNote('');
      setActionFeedback({ message: 'Internal customer note recorded.', isError: false });
    } catch (err: any) {
      setActionFeedback({ message: err.message || 'Failed to add internal note', isError: true });
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleCancelSubscription = async (subId: string) => {
    setActionFeedback(null);
    try {
      const updated = await api.cancelSubscription(subId);
      setDetails((prev) =>
        prev
          ? {
              ...prev,
              subscriptions: prev.subscriptions.map((s) => (s.id === subId ? updated : s)),
            }
          : null
      );
      onRefresh();
      setActionFeedback({ message: 'Subscription canceled successfully.', isError: false });
    } catch (err: any) {
      setActionFeedback({ message: err.message || 'Failed to cancel subscription', isError: true });
    }
  };

  const handleDelete = async () => {
    if (!customerId) return;
    setActionFeedback(null);
    try {
      await api.deleteCustomer(customerId);
      onClose();
      onRefresh();
    } catch (err: any) {
      setActionFeedback({ message: err.message || 'Failed to delete customer', isError: true });
    }
  };

  const customer = details?.customer;
  const healthScore = extractHealthScoreNumber(customer?.health_score);
  const healthGrade = customer?.health_grade || getHealthGrade(healthScore);
  const healthReasons = extractHealthReasons(customer?.health_score, customer?.health_reasons);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-base">
              {customer?.name.charAt(0) || 'C'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{customer?.name || 'Customer Details'}</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    customer?.current_risk_status === 'healthy'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : customer?.current_risk_status === 'at_risk'
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {customer?.current_risk_status?.replace(/_/g, ' ') || 'HEALTHY'}
                </span>

                {customer?.health_score !== undefined && (
                  <div
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-bold flex items-center gap-1.5 ${
                      healthScore >= 80
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : healthScore >= 60
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    <Activity className="w-3 h-3" />
                    <span>Health: {healthScore}/100</span>
                    <span className="px-1 py-0.2 bg-black/40 rounded text-[9px]">
                      Grade {healthGrade}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {customer?.email} • ID: {customer?.provider_customer_id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToTimeline && customerId && (
              <button
                onClick={() => {
                  onClose();
                  onNavigateToTimeline(customerId);
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="View Full Customer Activity Timeline"
              >
                <History className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Activity Timeline</span>
              </button>
            )}

            <button
              onClick={() => onIngestFailure(customerId)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/90 hover:bg-rose-600 text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Simulate Failure</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-800 bg-slate-900/50 flex gap-4 text-xs font-semibold text-slate-400">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`py-3 border-b-2 transition-colors cursor-pointer ${
              activeSubTab === 'overview'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            Overview & Metrics
          </button>
          <button
            onClick={() => setActiveSubTab('recovery')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'recovery'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            <span>Recovery Opportunities</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {details?.opportunities?.length || 0}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('invoices')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'invoices'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            <span>Invoices</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {details?.invoices?.length || 0}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('subscriptions')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'subscriptions'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            <span>Subscriptions</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {details?.subscriptions?.length || 0}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('timeline')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'timeline'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            <span>Timeline & Notes</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {details?.timeline?.length || 0}
            </span>
          </button>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`mx-6 mt-3 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between gap-3 border ${
              actionFeedback.isError
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionFeedback.isError ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {isLoading && !details ? (
            <div className="py-12 text-center text-slate-400 text-xs">Loading customer profile...</div>
          ) : !customer ? (
            <div className="py-12 text-center text-slate-400 text-xs">Customer not found</div>
          ) : (
            <>
              {activeSubTab === 'overview' && (
                <div className="space-y-6">
                  {/* Financial Stats Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                      <span className="text-xs text-slate-400">Lifetime Revenue</span>
                      <div className="text-xl font-black text-white font-mono mt-1">
                        {formatCurrency(customer.lifetime_value_cents, customer.currency)}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                      <span className="text-xs text-slate-400">Recovered Revenue</span>
                      <div className="text-xl font-black text-emerald-400 font-mono mt-1">
                        {formatCurrency(customer.total_recovered_cents, customer.currency)}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl">
                      <span className="text-xs text-slate-400">Gateway Provider</span>
                      <div className="text-xl font-black text-white uppercase font-mono mt-1">
                        {customer.provider_type}
                      </div>
                    </div>
                  </div>

                  {/* Customer Health Score & Risk Diagnostic Card */}
                  <div className="p-5 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Account Health Score & Churn Risk Engine
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono">
                          Score: <strong className="text-white">{healthScore}</strong>/100
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            healthScore >= 80
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : healthScore >= 60
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          Grade {healthGrade}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/80">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          healthScore >= 80
                            ? 'bg-emerald-500'
                            : healthScore >= 60
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.max(5, Math.min(100, healthScore))}%` }}
                      />
                    </div>

                    {/* Diagnostic Factors */}
                    {healthReasons.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                          Key Diagnostic Drivers:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {healthReasons.map((reason, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] text-slate-300 flex items-start gap-1.5 p-2 rounded-lg bg-slate-900/40 border border-slate-800"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              <span>{reason}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Profile & Edit Panel */}
                  <div className="p-5 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Profile Attributes
                      </h4>
                      {!isEditing ? (
                        <button
                          onClick={() => setIsEditing(true)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit Profile</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsEditing(false)}
                            className="px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors"
                          >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      )}
                    </div>

                    {!isEditing ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-slate-500">Full Name:</span>
                          <p className="font-semibold text-white mt-0.5">{customer.name}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Email Address:</span>
                          <p className="font-semibold text-white mt-0.5">{customer.email}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Billing Currency:</span>
                          <p className="font-semibold text-emerald-400 mt-0.5 font-mono">
                            {getCurrencySymbol(customer.currency || currency)} {customer.currency || currency}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-500">Phone:</span>
                          <p className="font-semibold text-white mt-0.5">{customer.phone || 'Not specified'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Country:</span>
                          <p className="font-semibold text-white mt-0.5">{customer.country || 'US'}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Status:</span>
                          <p className="font-semibold text-slate-300 mt-0.5 capitalize">
                            {customer.current_risk_status.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {editError && (
                          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                            <span>{editError}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-slate-400">Full Name *</label>
                              {nameVal.isValid && (
                                <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" /> Valid
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className={`w-full px-3 py-1.5 bg-slate-800 border rounded-lg text-white text-xs focus:outline-none ${
                                !nameVal.isValid ? 'border-rose-500' : 'border-slate-700 focus:border-emerald-500'
                              }`}
                            />
                            {!nameVal.isValid && (
                              <p className="text-[10px] text-rose-400 mt-0.5">{nameVal.error}</p>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-slate-400">Email Address (RFC) *</label>
                              {emailVal.isValid && (
                                <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" /> RFC Valid
                                </span>
                              )}
                            </div>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              className={`w-full px-3 py-1.5 bg-slate-800 border rounded-lg text-white text-xs focus:outline-none ${
                                !emailVal.isValid ? 'border-rose-500' : 'border-slate-700 focus:border-emerald-500'
                              }`}
                            />
                            {!emailVal.isValid && (
                              <p className="text-[10px] text-rose-400 mt-0.5">{emailVal.error}</p>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-slate-400">Phone (E.164)</label>
                              {editPhone.trim() && phoneVal.isValid && (
                                <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                                  <CheckCircle2 className="w-3 h-3" /> E.164 Valid
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="+1 555-0182"
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value.replace(/[a-zA-Z]/g, ''))}
                              className={`w-full px-3 py-1.5 bg-slate-800 border rounded-lg text-white text-xs focus:outline-none ${
                                editPhone.trim() && !phoneVal.isValid ? 'border-rose-500' : 'border-slate-700 focus:border-emerald-500'
                              }`}
                            />
                            {editPhone.trim() && !phoneVal.isValid && (
                              <p className="text-[10px] text-rose-400 mt-0.5">{phoneVal.error}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-slate-400 mb-1">Currency</label>
                            <select
                              value={editCurrency}
                              onChange={(e) => setEditCurrency(e.target.value)}
                              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-500"
                            >
                              {CURRENCY_LIST.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.flag} {c.code} - {c.symbol} ({c.name})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-slate-400 mb-1">Account Risk Status</label>
                            <select
                              value={editRiskStatus}
                              onChange={(e) => setEditRiskStatus(e.target.value as any)}
                              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-emerald-500"
                            >
                              <option value="healthy">Healthy</option>
                              <option value="at_risk">At Risk (Active Failure)</option>
                              <option value="delinquent">Delinquent</option>
                              <option value="churned">Churned</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Danger Zone */}
                  <div className="p-4 rounded-xl border border-rose-900/40 bg-rose-950/10 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-rose-300">Archive Customer</h4>
                      <p className="text-[11px] text-rose-400/80">
                        Remove customer from active directory and stop upcoming dunning campaigns.
                      </p>
                    </div>
                    <button
                      onClick={handleDelete}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-900/60 hover:bg-rose-800 text-rose-200 flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Archive</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Recovery Opportunities Tab */}
              {activeSubTab === 'recovery' && (
                <div className="space-y-3">
                  {details?.opportunities.map((opp) => (
                    <div
                      key={opp.id}
                      className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">
                            {formatCurrency(opp.amount_at_risk_cents, opp.currency)}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              opp.status === 'recovered'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {opp.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-slate-400 capitalize">
                            • {opp.failure_category.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{opp.recommended_action}</p>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Token: <code className="text-slate-400 font-mono">{opp.recovery_token}</code> • Created:{' '}
                          {new Date(opp.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {onSelectOpportunity && (
                          <button
                            onClick={() => {
                              onClose();
                              onSelectOpportunity(opp.id);
                            }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Open in Case Command Center"
                          >
                            <Briefcase className="w-3.5 h-3.5" />
                            <span>Command Center</span>
                          </button>
                        )}
                        <a
                          href={`/pay/${opp.recovery_token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-400 flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Pay Portal</span>
                        </a>
                      </div>
                    </div>
                  ))}

                  {details?.opportunities.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      No recovery opportunities recorded for this customer.
                    </div>
                  )}
                </div>
              )}

              {/* Invoices Tab */}
              {activeSubTab === 'invoices' && (
                <div className="space-y-3">
                  {details?.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="font-semibold text-white text-xs font-mono">
                            {inv.provider_invoice_id}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Due: {new Date(inv.due_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-mono font-bold text-white text-xs">
                            {formatCurrency(inv.amount_cents, inv.currency)}
                          </div>
                          <span
                            className={`text-[10px] font-semibold uppercase ${
                              inv.status === 'paid'
                                ? 'text-emerald-400'
                                : inv.status === 'past_due'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {inv.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {details?.invoices.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-xs">No invoices found.</div>
                  )}
                </div>
              )}

              {/* Subscriptions Tab */}
              {activeSubTab === 'subscriptions' && (
                <div className="space-y-4">
                  {details?.subscriptions.map((sub) => {
                    const formattedInterval = formatBillingInterval(
                      sub.billing_interval,
                      sub.custom_interval_count,
                      sub.custom_interval_unit
                    );
                    const isTrialActive =
                      sub.trial_end_date && new Date(sub.trial_end_date).getTime() > Date.now();
                    const isGraceActive =
                      sub.grace_period_end_date &&
                      new Date(sub.grace_period_end_date).getTime() > Date.now();

                    return (
                      <div
                        key={sub.id}
                        className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-4"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-white text-sm">{sub.plan_name}</h4>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                  sub.status === 'active'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : sub.status === 'trialing'
                                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                    : sub.status === 'past_due'
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                }`}
                              >
                                {sub.status.replace(/_/g, ' ')}
                              </span>
                              {isTrialActive && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                                  Trial Active
                                </span>
                              )}
                              {isGraceActive && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                  Grace Period Active
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 mt-1">
                              Amount: <strong className="text-white font-mono">{formatCurrency(sub.amount_cents, sub.currency)}</strong> • Recurrence: <span className="text-emerald-400 font-semibold">{formattedInterval}</span> • ID: <code className="text-slate-400">{sub.provider_subscription_id}</code>
                            </div>
                          </div>

                          {sub.status !== 'canceled' && (
                            <button
                              onClick={() => handleCancelSubscription(sub.id)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Cancel Sub</span>
                            </button>
                          )}
                        </div>

                        {/* Subscription Engine Metadata Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-xs">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Next Billing</span>
                            <span className="font-semibold text-slate-200 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3 text-emerald-400" />
                              {sub.next_billing_date
                                ? new Date(sub.next_billing_date).toLocaleDateString()
                                : 'None'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block">Previous Billing</span>
                            <span className="font-semibold text-slate-200 mt-0.5 block">
                              {sub.previous_billing_date
                                ? new Date(sub.previous_billing_date).toLocaleDateString()
                                : 'None'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block">Renewals Count</span>
                            <span className="font-semibold text-white mt-0.5 block font-mono">
                              {sub.renewal_count || 0} cycles completed
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block">Grace Period</span>
                            <span className="font-semibold text-slate-200 mt-0.5 block">
                              {sub.grace_period_days ? `${sub.grace_period_days} Days` : 'Disabled'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block">Started Date</span>
                            <span className="text-slate-300 mt-0.5 block">
                              {sub.subscription_start_date ? new Date(sub.subscription_start_date).toLocaleDateString() : '—'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block">End Date</span>
                            <span className="text-slate-300 mt-0.5 block">
                              {sub.subscription_end_date ? new Date(sub.subscription_end_date).toLocaleDateString() : 'Ongoing'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block">Trial Period</span>
                            <span className="text-slate-300 mt-0.5 block">
                              {sub.trial_days ? `${sub.trial_days} Days` : 'No Trial'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 block">Custom Interval</span>
                            <span className="text-slate-300 mt-0.5 block font-mono">
                              {sub.custom_interval_count && sub.custom_interval_unit
                                ? `${sub.custom_interval_count} ${sub.custom_interval_unit}`
                                : 'Standard'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {details?.subscriptions.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      No subscriptions configured for this customer.
                    </div>
                  )}
                </div>
              )}

              {/* Timeline & Notes Tab */}
              {activeSubTab === 'timeline' && (
                <div className="space-y-5">
                  {/* Add Note Form */}
                  <form onSubmit={handleAddNote} className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                        Append Operator Note / Activity
                      </h4>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Log customer phone call, promise to pay, custom discount agreed..."
                        className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingNote || !newNote.trim()}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isSubmittingNote ? 'Saving...' : 'Post Note'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Timeline Events Feed */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                      Chronological Customer Activity History ({details?.timeline?.length || 0} events)
                    </h4>

                    {details?.timeline?.map((ev) => {
                      const isFailure = ev.event_type === 'payment_failure';
                      const isRetry = ev.event_type === 'smart_retry_attempted' || ev.event_type === 'recovery_attempt';
                      const isEmail = ev.event_type === 'email_sent';
                      const isSub = ev.event_type === 'subscription_created';
                      const isNote = ev.event_type === 'note_added';

                      return (
                        <div
                          key={ev.id}
                          className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 flex items-start gap-3"
                        >
                          <div
                            className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                              isFailure
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : isRetry
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : isEmail
                                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                                : isNote
                                ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {isFailure ? (
                              <AlertTriangle className="w-4 h-4" />
                            ) : isRetry ? (
                              <RotateCcw className="w-4 h-4" />
                            ) : isEmail ? (
                              <Mail className="w-4 h-4" />
                            ) : isNote ? (
                              <MessageSquare className="w-4 h-4" />
                            ) : (
                              <Activity className="w-4 h-4" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white text-xs capitalize">
                                  {ev.event_type.replace(/_/g, ' ')}
                                </span>
                                <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono">
                                  Actor: {ev.actor}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500 font-mono shrink-0">
                                {new Date(ev.created_at).toLocaleString()}
                              </span>
                            </div>

                            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                              {ev.description}
                            </p>

                            {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                              <div className="mt-2 text-[10px] text-slate-400 font-mono bg-slate-900/60 p-2 rounded border border-slate-800 overflow-x-auto">
                                {JSON.stringify(ev.metadata, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {(!details?.timeline || details.timeline.length === 0) && (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        No timeline events recorded yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
