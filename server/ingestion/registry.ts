import { IRevenueConnector, SourceCategory } from './types.js';

/**
 * Universal Revenue Data Ingestion Framework - Connector Registry
 * 
 * Provides dynamic registration for all 30 initial connectors across:
 * - PAYMENTS (10)
 * - ECOMMERCE (2)
 * - ACCOUNTING (4)
 * - CRM (3)
 * - FILES (6)
 * - DATABASES (4)
 * - UNIVERSAL API (1)
 * 
 * Adding source #50 requires ONLY:
 * 1. Implement `IRevenueConnector` (or extend `BaseRevenueConnector`)
 * 2. Call `universalConnectorRegistry.register(new Source50Connector())`
 * No system rewrites, no schema shifts, no changes to downstream engines.
 */
export class UniversalConnectorRegistry {
  private static instance: UniversalConnectorRegistry;
  private connectors: Map<string, IRevenueConnector> = new Map();

  private constructor() {}

  public static getInstance(): UniversalConnectorRegistry {
    if (!UniversalConnectorRegistry.instance) {
      UniversalConnectorRegistry.instance = new UniversalConnectorRegistry();
    }
    return UniversalConnectorRegistry.instance;
  }

  /**
   * Register a connector into the universal registry
   */
  public register(connector: IRevenueConnector): void {
    if (!connector || !connector.id) {
      throw new Error('Cannot register invalid connector: id is required.');
    }
    this.connectors.set(connector.id.toLowerCase(), connector);
  }

  /**
   * Get a registered connector by its unique identifier
   */
  public get(id: string): IRevenueConnector | undefined {
    if (!id) return undefined;
    return this.connectors.get(id.toLowerCase());
  }

  /**
   * Check if a connector exists in the registry
   */
  public has(id: string): boolean {
    if (!id) return false;
    return this.connectors.has(id.toLowerCase());
  }

  /**
   * Get all registered connectors
   */
  public getAll(): IRevenueConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Get connectors filtered by category
   */
  public getByCategory(category: SourceCategory): IRevenueConnector[] {
    return this.getAll().filter((c) => c.category === category);
  }

  /**
   * Total registered connectors count
   */
  public get count(): number {
    return this.connectors.size;
  }

  /**
   * Clear registry (useful for unit testing isolation)
   */
  public clear(): void {
    this.connectors.clear();
  }
}

export const universalConnectorRegistry = UniversalConnectorRegistry.getInstance();
