import React, { useState } from 'react';
import {
  Palette,
  CheckCircle2,
  Lock,
  ExternalLink,
  ShieldCheck,
  CreditCard,
  Building2,
  Save,
  Sparkles,
  Smartphone,
  Eye,
} from 'lucide-react';
import { Workspace, PortalBrandingConfig } from '../types/index.js';

interface HostedPortalSettingsTabProps {
  workspace: Workspace | null;
  onSave?: (config: PortalBrandingConfig) => Promise<void>;
}

export const HostedPortalSettingsTab: React.FC<HostedPortalSettingsTabProps> = ({
  workspace,
  onSave,
}) => {
  const [companyName, setCompanyName] = useState(
    workspace?.portal_config?.company_name || workspace?.name || ''
  );
  const [brandColor, setBrandColor] = useState(
    workspace?.portal_config?.brand_color || '#10B981'
  );
  const [logoUrl, setLogoUrl] = useState(
    workspace?.portal_config?.logo_url || ''
  );
  const [supportEmail, setSupportEmail] = useState(
    workspace?.portal_config?.support_email || ''
  );
  const [tagline, setTagline] = useState(
    workspace?.portal_config?.header_tagline || 'Secure Subscription Recovery Portal'
  );
  const [termsUrl, setTermsUrl] = useState(
    workspace?.portal_config?.terms_url || ''
  );
  const [privacyUrl, setPrivacyUrl] = useState(
    workspace?.portal_config?.privacy_url || ''
  );
  const [acceptedMethods, setAcceptedMethods] = useState<string[]>(
    workspace?.portal_config?.accepted_methods || ['card', 'apple_pay', 'ach', 'upi']
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const colorPresets = [
    { name: 'Emerald', hex: '#10B981' },
    { name: 'Indigo', hex: '#6366F1' },
    { name: 'Violet', hex: '#8B5CF6' },
    { name: 'Sky Blue', hex: '#0EA5E9' },
    { name: 'Amber', hex: '#F59E0B' },
    { name: 'Rose', hex: '#F43F5E' },
  ];

  const toggleMethod = (method: string) => {
    if (acceptedMethods.includes(method)) {
      if (acceptedMethods.length === 1) return; // Keep at least one
      setAcceptedMethods(acceptedMethods.filter((m) => m !== method));
    } else {
      setAcceptedMethods([...acceptedMethods, method]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave({
          company_name: companyName,
          brand_color: brandColor,
          logo_url: logoUrl || undefined,
          support_email: supportEmail,
          header_tagline: tagline,
          terms_url: termsUrl || undefined,
          privacy_url: privacyUrl || undefined,
          accepted_methods: acceptedMethods as any,
        });
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const isPortalEmpty = !workspace?.portal_config || Object.keys(workspace.portal_config).length === 0;

  return (
    <div className="space-y-6">
      {isPortalEmpty && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-3">
          <div className="font-bold">Portal not configured</div>
          <div className="text-slate-400 mt-0.5">Add your branding, support email and policy URLs to activate the customer recovery portal.</div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Palette className="w-5 h-5 text-emerald-400" />
            <span>Hosted Pay Portal Branding & Customization</span>
          </h3>
          <p className="text-xs text-slate-400">
            Configure the white-labeled payment recovery destination (<code>/pay/:recovery_token</code>) served to your subscribers.
          </p>
        </div>

        {saveSuccess && (
          <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold animate-pulse">
            <CheckCircle2 className="w-4 h-4" /> Portal Branding Saved!
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-5">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Company / Brand Name</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Support Email</label>
                <input
                  type="email"
                  required
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Portal Tagline / Subtitle</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Logo URL (Optional SVG or PNG)</label>
              <input
                type="url"
                placeholder="https://acmecloud.io/logo.svg"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Accent Color Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Brand Accent Color</label>
              <div className="flex flex-wrap items-center gap-2">
                {colorPresets.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setBrandColor(preset.hex)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                      brandColor.toLowerCase() === preset.hex.toLowerCase()
                        ? 'border-white text-white font-bold shadow-sm'
                        : 'border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: preset.hex }} />
                    <span>{preset.name}</span>
                  </button>
                ))}

                <div className="flex items-center gap-1.5 ml-2">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-7 h-7 rounded border border-slate-700 bg-slate-800 cursor-pointer p-0.5"
                  />
                  <span className="text-xs font-mono text-slate-400">{brandColor}</span>
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Accepted Payment Recovery Methods
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'card', label: 'Cards (Visa, MC, Amex)' },
                  { id: 'apple_pay', label: 'Apple Pay & Google Pay' },
                  { id: 'ach', label: 'ACH / SEPA Direct Debit' },
                  { id: 'upi', label: 'UPI AutoPay (India)' },
                  { id: 'paypal', label: 'PayPal & Venmo' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMethod(m.id)}
                    className={`p-2 rounded-lg border text-left flex items-center justify-between cursor-pointer transition-colors ${
                      acceptedMethods.includes(m.id)
                        ? 'bg-slate-800 border-emerald-500/50 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    <span className="text-[11px] font-medium truncate">{m.label}</span>
                    {acceptedMethods.includes(m.id) && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Legal URLs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Terms of Service URL</label>
                <input
                  type="url"
                  value={termsUrl}
                  onChange={(e) => setTermsUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Privacy Policy URL</label>
                <input
                  type="url"
                  value={privacyUrl}
                  onChange={(e) => setPrivacyUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md shadow-emerald-500/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving Portal...' : 'Save Portal Branding'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Interactive Mockup Viewport */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col flex-1 shadow-xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs text-slate-400">
              <span className="font-bold flex items-center gap-1.5 text-amber-400">
                <Eye className="w-3.5 h-3.5" />
                <span>Demo Preview — not live customer data</span>
              </span>
              <span className="font-mono text-[10px] text-slate-500">https://pay.yourdomain.com/...</span>
            </div>

            {/* Mock Phone / Window Frame */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 flex-1 flex flex-col justify-between">
              {/* Header inside frame */}
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-slate-950"
                      style={{ backgroundColor: brandColor }}
                    >
                      {(companyName || 'Portal').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white leading-none">{companyName || 'Your Company'}</div>
                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{tagline}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">INV-9824</span>
                </div>

                {/* Amount to pay */}
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 mb-3 text-center">
                  <div className="text-[10px] text-slate-400">Past-Due Balance Due</div>
                  <div className="text-xl font-bold text-white">[Sample Amount]</div>
                  <div className="text-[10px] text-amber-400 mt-0.5 flex items-center justify-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>Card declined (Insufficient funds)</span>
                  </div>
                </div>

                {/* Form Simulation */}
                <div className="space-y-2 text-[11px]">
                  <div>
                    <label className="text-slate-400 text-[10px] block mb-0.5">Card Number</label>
                    <div className="px-2.5 py-1.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300 font-mono text-[10px] flex items-center justify-between">
                      <span>•••• •••• •••• ••••</span>
                      <CreditCard className="w-3 h-3 text-slate-400" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 text-[10px] block mb-0.5">Expires</label>
                      <div className="px-2.5 py-1.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300 font-mono text-[10px]">
                        MM / YY
                      </div>
                    </div>
                    <div>
                      <label className="text-slate-400 text-[10px] block mb-0.5">CVC</label>
                      <div className="px-2.5 py-1.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300 font-mono text-[10px]">
                        •••
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      className="w-full py-2 rounded-lg text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
                      style={{ backgroundColor: brandColor }}
                    >
                      <Lock className="w-3 h-3" />
                      <span>Pay [Sample Amount] & Resume Service</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer info inside frame */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[9px] text-slate-500">
                <span>Support: {supportEmail || 'Not configured'}</span>
                <span className="flex items-center gap-1 text-slate-400">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> 256-bit TLS
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
