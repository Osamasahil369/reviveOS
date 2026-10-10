/**
 * ReviveOS Indian GST Engine
 * Validates GSTIN, state codes, computes CGST (9%) + SGST (9%) for Karnataka or IGST (18%) for inter-state,
 * and produces compliant GST tax breakdowns.
 */

export interface GstTaxBreakdown {
  taxableAmountSubunit: number; // Base amount before tax
  gstRatePercent: number; // 18% standard SaaS rate
  isInterState: boolean;
  cgstPercent: number;
  cgstSubunit: number;
  sgstPercent: number;
  sgstSubunit: number;
  igstPercent: number;
  igstSubunit: number;
  totalTaxSubunit: number;
  totalAmountSubunit: number; // Base + Tax
  sacCode: string; // 998313 (Information technology software services)
}

export interface BillingProfile {
  workspace_id: string;
  business_name: string;
  billing_email: string;
  billing_phone?: string;
  billing_address: string;
  city: string;
  state: string; // State name or code
  state_code?: string; // 2-digit GST state code
  postal_code: string;
  country: string; // 'IN' or other
  gstin?: string; // 15-character GSTIN
  is_gst_registered: boolean;
  updated_at: string;
}

export class IndiaGstService {
  // ReviveOS Platform Registered State: 29 (Karnataka)
  public static readonly PLATFORM_STATE_CODE = '29';
  public static readonly SAC_CODE = '998313'; // SaaS & IT Services
  public static readonly GST_RATE = 18; // 18%

  public static readonly STATE_CODE_MAP: Record<string, string> = {
    'JAMMU AND KASHMIR': '01',
    'HIMACHAL PRADESH': '02',
    'PUNJAB': '03',
    'CHANDIGARH': '04',
    'UTTARAKHAND': '05',
    'HARYANA': '06',
    'DELHI': '07',
    'RAJASTHAN': '08',
    'UTTAR PRADESH': '09',
    'BIHAR': '10',
    'SIKKIM': '11',
    'ARUNACHAL PRADESH': '12',
    'NAGALAND': '13',
    'MANIPUR': '14',
    'MIZORAM': '15',
    'TRIPURA': '16',
    'MEGHALAYA': '17',
    'ASSAM': '18',
    'WEST BENGAL': '19',
    'JHARKHAND': '20',
    'ODISHA': '21',
    'CHHATTISGARH': '22',
    'MADHYA PRADESH': '23',
    'GUJARAT': '24',
    'DAMAN AND DIU': '25',
    'DADRA AND NAGAR HAVELI': '26',
    'MAHARASHTRA': '27',
    'ANDHRA PRADESH': '28',
    'KARNATAKA': '29',
    'GOA': '30',
    'LAKSHADWEEP': '31',
    'KERALA': '32',
    'TAMIL NADU': '33',
    'PUDUCHERRY': '34',
    'ANDAMAN AND NICOBAR ISLANDS': '35',
    'TELANGANA': '36',
    'LADAKH': '38',
  };

  /**
   * Validates Indian 15-digit GSTIN regex: 2 digits state + 10 chars PAN + 1 entity num + 'Z' + 1 checksum
   */
  public static validateGstIn(gstin?: string): { valid: boolean; stateCode?: string; error?: string } {
    if (!gstin || !gstin.trim()) {
      return { valid: false, error: 'GSTIN is empty' };
    }
    const clean = gstin.trim().toUpperCase();
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(clean)) {
      return { valid: false, error: 'Invalid GSTIN format. Expected 15 characters (e.g. 29ABCDE1234F1Z5).' };
    }
    const stateCode = clean.substring(0, 2);
    return { valid: true, stateCode };
  }

  /**
   * Resolves state code from state name or GSTIN
   */
  public static resolveStateCode(stateName?: string, gstin?: string): string {
    if (gstin) {
      const gstinVal = this.validateGstIn(gstin);
      if (gstinVal.valid && gstinVal.stateCode) return gstinVal.stateCode;
    }
    if (stateName) {
      const normalized = stateName.toUpperCase().trim();
      if (/^[0-9]{2}$/.test(normalized)) return normalized;
      if (this.STATE_CODE_MAP[normalized]) return this.STATE_CODE_MAP[normalized];
    }
    return '29'; // Default Karnataka
  }

  /**
   * Computes GST breakdown on an amount in sub-units (paise/cents).
   * For India (INR):
   * - If Buyer is in Karnataka (State 29): CGST 9% + SGST 9%
   * - If Buyer is outside Karnataka: IGST 18%
   * For non-India (USD/EUR/etc):
   * - 0% Indian GST export of services
   */
  public static calculateGst(
    taxableAmountSubunit: number,
    country: string = 'IN',
    buyerStateOrCode?: string,
    buyerGstin?: string
  ): GstTaxBreakdown {
    const isIndia = country.toUpperCase() === 'IN' || country.toUpperCase() === 'IND' || country.toUpperCase() === 'INDIA';

    if (!isIndia || taxableAmountSubunit <= 0) {
      return {
        taxableAmountSubunit,
        gstRatePercent: 0,
        isInterState: false,
        cgstPercent: 0,
        cgstSubunit: 0,
        sgstPercent: 0,
        sgstSubunit: 0,
        igstPercent: 0,
        igstSubunit: 0,
        totalTaxSubunit: 0,
        totalAmountSubunit: taxableAmountSubunit,
        sacCode: this.SAC_CODE,
      };
    }

    const buyerStateCode = this.resolveStateCode(buyerStateOrCode, buyerGstin);
    const isIntraState = buyerStateCode === this.PLATFORM_STATE_CODE;

    if (isIntraState) {
      const cgstSubunit = Math.round((taxableAmountSubunit * 9) / 100);
      const sgstSubunit = Math.round((taxableAmountSubunit * 9) / 100);
      const totalTaxSubunit = cgstSubunit + sgstSubunit;
      return {
        taxableAmountSubunit,
        gstRatePercent: 18,
        isInterState: false,
        cgstPercent: 9,
        cgstSubunit,
        sgstPercent: 9,
        sgstSubunit,
        igstPercent: 0,
        igstSubunit: 0,
        totalTaxSubunit,
        totalAmountSubunit: taxableAmountSubunit + totalTaxSubunit,
        sacCode: this.SAC_CODE,
      };
    } else {
      const igstSubunit = Math.round((taxableAmountSubunit * 18) / 100);
      return {
        taxableAmountSubunit,
        gstRatePercent: 18,
        isInterState: true,
        cgstPercent: 0,
        cgstSubunit: 0,
        sgstPercent: 0,
        sgstSubunit: 0,
        igstPercent: 18,
        igstSubunit,
        totalTaxSubunit: igstSubunit,
        totalAmountSubunit: taxableAmountSubunit + igstSubunit,
        sacCode: this.SAC_CODE,
      };
    }
  }
}
