import { universalConnectorRegistry } from '../registry.js';
import {
  RazorpayConnector,
  StripeConnector,
  PayPalConnector,
  CashfreeConnector,
  PhonePeBusinessConnector,
  PayUConnector,
  InstamojoConnector,
  PaddleConnector,
  LemonSqueezyConnector,
  ChargebeeConnector,
} from './payments.js';
import {
  ShopifyConnector,
  WooCommerceConnector,
} from './ecommerce.js';
import {
  ZohoBooksConnector,
  QuickBooksConnector,
  XeroConnector,
  TallyConnector,
} from './accounting.js';
import {
  HubSpotConnector,
  SalesforceConnector,
  ZohoCrmConnector,
} from './crm.js';
import {
  CsvConnector,
  XlsxConnector,
  XlsConnector,
  TsvConnector,
  JsonConnector,
  XmlConnector,
} from './files.js';
import {
  PostgreSqlConnector,
  MySqlConnector,
  SqlServerConnector,
  MongoDbConnector,
} from './databases.js';
import { UniversalApiConnector } from './universalApi.js';

/**
 * Bootstraps and registers all 30 Initial Revenue Connectors
 */
export function registerAllConnectors(): void {
  // PAYMENTS (10)
  universalConnectorRegistry.register(new RazorpayConnector());
  universalConnectorRegistry.register(new StripeConnector());
  universalConnectorRegistry.register(new PayPalConnector());
  universalConnectorRegistry.register(new CashfreeConnector());
  universalConnectorRegistry.register(new PhonePeBusinessConnector());
  universalConnectorRegistry.register(new PayUConnector());
  universalConnectorRegistry.register(new InstamojoConnector());
  universalConnectorRegistry.register(new PaddleConnector());
  universalConnectorRegistry.register(new LemonSqueezyConnector());
  universalConnectorRegistry.register(new ChargebeeConnector());

  // ECOMMERCE (2)
  universalConnectorRegistry.register(new ShopifyConnector());
  universalConnectorRegistry.register(new WooCommerceConnector());

  // ACCOUNTING (4)
  universalConnectorRegistry.register(new ZohoBooksConnector());
  universalConnectorRegistry.register(new QuickBooksConnector());
  universalConnectorRegistry.register(new XeroConnector());
  universalConnectorRegistry.register(new TallyConnector());

  // CRM (3)
  universalConnectorRegistry.register(new HubSpotConnector());
  universalConnectorRegistry.register(new SalesforceConnector());
  universalConnectorRegistry.register(new ZohoCrmConnector());

  // FILES (6)
  universalConnectorRegistry.register(new CsvConnector());
  universalConnectorRegistry.register(new XlsxConnector());
  universalConnectorRegistry.register(new XlsConnector());
  universalConnectorRegistry.register(new TsvConnector());
  universalConnectorRegistry.register(new JsonConnector());
  universalConnectorRegistry.register(new XmlConnector());

  // DATABASES (4)
  universalConnectorRegistry.register(new PostgreSqlConnector());
  universalConnectorRegistry.register(new MySqlConnector());
  universalConnectorRegistry.register(new SqlServerConnector());
  universalConnectorRegistry.register(new MongoDbConnector());

  // UNIVERSAL API (1)
  universalConnectorRegistry.register(new UniversalApiConnector());
}

// Auto-register on import
registerAllConnectors();
