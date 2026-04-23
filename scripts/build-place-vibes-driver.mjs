import { runDriverCli } from "./place-vibe-seed.mjs";

runDriverCli().catch((error) => {
  console.error("Failed to run place vibe seed driver.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
