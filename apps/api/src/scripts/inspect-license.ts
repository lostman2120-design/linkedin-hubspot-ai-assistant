import { inspectLicense } from "../services/tester-license-admin.service.js";
import { createRepositoryForLicenseScript, getOption, hasFlag, loadEnvFiles, printJson } from "./license-script-utils.js";

async function main(): Promise<void> {
  loadEnvFiles();
  const repository = createRepositoryForLicenseScript({
    allowLocalDatabase: hasFlag("--allow-local"),
    writesProduction: false
  });

  try {
    const license = await inspectLicense(repository, getOption("--key") ?? "");
    printJson(license);
  } finally {
    await repository.close?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not inspect the license.");
  process.exitCode = 1;
});
