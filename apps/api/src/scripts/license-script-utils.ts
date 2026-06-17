import { resolve } from "node:path";
import { config } from "dotenv";
import { createLicenseRepository } from "../services/license.repository.js";

export function loadEnvFiles(): void {
  config({ path: resolve(process.cwd(), "../../.env") });
  config({ path: resolve(process.cwd(), ".env") });
}

export function getOption(name: string): string | undefined {
  const args = process.argv.slice(2);
  const valueIndex = args.indexOf(name);

  if (valueIndex >= 0) {
    return args[valueIndex + 1];
  }

  const inlineValue = args.find((arg) => arg.startsWith(`${name}=`));
  return inlineValue?.slice(name.length + 1);
}

export function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

export function createRepositoryForLicenseScript(options: { allowLocalDatabase: boolean; writesProduction: boolean }) {
  if (!options.allowLocalDatabase && !isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string. Use --allow-local only for local development.");
  }

  if (options.writesProduction && process.env.NODE_ENV === "production" && !hasFlag("--confirm-production")) {
    throw new Error("Production writes require --confirm-production.");
  }

  return createLicenseRepository();
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function isPostgresDatabaseUrl(databaseUrl: string | undefined): boolean {
  const normalizedDatabaseUrl = databaseUrl?.trim() ?? "";
  return normalizedDatabaseUrl.startsWith("postgres://") || normalizedDatabaseUrl.startsWith("postgresql://");
}
