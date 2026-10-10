import React, { useState, useMemo } from 'react';
import {
  X,
  UserPlus,
  CreditCard,
  Globe,
  Phone,
  Mail,
  User,
  CheckCircle2,
  AlertCircle,
  Coins,
} from 'lucide-react';
import {
  ProviderType,
  BillingIntervalType,
  CustomIntervalUnit,
} from '../types/index.js';
import {
  validateCustomerForm,
  validateEmail,
  validatePhone,
  validateCustomerName,
  validateAmount,
} from '../utils/validation.js';
import {
  CURRENCY_LIST,
  getCurrencySymbol,
  getCurrencyConfig,
  SupportedCurrency,
} from '../utils/currency.js';
import { formatBillingInterval } from '../utils/subscription.js';

interface AddCustomerModalProps {
  isOpen: boolean;
  currency: string;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    email: string;
    phone?: string;
    country?: string;
    currency?: string;
    provider_type: ProviderType;
    plan_name?: string;
    plan_amount_cents?: number;
    billing_interval?: BillingIntervalType;
    custom_interval_count?: number;
    custom_interval_unit?: CustomIntervalUnit;
    trial_days?: number;
    grace_period_days?: number;
  }) => Promise<void>;
}

export const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  isOpen,
  currency: defaultCurrency,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('US');
  const [customerCurrency, setCustomerCurrency] = useState<string>(defaultCurrency || 'USD');
  const [providerType, setProviderType] = useState<ProviderType>('stripe');
  const [planName, setPlanName] = useState('Scale SaaS Plan');
  const [planAmount, setPlanAmount] = useState('199.00');
  const [billingInterval, setBillingInterval] = useState<BillingIntervalType>('monthly');
  const [customIntervalCount, setCustomIntervalCount] = useState<number>(3);
  const [customIntervalUnit, setCustomIntervalUnit] = useState<CustomIntervalUnit>('months');
  const [trialDays, setTrialDays] = useState<number>(0);
  const [gracePeriodDays, setGracePeriodDays] = useState<number>(7);

  // Touched states for real-time validation display
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    planAmount: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Real-time validations
  const nameValidation = useMemo(() => validateCustomerName(name), [name]);
  const emailValidation = useMemo(() => validateEmail(email), [email]);
  const phoneValidation = useMemo(() => validatePhone(phone, country), [phone, country]);
  const amountValidation = useMemo(() => validateAmount(planAmount), [planAmount]);

  // Comprehensive form validation
  const formValidation = useMemo(() => {
    return validateCustomerForm({
      name,
      email,
      phone,
      country,
      currency: customerCurrency,
      planName,
      planAmount,
      billingInterval,
    });
  }, [name, email, phone, country, customerCurrency, planName, planAmount, billingInterval]);

  if (!isOpen) return null;

  const currentSymbol = getCurrencySymbol(customerCurrency);
  const currentConfig = getCurrencyConfig(customerCurrency);

  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    const countryCurrencyMap: Record<string, SupportedCurrency> = {
      IN: 'INR',
      GB: 'GBP',
      DE: 'EUR',
      CA: 'CAD',
      AU: 'AUD',
      SG: 'SGD',
      US: 'USD',
      AE: 'AED',
      SA: 'SAR',
      JP: 'JPY',
      CH: 'CHF',
      BR: 'BRL',
      MX: 'MXN',
    };
    if (countryCurrencyMap[newCountry]) {
      setCustomerCurrency(countryCurrencyMap[newCountry]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, phone: true, planAmount: true });
    if (!formValidation.isValid) return;

    setIsSubmitting(true);
    setServerError(null);

    try {
      const amountCents = Math.round(parseFloat(planAmount) * 100);
      await onSubmit({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        country,
        currency: customerCurrency,
        provider_type: providerType,
        plan_name: planName.trim(),
        plan_amount_cents: amountCents,
        billing_interval: billingInterval,
        custom_interval_count: billingInterval === 'custom' ? customIntervalCount : undefined,
        custom_interval_unit: billingInterval === 'custom' ? customIntervalUnit : undefined,
        trial_days: trialDays > 0 ? trialDays : undefined,
        grace_period_days: gracePeriodDays > 0 ? gracePeriodDays : undefined,
      });
      onClose();
    } catch (err: any) {
      setServerError(err.message || 'Failed to create customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Create New Customer</h3>
              <p className="text-xs text-slate-400">
                Multi-currency subscription onboarding with RFC & E.164 verification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {serverError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Row 1: Name & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Full Name *
                </label>
                {touched.name && nameValidation.isValid && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> Valid
                  </span>
                )}
              </div>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Cooper"
                  value={name}
                  onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!touched.name) setTouched((p) => ({ ...p, name: true }));
                  }}
                  className={`w-full pl-9 pr-3 py-2 bg-slate-800 border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    touched.name && !nameValidation.isValid
                      ? 'border-rose-500/80 focus:border-rose-500 bg-rose-950/10'
                      : touched.name && nameValidation.isValid
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-700 focus:border-emerald-500'
                  }`}
                />
              </div>
              {touched.name && !nameValidation.isValid && (
                <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{nameValidation.error}</span>
                </p>
              )}
            </div>

            {/* Email Address with RFC validation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Email Address *
                </label>
                {touched.email && emailValidation.isValid && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> RFC Valid
                  </span>
                )}
              </div>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="e.g. user@company.com"
                  value={email}
                  onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (!touched.email) setTouched((p) => ({ ...p, email: true }));
                  }}
                  className={`w-full pl-9 pr-3 py-2 bg-slate-800 border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    touched.email && !emailValidation.isValid
                      ? 'border-rose-500/80 focus:border-rose-500 bg-rose-950/10'
                      : touched.email && emailValidation.isValid
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-700 focus:border-emerald-500'
                  }`}
                />
              </div>
              {touched.email && !emailValidation.isValid ? (
                <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{emailValidation.error}</span>
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-slate-400">
                  Must follow RFC standard (e.g. user@gmail.com, test@company.co.uk)
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Phone & Country */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Phone Number with E.164 format and hint */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Phone (E.164 Format)
                </label>
                {phone.trim() && phoneValidation.isValid && (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> E.164 Valid
                  </span>
                )}
              </div>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  placeholder={currentConfig.dialCode + ' 555-0182'}
                  value={phone}
                  onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                  onChange={(e) => {
                    // Filter illegal letters immediately
                    const sanitized = e.target.value.replace(/[a-zA-Z]/g, '');
                    setPhone(sanitized);
                    if (!touched.phone) setTouched((p) => ({ ...p, phone: true }));
                  }}
                  className={`w-full pl-9 pr-3 py-2 bg-slate-800 border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    touched.phone && phone.trim() && !phoneValidation.isValid
                      ? 'border-rose-500/80 focus:border-rose-500 bg-rose-950/10'
                      : phone.trim() && phoneValidation.isValid
                      ? 'border-emerald-500/60 focus:border-emerald-500'
                      : 'border-slate-700 focus:border-emerald-500'
                  }`}
                />
              </div>
              {touched.phone && phone.trim() && !phoneValidation.isValid ? (
                <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{phoneValidation.error}</span>
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-slate-400">
                  Includes international code, e.g. {currentConfig.dialCode} 9876543210
                </p>
              )}
            </div>

            {/* Country Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Country
              </label>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <select
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="US">🇺🇸 United States (US)</option>
                  <option value="IN">🇮🇳 India (IN)</option>
                  <option value="GB">🇬🇧 United Kingdom (GB)</option>
                  <option value="DE">🇩🇪 Germany (DE)</option>
                  <option value="CA">🇨🇦 Canada (CA)</option>
                  <option value="AU">🇦🇺 Australia (AU)</option>
                  <option value="SG">🇸🇬 Singapore (SG)</option>
                  <option value="AE">🇦🇪 United Arab Emirates (AE)</option>
                  <option value="SA">🇸🇦 Saudi Arabia (SA)</option>
                  <option value="JP">🇯🇵 Japan (JP)</option>
                  <option value="CH">🇨🇭 Switzerland (CH)</option>
                  <option value="BR">🇧🇷 Brazil (BR)</option>
                  <option value="MX">🇲🇽 Mexico (MX)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Row 3: Payment Gateway & Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Payment Gateway Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setProviderType('stripe')}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    providerType === 'stripe'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Stripe</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProviderType('razorpay')}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    providerType === 'razorpay'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Razorpay</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProviderType('paypal')}
                  className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    providerType === 'paypal'
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>PayPal</span>
                </button>
              </div>
            </div>

            {/* Multi-Currency Dropdown (All 27 Supported Currencies) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Billing Currency (27 Supported)
                </label>
                <span className="text-[10px] font-mono font-bold text-emerald-400">
                  {currentConfig.symbol} {customerCurrency}
                </span>
              </div>
              <div className="relative">
                <Coins className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <select
                  value={customerCurrency}
                  onChange={(e) => setCustomerCurrency(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  {CURRENCY_LIST.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code} - {c.symbol} ({c.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Subscription Details Box */}
          <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>Subscription Pricing & Schedule</span>
              <span className="text-emerald-400 font-mono">
                Currency: {customerCurrency} ({currentSymbol})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">Plan Name</label>
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Price ({currentSymbol})
                </label>
                <div className="relative">
                  <span className="w-6 text-center text-xs font-mono font-bold text-slate-400 absolute left-2 top-2">
                    {currentSymbol}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={planAmount}
                    onBlur={() => setTouched((p) => ({ ...p, planAmount: true }))}
                    onChange={(e) => {
                      setPlanAmount(e.target.value);
                      if (!touched.planAmount) setTouched((p) => ({ ...p, planAmount: true }));
                    }}
                    className={`w-full pl-8 pr-2 py-1.5 bg-slate-800 border rounded-lg text-xs text-white font-mono focus:outline-none ${
                      touched.planAmount && !amountValidation.isValid
                        ? 'border-rose-500'
                        : 'border-slate-700 focus:border-emerald-500'
                    }`}
                  />
                </div>
                {touched.planAmount && !amountValidation.isValid && (
                  <p className="mt-0.5 text-[10px] text-rose-400">{amountValidation.error}</p>
                )}
              </div>
            </div>

            {/* Billing Interval Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] text-slate-400">Billing Interval</label>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {formatBillingInterval(billingInterval, customIntervalCount, customIntervalUnit)}
                </span>
              </div>
              <select
                value={billingInterval}
                onChange={(e) => setBillingInterval(e.target.value as BillingIntervalType)}
                className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="one_time">One Time Payment</option>
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="bi_week">Bi-Weekly (Every 2 Weeks)</option>
                <option value="month">Monthly</option>
                <option value="every_2_months">Every 2 Months</option>
                <option value="quarter">Quarterly (Every 3 Months)</option>
                <option value="every_6_months">Every 6 Months</option>
                <option value="year">Yearly</option>
                <option value="custom">Custom Billing Interval...</option>
              </select>
            </div>

            {/* Custom Interval Builder */}
            {billingInterval === 'custom' && (
              <div className="p-3 bg-slate-900/60 border border-slate-700/80 rounded-lg space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Custom Interval Configuration
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Interval Value</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={customIntervalCount}
                      onChange={(e) => setCustomIntervalCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Interval Unit</label>
                    <select
                      value={customIntervalUnit}
                      onChange={(e) => setCustomIntervalUnit(e.target.value as CustomIntervalUnit)}
                      className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-emerald-400 font-medium">
                  → Recurs: Every {customIntervalCount} {customIntervalUnit} (e.g. 18 Days, 5 Weeks, 3 Months)
                </p>
              </div>
            )}

            {/* Trial & Grace Period Controls */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Trial Period (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={trialDays}
                  onChange={(e) => setTrialDays(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0 (no trial)"
                  className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[9px] text-slate-500">First payment deferred until trial ends</span>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Grace Period (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="7 days"
                  className="w-full px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[9px] text-slate-500">Days allowed before cancellation</span>
              </div>
            </div>
          </div>

          {/* Validation summary banner if touched with errors */}
          {!formValidation.isValid && (touched.name || touched.email) && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>
                Please resolve validation requirements to enable customer creation.
              </span>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !formValidation.isValid}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isSubmitting ? 'Creating Customer...' : 'Create Customer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
