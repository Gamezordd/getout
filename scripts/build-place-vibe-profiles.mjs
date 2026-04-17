import { runSeedCli } from "./place-vibe-seed.mjs";

runSeedCli().catch((error) => {
  console.error("Failed to seed place vibe profiles.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
