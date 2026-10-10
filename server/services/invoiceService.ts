/**
 * ReviveOS Production Invoicing Engine
 * Handles tax-compliant invoice generation, sequential numbering (REV-YYYY-XXXX),
 * PDF/HTML receipt exports, and Indian GST breakdown.
 */

import { GstTaxBreakdown, IndiaGstService, BillingProfile } from './indiaGstService.js';
import { SupportedCurrency, CentralPricingEngine } from './centralPricingConfig.js';

export interface PlatformInvoice {
  id: string; // inv_platform_...
  invoice_number: string; // REV-2026-0001
  workspace_id: string;
  customer_id?: string;
  subscription_id: string;
  provider_payment_id?: string;
  provider_subscription_id?: string;
  plan_tier: string;
  billing_cycle: 'monthly' | 'annual';
  currency: SupportedCurrency;
  amount_subunits: number; // Final total charged
  taxable_amount_subunits: number;
  tax_amount_subunits: number;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  invoice_date: string;
  due_date: string;
  paid_at?: string;
  billing_profile: BillingProfile;
  tax_breakdown: GstTaxBreakdown;
  line_items: Array<{
    description: string;
    sac_code: string;
    quantity: number;
    unit_price_subunit: number;
    amount_subunit: number;
  }>;
  download_url?: string;
  receipt_url?: string;
  created_at: string;
}

export class PlatformInvoiceService {
  private static sequenceCounter = 1000;

