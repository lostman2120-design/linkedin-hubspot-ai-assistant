import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { Pool } from "pg";

export type LicenseStatus = "active" | "past_due" | "canceled" | "inactive";

export type LicenseRecord = {
  id: string;
  email: string;
  licenseKey: string;
  plan: "beta_pro";
  status: LicenseStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
  lastEmailSentAt: string | null;
};

export type ProcessedStripeEventRecord = {
  id: string;
  stripeEventId: string;
  eventType: string;
  processedAt: string;
};

export type LicenseRepositoryLike = {
  listLicenses(): Promise<LicenseRecord[]>;
  findByLicenseKey(licenseKey: string): Promise<LicenseRecord | null>;
  findByEmailOrLicenseKey(input: { email?: string; licenseKey?: string }): Promise<LicenseRecord | null>;
  findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<LicenseRecord | null>;
  findByStripeCustomerId(stripeCustomerId: string): Promise<LicenseRecord | null>;
  hasProcessedStripeEvent(eventId: string): Promise<boolean>;
  recordProcessedStripeEvent(eventId: string, type: string): Promise<void>;
  upsertLicenseForStripeCheckout(input: {
    email: string;
    licenseKey: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string;
    stripeCheckoutSessionId: string;
    status: LicenseStatus;
    currentPeriodEnd?: string | null;
  }): Promise<LicenseRecord>;
  updateLicenseStatus(
    licenseId: string,
    input: { status: LicenseStatus; currentPeriodEnd?: string | null; stripeCustomerId?: string | null }
  ): Promise<LicenseRecord | null>;
  updateLastEmailSentAt(licenseId: string, lastEmailSentAt?: string): Promise<LicenseRecord | null>;
  isLicenseKeyTaken(licenseKey: string): Promise<boolean>;
};

type LicenseDatabase = {
  licenses: LicenseRecord[];
  processedStripeEvents: ProcessedStripeEventRecord[];
};

type LegacyProcessedStripeEvent = {
  id?: string;
  stripeEventId?: string;
  eventId?: string;
  eventType?: string;
  type?: string;
  processedAt?: string;
  createdAt?: string;
};

type LicenseRow = {
  id: string;
  email: string;
  license_key: string;
  plan: string;
  status: LicenseStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  current_period_end: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_email_sent_at: Date | string | null;
};

const emptyDatabase = (): LicenseDatabase => ({
  licenses: [],
  processedStripeEvents: []
});

const postgresSchemaSql = `
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'beta_pro',
  status TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT UNIQUE,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_email_sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS processed_stripe_events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS licenses_email_lower_idx ON licenses (LOWER(email));
CREATE INDEX IF NOT EXISTS licenses_stripe_customer_id_idx ON licenses (stripe_customer_id);
CREATE INDEX IF NOT EXISTS licenses_stripe_subscription_id_idx ON licenses (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS processed_stripe_events_stripe_event_id_idx ON processed_stripe_events (stripe_event_id);
`;

export class FileLicenseRepository implements LicenseRepositoryLike {
  private queue = Promise.resolve();

  constructor(private readonly databaseFilePath = resolveDatabaseFilePath()) {}

