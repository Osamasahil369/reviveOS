import React, { useState } from 'react';
import { X, Send, Eye, Sparkles, Mail, CheckCircle2 } from 'lucide-react';
import { RecoveryOpportunity } from '../types/index.js';

interface SendEmailModalProps {
  opportunity: RecoveryOpportunity | null;
  businessName: string;
  currency: string;
  onClose: () => void;
  onSend: (oppId: string, subject: string, body: string) => Promise<void>;
}

export const SendEmailModal: React.FC<SendEmailModalProps> = ({
  opportunity,
  businessName,
  currency,
  onClose,
  onSend,
}) => {
  if (!opportunity) return null;

  const formattedAmount = (opportunity.amount_at_risk_cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: opportunity.currency || currency || 'USD',
  });

  const recoveryLink = `${window.location.origin}/pay/${opportunity.recovery_token}`;

  const defaultSubject = 'Action Required: Payment failed for {{business_name}}';
  const defaultBody = `Hello {{customer_name}},

We noticed your recent payment of {{amount}} for your {{subscription_plan}} could not be processed due to a card issue.

To prevent any interruption to your service, please take 30 seconds to update your billing details using our secure recovery portal:
{{recovery_link}}

If you have already resolved this with your bank, you can simply click retry on your dashboard or reply to this message.

Best regards,
The Billing Team at {{business_name}}`;

  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  // Render preview
  const renderTemplate = (text: string) => {
    return text
      .replace(/{{customer_name}}/g, opportunity.customer.name)
      .replace(/{{amount}}/g, formattedAmount)
      .replace(/{{business_name}}/g, businessName)
      .replace(/{{subscription_plan}}/g, opportunity.subscription?.plan_name || 'Active Plan')
      .replace(/{{recovery_link}}/g, recoveryLink);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    try {
      await onSend(opportunity.id, subject, body);
      setSentSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } finally {
      setIsSending(false);
    }
  };

  const insertVariable = (varName: string) => {
    setBody((prev) => prev + ` {{${varName}}}`);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col justify-between">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Send Dunning Recovery Email</h3>
              <p className="text-xs text-slate-400">To: {opportunity.customer.email}</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {sentSuccess ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Recovery Email Dispatched!</h4>
              <p className="text-xs text-slate-400 mt-1">Logged in dunning event timeline.</p>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              {/* Dynamic Variables Chips */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Insert Personalization Tokens:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'customer_name',
                    'amount',
                    'recovery_link',
                    'business_name',
                    'subscription_plan',
                  ].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 font-mono text-[11px] border border-slate-700 transition-colors"
                    >
                      +{`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Subject Line</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Email Body (Markdown / Text)</label>
                <textarea
                  rows={6}
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-sans leading-relaxed focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Live Preview Pane */}
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <Eye className="w-3.5 h-3.5 text-blue-400" />
                  <span>Customer View Preview</span>
                </div>
                <div className="text-xs font-semibold text-white mb-2 pb-2 border-b border-slate-800">
                  Subject: {renderTemplate(subject)}
                </div>
                <div className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans">
                  {renderTemplate(body)}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  {isSending ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send Recovery Email</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
