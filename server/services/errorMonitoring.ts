import crypto from 'crypto';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ErrorLogRecord {
  id: string;
  timestamp: string;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  context?: string;
  requestId?: string;
  workspaceId?: string;
  metadata?: Record<string, any>;
}

export class ErrorMonitoringService {
  private static errors: ErrorLogRecord[] = [];
  private static maxErrors = 5000;
  private static startTime = Date.now();

  public static log(
    severity: ErrorSeverity,
    message: string,
    error?: Error | any,
    context?: string,
    workspaceId?: string,
    requestId?: string,
    metadata?: Record<string, any>
  ): ErrorLogRecord {
    const record: ErrorLogRecord = {
      id: `err_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      severity,
      message,
      stack: error?.stack || (typeof error === 'string' ? error : undefined),
      context: context || 'general',
      workspaceId,
      requestId,
      metadata,
    };

    this.errors.unshift(record);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    const prefix = `[${record.timestamp}] [${severity.toUpperCase()}] [${record.context}]`;
    if (severity === 'error' || severity === 'critical') {
      console.error(`${prefix} ${message}`, error || '');
    } else if (severity === 'warning') {
      console.warn(`${prefix} ${message}`);
    } else {
      console.log(`${prefix} ${message}`);
    }

    return record;
  }

  public static getRecentErrors(limit: number = 100, severity?: ErrorSeverity, workspaceId?: string): ErrorLogRecord[] {
    let filtered = this.errors;
    if (severity && severity !== 'info') {
      filtered = filtered.filter((e) => e.severity === severity);
    }
    if (workspaceId) {
      filtered = filtered.filter((e) => e.workspaceId === workspaceId);
    }
    return filtered.slice(0, limit);
  }

  public static getErrorCounts(): Record<ErrorSeverity, number> {
    const counts: Record<ErrorSeverity, number> = { info: 0, warning: 0, error: 0, critical: 0 };
    for (const err of this.errors) {
      if (counts[err.severity] !== undefined) {
        counts[err.severity]++;
      }
    }
    return counts;
  }

  public static getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  public static clearErrors() {
    this.errors = [];
  }

  public static initGlobalHandlers() {
    if (typeof process !== 'undefined') {
      process.on('uncaughtException', (err: Error) => {
        this.log('critical', `Uncaught Exception: ${err.message}`, err, 'runtime_crash');
      });

      process.on('unhandledRejection', (reason: any) => {
        const msg = reason instanceof Error ? reason.message : String(reason);
        this.log('critical', `Unhandled Promise Rejection: ${msg}`, reason, 'runtime_crash');
      });
    }
  }
}

// Initialize global crash hooks
ErrorMonitoringService.initGlobalHandlers();