  async listLicenses(): Promise<LicenseRecord[]> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      return [...database.licenses].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });
  }

  async findByLicenseKey(licenseKey: string): Promise<LicenseRecord | null> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      return database.licenses.find((license) => license.licenseKey === licenseKey) ?? null;
    });
  }

  async findByEmailOrLicenseKey(input: { email?: string; licenseKey?: string }): Promise<LicenseRecord | null> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      const normalizedEmail = input.email?.trim().toLowerCase();
      return (
        database.licenses.find((license) => {
          if (input.licenseKey && license.licenseKey === input.licenseKey.trim()) {
            return true;
          }

          return Boolean(normalizedEmail && license.email.toLowerCase() === normalizedEmail);
        }) ?? null
      );
    });
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<LicenseRecord | null> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      return database.licenses.find((license) => license.stripeSubscriptionId === stripeSubscriptionId) ?? null;
    });
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<LicenseRecord | null> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      return database.licenses.find((license) => license.stripeCustomerId === stripeCustomerId) ?? null;
    });
  }

  async hasProcessedStripeEvent(eventId: string): Promise<boolean> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      return database.processedStripeEvents.some((event) => event.stripeEventId === eventId);
    });
  }

  async recordProcessedStripeEvent(eventId: string, type: string): Promise<void> {
    await this.withLock(async () => {
      const database = await this.readDatabase();
      if (!database.processedStripeEvents.some((event) => event.stripeEventId === eventId)) {
        database.processedStripeEvents.push({
          id: randomUUID(),
          stripeEventId: eventId,
          eventType: type,
          processedAt: new Date().toISOString()
        });
      }
      await this.writeDatabase(database);
    });
  }

  async upsertLicenseForStripeCheckout(input: {
    email: string;
    licenseKey: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string;
    stripeCheckoutSessionId: string;
    status: LicenseStatus;
    currentPeriodEnd?: string | null;
  }): Promise<LicenseRecord> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      const now = new Date().toISOString();
      const existingLicense = database.licenses.find(
        (license) =>
          license.stripeSubscriptionId === input.stripeSubscriptionId ||
          license.stripeCheckoutSessionId === input.stripeCheckoutSessionId
      );

      if (existingLicense) {
        Object.assign(existingLicense, {
          email: input.email,
          status: input.status,
          stripeCustomerId: input.stripeCustomerId,
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripeCheckoutSessionId: input.stripeCheckoutSessionId,
          currentPeriodEnd: input.currentPeriodEnd ?? existingLicense.currentPeriodEnd,
          updatedAt: now
        });
        await this.writeDatabase(database);
        return existingLicense;
      }

      const license: LicenseRecord = {
        id: randomUUID(),
        email: input.email,
        licenseKey: input.licenseKey,
        plan: "beta_pro",
        status: input.status,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        createdAt: now,
        updatedAt: now,
        lastEmailSentAt: null
      };
      database.licenses.push(license);
      await this.writeDatabase(database);
      return license;
    });
  }

  async updateLicenseStatus(
    licenseId: string,
    input: { status: LicenseStatus; currentPeriodEnd?: string | null; stripeCustomerId?: string | null }
  ): Promise<LicenseRecord | null> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      const license = database.licenses.find((item) => item.id === licenseId);

      if (!license) {
        return null;
      }

      license.status = input.status;
      license.currentPeriodEnd = input.currentPeriodEnd ?? license.currentPeriodEnd;
      license.stripeCustomerId = input.stripeCustomerId ?? license.stripeCustomerId;
      license.updatedAt = new Date().toISOString();
      await this.writeDatabase(database);
      return license;
    });
  }

  async updateLastEmailSentAt(licenseId: string, lastEmailSentAt = new Date().toISOString()): Promise<LicenseRecord | null> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      const license = database.licenses.find((item) => item.id === licenseId);

      if (!license) {
        return null;
      }

      license.lastEmailSentAt = lastEmailSentAt;
      license.updatedAt = new Date().toISOString();
      await this.writeDatabase(database);
      return license;
    });
  }

  async isLicenseKeyTaken(licenseKey: string): Promise<boolean> {
    return this.withLock(async () => {
      const database = await this.readDatabase();
      return database.licenses.some((license) => license.licenseKey === licenseKey);
    });
  }

  private async readDatabase(): Promise<LicenseDatabase> {
    try {
      const rawDatabase = await readFile(this.databaseFilePath, "utf8");
      const parsedDatabase = JSON.parse(rawDatabase) as Partial<LicenseDatabase>;
      return {
        licenses: Array.isArray(parsedDatabase.licenses) ? parsedDatabase.licenses : [],
        processedStripeEvents: normalizeProcessedStripeEvents(parsedDatabase.processedStripeEvents)
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return emptyDatabase();
      }

      throw error;
    }
  }

  private async writeDatabase(database: LicenseDatabase): Promise<void> {
    await mkdir(dirname(this.databaseFilePath), { recursive: true });
    await writeFile(this.databaseFilePath, JSON.stringify(database, null, 2), "utf8");
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

export class PostgresLicenseRepository implements LicenseRepositoryLike {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  static fromDatabaseUrl(databaseUrl: string): PostgresLicenseRepository {
    return new PostgresLicenseRepository(
      new Pool({
        connectionString: databaseUrl,
        ssl: shouldUsePostgresSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined
      })
    );
  }

  async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.pool.query(postgresSchemaSql).then(() => undefined);
    return this.schemaReady;
  }

  async listLicenses(): Promise<LicenseRecord[]> {
    const rows = await this.queryLicenseRows("SELECT * FROM licenses ORDER BY created_at DESC");
    return rows.map(rowToLicenseRecord);
  }

  async findByLicenseKey(licenseKey: string): Promise<LicenseRecord | null> {
    const rows = await this.queryLicenseRows("SELECT * FROM licenses WHERE license_key = $1 LIMIT 1", [licenseKey]);
    return rows[0] ? rowToLicenseRecord(rows[0]) : null;
  }

  async findByEmailOrLicenseKey(input: { email?: string; licenseKey?: string }): Promise<LicenseRecord | null> {
    const normalizedEmail = input.email?.trim().toLowerCase() ?? "";
    const normalizedLicenseKey = input.licenseKey?.trim() ?? "";

    const rows = await this.queryLicenseRows(
      `SELECT *
       FROM licenses
       WHERE ($1 <> '' AND license_key = $1)
          OR ($2 <> '' AND LOWER(email) = $2)
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedLicenseKey, normalizedEmail]
    );

    return rows[0] ? rowToLicenseRecord(rows[0]) : null;
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<LicenseRecord | null> {
    const rows = await this.queryLicenseRows("SELECT * FROM licenses WHERE stripe_subscription_id = $1 LIMIT 1", [
      stripeSubscriptionId
    ]);
    return rows[0] ? rowToLicenseRecord(rows[0]) : null;
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<LicenseRecord | null> {
    const rows = await this.queryLicenseRows(
      "SELECT * FROM licenses WHERE stripe_customer_id = $1 ORDER BY created_at DESC LIMIT 1",
      [stripeCustomerId]
    );
    return rows[0] ? rowToLicenseRecord(rows[0]) : null;
  }

  async hasProcessedStripeEvent(eventId: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM processed_stripe_events WHERE stripe_event_id = $1) AS exists",
      [eventId]
    );
    return result.rows[0]?.exists === true;
  }

  async recordProcessedStripeEvent(eventId: string, type: string): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO processed_stripe_events (id, stripe_event_id, event_type, processed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (stripe_event_id) DO NOTHING`,
      [randomUUID(), eventId, type]
    );
  }

  async upsertLicenseForStripeCheckout(input: {
    email: string;
    licenseKey: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string;
    stripeCheckoutSessionId: string;
    status: LicenseStatus;
    currentPeriodEnd?: string | null;
  }): Promise<LicenseRecord> {
    const existingLicense = await this.findExistingStripeCheckoutLicense(input.stripeSubscriptionId, input.stripeCheckoutSessionId);

    if (existingLicense) {
      const updatedLicense = await this.updateStripeCheckoutLicense(existingLicense.id, input);
      if (updatedLicense) {
        return updatedLicense;
      }
    }

    await this.ensureSchema();
    const result = await this.pool.query<LicenseRow>(
      `INSERT INTO licenses (
          id,
          email,
          license_key,
          plan,
          status,
          stripe_customer_id,
          stripe_subscription_id,
          stripe_checkout_session_id,
          current_period_end,
          created_at,
          updated_at,
          last_email_sent_at
        )
       VALUES ($1, $2, $3, 'beta_pro', $4, $5, $6, $7, $8::timestamptz, NOW(), NOW(), NULL)
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
          email = EXCLUDED.email,
          status = EXCLUDED.status,
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          stripe_checkout_session_id = EXCLUDED.stripe_checkout_session_id,
          current_period_end = COALESCE(EXCLUDED.current_period_end, licenses.current_period_end),
          updated_at = NOW()
       RETURNING *`,
      [
        randomUUID(),
        input.email,
        input.licenseKey,
        input.status,
        input.stripeCustomerId,
        input.stripeSubscriptionId,
        input.stripeCheckoutSessionId,
        input.currentPeriodEnd ?? null
      ]
    );

    return rowToLicenseRecord(result.rows[0] as LicenseRow);
  }

  async updateLicenseStatus(
    licenseId: string,
    input: { status: LicenseStatus; currentPeriodEnd?: string | null; stripeCustomerId?: string | null }
  ): Promise<LicenseRecord | null> {
    const rows = await this.queryLicenseRows(
      `UPDATE licenses
       SET status = $2,
           current_period_end = COALESCE($3::timestamptz, current_period_end),
           stripe_customer_id = COALESCE($4, stripe_customer_id),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [licenseId, input.status, input.currentPeriodEnd ?? null, input.stripeCustomerId ?? null]
    );

    return rows[0] ? rowToLicenseRecord(rows[0]) : null;
  }

  async updateLastEmailSentAt(licenseId: string, lastEmailSentAt = new Date().toISOString()): Promise<LicenseRecord | null> {
    const rows = await this.queryLicenseRows(
      `UPDATE licenses
       SET last_email_sent_at = $2::timestamptz,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [licenseId, lastEmailSentAt]
    );

    return rows[0] ? rowToLicenseRecord(rows[0]) : null;
  }

  async isLicenseKeyTaken(licenseKey: string): Promise<boolean> {
    await this.ensureSchema();
    const result = await this.pool.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM licenses WHERE license_key = $1) AS exists",
      [licenseKey]
    );
    return result.rows[0]?.exists === true;
  }

  private async findExistingStripeCheckoutLicense(
    stripeSubscriptionId: string,
    stripeCheckoutSessionId: string
  ): Promise<LicenseRecord | null> {
    const rows = await this.queryLicenseRows(
      `SELECT *
       FROM licenses
       WHERE stripe_subscription_id = $1 OR stripe_checkout_session_id = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [stripeSubscriptionId, stripeCheckoutSessionId]
    );
    return rows[0] ? rowToLicenseRecord(rows[0]) : null;
  }

  private async updateStripeCheckoutLicense(
    licenseId: string,
    input: {
      email: string;
      stripeCustomerId: string | null;
      stripeSubscriptionId: string;
      stripeCheckoutSessionId: string;
      status: LicenseStatus;
      currentPeriodEnd?: string | null;
    }
  ): Promise<LicenseRecord | null> {
    const rows = await this.queryLicenseRows(
      `UPDATE licenses
       SET email = $2,
           status = $3,
           stripe_customer_id = $4,
           stripe_subscription_id = $5,
           stripe_checkout_session_id = $6,
           current_period_end = COALESCE($7::timestamptz, current_period_end),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        licenseId,
        input.email,
        input.status,
        input.stripeCustomerId,
        input.stripeSubscriptionId,
        input.stripeCheckoutSessionId,
        input.currentPeriodEnd ?? null
      ]
    );

    return rows[0] ? rowToLicenseRecord(rows[0]) : null;
  }

  private async queryLicenseRows(query: string, values: unknown[] = []): Promise<LicenseRow[]> {
    await this.ensureSchema();
    const result = await this.pool.query<LicenseRow>(query, values);
    return result.rows;
  }
}

