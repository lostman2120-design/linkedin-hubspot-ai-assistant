import { resolve } from "node:path";
import { config } from "dotenv";
import { createLicenseRepository, type LicenseRecord } from "../services/license.repository.js";
import { generateUniqueLicenseKey, maskEmail, maskLicenseKey } from "../services/license.service.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

async function main(): Promise<void> {
  loadEnvFiles();
  const email = getOption("--email") ?? process.env.INTERNAL_LICENSE_EMAIL;
  const shouldPrintFullKey = hasFlag("--print-key");
  const allowLocalDatabase = hasFlag("--allow-local");

  if (!email || !emailPattern.test(email.trim())) {
    throw new Error("Provide a valid email with --email user@example.com or INTERNAL_LICENSE_EMAIL.");
  }

  if (!allowLocalDatabase && !isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL connection string for internal license creation. Use --allow-local only for local development."
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const repository = createLicenseRepository();

  try {
    const existingLicense = await findExistingInternalActiveLicense(repository, normalizedEmail);
    const license =
      existingLicense ??
      (await repository.createInternalLicense({
        email: normalizedEmail,
        licenseKey: await generateUniqueLicenseKey(repository),
        status: "active"
      }));

    console.log(existingLicense ? "Existing internal Beta Pro license found." : "Internal Beta Pro license created.");
    console.log(`Email: ${maskEmail(license.email)}`);
    console.log(`Status: ${license.status}`);
    console.log(`Plan: ${license.plan}`);
    console.log(`Source: ${license.source}`);
    console.log(`License key: ${shouldPrintFullKey ? license.licenseKey : maskLicenseKey(license.licenseKey)}`);

    if (!shouldPrintFullKey) {
      console.log("Run again with --print-key if you need to display the full license key.");
    }
  } finally {
    await repository.close?.();
  }
}

async function findExistingInternalActiveLicense(
  repository: ReturnType<typeof createLicenseRepository>,
  email: string
): Promise<LicenseRecord | null> {
  const licenses = await repository.listLicenses();
  return (
    licenses.find(
      (license) =>
        license.email.toLowerCase() === email &&
        license.status === "active" &&
        license.source === "internal" &&
        license.stripeCustomerId === null &&
        license.stripeSubscriptionId === null &&
        license.stripeCheckoutSessionId === null
    ) ?? null
  );
}

function getOption(name: string): string | undefined {
  const args = process.argv.slice(2);
  const valueIndex = args.indexOf(name);

  if (valueIndex >= 0) {
    return args[valueIndex + 1];
  }

  const inlineValue = args.find((arg) => arg.startsWith(`${name}=`));
  return inlineValue?.slice(name.length + 1);
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function loadEnvFiles(): void {
  config({ path: resolve(process.cwd(), "../../.env") });
  config({ path: resolve(process.cwd(), ".env") });
}

function isPostgresDatabaseUrl(databaseUrl: string | undefined): boolean {
  const normalizedDatabaseUrl = databaseUrl?.trim() ?? "";
  return normalizedDatabaseUrl.startsWith("postgres://") || normalizedDatabaseUrl.startsWith("postgresql://");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not create the internal license.");
  process.exitCode = 1;
});
