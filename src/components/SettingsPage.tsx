import React, { useState } from 'react';
import {
  CreditCard,
  Zap,
  Sliders,
  Shield,
  FileText,
  CheckCircle2,
  Building,
  Lock,
} from 'lucide-react';
import {
  Workspace,
  ProviderConnection,
  ProviderType,
  RecoveryCampaign,
  AuditLog,
  WebhookEventRecord,
  EmailMessage,
  User,
  UserRole,
} from '../types/index.js';
import { ProvidersView } from './ProvidersView.js';
import { CampaignsView } from './CampaignsView.js';
import { EnterpriseSecurityTab } from './EnterpriseSecurityTab.js';
import { SettingsView } from './SettingsView.js';
import { RecoveryAutomationSection } from './RecoveryAutomationSection.js';
import { SubscriptionBillingTab } from './SubscriptionBillingTab.js';
import { TrustAndSafetyCard } from './TrustAndSafetyCard.js';

export type SettingsSection = 'billing' | 'providers' | 'automation' | 'recovery_rules' | 'security' | 'workspace';

interface SettingsPageProps {
  workspace: Workspace | null;
  workspaces: Workspace[];
  connections: ProviderConnection[];
  supportedProviders: ProviderType[];
  campaigns: RecoveryCampaign[];
  auditLogs: AuditLog[];
  webhooks: WebhookEventRecord[];
  emails: EmailMessage[];
  user?: User | null;
  userRole?: UserRole;
  currency: string;
  initialSection?: SettingsSection;
  onUpdateWorkspace: (updates: Partial<Workspace>) => Promise<void>;
  onConnectProvider: (type: ProviderType, config: any) => Promise<void>;
  onDisconnectProvider: (type: ProviderType) => Promise<void>;
  onSyncProvider: (type: ProviderType) => Promise<void>;
  onToggleCampaign: (id: string) => void;
  onCreateCampaign: (campaign: Partial<RecoveryCampaign>) => void;
  onOpenCsvModal: () => void;
  onOpenSimulatorModal: () => void;
  onNavigateToOpportunity?: (oppId: string) => void;
  onShowToast?: (title: string, desc: string, type?: 'success' | 'info') => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  workspace,
  workspaces,
  connections,
  supportedProviders,
  campaigns,
  auditLogs,
  webhooks,
  emails,
  user,
  userRole = 'owner',
  currency,
  initialSection = 'billing',
  onUpdateWorkspace,
  onConnectProvider,
  onDisconnectProvider,
  onSyncProvider,
  onToggleCampaign,
  onCreateCampaign,
  onOpenCsvModal,
  onOpenSimulatorModal,
  onNavigateToOpportunity,
  onShowToast,
}) => {
  const [section, setSection] = useState<SettingsSection>(initialSection);

  const isAdvancedMode = typeof localStorage !== 'undefined' ? localStorage.getItem('reviveos_advanced_mode') === 'true' : false;

  const allTabs: Array<{ id: SettingsSection; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'billing', label: 'Plan & Billing', icon: FileText },
    { id: 'providers', label: 'Payment Systems', icon: CreditCard },
    { id: 'automation', label: 'Automatic Recovery', icon: Zap },
    { id: 'recovery_rules', label: 'Payment Reminders', icon: Sliders },
    { id: 'security', label: 'Security & Members', icon: Shield },
    { id: 'workspace', label: 'General & Pay Portal', icon: Building },
  ];

  const tabs = allTabs.filter(t => {
    if (!isAdvancedMode) {
      return t.id !== 'security' && t.id !== 'recovery_rules';
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-[#4ADE80]" />
            <span className="text-[#4ADE80] font-semibold tracking-wide uppercase">SETTINGS & CONFIGURATION</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">{workspace?.name || 'Workspace'}</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight font-display">
            System Settings
          </h1>
        </div>
      </div>

      {/* 5-Tab Clean Segmented Control (No Unnecessary Sub-Nesting) */}
      <div className="flex items-center gap-1.5 p-1 bg-[#071224] border border-slate-800 rounded-xl overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = section === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSection(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-mono font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white font-bold border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#4ADE80]' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Platform Billing & Plans */}
      {section === 'billing' && (
        <div className="p-6 rounded-xl bg-[#071224] border border-slate-800 space-y-6">
          <SubscriptionBillingTab workspace={workspace} />
        </div>
      )}

      {/* Tab 2: Providers */}
      {section === 'providers' && (
        <div className="p-6 rounded-xl bg-[#071224] border border-slate-800 space-y-6">
          <ProvidersView
            connections={connections}
            supported={supportedProviders}
            onConnect={onConnectProvider}
            onDisconnect={onDisconnectProvider}
            onSync={onSyncProvider}
            workspaceId={workspace?.id}
          />
        </div>
      )}

      {/* Tab 3: Automation */}
      {section === 'automation' && (
        <div className="p-6 rounded-xl bg-[#071224] border border-slate-800 space-y-6">
          <RecoveryAutomationSection
            workspace={workspace}
            onUpdateWorkspace={onUpdateWorkspace}
          />
        </div>
      )}

      {/* Tab 4: Recovery Rules */}
      {section === 'recovery_rules' && (
        <div className="p-6 rounded-xl bg-[#071224] border border-slate-800 space-y-6">
          <CampaignsView
            campaigns={campaigns}
            onToggleCampaign={onToggleCampaign}
            onCreateCampaign={onCreateCampaign}
          />
        </div>
      )}

      {/* Tab 5: Security */}
      {section === 'security' && (
        <div className="p-6 rounded-xl bg-[#071224] border border-slate-800 space-y-6">
          <EnterpriseSecurityTab
            workspace={workspace}
          />
        </div>
      )}

      {/* Tab 6: General Workspace & Pay Portal */}
      {section === 'workspace' && (
        <div className="p-6 rounded-xl bg-[#071224] border border-slate-800 space-y-6">
          <SettingsView
            workspace={workspace}
            onUpdateWorkspace={onUpdateWorkspace}
          />
        </div>
      )}

      {/* Feature 4: Trust and Safety Layer on Settings */}
      <TrustAndSafetyCard variant="compact" />
    </div>
  );
};
