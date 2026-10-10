import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Sparkles,
  Shield,
  Clock,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  XCircle,
  Check,
  Zap,
  Building2,
  FileText,
  Download,
  Globe,
  Lock,
  ArrowRight,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Workspace,
  PlatformPlanTier,
  PlatformBillingCycle,
  SupportedCurrency,
  AuthoritativeSubscriptionData,
  PlatformPlanDefinition,
  BillingProfileData,
  PlatformInvoiceData,
  WorkspaceTrialStatus,
} from '../types/index.js';
import { api } from '../services/api.js';

interface SubscriptionBillingTabProps {
  workspace: Workspace | null;
}

export const SubscriptionBillingTab: React.FC<SubscriptionBillingTabProps> = ({ workspace }) => {
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>('INR');
  const [billingCycle, setBillingCycle] = useState<PlatformBillingCycle>('monthly');
  const [loading, setLoading] = useState<boolean>(true);
  const [subscription, setSubscription] = useState<AuthoritativeSubscriptionData | null>(null);
  const [trialStatus, setTrialStatus] = useState<WorkspaceTrialStatus | null>(null);
  const [billingProfile, setBillingProfile] = useState<BillingProfileData | null>(null);
  const [plans, setPlans] = useState<PlatformPlanDefinition[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoiceData[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [foundingInfo, setFoundingInfo] = useState<{ totalClaimed: number; remainingSpots: number; isWorkspaceFounding: boolean }>({
    totalClaimed: 0,
    remainingSpots: 20,
    isWorkspaceFounding: false,
  });

  const [activeTab, setActiveTab] = useState<'plans' | 'invoices' | 'gst' | 'payment_methods'>('plans');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // GST Form state
  const [gstForm, setGstForm] = useState({
    business_name: '',
    billing_email: '',
    billing_phone: '',
    billing_address: '',
    city: '',
    state: 'Karnataka',
    postal_code: '',
    country: 'IN',
    gstin: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [pricingRes, subRes, invRes, pmRes] = await Promise.all([
        api.getBillingPricing({ currency: selectedCurrency }),
        api.getBillingSubscription(),
        api.getBillingInvoices(),
        api.getBillingPaymentMethods(),
      ]);

      if (pricingRes?.plans) {
        setPlans(pricingRes.plans);
      }
      if (subRes) {
        setSubscription(subRes.subscription);
        setTrialStatus(subRes.trialStatus);
        setBillingProfile(subRes.billingProfile);
        setFoundingInfo(subRes.foundingCustomerInfo);
        if (subRes.billingProfile) {
          setGstForm({
            business_name: subRes.billingProfile.business_name || '',
            billing_email: subRes.billingProfile.billing_email || '',
            billing_phone: subRes.billingProfile.billing_phone || '',
            billing_address: subRes.billingProfile.billing_address || '',
            city: subRes.billingProfile.city || '',
            state: subRes.billingProfile.state || 'Karnataka',
            postal_code: subRes.billingProfile.postal_code || '',
            country: subRes.billingProfile.country || 'IN',
            gstin: subRes.billingProfile.gstin || '',
          });
        }
      }
      if (invRes?.invoices) {
        setInvoices(invRes.invoices);
      }
      if (pmRes?.methods) {
        setPaymentMethods(pmRes.methods);
      }
    } catch (err: any) {
      console.warn('[BillingTab] Fetch notice:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspace?.id, selectedCurrency]);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Real Razorpay Subscription Checkout Flow
  const handleRazorpayCheckout = async (planTier: PlatformPlanTier) => {
    setIsProcessingCheckout(true);
    setToastMessage(null);

    try {
      // Step 1: Request authoritative backend to create real Razorpay subscription
      const order = await api.createBillingSubscriptionOrder({
        planTier,
        billingCycle,
        currency: selectedCurrency,
        customerName: gstForm.business_name || workspace?.name || 'ReviveOS Customer',
        customerEmail: gstForm.billing_email || 'billing@example.com',
      });

      if (!order || !order.subscriptionId) {
        throw new Error('Failed to create Razorpay subscription on ReviveOS platform account.');
      }

      // Step 2: Open Razorpay Checkout modal
      // We check if window.Razorpay script is loaded; otherwise load it dynamically
      const loadRazorpayScript = (): Promise<boolean> => {
        return new Promise((resolve) => {
          if ((window as any).Razorpay) return resolve(true);
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });
      };

      const loaded = await loadRazorpayScript();
      if (!loaded || !(window as any).Razorpay) {
        showToast('Razorpay Checkout SDK could not be loaded. Please verify internet access and ensure third-party payment scripts are not blocked.', 'error');
        setIsProcessingCheckout(false);
        return;
      }

      const options = {
        key: order.keyId,
        subscription_id: order.subscriptionId,
        name: 'ReviveOS Platform',
        description: `Subscription: ${planTier.toUpperCase()} Plan (${billingCycle})`,
        image: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        handler: async (response: any) => {
          try {
            // Step 3: Send Razorpay signature to authoritative backend for verification
            const verifyRes = await api.verifyBillingCheckout({
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySubscriptionId: response.razorpay_subscription_id,
              razorpaySignature: response.razorpay_signature,
              planTier,
              billingCycle,
              currency: selectedCurrency,
              cardLast4: '4242',
              cardNetwork: 'Visa',
            });
            setSubscription(verifyRes.subscription);
            await loadData();
            showToast(`🎉 Payment confirmed! Subscription activated for ${planTier.toUpperCase()}!`, 'success');
          } catch (vErr: any) {
            showToast(`Verification failed: ${vErr.message}`, 'error');
          } finally {
            setIsProcessingCheckout(false);
          }
        },
        prefill: {
          name: gstForm.business_name || workspace?.name,
          email: gstForm.billing_email,
        },
        theme: {
          color: '#4f46e5',
        },
        modal: {
          ondismiss: () => {
            setIsProcessingCheckout(false);
            showToast('Checkout canceled by user.', 'info');
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      showToast(err.message || 'Checkout failed', 'error');
      setIsProcessingCheckout(false);
    }
  };

  const handleSaveGstProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await api.updateBillingProfile(gstForm);
      if (res.profile) {
        setBillingProfile(res.profile);
        showToast('Billing & GST profile saved successfully!', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update GST profile', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleOpenCustomerPortal = async () => {
    setIsOpeningPortal(true);
    try {
      const res = await api.getBillingCustomerPortal();
      if (res?.url) {
        window.open(res.url, '_blank');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to open billing portal', 'error');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const activePlanTier = subscription?.plan_id || 'growth';
  const isFoundingCustomer = Boolean(subscription?.is_founding_customer);
  const status = subscription?.status || 'trial';

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm shadow-lg transition-all ${
            toastType === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : toastType === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
          }`}
        >
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-4 font-bold text-xs opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Top Banner: Status & Founding Customer Badge */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Active Plan</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : status === 'trial'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {status}
              </span>
              {isFoundingCustomer && (
                <span className="bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-xs px-3 py-0.5 rounded-full shadow-md flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> FOUNDING CUSTOMER #{subscription?.founding_customer_number || 1}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold text-white capitalize flex items-center gap-3">
              ReviveOS {activePlanTier} Plan
              <span className="text-sm font-normal text-slate-400">
                ({subscription?.billing_cycle === 'annual' ? 'Billed Annually' : 'Billed Monthly'})
              </span>
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Next billing cycle:{' '}
              <span className="text-slate-200 font-medium">
                {subscription?.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString() : 'Active Free Trial'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenCustomerPortal}
              disabled={isOpeningPortal}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition-all flex items-center gap-2 shadow-sm"
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
              {isOpeningPortal ? 'Opening Portal...' : 'Razorpay Billing Portal'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-3 text-sm font-semibold transition-all relative ${
            activeTab === 'plans' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Subscription Plans
        </button>
        <button
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 text-sm font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'invoices' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" /> Invoices & Receipts ({invoices.length})
        </button>
        <button
          onClick={() => setActiveTab('gst')}
          className={`pb-3 text-sm font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'gst' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" /> India GST & Tax Profile
        </button>
        <button
          onClick={() => setActiveTab('payment_methods')}
          className={`pb-3 text-sm font-semibold transition-all relative flex items-center gap-2 ${
            activeTab === 'payment_methods' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" /> Payment Methods
        </button>
      </div>

      {/* TAB 1: SUBSCRIPTION PLANS & CHECKOUT */}
      {activeTab === 'plans' && (
        <div className="space-y-6">
          {/* Currency & Billing Cycle Selectors */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span className="text-xs text-slate-400 font-medium">Billing Currency:</span>
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                {(['INR', 'USD', 'GBP', 'EUR', 'AED', 'SGD', 'AUD'] as SupportedCurrency[]).map((cur) => (
                  <button
                    key={cur}
                    onClick={() => setSelectedCurrency(cur)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                      selectedCurrency === cur ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    billingCycle === 'monthly' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
                    billingCycle === 'annual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Annual <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-extrabold">Save 17%</span>
                </button>
              </div>
            </div>
          </div>

          {/* Founding Customer Banner */}
          {!isFoundingCustomer && (
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-bold text-sm">Founding Customer Program</h4>
                    <span className="text-xs font-extrabold px-2 py-0.5 rounded bg-amber-500 text-slate-950">
                      {foundingInfo.remainingSpots} of 20 spots remaining
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    First 20 customers lock in <span className="font-bold text-amber-300">₹999/month forever</span> with zero price increases.
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRazorpayCheckout('founding')}
                disabled={isProcessingCheckout || foundingInfo.remainingSpots <= 0}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all"
              >
                Claim Founding Spot (₹999/mo)
              </button>
            </div>
          )}

          {/* Pricing Tier Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {plans
              .filter((p) => p.id !== 'founding')
              .map((plan) => {
                const pricing = plan.pricing?.[selectedCurrency] || {
                  monthlyAmount: 0,
                  annualAmount: 0,
                  currencySymbol: selectedCurrency === 'INR' ? '₹' : '$',
                };
                const price = billingCycle === 'annual' ? pricing.annualAmount : pricing.monthlyAmount;
                const isCurrent = activePlanTier === plan.id;

                return (
                  <div
                    key={plan.id}
                    className={`bg-slate-900 border rounded-2xl p-6 flex flex-col justify-between transition-all relative ${
                      isCurrent
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                        : plan.popular
                        ? 'border-indigo-500/50 hover:border-indigo-500'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {plan.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[11px] font-extrabold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-md">
                        Most Popular
                      </span>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-lg text-white">{plan.name}</h3>
                      </div>
                      <p className="text-xs text-slate-400 min-h-[36px]">{plan.description}</p>

                      <div className="my-6">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-extrabold text-white">
                            {plan.id === 'enterprise' ? 'Custom' : `${pricing.currencySymbol}${price.toLocaleString()}`}
                          </span>
                          {plan.id !== 'enterprise' && (
                            <span className="text-xs text-slate-400 font-medium">
                              /{billingCycle === 'annual' ? 'year' : 'month'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">+ 18% GST for Indian entities</div>
                      </div>

                      <div className="space-y-2.5 mb-6 text-xs text-slate-300">
                        {plan.features.map((f, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRazorpayCheckout(plan.id)}
                      disabled={isProcessingCheckout || isCurrent}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        isCurrent
                          ? 'bg-slate-800 text-slate-400 cursor-default'
                          : plan.popular
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
                      }`}
                    >
                      {isCurrent ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Current Plan
                        </>
                      ) : isProcessingCheckout ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Initializing...
                        </>
                      ) : (
                        <>
                          Upgrade with Razorpay <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 2: INVOICES & RECEIPTS */}
      {activeTab === 'invoices' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-white">Invoice History & GST Tax Breakdown</h3>
              <p className="text-xs text-slate-400 mt-0.5">Official GST-compliant tax invoices for your ReviveOS subscriptions</p>
            </div>
          </div>

          {invoices.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No invoices generated yet. Invoices appear here automatically after subscription payments.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Plan</th>
                    <th className="py-3 px-4">Taxable</th>
                    <th className="py-3 px-4">Tax (GST)</th>
                    <th className="py-3 px-4">Total Paid</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-white">{inv.invoice_number}</td>
                      <td className="py-3.5 px-4">{new Date(inv.invoice_date).toLocaleDateString()}</td>
                      <td className="py-3.5 px-4 capitalize">{inv.plan_tier}</td>
                      <td className="py-3.5 px-4">
                        {inv.currency} {(inv.taxable_amount_subunits / 100).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        {inv.currency} {(inv.tax_amount_subunits / 100).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400">
                        {inv.currency} {(inv.amount_subunits / 100).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <a
                          href={`/api/billing/invoices/${inv.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg inline-flex items-center gap-1.5 font-medium transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" /> PDF / HTML
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INDIA GST & TAX PROFILE */}
      {activeTab === 'gst' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-3xl">
          <div className="mb-6">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" /> Indian GST & Business Tax Details
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Provide your 15-character GSTIN to receive valid B2B tax invoices with Input Tax Credit (ITC) eligibility under SAC 998313.
            </p>
          </div>

          <form onSubmit={handleSaveGstProfile} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Registered Business Name</label>
                <input
                  type="text"
                  required
                  value={gstForm.business_name}
                  onChange={(e) => setGstForm({ ...gstForm, business_name: e.target.value })}
                  placeholder="e.g. Acme Technologies Pvt Ltd"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">GSTIN (Optional for B2C)</label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstForm.gstin}
                  onChange={(e) => setGstForm({ ...gstForm, gstin: e.target.value.toUpperCase() })}
                  placeholder="29ABCDE1234F1Z5"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Billing Email (For Invoices)</label>
                <input
                  type="email"
                  required
                  value={gstForm.billing_email}
                  onChange={(e) => setGstForm({ ...gstForm, billing_email: e.target.value })}
                  placeholder="accounts@acme.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">State</label>
                <input
                  type="text"
                  required
                  value={gstForm.state}
                  onChange={(e) => setGstForm({ ...gstForm, state: e.target.value })}
                  placeholder="Karnataka"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1">Billing Address</label>
                <input
                  type="text"
                  required
                  value={gstForm.billing_address}
                  onChange={(e) => setGstForm({ ...gstForm, billing_address: e.target.value })}
                  placeholder="100 Tech Park, MG Road"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">City</label>
                <input
                  type="text"
                  value={gstForm.city}
                  onChange={(e) => setGstForm({ ...gstForm, city: e.target.value })}
                  placeholder="Bangalore"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Postal Code (PIN)</label>
                <input
                  type="text"
                  value={gstForm.postal_code}
                  onChange={(e) => setGstForm({ ...gstForm, postal_code: e.target.value })}
                  placeholder="560001"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all"
              >
                {isSavingProfile ? 'Saving...' : 'Update Tax Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: PAYMENT METHODS */}
      {activeTab === 'payment_methods' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-3xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-400" /> Saved Payment Methods
              </h3>
              <p className="text-xs text-slate-400 mt-1">Payment cards used for automated recurring subscriptions</p>
            </div>
          </div>

          <div className="space-y-3">
            {paymentMethods.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center text-slate-500 text-xs">
                No credit/debit card on file. Your card will be saved automatically upon Razorpay checkout.
              </div>
            ) : (
              paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-900 rounded-lg text-slate-300">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-white font-bold flex items-center gap-2">
                        •••• •••• •••• {pm.card_last4 || '4242'}
                        {pm.is_default && (
                          <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-extrabold">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        {pm.card_network || 'Visa'} • Expires {pm.card_exp_month || 12}/{pm.card_exp_year || 2029}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
