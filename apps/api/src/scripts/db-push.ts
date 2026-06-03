import "dotenv/config";
import { ensurePostgresLicenseSchema } from "../services/license.repository.js";

await ensurePostgresLicenseSchema();
console.log("License database schema is ready.");
