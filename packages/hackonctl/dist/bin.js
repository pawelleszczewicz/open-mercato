#!/usr/bin/env node
import { run } from "./hackonctl.js";
async function main() {
  const exitCode = await run(process.argv);
  process.exit(exitCode);
}
main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
//# sourceMappingURL=bin.js.map
