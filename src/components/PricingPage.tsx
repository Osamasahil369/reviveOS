import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Shield,
  Zap,
  ArrowRight,
  Building2,
  Lock,
  Star,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Workspace, PlatformBillingCycle, PlatformPlanTier, PlanDefinition } from '../types/index.js';
import { api } from '../services/api.js';

interface PricingPageProps {
  workspace: Workspace | null;
  onPlanUpgraded?: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ workspace, onPlanUpgraded }) => {
  const [billingCycle, setBillingCycle] = useState<PlatformBillingCycle>('monthly');
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [foundingInfo, setFoundingInfo] = useState({
    maxSpots: 20,
    claimedSpots: 3,
    remainingSpots: 17,
    priceRupees: 999,
  });
  const [currentPlan, setCurrentPlan] = useState<PlatformPlanTier>('growth');
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showEnterpriseModal, setShowEnterpriseModal] = useState(false);

  const fetchPricingData = async () => {
    try {
      setLoading(true);
      const res = await api.getPlatformPricing();
      if (res.plans) {
        setPlans(res.plans);
      }
      if (res.foundingCustomerProgram) {
        setFoundingInfo({
          maxSpots: res.foundingCustomerProgram.maxSpots,
          claimedSpots: res.foundingCustomerProgram.claimedSpots,
          remainingSpots: res.foundingCustomerProgram.remainingSpots,
          priceRupees: res.foundingCustomerProgram.priceRupees,
        });
      }
      const subRes = await api.getPlatformSubscription();
      if (subRes.subscription) {
        setCurrentPlan(subRes.subscription.plan);
        setIsFoundingMember(Boolean(subRes.subscription.is_founding_customer));
      }
    } catch (err: any) {
      console.warn('[PricingPage] Fallback fetch notice:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPricingData();
  }, [workspace?.id]);

  const handleSelectPlan = async (tier: PlatformPlanTier) => {
    if (tier === 'enterprise') {
      setShowEnterpriseModal(true);
      return;
    }

    setIsProcessing(true);
    setToastMessage(null);

    try {
      const session = await api.createPlatformCheckoutSession({
        planTier: tier,
        billingCycle,
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      });

      if (session?.checkoutUrl) {
        if (session.checkoutUrl.includes('mock_checkout')) {
          await api.upgradePlatformPlan({
            planTier: tier,
            billingCycle,
            cardLast4: '4242',
          });
          await fetchPricingData();
          setToastType('success');
          setToastMessage(`🎉 Successfully activated ReviveOS ${tier.toUpperCase()} Plan!`);
          if (onPlanUpgraded) onPlanUpgraded();
          setIsProcessing(false);
          return;
        }
        window.location.href = session.checkoutUrl;
      }
    } catch (err: any) {
      setToastType('error');
      setToastMessage(err.message || 'Failed to initiate plan upgrade.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-12 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 animate-in fade-in duration-200">
      {/* Toast Feedback */}
      {toastMessage && (
        <div
          className={`p-4 border rounded-2xl text-sm font-semibold flex items-center justify-between shadow-xl ${
            toastType === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
              : toastType === 'error'
              ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
              : 'bg-indigo-950/80 border-indigo-500/50 text-indigo-300'
          }`}
        >
          <div className="flex items-center space-x-3">
            <Sparkles className="w-5 h-5 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-xs underline hover:opacity-85">
            Dismiss
          </button>
        </div>
      )}

      {/* Founding Customer Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-emerald-500/20 border border-amber-500/30 rounded-3xl p-6 sm:p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 transform translate-x-6 -translate-y-6 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="inline-flex items-center space-x-2 px-3 py-1 bg-amber-500/20 border border-amber-500/40 rounded-full text-amber-300 text-xs font-bold uppercase tracking-widest mb-4">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span>Founding Customer Program</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
          Only <span className="text-amber-400">{foundingInfo.remainingSpots}</span> of {foundingInfo.maxSpots} Founding Spots Remaining at ₹999/mo Locked Forever
        </h2>
        <p className="text-slate-300 max-w-2xl mx-auto text-sm sm:text-base mb-6">
          Claim early adopter pricing. Your rate will never be automatically increased, even as ReviveOS adds advanced AI intelligence and new data connectors.
        </p>
        <div className="flex items-center justify-center space-x-2 text-xs text-emerald-400 font-medium">
          <CheckCircle2 className="w-4 h-4" />
          <span>Includes all Growth & Business features • Zero automatic price hikes</span>
        </div>
      </div>

      {/* Pricing Header & Toggle */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
          Predictable Revenue Recovery. <br />
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
            Transparent Launch Pricing.
          </span>
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto text-base">
          Choose the plan that matches your monthly billing volume and automation requirements.
        </p>

        {/* Monthly / Annual Toggle */}
        <div className="inline-flex items-center bg-slate-900/90 border border-slate-800 p-1.5 rounded-full shadow-inner mt-6">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-6 py-2 rounded-full text-xs font-bold transition-all ${
              billingCycle === 'monthly'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={`px-6 py-2 rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 ${
              billingCycle === 'annual'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Annual Billing</span>
            <span className="px-1.5 py-0.5 bg-emerald-950 text-emerald-300 text-[10px] font-extrabold rounded-full border border-emerald-500/30">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-stretch">
        {/* Founding Customer Card */}
        <div
          className={`relative bg-slate-900/90 border rounded-3xl p-6 flex flex-col justify-between shadow-xl transition-all duration-200 ${
            currentPlan === 'founding'
              ? 'border-amber-500 ring-2 ring-amber-500/40 bg-slate-900'
              : 'border-amber-500/40 hover:border-amber-500/70'
          }`}
        >
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
            ⚡ Founding Spot
          </div>
          <div>
            <div className="flex items-center justify-between mb-4 mt-2">
              <h3 className="text-xl font-bold text-white">Founding</h3>
              {isFoundingMember && (
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-full">
                  Active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-6">First 20 customers only. Locked forever with zero price hikes.</p>
            <div className="mb-6">
              <span className="text-3xl font-black text-white">
                ₹{billingCycle === 'annual' ? '832' : '999'}
              </span>
              <span className="text-slate-400 text-xs">/month</span>
              {billingCycle === 'annual' && (
                <div className="text-[11px] text-amber-400 font-semibold mt-1">Billed annually at ₹9,990/yr</div>
              )}
            </div>
            <ul className="space-y-3 text-xs text-slate-300 mb-8">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>All Growth & Business features</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>₹999/mo price locked forever</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Founding Customer Dashboard Badge</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>Direct product team access</span>
              </li>
            </ul>
          </div>
          <button
            disabled={isProcessing || foundingInfo.remainingSpots <= 0 && !isFoundingMember}
            onClick={() => handleSelectPlan('founding')}
            className={`w-full py-3 rounded-xl font-bold text-xs transition-all shadow-lg flex items-center justify-center space-x-2 ${
              currentPlan === 'founding'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-default'
                : 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:opacity-95'
            }`}
          >
            <span>{currentPlan === 'founding' ? 'Current Plan' : 'Claim Founding Spot'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Starter Card */}
        <div
          className={`relative bg-slate-900/90 border rounded-3xl p-6 flex flex-col justify-between shadow-xl transition-all duration-200 ${
            currentPlan === 'starter'
              ? 'border-emerald-500 ring-2 ring-emerald-500/40'
              : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Starter</h3>
            </div>
            <p className="text-xs text-slate-400 mb-6">Essential automated dunning and recovery for single workspaces.</p>
            <div className="mb-6">
              <span className="text-3xl font-black text-white">
                ₹{billingCycle === 'annual' ? '1,666' : '1,999'}
              </span>
              <span className="text-slate-400 text-xs">/month</span>
              {billingCycle === 'annual' && (
                <div className="text-[11px] text-emerald-400 font-semibold mt-1">Billed annually at ₹19,990/yr</div>
              )}
            </div>
            <ul className="space-y-3 text-xs text-slate-300 mb-8">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Single workspace support</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Recovery Autopilot & Scanner</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Email Recovery Infrastructure</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Razorpay & Stripe Connection</span>
              </li>
            </ul>
          </div>
          <button
            disabled={isProcessing}
            onClick={() => handleSelectPlan('starter')}
            className={`w-full py-3 rounded-xl font-bold text-xs transition-all shadow-lg flex items-center justify-center space-x-2 ${
              currentPlan === 'starter'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            <span>{currentPlan === 'starter' ? 'Current Plan' : 'Select Starter'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Growth Card (Most Popular) */}
        <div
          className={`relative bg-gradient-to-b from-slate-900 to-emerald-950/40 border rounded-3xl p-6 flex flex-col justify-between shadow-2xl transition-all duration-200 ${
            currentPlan === 'growth'
              ? 'border-emerald-500 ring-2 ring-emerald-500/40'
              : 'border-emerald-500/60 hover:border-emerald-500'
          }`}
        >
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
            🔥 Most Popular
          </div>
          <div>
            <div className="flex items-center justify-between mb-4 mt-2">
              <h3 className="text-xl font-bold text-white">Growth</h3>
            </div>
            <p className="text-xs text-slate-400 mb-6">Advanced revenue intelligence, multi-user access, and AI recovery.</p>
            <div className="mb-6">
              <span className="text-3xl font-black text-white">
                ₹{billingCycle === 'annual' ? '4,166' : '4,999'}
              </span>
              <span className="text-slate-400 text-xs">/month</span>
              {billingCycle === 'annual' && (
                <div className="text-[11px] text-emerald-400 font-semibold mt-1">Billed annually at ₹49,990/yr</div>
              )}
            </div>
            <ul className="space-y-3 text-xs text-slate-300 mb-8">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Everything in Starter</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Multi-user access & RBAC</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Revenue Brain AI Assistant</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Churn Prevention & Expansion Intelligence</span>
              </li>
            </ul>
          </div>
          <button
            disabled={isProcessing}
            onClick={() => handleSelectPlan('growth')}
            className={`w-full py-3 rounded-xl font-bold text-xs transition-all shadow-lg flex items-center justify-center space-x-2 ${
              currentPlan === 'growth'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
          >
            <span>{currentPlan === 'growth' ? 'Current Plan' : 'Select Growth'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Business Card */}
        <div
          className={`relative bg-slate-900/90 border rounded-3xl p-6 flex flex-col justify-between shadow-xl transition-all duration-200 ${
            currentPlan === 'business'
              ? 'border-indigo-500 ring-2 ring-indigo-500/40'
              : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Business</h3>
            </div>
            <p className="text-xs text-slate-400 mb-6">Multi-business management, white-label reporting, and agency mode.</p>
            <div className="mb-6">
              <span className="text-3xl font-black text-white">
                ₹{billingCycle === 'annual' ? '8,332' : '9,999'}
              </span>
              <span className="text-slate-400 text-xs">/month</span>
              {billingCycle === 'annual' && (
                <div className="text-[11px] text-indigo-400 font-semibold mt-1">Billed annually at ₹99,990/yr</div>
              )}
            </div>
            <ul className="space-y-3 text-xs text-slate-300 mb-8">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span>Everything in Growth</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span>Multi-business management</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span>Agency Mode & White-label reports</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span>Priority 1-hour support SLA</span>
              </li>
            </ul>
          </div>
          <button
            disabled={isProcessing}
            onClick={() => handleSelectPlan('business')}
            className={`w-full py-3 rounded-xl font-bold text-xs transition-all shadow-lg flex items-center justify-center space-x-2 ${
              currentPlan === 'business'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 cursor-default'
                : 'bg-slate-800 hover:bg-slate-700 text-white'
            }`}
          >
            <span>{currentPlan === 'business' ? 'Current Plan' : 'Select Business'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Enterprise Card */}
        <div
          className={`relative bg-slate-900/90 border rounded-3xl p-6 flex flex-col justify-between shadow-xl transition-all duration-200 ${
            currentPlan === 'enterprise'
              ? 'border-purple-500 ring-2 ring-purple-500/40'
              : 'border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Enterprise</h3>
            </div>
            <p className="text-xs text-slate-400 mb-6">Custom infrastructure, dedicated onboarding, and SLA guarantees.</p>
            <div className="mb-6">
              <span className="text-2xl font-black text-white">Custom Pricing</span>
              <div className="text-[11px] text-purple-400 font-semibold mt-1">Contact Sales</div>
            </div>
            <ul className="space-y-3 text-xs text-slate-300 mb-8">
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>Unlimited workspaces & volume</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>Custom integrations & adapters</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>Dedicated Success Manager</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>99.99% Uptime SLA Guarantee</span>
              </li>
            </ul>
          </div>
          <button
            onClick={() => setShowEnterpriseModal(true)}
            className="w-full py-3 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-white transition-all shadow-lg flex items-center justify-center space-x-2"
          >
            <span>Contact Sales</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Enterprise Modal */}
      {showEnterpriseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative">
            <h3 className="text-2xl font-bold text-white mb-2">Contact Enterprise Sales</h3>
            <p className="text-slate-400 text-sm mb-6">
              Speak with our revenue recovery architects for custom enterprise deployments, SLA agreements, and custom data connectors.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowEnterpriseModal(false);
                setToastType('success');
                setToastMessage('Enterprise sales inquiry received! Our team will contact you within 2 hours.');
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Monthly Billing Volume</label>
                <select className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500">
                  <option>₹10L - ₹50L / month</option>
                  <option>₹50L - ₹2Cr / month</option>
                  <option>₹2Cr+ / month (Enterprise)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Message / Requirements</label>
                <textarea
                  rows={3}
                  placeholder="Tell us about your payment stack and custom requirements..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEnterpriseModal(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-lg"
                >
                  Submit Inquiry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
