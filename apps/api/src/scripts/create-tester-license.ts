import { createTesterLicense, normalizeTesterPlan, parsePositiveTesterDays } from "../services/tester-license-admin.service.js";
import { createRepositoryForLicenseScript, getOption, hasFlag, loadEnvFiles } from "./license-script-utils.js";

async function main(): Promise<void> {
  loadEnvFiles();
  const repository = createRepositoryForLicenseScript({
    allowLocalDatabase: hasFlag("--allow-local"),
    writesProduction: true
  });

  try {
    const license = await createTesterLicense(repository, {
      email: getOption("--email"),
      label: getOption("--label") ?? "",
      plan: normalizeTesterPlan(getOption("--plan")),
      days: parsePositiveTesterDays(getOption("--days")),
      notes: getOption("--notes")
    });

    console.log("Tester license created.");
    console.log(`Label: ${license.label ?? ""}`);
    console.log(`Plan: ${license.plan}`);
    console.log(`Source: ${license.source}`);
    console.log(`Status: ${license.status}`);
    console.log(`Expires at: ${license.expiresAt ?? "No expiration"}`);
    console.log(`License key: ${license.licenseKey}`);
    console.log("Store this key securely now. It is only printed once by this command.");
  } finally {
    await repository.close?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not create the tester license.");
  process.exitCode = 1;
});