export function createLicenseRepository(databaseUrl = process.env.DATABASE_URL): LicenseRepositoryLike {
  const rawDatabaseUrl = databaseUrl?.trim();

  if (rawDatabaseUrl && isPostgresDatabaseUrl(rawDatabaseUrl)) {
    return PostgresLicenseRepository.fromDatabaseUrl(rawDatabaseUrl);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string in production.");
  }

  return new FileLicenseRepository(resolveDatabaseFilePath(rawDatabaseUrl));
}

export async function ensurePostgresLicenseSchema(databaseUrl = process.env.DATABASE_URL): Promise<void> {
  const rawDatabaseUrl = databaseUrl?.trim();

  if (!rawDatabaseUrl || !isPostgresDatabaseUrl(rawDatabaseUrl)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string before running db:push.");
  }

  const repository = PostgresLicenseRepository.fromDatabaseUrl(rawDatabaseUrl);
  await repository.ensureSchema();
}

// Backwards-compatible local repository name for older tests or scripts.
export class LicenseRepository extends FileLicenseRepository {}

function normalizeProcessedStripeEvents(rawEvents: unknown): ProcessedStripeEventRecord[] {
  if (!Array.isArray(rawEvents)) {
    return [];
  }

  return rawEvents
    .map((event): ProcessedStripeEventRecord | null => {
      const rawEvent = event as LegacyProcessedStripeEvent;
      const stripeEventId = rawEvent.stripeEventId ?? rawEvent.eventId;
      const eventType = rawEvent.eventType ?? rawEvent.type;
      const processedAt = rawEvent.processedAt ?? rawEvent.createdAt ?? new Date().toISOString();

      if (!stripeEventId || !eventType) {
        return null;
      }

      return {
        id: rawEvent.id ?? randomUUID(),
        stripeEventId,
        eventType,
        processedAt
      };
    })
    .filter((event): event is ProcessedStripeEventRecord => event !== null);
}

function rowToLicenseRecord(row: LicenseRow): LicenseRecord {
  return {
    id: row.id,
    email: row.email,
    licenseKey: row.license_key,
    plan: "beta_pro",
    status: row.status,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    currentPeriodEnd: toIsoStringOrNull(row.current_period_end),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    lastEmailSentAt: toIsoStringOrNull(row.last_email_sent_at)
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoStringOrNull(value: Date | string | null): string | null {
  return value ? toIsoString(value) : null;
}

function resolveDatabaseFilePath(databaseUrl = process.env.DATABASE_URL): string {
  const rawDatabaseUrl = databaseUrl?.trim() || "file:./data/license-db.json";
  const withoutFilePrefix = rawDatabaseUrl.startsWith("file:") ? rawDatabaseUrl.slice("file:".length) : rawDatabaseUrl;
  return isAbsolute(withoutFilePrefix) ? withoutFilePrefix : resolve(process.cwd(), withoutFilePrefix);
}

function isPostgresDatabaseUrl(databaseUrl: string): boolean {
  return databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://");
}

function shouldUsePostgresSsl(databaseUrl: string): boolean {
  return process.env.NODE_ENV === "production" || process.env.PGSSLMODE === "require" || databaseUrl.includes("sslmode=require");
}