  /**
   * Generates a tax invoice for a verified subscription payment
   */
  public static createInvoice(params: {
    workspaceId: string;
    customerId?: string;
    subscriptionId: string;
    providerPaymentId?: string;
    providerSubscriptionId?: string;
    planTier: string;
    billingCycle: 'monthly' | 'annual';
    currency: SupportedCurrency;
    baseAmountSubunit: number;
    billingProfile: BillingProfile;
    status?: 'paid' | 'pending' | 'failed';
  }): PlatformInvoice {
    this.sequenceCounter += 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `REV-${year}-${String(this.sequenceCounter).padStart(5, '0')}`;
    const invoiceId = `inv_plat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const taxBreakdown = IndiaGstService.calculateGst(
      params.baseAmountSubunit,
      params.billingProfile.country,
      params.billingProfile.state,
      params.billingProfile.gstin
    );

    const currencySymbol = CentralPricingEngine.CURRENCY_METADATA[params.currency]?.symbol || '₹';
    const planName = params.planTier.charAt(0).toUpperCase() + params.planTier.slice(1);

    const invoice: PlatformInvoice = {
      id: invoiceId,
      invoice_number: invoiceNumber,
      workspace_id: params.workspaceId,
      customer_id: params.customerId,
      subscription_id: params.subscriptionId,
      provider_payment_id: params.providerPaymentId,
      provider_subscription_id: params.providerSubscriptionId,
      plan_tier: params.planTier,
      billing_cycle: params.billingCycle,
      currency: params.currency,
      amount_subunits: taxBreakdown.totalAmountSubunit,
      taxable_amount_subunits: taxBreakdown.taxableAmountSubunit,
      tax_amount_subunits: taxBreakdown.totalTaxSubunit,
      status: params.status || 'paid',
      invoice_date: now,
      due_date: now,
      paid_at: params.status === 'failed' ? undefined : now,
      billing_profile: params.billingProfile,
      tax_breakdown: taxBreakdown,
      line_items: [
        {
          description: `ReviveOS ${planName} Plan (${params.billingCycle === 'annual' ? 'Annual Billing' : 'Monthly Subscription'})`,
          sac_code: taxBreakdown.sacCode,
          quantity: 1,
          unit_price_subunit: taxBreakdown.taxableAmountSubunit,
          amount_subunit: taxBreakdown.taxableAmountSubunit,
        },
      ],
      created_at: now,
    };

    return invoice;
  }

  /**
   * Generates a printable HTML/PDF representation of the GST-compliant Tax Invoice
   */
  public static renderInvoiceHtml(invoice: PlatformInvoice): string {
    const cur = invoice.currency;
    const sym = CentralPricingEngine.CURRENCY_METADATA[cur]?.symbol || '₹';
    const toMajor = (sub: number) => (sub / 100).toFixed(2);
    const p = invoice.billing_profile;
    const tb = invoice.tax_breakdown;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice - ${invoice.invoice_number}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; background: #fff; padding: 40px; margin: 0; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 30px; }
    .brand { font-size: 26px; font-weight: 800; color: #4338ca; }
    .title { font-size: 20px; font-weight: 700; color: #0f172a; text-align: right; }
    .meta { font-size: 13px; color: #64748b; line-height: 1.6; }
    .addresses { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
    .address-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; font-size: 13px; line-height: 1.6; }
    .address-card h4 { margin: 0 0 8px 0; color: #0f172a; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
    th { background: #f1f5f9; padding: 12px 14px; text-align: left; font-weight: 600; color: #334155; border-bottom: 1px solid #cbd5e1; }
    td { padding: 12px 14px; border-bottom: 1px solid #e2e8f0; }
    .text-right { text-align: right; }
    .totals { margin-left: auto; width: 340px; margin-bottom: 30px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .totals-row.grand { font-size: 16px; font-weight: 700; color: #4338ca; border-top: 2px solid #cbd5e1; border-bottom: none; padding-top: 12px; }
    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #dcfce7; color: #15803d; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">ReviveOS</div>
      <div class="meta" style="margin-top: 6px;">
        Autonomous Revenue Operating System<br/>
        Revive Technologies Pvt. Ltd.<br/>
        GSTIN: 29AABCR1234F1Z8 | SAC: 998313<br/>
        Indiranagar, Bangalore, Karnataka - 560038
      </div>
    </div>
    <div>
      <div class="title">ORIGINAL TAX INVOICE</div>
      <div class="meta" style="margin-top: 8px;">
        <strong>Invoice No:</strong> ${invoice.invoice_number}<br/>
        <strong>Invoice Date:</strong> ${new Date(invoice.invoice_date).toLocaleDateString()}<br/>
        <strong>Status:</strong> <span class="status-badge">${invoice.status}</span><br/>
        <strong>Payment Provider:</strong> Razorpay Subscriptions<br/>
        <strong>Reference ID:</strong> ${invoice.provider_payment_id || invoice.subscription_id}
      </div>
    </div>
  </div>

  <div class="addresses">
    <div class="address-card">
      <h4>Billed From (Supplier)</h4>
      <strong>Revive Technologies Private Limited</strong><br/>
      14th Main Road, HAL 2nd Stage, Indiranagar<br/>
      Bengaluru, Karnataka - 560038, India<br/>
      <strong>State Code:</strong> 29 (Karnataka)<br/>
      <strong>GSTIN:</strong> 29AABCR1234F1Z8<br/>
      <strong>Contact:</strong> billing@reviveos.io
    </div>
    <div class="address-card">
      <h4>Billed To (Customer)</h4>
      <strong>${p.business_name || 'Valued Workspace'}</strong><br/>
      ${p.billing_address || 'Address on file'}<br/>
      ${p.city || ''} ${p.state || ''} ${p.postal_code || ''}<br/>
      ${p.country || 'India'}<br/>
      <strong>GSTIN / Tax ID:</strong> ${p.gstin || 'Unregistered / B2C'}<br/>
      <strong>Billing Email:</strong> ${p.billing_email || 'Not specified'}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>SAC Code</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Taxable Amount (${sym})</th>
      </tr>
    </thead>
    <tbody>
      ${invoice.line_items
        .map(
          (item) => `
        <tr>
          <td><strong>${item.description}</strong></td>
          <td>${item.sac_code}</td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">${sym} ${toMajor(item.amount_subunit)}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Taxable Amount</span>
      <span>${sym} ${toMajor(tb.taxableAmountSubunit)}</span>
    </div>
    ${
      tb.cgstSubunit > 0
        ? `
      <div class="totals-row">
        <span>CGST (9.0%)</span>
        <span>${sym} ${toMajor(tb.cgstSubunit)}</span>
      </div>
      <div class="totals-row">
        <span>SGST (9.0%)</span>
        <span>${sym} ${toMajor(tb.sgstSubunit)}</span>
      </div>
    `
        : ''
    }
    ${
      tb.igstSubunit > 0
        ? `
      <div class="totals-row">
        <span>IGST (18.0%)</span>
        <span>${sym} ${toMajor(tb.igstSubunit)}</span>
      </div>
    `
        : ''
    }
    <div class="totals-row grand">
      <span>Total Paid</span>
      <span>${sym} ${toMajor(invoice.amount_subunits)}</span>
    </div>
  </div>

  <div class="footer">
    This is an electronically generated tax invoice and does not require a physical signature.<br/>
    Subject to Bangalore jurisdiction. For inquiries, please reach out to billing@reviveos.io.
  </div>
</body>
</html>
    `.trim();
  }
}
