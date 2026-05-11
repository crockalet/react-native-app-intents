import { runCli } from "./index.js";

const exitCode = await runCli();

process.exitCode = exitCode;
