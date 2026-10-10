import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Download,
  RefreshCw,
  Clock,
  Shield,
  Lock,
  Zap,
  TrendingUp,
  Sparkles,
  Database,
  History,
  Info,
  Check,
  ChevronDown,
} from 'lucide-react';
import { api } from '../services/api';
import {
  ImportColumnMapping,
  ImportValidationResult,
  ImportExecutionResult,
  ImportAuditRecord,
  ImportTemplate,
} from '../types';

interface CustomerImportWizardProps {
  workspace?: any;
  onSuccess?: (result: ImportExecutionResult) => void;
  onCancel?: () => void;
  onNavigateToCommandCenter?: () => void;
}

export const CustomerImportWizard: React.FC<CustomerImportWizardProps> = ({
  workspace,
  onSuccess,
  onCancel,
  onNavigateToCommandCenter,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [activeTab, setActiveTab] = useState<'wizard' | 'history'>('wizard');

  // Step 1: Upload state
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(false);

  // Parsed metadata from Step 1
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [totalRowsDetected, setTotalRowsDetected] = useState<number>(0);

  // Step 2: Mapping state
  const [mapping, setMapping] = useState<ImportColumnMapping>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3: Validation state
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [deduplicationMode, setDeduplicationMode] = useState<'merge' | 'skip'>('merge');

  // Step 4 & 5: Execution & Result
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<ImportExecutionResult | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // History state
  const [historyRecords, setHistoryRecords] = useState<ImportAuditRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Load templates on mount
  useEffect(() => {
    setIsLoadingTemplates(true);
    api.getImportTemplates()
      .then((res) => {
        if (res && Array.isArray(res.templates)) {
          setTemplates(res.templates);
        }
      })
      .catch((err) => console.warn('Could not load templates', err))
      .finally(() => setIsLoadingTemplates(false));
  }, []);

  const loadHistory = () => {
    setIsLoadingHistory(true);
    api.getImportHistory()
      .then((res) => {
        if (res && Array.isArray(res.history)) {
          setHistoryRecords(res.history);
        }
      })
      .catch((err) => console.warn('Could not load import history', err))
      .finally(() => setIsLoadingHistory(false));
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  // Handle File Selection
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('Invalid file format. Please upload a .csv file.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setUploadError('File size exceeds the 15MB maximum limit.');
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content || content.trim().length === 0) {
        setUploadError('The selected CSV file is empty.');
        return;
      }
      setCsvText(content);
      parseUploadedCsv(content, file.name);
    };
    reader.onerror = () => {
      setUploadError('Failed to read the file. Please check file permissions and try again.');
    };
    reader.readAsText(file);
  };

  const handleSelectTemplate = (tpl: ImportTemplate) => {
    setUploadError(null);
    setFileName(tpl.filename);
    setFileSize(Buffer.byteLength(tpl.csvContent, 'utf8'));
    setCsvText(tpl.csvContent);
    parseUploadedCsv(tpl.csvContent, tpl.filename);
  };

  const parseUploadedCsv = async (text: string, fName: string) => {
    setUploadError(null);
    try {
      const res = await api.uploadCsvForImport(text, fName);
      setHeaders(res.headers);
      setRawRows(res.rows);
      setTotalRowsDetected(res.totalRows);
      setMapping(res.suggestedMapping || {});
      setValidationResult(res.initialValidation);
      setCurrentStep(2);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse CSV file. Ensure standard format.');
    }
  };

  // Step 2 -> Step 3: Run full validation with current mapping
  const handleProceedToValidation = async () => {
    setIsValidating(true);
    setUploadError(null);
    try {
      const res = await api.validateImport({ csvText, mapping });
      setValidationResult(res);
      setCurrentStep(3);
    } catch (err: any) {
      setUploadError(err.message || 'Validation failed. Please verify column mappings.');
    } finally {
      setIsValidating(false);
    }
  };

  // Step 3 -> Step 4: Proceed to Review
  const handleProceedToReview = () => {
    setCurrentStep(4);
  };

  // Step 4: Execute Import
  const handleExecuteImport = async () => {
    setIsExecuting(true);
    setExecutionError(null);
    try {
      const res = await api.executeImport({
        csvText,
        mapping,
        fileName,
        deduplicationMode,
      });
      setExecutionResult(res);
      setCurrentStep(5);
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err: any) {
      setExecutionError(err.message || 'Import execution failed. Please try again.');
    } finally {
      setIsExecuting(false);
    }
  };

  const downloadTemplateFile = (tpl: ImportTemplate) => {
    const blob = new Blob([tpl.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', tpl.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Customer Import Wizard
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Autonomous Ingestion
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Ingest customer lists, subscriptions, and billing data in under 5 minutes to begin autonomous revenue recovery.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('wizard')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'wizard'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Import Wizard
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium flex items-center space-x-1.5 transition-colors ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Import History</span>
          </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        /* ================= IMPORT HISTORY PANEL ================= */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Immutable Import Audit Logs</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Every batch ingestion is tracked with timestamps, row counts, and ledger attribution.
              </p>
            </div>
            <button
              onClick={loadHistory}
              disabled={isLoadingHistory}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors"
              title="Refresh History"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoadingHistory ? (
            <div className="py-16 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
              <p className="text-sm">Loading audit logs...</p>
            </div>
          ) : historyRecords.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <FileText className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <p className="text-base font-medium text-slate-300">No import records found</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload your first CSV file in the wizard to start ingesting customer data.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/60 text-slate-400 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Imported At</th>
                    <th className="px-4 py-3">File Name</th>
                    <th className="px-4 py-3 text-right">Rows</th>
                    <th className="px-4 py-3 text-right">Imported</th>
                    <th className="px-4 py-3 text-right">Skipped</th>
                    <th className="px-4 py-3 text-right">Revenue Ingested</th>
                    <th className="px-4 py-3 text-center rounded-r-lg">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historyRecords.map((rec) => {
                    const sym = rec.currency === 'INR' ? '₹' : '$';
                    const revFormatted = `${sym}${((rec.total_revenue_imported_cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    return (
                      <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">
                          {new Date(rec.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <span className="truncate max-w-[200px]">{rec.file_name}</span>
                        </td>
                        <td className="px-4 py-3 text-right">{rec.total_rows}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-400">
                          {rec.rows_imported}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400">{rec.rows_skipped}</td>
                        <td className="px-4 py-3 text-right font-mono text-white">{revFormatted}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              rec.status === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {rec.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ================= STEPPED WIZARD ================= */
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
          {/* Progress Tracker (4 Steps) */}
          <div className="border-b border-slate-800 bg-slate-900/80 px-6 py-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { step: 1, title: 'Upload CSV', desc: 'Select or drag file' },
                { step: 2, title: 'Column Mapping', desc: 'Match fields' },
                { step: 3, title: 'Validation', desc: 'Scan for issues' },
                { step: 4, title: 'Review & Import', desc: 'Execute ingestion' },
              ].map((item) => {
                const isActive = currentStep === item.step;
                const isPassed = currentStep > item.step;
                return (
                  <div
                    key={item.step}
                    className={`flex items-center space-x-3 p-2 rounded-lg transition-colors ${
                      isActive ? 'bg-blue-600/10 border border-blue-500/30' : ''
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        isPassed
                          ? 'bg-emerald-500 text-white'
                          : isActive
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {isPassed ? <Check className="w-4 h-4" /> : item.step}
                    </div>
                    <div className="hidden sm:block">
                      <div
                        className={`text-xs font-semibold ${
                          isActive ? 'text-blue-400' : isPassed ? 'text-white' : 'text-slate-500'
                        }`}
                      >
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{item.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-6">
            {/* ================= STEP 1: UPLOAD CSV ================= */}
            {currentStep === 1 && (
              <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/40 p-4 border border-slate-800 rounded-2xl">
                  <div>
                    <h2 className="text-lg font-bold text-white">Step 1: Upload Member or Customer List</h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Start recovering missed payments instantly by uploading your member roster. We accept simple CSV spreadsheets exported from any billing system.
                    </p>
                  </div>
                  
                  {/* Trust Badge Indicators */}
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <span className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono flex items-center gap-1">
                      <Shield className="w-3 h-3 text-emerald-400" /> Secure Encryption
                    </span>
                    <span className="text-[10px] px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono flex items-center gap-1">
                      <Lock className="w-3 h-3 text-indigo-400" /> Isolated Sandbox
                    </span>
                  </div>
                </div>

                {uploadError && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-3 text-rose-400">
                    <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-sm">Upload Error</div>
                      <div className="text-xs mt-0.5">{uploadError}</div>
                    </div>
                  </div>
                )}

                {/* Drag and Drop Zone with Acquisition CTA */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-emerald-500 bg-emerald-500/5 scale-[0.99]'
                      : 'border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div className="text-xl font-bold text-white font-display">
                    Upload Customer List
                  </div>
                  <div className="text-xs text-slate-400 mt-2 max-w-lg mx-auto leading-relaxed">
                    Click to browse your computer or drag-and-drop your spreadsheet here. We will instantly scan it to find collectable, missed payments.
                  </div>
                </div>

                {/* Downloadable Sample Templates */}
                <div className="border-t border-slate-800 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        Download Ready-to-Use Templates
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Don't have a CSV ready? Test instantly with one of our sample datasets.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/40 transition-colors"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">{tpl.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300 uppercase">
                              {tpl.businessType}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-2 line-clamp-2">{tpl.description}</p>
                        </div>
                        <div className="mt-4 pt-3 border-t border-slate-700/40 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => downloadTemplateFile(tpl)}
                            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectTemplate(tpl)}
                            className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded text-xs font-medium transition-colors"
                          >
                            Use Sample
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ================= STEP 2: COLUMN MAPPING ================= */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">Step 2: Column Mapping</h2>
                    <p className="text-sm text-slate-400 mt-0.5">
                      We've automatically detected mappings based on your headers. Review and adjust if necessary.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span className="px-2.5 py-1 bg-slate-800 rounded-md font-mono text-white">
                      {fileName}
                    </span>
                    <span>•</span>
                    <span>{totalRowsDetected} rows detected</span>
                  </div>
                </div>

                {/* Mapping Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { key: 'email', label: 'Email Address *', required: true, desc: 'Unique customer identifier' },
                    { key: 'customer_name', label: 'Customer Name', required: false, desc: 'Full name or contact person' },
                    { key: 'plan_name', label: 'Plan / Package Name', required: false, desc: 'Subscription tier' },
                    { key: 'subscription_status', label: 'Subscription Status', required: false, desc: 'active, past_due, etc.' },
                    { key: 'mrr', label: 'Monthly Amount / MRR', required: false, desc: 'Recurring fee value' },
                    { key: 'phone', label: 'Phone Number', required: false, desc: 'For SMS recovery outreach' },
                    { key: 'company', label: 'Company / Org', required: false, desc: 'Organization name' },
                    { key: 'next_billing_date', label: 'Next Billing Date', required: false, desc: 'Renewal or due date' },
                    { key: 'last_payment_date', label: 'Last Payment Date', required: false, desc: 'Most recent successful debit' },
                    { key: 'invoice_amount', label: 'Last Invoice Amount', required: false, desc: 'Amount on last invoice' },
                    { key: 'arr', label: 'Annual Revenue (ARR)', required: false, desc: 'Annualized contract value' },
                    { key: 'external_id', label: 'External ID', required: false, desc: 'Stripe/Razorpay Customer ID' },
                  ].map((field) => {
                    const mappedValue = (mapping as any)[field.key] || '';
                    return (
                      <div key={field.key} className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-white flex items-center gap-1">
                            {field.label}
                            {field.required && <span className="text-rose-400">*</span>}
                          </label>
                          {mappedValue ? (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Mapped
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">Unmapped</span>
                          )}
                        </div>
                        <div className="relative">
                          <select
                            value={mappedValue}
                            onChange={(e) => {
                              setMapping({
                                ...mapping,
                                [field.key]: e.target.value || undefined,
                              });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 appearance-none"
                          >
                            <option value="">-- Do Not Import --</option>
                            {headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                        </div>
                        <p className="text-[10px] text-slate-500">{field.desc}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Preview Sample Rows */}
                {rawRows.length > 0 && (
                  <div className="space-y-2 border-t border-slate-800 pt-4">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Source CSV Preview (First 3 Rows)
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-800/80 text-slate-400">
                          <tr>
                            {headers.map((h) => (
                              <th key={h} className="px-3 py-2 font-medium">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                          {rawRows.slice(0, 3).map((r, rIdx) => (
                            <tr key={rIdx}>
                              {headers.map((h) => (
                                <td key={h} className="px-3 py-2 truncate max-w-[150px]">
                                  {r[h] || <span className="text-slate-600">-</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Navigation Footer */}
                <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Upload</span>
                  </button>
                  <button
                    onClick={handleProceedToValidation}
                    disabled={isValidating || !mapping.email}
                    className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors ${
                      mapping.email
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {isValidating ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Validating Data...</span>
                      </>
                    ) : (
                      <>
                        <span>Validate Data</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ================= STEP 3: DATA VALIDATION ================= */}
            {currentStep === 3 && validationResult && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Step 3: Data Quality & Validation</h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    We scanned {validationResult.summary.totalRows} records for email formats, currency values, dates, and duplicates.
                  </p>
                </div>

                {/* Validation Metric Badges */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                    <div className="flex items-center space-x-2 text-emerald-400 text-xs font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Valid Rows</span>
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {validationResult.summary.validRowsCount}
                    </div>
                    <div className="text-[11px] text-emerald-400/80 mt-0.5">Ready for ingestion</div>
                  </div>

                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                    <div className="flex items-center space-x-2 text-rose-400 text-xs font-medium">
                      <XCircle className="w-4 h-4" />
                      <span>Errors (Excluded)</span>
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {validationResult.summary.errorRowsCount}
                    </div>
                    <div className="text-[11px] text-rose-400/80 mt-0.5">Missing or bad email</div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                    <div className="flex items-center space-x-2 text-amber-400 text-xs font-medium">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Warnings</span>
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {validationResult.summary.warningRowsCount}
                    </div>
                    <div className="text-[11px] text-amber-400/80 mt-0.5">Auto-healed or merged</div>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <div className="flex items-center space-x-2 text-blue-400 text-xs font-medium">
                      <Shield className="w-4 h-4" />
                      <span>Existing Duplicates</span>
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {validationResult.summary.duplicateEmailsInWorkspace}
                    </div>
                    <div className="text-[11px] text-blue-400/80 mt-0.5">Matched in database</div>
                  </div>
                </div>

                {/* Deduplication Strategy Picker */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-blue-400" />
                      Deduplication Rule for Existing Customers
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      How should ReviveOS handle records whose email already exists in your workspace?
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setDeduplicationMode('merge')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        deduplicationMode === 'merge'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Merge & Update Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeduplicationMode('skip')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        deduplicationMode === 'skip'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Skip Duplicates
                    </button>
                  </div>
                </div>

                {/* Issue Callouts if any */}
                {(validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Validation Report Details
                    </h3>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {validationResult.errors.slice(0, 10).map((err, idx) => (
                        <div
                          key={`err_${idx}`}
                          className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-2 text-rose-300">
                            <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            <span>
                              Row {err.rowNumber}: <strong>{err.message}</strong>
                            </span>
                          </div>
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded">
                            FATAL (Row Excluded)
                          </span>
                        </div>
                      ))}
                      {validationResult.warnings.slice(0, 10).map((warn, idx) => (
                        <div
                          key={`warn_${idx}`}
                          className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-2 text-amber-300">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <span>
                              Row {warn.rowNumber}: {warn.message}
                            </span>
                          </div>
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                            Auto-Resolved
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Navigation Footer */}
                <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Mapping</span>
                  </button>
                  <button
                    onClick={handleProceedToReview}
                    disabled={validationResult.summary.validRowsCount === 0}
                    className={`px-5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors ${
                      validationResult.summary.validRowsCount > 0
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <span>Proceed to Review ({validationResult.summary.validRowsCount} Valid)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ================= STEP 4: IMPORT REVIEW ================= */}
            {currentStep === 4 && validationResult && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white">Step 4: Final Review & Ingestion</h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Review your projected import numbers. Once confirmed, ReviveOS will create subscriptions, invoices, and instantly initiate revenue protection.
                  </p>
                </div>

                {executionError && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-3 text-rose-400">
                    <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-sm">Execution Error</div>
                      <div className="text-xs mt-0.5">{executionError}</div>
                    </div>
                  </div>
                )}

                {/* Summary Table Card */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 space-y-4">
                  <div className="text-sm font-semibold text-white border-b border-slate-700/40 pb-3 flex items-center justify-between">
                    <span>Import Manifest Summary</span>
                    <span className="text-xs font-mono text-slate-400">{fileName}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-slate-400">Total Rows</div>
                      <div className="text-xl font-bold text-white mt-0.5">
                        {validationResult.summary.totalRows}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Customers to Ingest</div>
                      <div className="text-xl font-bold text-emerald-400 mt-0.5">
                        {validationResult.summary.validRowsCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Deduplication Action</div>
                      <div className="text-sm font-semibold text-blue-400 mt-1 capitalize">
                        {deduplicationMode === 'merge' ? 'Merge & Update' : 'Skip Existing'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Target Currency</div>
                      <div className="text-xl font-mono font-bold text-white mt-0.5">
                        {validationResult.summary.currencyDetected}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span>
                      <strong>Instant Autonomous Recovery:</strong> Any imported customers with past due or unpaid status will automatically trigger 1-click recovery links and autonomous dunning.
                    </span>
                  </div>
                </div>

                {/* Navigation Footer */}
                <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                  <button
                    onClick={() => setCurrentStep(3)}
                    disabled={isExecuting}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center space-x-2 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to Validation</span>
                  </button>
                  <button
                    onClick={handleExecuteImport}
                    disabled={isExecuting}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-2 shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    {isExecuting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Ingesting Records...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Import & Start Recovering Revenue</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ================= STEP 5: POST-IMPORT INSIGHTS & SUCCESS ================= */}
            {currentStep === 5 && executionResult && (
              <div className="space-y-6 text-center py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-white">Import Successfully Completed!</h2>
                  <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
                    {executionResult.importedCustomersCount} customers, {executionResult.createdSubscriptionsCount} subscriptions, and {executionResult.createdInvoicesCount} invoices ingested into your workspace.
                  </p>
                </div>

                {/* Post-Import Insights Card */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6 text-left space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                      Immediate Value Generated
                    </h3>
                    <span className="text-xs text-slate-400">Audit ID: {executionResult.auditId}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                      <div className="text-xs text-rose-400 font-medium">Revenue At Risk</div>
                      <div className="text-2xl font-bold text-white mt-1">
                        {executionResult.insights.revenueAtRiskFormatted}
                      </div>
                      <div className="text-[11px] text-rose-400/80 mt-0.5">Ready for recovery</div>
                    </div>

                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                      <div className="text-xs text-emerald-400 font-medium">Imported MRR</div>
                      <div className="text-2xl font-bold text-white mt-1">
                        {executionResult.insights.totalImportedMrrFormatted}
                      </div>
                      <div className="text-[11px] text-emerald-400/80 mt-0.5">Active subscription revenue</div>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                      <div className="text-xs text-blue-400 font-medium">Recovery Opportunities</div>
                      <div className="text-2xl font-bold text-white mt-1">
                        {executionResult.createdOpportunitiesCount}
                      </div>
                      <div className="text-[11px] text-blue-400/80 mt-0.5">Workflows initialized</div>
                    </div>

                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                      <div className="text-xs text-purple-400 font-medium">Active Subscribers</div>
                      <div className="text-2xl font-bold text-white mt-1">
                        {executionResult.insights.activeCustomersCount}
                      </div>
                      <div className="text-[11px] text-purple-400/80 mt-0.5">Healthy customer base</div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      if (onNavigateToCommandCenter) {
                        onNavigateToCommandCenter();
                      } else if (onCancel) {
                        onCancel();
                      }
                    }}
                    className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-2 shadow-sm transition-colors"
                  >
                    <span>Go to Revenue Command Center</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      setCsvText('');
                      setFileName('');
                      setExecutionResult(null);
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                  >
                    Import Another File
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
