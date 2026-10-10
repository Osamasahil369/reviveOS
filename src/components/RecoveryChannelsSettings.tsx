import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Mail,
  Zap,
  CheckCircle2,
  Clock,
  Phone,
  Sliders,
  Sparkles,
  Save,
  HelpCircle,
} from 'lucide-react';
import { api } from '../services/api.js';

interface RecoveryChannelsSettingsProps {
  onShowToast?: (title: string, desc: string, type?: 'success' | 'info') => void;
}

export const RecoveryChannelsSettings: React.FC<RecoveryChannelsSettingsProps> = ({ onShowToast }) => {
  const [activeChannelMode, setActiveChannelMode] = useState<'email' | 'whatsapp' | 'both'>('email');
  const [whatsappProvider, setWhatsAppProvider] = useState<'twilio' | 'meta'>('twilio');
  const [isSaving, setIsSaving] = useState(false);
  const [whatsappTemplates, setWhatsAppTemplates] = useState<any[]>([]);

  useEffect(() => {
    // Load active templates from server
    api.getWhatsAppTemplates()
      .then((res) => {
        setWhatsAppTemplates(res.templates || []);
      })
      .catch((err) => console.error('Failed to load WhatsApp templates:', err));
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Simulate saving active channels configs
      await new Promise((r) => setTimeout(r, 800));
      if (onShowToast) {
        onShowToast(
          'Recovery Channels Saved',
          `Your outreach routing has been set to: ${activeChannelMode === 'email' ? 'Email Only' : activeChannelMode === 'whatsapp' ? 'WhatsApp Only' : 'Email + WhatsApp'}.`,
          'success'
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Block */}
      <div className="bg-[#071224] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-400 text-xs font-mono font-semibold">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Multi-Channel Outreach</span>
            </div>
            <h1 className="text-xl font-extrabold text-white tracking-tight font-display">
              Recovery Messaging Channels Settings
            </h1>
            <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
              Choose the delivery paths used to contact your subscribers immediately when recurring payments fail. Fully automated and calibrated for open-rates.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form Settings */}
        <div className="bg-[#071224] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5 lg:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Routing Rules</span>

          {/* Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-300">Active Outreach Routing</label>
            <div className="space-y-2">
              {[
                { id: 'email', label: 'Email Reminders Only', desc: 'Send customized receipts and secure recovery portal links via transactional email.', icon: Mail, color: 'text-blue-400 bg-blue-500/10' },
                { id: 'whatsapp', label: 'WhatsApp Messages Only', desc: 'Contact subscribers directly on their phones using secure templates.', icon: MessageSquare, color: 'text-emerald-400 bg-emerald-500/10' },
                { id: 'both', label: 'Email + WhatsApp Hybrid', desc: 'Attempts WhatsApp mobile first. Switches to Email automatically as a smart fall-back.', icon: Zap, color: 'text-purple-400 bg-purple-500/10' },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = activeChannelMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setActiveChannelMode(opt.id as any)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3 cursor-pointer ${isSelected ? 'bg-slate-900 border-indigo-500 text-white' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'}`}
                  >
                    <div className={`p-2.5 rounded-lg shrink-0 ${opt.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold font-sans">{opt.label}</div>
                      <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Config WhatsApp Provider */}
          {activeChannelMode !== 'email' && (
            <div className="space-y-3 pt-3 border-t border-slate-800 animate-in fade-in duration-200">
              <label className="block text-xs font-semibold text-slate-300">WhatsApp Gateway Provider</label>
              <select
                value={whatsappProvider}
                onChange={(e) => setWhatsAppProvider(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="twilio">Twilio API for WhatsApp</option>
                <option value="meta">Meta Cloud API (WhatsApp Business)</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-2.5 px-4 rounded-xl bg-[#4ADE80] hover:bg-[#22C55E] disabled:opacity-50 text-slate-950 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-lg font-mono"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving Routing...' : 'Save Settings'}</span>
          </button>
        </div>

        {/* Right Preview Pane */}
        <div className="bg-[#071224] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 lg:col-span-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Durable WhatsApp Templates Preview</span>

          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {whatsappTemplates.map((tpl) => (
              <div key={tpl.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white font-sans">{tpl.name}</span>
                    <span className="font-mono text-[10px] text-emerald-400">Day {tpl.day} Outreach</span>
                  </div>
                  <div className="mt-2 p-3 bg-slate-950 text-xs rounded-xl border border-slate-850 font-sans text-slate-300 leading-relaxed max-w-xl">
                    {tpl.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
};
