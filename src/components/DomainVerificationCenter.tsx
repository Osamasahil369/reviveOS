import React, { useState } from 'react';
import {
  Globe,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  Copy,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Server,
  Database,
  Mail,
} from 'lucide-react';
import { api } from '../services/api.js';

export const DomainVerificationCenter: React.FC = () => {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any | null>(null);
  const [copiedText, setCopiedUrl] = useState<string | null>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    setLoading(true);
    try {
      // Calls our server domain verification endpoint
      const res = await api.verifyDomain(domain.trim());
      setVerificationResult(res);
    } catch (err) {
      console.error('Domain check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedUrl(txt);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-[#071224] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-mono font-semibold">
              <Globe className="w-3.5 h-3.5" />
              <span>Sender Identity Verification</span>
            </div>
            <h1 className="text-xl font-extrabold text-white tracking-tight font-display">
              Custom Domain Verification Center
            </h1>
            <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
              Verify your custom business domain to send recovery reminders from <code className="text-blue-300">billing@yourdomain.com</code> instead of our generic address. Excellent for trust and open-rates.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Input Pane */}
        <div className="bg-[#071224] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 lg:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Register Domain</span>
          
          <form onSubmit={handleVerify} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Domain Name</label>
              <input
                type="text"
                required
                placeholder="e.g. pulsefit.in or hyperion.io"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-sans focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Enter your base domain without http:// or www.</span>
            </div>

            <button
              type="submit"
              disabled={loading || !domain.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying DNS Records...</span>
                </>
              ) : (
                <>
                  <Server className="w-3.5 h-3.5" />
                  <span>Verify Custom DNS</span>
                </>
              )}
            </button>
          </form>

          {/* Tips box */}
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2 text-[11px] text-slate-400">
            <span className="font-bold text-white block">Instant Demo Activation Tips:</span>
            <span>Enter <code className="text-emerald-400">pulsefit.in</code> or <code className="text-emerald-400">hyperion.io</code> to trigger an instant verified success state with live validation feedback!</span>
          </div>
        </div>

        {/* Right DNS Records Table Area */}
        <div className="bg-[#071224] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Required DNS Records Configuration</span>
            {verificationResult && (
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${verificationResult.verified ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'}`}>
                {verificationResult.verified ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                <span>{verificationResult.verified ? 'Domain Verified' : 'Awaiting Records Propagation'}</span>
              </span>
            )}
          </div>

          {!verificationResult ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              <Mail className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <span>Submit your business domain name on the left to review required SPF, DKIM, and DMARC text records.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Record Rows */}
              {[
                { type: 'SPF', data: verificationResult.spf },
                { type: 'DKIM', data: verificationResult.dkim },
                { type: 'DMARC', data: verificationResult.dmarc }
              ].map((rec) => (
                <div key={rec.type} className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-[10px] text-indigo-300 font-bold">{rec.type}</span>
                      <span className="font-bold text-white font-sans">{rec.type === 'SPF' ? 'Sender Policy Framework' : rec.type === 'DKIM' ? 'DomainKeys Identified Mail' : 'DMARC Security Policy'}</span>
                    </div>
                    <span className={`flex items-center gap-1 font-bold text-[10px] uppercase font-mono ${rec.data.verified ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {rec.data.verified ? 'VERIFIED' : 'PENDING'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono">
                    <div>
                      <span className="text-slate-500 block mb-0.5 text-[9px] uppercase font-mono">Record Type</span>
                      <span className="text-slate-300">{rec.data.recordType}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5 text-[9px] uppercase font-mono">Host / Name</span>
                      <div className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-300 truncate max-w-[120px]">{rec.data.host}</span>
                        <button onClick={() => handleCopyText(rec.data.host)} className="text-slate-500 hover:text-white cursor-pointer"><Copy className="w-3 h-3" /></button>
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5 text-[9px] uppercase font-mono">Expected Value</span>
                      <div className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded border border-slate-800">
                        <span className="text-slate-300 truncate max-w-[120px]" title={rec.data.expected}>{rec.data.expected}</span>
                        <button onClick={() => handleCopyText(rec.data.expected)} className="text-slate-500 hover:text-white cursor-pointer"><Copy className="w-3 h-3" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
