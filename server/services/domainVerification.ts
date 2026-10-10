import { db } from '../store/db.js';

export interface DomainVerificationStatus {
  domain: string;
  verified: boolean;
  spf: { verified: boolean; recordType: string; host: string; expected: string; actual: string };
  dkim: { verified: boolean; recordType: string; host: string; expected: string; actual: string };
  dmarc: { verified: boolean; recordType: string; host: string; expected: string; actual: string };
}

export class DomainVerificationEngine {
  public static async getVerificationStatus(domain: string): Promise<DomainVerificationStatus> {
    // Generate realistic verification DNS targets based on RFC specifications
    const dkimSelector = 'reviveos';
    const isMockVerified = domain.includes('verified') || domain === 'pulsefit.in' || domain === 'hyperion.io';

    return {
      domain,
      verified: isMockVerified,
      spf: {
        verified: isMockVerified,
        recordType: 'TXT',
        host: '@',
        expected: 'v=spf1 include:mail.reviveos.com ~all',
        actual: isMockVerified ? 'v=spf1 include:mail.reviveos.com ~all' : 'v=spf1 include:spf.protection.outlook.com -all',
      },
      dkim: {
        verified: isMockVerified,
        recordType: 'TXT',
        host: `${dkimSelector}._domainkey.${domain}`,
        expected: `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv1K7i`,
        actual: isMockVerified ? `v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv1K7i` : '',
      },
      dmarc: {
        verified: isMockVerified,
        recordType: 'TXT',
        host: `_dmarc.${domain}`,
        expected: 'v=DMARC1; p=quarantine; pct=100',
        actual: isMockVerified ? 'v=DMARC1; p=quarantine; pct=100' : 'v=DMARC1; p=none;',
      },
    };
  }

  public static async verifyDomainRecords(domain: string): Promise<DomainVerificationStatus> {
    const status = await this.getVerificationStatus(domain);
    if (status.verified) {
      // Save domain as verified in email configurations
      const workspaces = db.getWorkspaces();
      const ws = workspaces.find((w) => w.email_config?.from_email?.includes(domain));
      if (ws && ws.email_config) {
        ws.email_config.custom_domain_verified = true;
        db.persist();
      }
    }
    return status;
  }
}
