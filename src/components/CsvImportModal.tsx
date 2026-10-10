import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  Upload,
  AlertCircle,
  AlertTriangle,
  FileText,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Download,
  Globe,
  Sliders,
  Check,
  Copy,
  Info,
  Layers,
  Sparkles,
  Phone,
  Calendar,
  DollarSign,
  User,
  Mail,
  CreditCard,
  Building,
} from 'lucide-react';
import { api } from '../services/api.js';
import { Workspace } from '../types/index.js';
import {
  COUNTRY_DIAL_CONFIGS,
  CountryDialConfig,
  normalizePhoneNumber,
  getDefaultCountryForWorkspace,
  ColumnMapping,
  TARGET_FIELDS,
  autoDetectMappings,
  downloadErrorReportCsv,
  downloadSampleCsvTemplate,
} from '../utils/phone.js';
import { formatCurrency } from '../utils/currency.js';

interface CsvImportModalProps {
  workspace?: Workspace | null;
  onClose: () => void;
  onImport: (rows: any[], defaultCountry?: string, mappings?: any) => Promise<any>;
}

type ModalStep = 'upload' | 'mapping' | 'preview' | 'summary';

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  workspace,
  onClose,
  onImport,
}) => {
  // Preset Sample CSVs
  const sampleCleanCsv = `customer_name,email,phone,amount,currency,provider,subscription_type,next_billing_date,invoice_id,failure_reason
Aarav Sharma,aarav.sharma@techflow.in,9876543210,299,INR,razorpay,monthly,2026-10-15,inv_rf_901,insufficient_funds
Taylor Brooks,taylor.brooks@cloudscale.io,5551234567,499,USD,stripe,monthly,2026-10-20,inv_str_902,expired_card
Elena Rostova,elena.rostova@designworks.com,,149,USD,stripe,quarterly,2026-12-01,inv_str_903,payment_method_declined
Oliver Smith,oliver@fintechlondon.co.uk,+447911123456,350,GBP,stripe,yearly,2027-09-01,inv_str_904,authentication_required
Mateo Rossi,mateo@milandesign.it,3201234567,280,EUR,paypal,monthly,2026-10-25,inv_it_905,insufficient_funds`;

  const sampleMixedCsv = `customer_name,email,phone,amount,currency,provider,subscription_type,next_billing_date,invoice_id,failure_reason
Neha Gupta,neha.gupta@delhiinnovations.in,9876543210,249,INR,razorpay,monthly,2026-10-18,inv_in_911,insufficient_funds
Jordan Reed,bad-email-format,5551234567,99,USD,stripe,monthly,2026-10-20,inv_us_912,expired_card
Blank Phone Customer,blankphone@saasops.com,,199,USD,stripe,monthly,2026-10-22,inv_us_913,payment_method_declined
Invalid Phone Account,alex@invalidphone.org,123abc456,350,USD,razorpay,monthly,2026-10-25,inv_us_914,insufficient_funds
Zero Amount Client,zero@testcorp.com,9876543210,0,USD,paypal,monthly,2026-11-01,inv_us_915,bank_related_failure
Missing Name Account,,5551234567,120,USD,stripe,monthly,2026-10-30,inv_us_916,insufficient_funds
Neha Gupta,neha.gupta@delhiinnovations.in,9876543210,249,INR,razorpay,monthly,2026-10-18,inv_in_911,insufficient_funds`;

  // State
  const [step, setStep] = useState<ModalStep>('upload');
  const [csvText, setCsvText] = useState(sampleCleanCsv);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [inputMode, setInputMode] = useState<'upload' | 'editor'>('upload');

  // Country Selection (Requirement 2)
  const initialCountry = getDefaultCountryForWorkspace(workspace);
  const [selectedCountry, setSelectedCountry] = useState<string>(initialCountry);

  // Column Mappings (Requirement 10)
  const [mappings, setMappings] = useState<ColumnMapping>({
    customer_name: '',
    email: '',
    phone: '',
    amount: '',
    currency: '',
    provider: '',
    subscription_type: '',
    next_billing_date: '',
  });

  // Validation & Processing
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    validRows: any[];
    errors: Array<{
      rowNumber: number;
      name?: string;
      email?: string;
      phone?: string;
      amount?: number | string;
      currency?: string;
      field?: string;
      error: string;
    }>;
    duplicates: Array<{
      rowNumber: number;
      name?: string;
      email?: string;
      phone?: string;
      amount?: number | string;
      invoice_id?: string;
      reason: string;
    }>;
    totalCount: number;
    validCount: number;
    errorCount: number;
    duplicateCount: number;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'all' | 'valid' | 'failed' | 'duplicates'>('all');
  const [modalAlert, setModalAlert] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    totalCount: number;
    importedCount: number;
    failedCount: number;
    duplicateCount: number;
    errors?: any[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse CSV helper
  const parseCsvLines = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!cleanText) return { headers: [], rows: [] };

    const parseLine = (line: string): string[] => {
      const values: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(cur.trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      values.push(cur.trim());
      return values;
    };

    const lines = cleanText.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = parseLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i]);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = vals[idx] !== undefined ? vals[idx] : '';
      });
      rows.push(obj);
    }

    return { headers, rows };
  };

  const parsedData = useMemo(() => parseCsvLines(csvText), [csvText]);

  // When CSV text changes, auto-detect column mappings
  useEffect(() => {
    if (parsedData.headers.length > 0) {
      const detected = autoDetectMappings(parsedData.headers);
      setMappings(detected);
    }
  }, [parsedData.headers]);

  // Current Country Config
  const currentCountryConfig = useMemo(() => {
    return (
      COUNTRY_DIAL_CONFIGS.find((c) => c.code.toUpperCase() === selectedCountry.toUpperCase()) ||
      COUNTRY_DIAL_CONFIGS.find((c) => c.code === 'US')!
    );
  }, [selectedCountry]);

  // File Drop Handlers (Requirement 9)
  const handleFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setCsvText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Run Validation (Server-Side with phone normalization & mappings)
  const runValidation = async () => {
    setModalAlert(null);
    if (parsedData.rows.length === 0) {
      setModalAlert('No data rows found in CSV. Please ensure you have headers and data lines.');
      return;
    }

    // Check required fields mapped
    if (!mappings.customer_name) {
      setModalAlert('Please map the Customer Name column before validating.');
      setStep('mapping');
      return;
    }
    if (!mappings.email) {
      setModalAlert('Please map the Email column before validating.');
      setStep('mapping');
      return;
    }
    if (!mappings.amount) {
      setModalAlert('Please map the Subscription Amount column before validating.');
      setStep('mapping');
      return;
    }

    setIsValidating(true);
    try {
      const result = await api.validateCsv(parsedData.rows, selectedCountry, mappings);
      setValidationResult(result);
      setStep('preview');
      setActiveTab('all');
    } catch (err: any) {
      setModalAlert(err.message || 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  // Ingest Valid Rows (Requirement 5: Import valid, skip invalid)
  const handleConfirmImport = async () => {
    setModalAlert(null);
    if (!validationResult || validationResult.validCount === 0) {
      setModalAlert('No valid rows available to import.');
      return;
    }

    setIsImporting(true);
    try {
      const res = await onImport(parsedData.rows, selectedCountry, mappings);
      setImportSummary({
        totalCount: res?.totalCount ?? validationResult.totalCount,
        importedCount: res?.importedCount ?? validationResult.validCount,
        failedCount: res?.failedCount ?? validationResult.errorCount,
        duplicateCount: res?.duplicateCount ?? validationResult.duplicateCount,
        errors: res?.errors || validationResult.errors,
      });
      setStep('summary');
    } catch (err: any) {
      setModalAlert(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  // Download Error Report CSV (Requirement 6)
  const handleDownloadErrors = () => {
    setModalAlert(null);
    const errorsToExport = [
      ...(validationResult?.errors || []),
      ...(validationResult?.duplicates.map((d) => ({
        rowNumber: d.rowNumber,
        name: d.name,
        email: d.email,
        phone: d.phone,
        amount: d.amount,
        error: d.reason,
      })) || []),
    ];

    if (errorsToExport.length === 0) {
      setModalAlert('No error or duplicate records to download.');
      return;
    }

    downloadErrorReportCsv(
      errorsToExport,
      `import_errors_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
    );
  };

  // Preview of 1st row for live mapping feedback
  const sampleFirstRow = parsedData.rows[0] || {};

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">CSV Subscriber Import</h3>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  E.164 Auto-Normalize
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Bulk ingest payment failures, auto-normalize phones to E.164, and initialize recovery campaigns.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Alert Banner */}
        {modalAlert && (
          <div className="mt-3 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{modalAlert}</span>
            </div>
            <button
              type="button"
              onClick={() => setModalAlert(null)}
              className="text-rose-400 hover:text-white text-xs font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step Navigation Indicator */}
        <div className="flex items-center justify-between px-2 pt-3 pb-2 text-xs border-b border-slate-800/60 shrink-0">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Step 1 */}
            <button
              onClick={() => setStep('upload')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                step === 'upload'
                  ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                1
              </span>
              <span>Upload CSV</span>
            </button>
            <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />

            {/* Step 2 */}
            <button
              onClick={() => {
                if (parsedData.rows.length > 0) setStep('mapping');
              }}
              disabled={parsedData.rows.length === 0}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 ${
                step === 'mapping'
                  ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                2
              </span>
              <span>Map Columns</span>
            </button>
            <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />

            {/* Step 3 */}
            <button
              onClick={() => {
                if (validationResult) setStep('preview');
              }}
              disabled={!validationResult}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-40 ${
                step === 'preview'
                  ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                3
              </span>
              <span>Transformed Preview</span>
            </button>
          </div>

          {/* Download Sample Button (Requirement 8) */}
          <button
            type="button"
            onClick={() => downloadSampleCsvTemplate(selectedCountry)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/20 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Sample CSV</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 space-y-4 overflow-y-auto grow pr-1">
          {/* ==================================================== */}
          {/* STEP 1: UPLOAD & DEFAULT COUNTRY */}
          {/* ==================================================== */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Default Country Selector (Requirement 2 & 1) */}
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Globe className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      Default Country for Phone Normalization
                      <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                        Requirement 1 & 2
                      </span>
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Local numbers without country code will be auto-prefixed (e.g. 9876543210 → +919876543210 for India, 5551234567 → +15551234567 for US). Blank phone fields are allowed.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {COUNTRY_DIAL_CONFIGS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name} ({c.dialCode})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mode Toggle (Drag & Drop vs Direct Editor) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setInputMode('upload')}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      inputMode === 'upload'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    File Drag & Drop
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('editor')}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                      inputMode === 'editor'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Direct CSV Editor
                  </button>
                </div>

                {/* Preset Switchers */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 text-[11px]">Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvText(sampleCleanCsv);
                      setFileName(null);
                    }}
                    className="text-[11px] text-emerald-400 hover:underline cursor-pointer font-medium"
                  >
                    Clean Preset
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCsvText(sampleMixedCsv);
                      setFileName(null);
                    }}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer font-medium"
                  >
                    Preset with Errors
                  </button>
                </div>
              </div>

              {/* Drag & Drop File Upload Zone (Requirement 9) */}
              {inputMode === 'upload' && (
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    dragActive
                      ? 'border-emerald-500 bg-emerald-500/10 scale-[0.99]'
                      : 'border-slate-700 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFile(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="flex flex-col items-center gap-2.5">
                    <div className="p-3 rounded-full bg-slate-800 border border-slate-700 text-blue-400 shadow-inner">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {fileName ? (
                        <span className="text-emerald-400 flex items-center gap-2 justify-center">
                          <FileText className="w-4 h-4" /> {fileName}
                        </span>
                      ) : (
                        'Drop your CSV file here, or click to browse'
                      )}
                    </div>
                    <p className="text-xs text-slate-400 max-w-md">
                      Supports comma-separated files containing customer details, invoice numbers, amounts, and phone numbers.
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {parsedData.rows.length} rows loaded
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {parsedData.headers.length} columns detected
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Direct CSV Textarea */}
              {inputMode === 'editor' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Edit raw comma-separated values:</span>
                    <span className="font-mono text-emerald-400">
                      {parsedData.rows.length} records detected
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-800/70 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-emerald-500 leading-relaxed"
                    placeholder="customer_name,email,phone,amount,currency,invoice_id,failure_reason"
                  />
                </div>
              )}

              {/* Information Callout */}
              <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200">Resilient Ingestion Engine: </span>
                  Valid rows are ingested and invalid rows are skipped. Failed records and duplicates generate a downloadable diagnostic error report CSV.
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* STEP 2: MAPPING SCREEN (Requirement 10) */}
          {/* ==================================================== */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/60">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-blue-400" /> Map CSV Columns to System Fields
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Match each system attribute to the corresponding header in your file. We auto-detected matches below.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const detected = autoDetectMappings(parsedData.headers);
                      setMappings(detected);
                    }}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded border border-blue-500/20 transition-all cursor-pointer"
                  >
                    Reset Auto-Detect
                  </button>
                </div>
              </div>

              {/* Grid of 8 Target Fields (Requirement 10) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {TARGET_FIELDS.map((target) => {
                  const mappedHeader = mappings[target.key];
                  const sampleVal = mappedHeader ? sampleFirstRow[mappedHeader] : '';

                  return (
                    <div
                      key={target.key}
                      className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 hover:border-slate-600 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {target.key === 'customer_name' && <User className="w-3.5 h-3.5 text-blue-400" />}
                          {target.key === 'email' && <Mail className="w-3.5 h-3.5 text-blue-400" />}
                          {target.key === 'phone' && <Phone className="w-3.5 h-3.5 text-emerald-400" />}
                          {target.key === 'amount' && <DollarSign className="w-3.5 h-3.5 text-emerald-400" />}
                          {target.key === 'currency' && <CreditCard className="w-3.5 h-3.5 text-amber-400" />}
                          {target.key === 'provider' && <Building className="w-3.5 h-3.5 text-purple-400" />}
                          {target.key === 'subscription_type' && <Layers className="w-3.5 h-3.5 text-cyan-400" />}
                          {target.key === 'next_billing_date' && <Calendar className="w-3.5 h-3.5 text-rose-400" />}
                          <span className="text-xs font-bold text-white">{target.label}</span>
                        </div>
                        {target.required ? (
                          <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            Required
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
                            Optional
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400">{target.description}</p>

                      <div className="flex flex-col gap-1.5">
                        <select
                          value={mappedHeader || ''}
                          onChange={(e) =>
                            setMappings((prev) => ({
                              ...prev,
                              [target.key]: e.target.value,
                            }))
                          }
                          className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none cursor-pointer ${
                            target.required && !mappedHeader
                              ? 'border-rose-500/80 bg-rose-950/20 text-rose-200'
                              : 'border-slate-700 focus:border-blue-500'
                          }`}
                        >
                          <option value="">
                            {target.required ? 'Select column...' : '(Do not map / Use default)'}
                          </option>
                          {parsedData.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>

                        {/* Sample preview chip */}
                        {mappedHeader && (
                          <div className="text-[11px] text-slate-400 font-mono bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800 flex items-center justify-between">
                            <span className="text-slate-500">Row 1 value:</span>
                            <span className="text-emerald-300 truncate max-w-[200px]">
                              {sampleVal ? String(sampleVal) : '(blank)'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* STEP 3: TRANSFORMED PREVIEW & VALIDATION (Requirement 3, 4, 7) */}
          {/* ==================================================== */}
          {step === 'preview' && validationResult && (
            <div className="space-y-4">
              {/* Requirement 7: 4 Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Total Rows */}
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Total Rows
                  </span>
                  <div className="text-2xl font-black text-white font-mono mt-0.5">
                    {validationResult.totalCount}
                  </div>
                </div>

                {/* Valid / Imported Rows */}
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-center">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                    Valid (To Import)
                  </span>
                  <div className="text-2xl font-black text-emerald-300 font-mono mt-0.5">
                    {validationResult.validCount}
                  </div>
                </div>

                {/* Failed Rows */}
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/50 text-center">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                    Failed Rows
                  </span>
                  <div className="text-2xl font-black text-rose-400 font-mono mt-0.5">
                    {validationResult.errorCount}
                  </div>
                </div>

                {/* Duplicate Rows */}
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-center">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                    Duplicate Rows
                  </span>
                  <div className="text-2xl font-black text-amber-400 font-mono mt-0.5">
                    {validationResult.duplicateCount}
                  </div>
                </div>
              </div>

              {/* Banner & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs">
                <div className="flex items-center gap-2">
                  {validationResult.errorCount > 0 || validationResult.duplicateCount > 0 ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span>
                    {validationResult.validCount} records ready for ingestion. Phone numbers normalized using{' '}
                    <strong className="text-white font-semibold">
                      {currentCountryConfig.name} ({currentCountryConfig.dialCode})
                    </strong>
                    .
                  </span>
                </div>

                {/* Download Error Report CSV Button (Requirement 6) */}
                {(validationResult.errorCount > 0 || validationResult.duplicateCount > 0) && (
                  <button
                    type="button"
                    onClick={handleDownloadErrors}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold transition-all cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Error Report (CSV)</span>
                  </button>
                )}
              </div>

              {/* Requirement 3: Transformed Values Preview Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden">
                {/* Filter Tabs */}
                <div className="flex items-center justify-between p-2.5 bg-slate-800/80 border-b border-slate-800 text-xs">
                  <span className="font-bold text-slate-200">
                    Pre-Ingestion Transformed Preview
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                        activeTab === 'all'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All ({validationResult.totalCount})
                    </button>
                    <button
                      onClick={() => setActiveTab('valid')}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                        activeTab === 'valid'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Valid ({validationResult.validCount})
                    </button>
                    {validationResult.errorCount > 0 && (
                      <button
                        onClick={() => setActiveTab('failed')}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                          activeTab === 'failed'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Failed ({validationResult.errorCount})
                      </button>
                    )}
                    {validationResult.duplicateCount > 0 && (
                      <button
                        onClick={() => setActiveTab('duplicates')}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                          activeTab === 'duplicates'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Duplicates ({validationResult.duplicateCount})
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60 text-xs">
                  {/* Errors Tab */}
                  {(activeTab === 'all' || activeTab === 'failed') &&
                    validationResult.errors.map((err, i) => (
                      <div
                        key={`err_${i}`}
                        className="p-3 bg-rose-950/20 text-rose-300 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded">
                            Row #{err.rowNumber}
                          </span>
                          <span className="font-bold text-white">{err.name || 'Missing Name'}</span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            ({err.email || 'No email'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-rose-400 text-[11px] font-mono shrink-0">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{err.error}</span>
                        </div>
                      </div>
                    ))}

                  {/* Duplicates Tab */}
                  {(activeTab === 'all' || activeTab === 'duplicates') &&
                    validationResult.duplicates.map((dup, i) => (
                      <div
                        key={`dup_${i}`}
                        className="p-3 bg-amber-950/20 text-amber-300 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded">
                            Row #{dup.rowNumber}
                          </span>
                          <span className="font-bold text-white">{dup.name || 'Duplicate Row'}</span>
                          <span className="text-slate-400 font-mono text-[11px]">({dup.email})</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-400 text-[11px] font-mono shrink-0">
                          <Copy className="w-3.5 h-3.5" />
                          <span>{dup.reason}</span>
                        </div>
                      </div>
                    ))}

                  {/* Valid Rows Tab (Showing Transformed Values!) */}
                  {(activeTab === 'all' || activeTab === 'valid') &&
                    validationResult.validRows.map((row, i) => (
                      <div
                        key={`val_${i}`}
                        className="p-3 hover:bg-slate-800/40 text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                            #{row.rowNumber || i + 1}
                          </span>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>{row.name}</span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                {row.email}
                              </span>
                            </div>

                            {/* Transformed Phone Preview (Requirement 1, 3, 4) */}
                            <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                              {row.phone ? (
                                <span className="font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                                  <Phone className="w-3 h-3" />
                                  <span>{row.phone}</span>
                                  {row.phoneNormalized && (
                                    <span className="text-[9px] text-emerald-300 opacity-80">
                                      (from: {row.rawPhone})
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic bg-slate-800 px-1.5 py-0.2 rounded text-[10px]">
                                  Phone: Blank (Allowed)
                                </span>
                              )}
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400 capitalize">
                                {row.subscription_type} Plan
                              </span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400 uppercase text-[10px]">
                                {row.provider}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                          <span className="font-mono text-xs text-white font-bold">
                            {formatCurrency(row.amount, row.currency)}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Valid
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* STEP 4: SUMMARY SCREEN (Requirement 6, 7) */}
          {/* ==================================================== */}
          {step === 'summary' && importSummary && (
            <div className="py-6 text-center space-y-5">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div>
                <h4 className="text-xl font-bold text-white">
                  {importSummary.importedCount} Invoices Ingested Successfully!
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  Customer records created, phone numbers standardized in E.164, and automated recovery workflows activated.
                </p>
              </div>

              {/* Requirement 7: Show Total, Imported, Failed, Duplicate rows */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto">
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Rows</span>
                  <div className="text-xl font-black text-white font-mono mt-0.5">
                    {importSummary.totalCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-center">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">Imported</span>
                  <div className="text-xl font-black text-emerald-300 font-mono mt-0.5">
                    {importSummary.importedCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/50 text-center">
                  <span className="text-[10px] font-bold text-rose-400 uppercase">Failed</span>
                  <div className="text-xl font-black text-rose-400 font-mono mt-0.5">
                    {importSummary.failedCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 text-center">
                  <span className="text-[10px] font-bold text-amber-400 uppercase">Duplicate</span>
                  <div className="text-xl font-black text-amber-400 font-mono mt-0.5">
                    {importSummary.duplicateCount}
                  </div>
                </div>
              </div>

              {/* Download error report button if any failed/duplicates */}
              {(importSummary.failedCount > 0 || importSummary.duplicateCount > 0) && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadErrors}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold text-xs transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Error Report for {importSummary.failedCount + importSummary.duplicateCount} Skipped Records</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800 shrink-0 text-xs">
          {step === 'upload' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={parsedData.rows.length === 0}
                onClick={() => setStep('mapping')}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-blue-600/20"
              >
                <span>Next: Map Columns ({parsedData.rows.length} rows)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'mapping' && (
            <>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Upload</span>
              </button>

              <button
                type="button"
                disabled={isValidating}
                onClick={runValidation}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-blue-600/20"
              >
                {isValidating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Apply Mapping & Validate</span>
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('mapping')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Mapping</span>
              </button>

              <div className="flex items-center gap-2">
                {/* Requirement 5: Ingest valid rows and skip invalid */}
                <button
                  type="button"
                  disabled={isImporting || !validationResult || validationResult.validCount === 0}
                  onClick={handleConfirmImport}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isImporting ? (
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>
                    Ingest {validationResult?.validCount} Valid Records
                    {validationResult &&
                      validationResult.errorCount + validationResult.duplicateCount > 0 &&
                      ` (Skip ${validationResult.errorCount + validationResult.duplicateCount} Failed)`}
                  </span>
                </button>
              </div>
            </>
          )}

          {step === 'summary' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold transition-all cursor-pointer shadow-md shadow-emerald-500/20"
              >
                Done & View Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
