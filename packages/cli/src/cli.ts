import { runCli } from "./index.js";

const exitCode = await runCli();

process.exit(exitCode);
