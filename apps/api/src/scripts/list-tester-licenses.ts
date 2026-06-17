import { listTesterLicenses } from "../services/tester-license-admin.service.js";
import { createRepositoryForLicenseScript, hasFlag, loadEnvFiles, printJson } from "./license-script-utils.js";

async function main(): Promise<void> {
  loadEnvFiles();
  const repository = createRepositoryForLicenseScript({
    allowLocalDatabase: hasFlag("--allow-local"),
    writesProduction: false
  });

  try {
    const licenses = await listTesterLicenses(repository);
    printJson({ licenses });
  } finally {
    await repository.close?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not list tester licenses.");
  process.exitCode = 1;
});
