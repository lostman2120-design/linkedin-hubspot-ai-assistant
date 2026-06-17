import { revokeLicense, toSafeLicenseView } from "../services/tester-license-admin.service.js";
import { createRepositoryForLicenseScript, getOption, hasFlag, loadEnvFiles, printJson } from "./license-script-utils.js";

async function main(): Promise<void> {
  loadEnvFiles();
  const repository = createRepositoryForLicenseScript({
    allowLocalDatabase: hasFlag("--allow-local"),
    writesProduction: true
  });

  try {
    const license = await revokeLicense(repository, getOption("--key") ?? "");
    printJson({
      revoked: true,
      license: toSafeLicenseView(license)
    });
  } finally {
    await repository.close?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not revoke the license.");
  process.exitCode = 1;
});
