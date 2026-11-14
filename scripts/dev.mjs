import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const web = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--webpack", ...process.argv.slice(2)], {
  stdio: "inherit",
});
let worker;
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  worker?.kill();
  web.kill();
  process.exitCode = code;
}

web.once("spawn", () => {
  if (stopping) return;
  worker = spawn(process.execPath, ["lib/worker.ts"], {
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "inherit",
  });
  worker.once("error", () => console.error("[PDF worker] Could not start."));
  worker.once("exit", (code, signal) => {
    if (!stopping && !signal) console.error(`[PDF worker] Exited with code ${code}. Fix the error above and restart npm run dev.`);
  });
});
web.once("error", () => stop(1));
web.once("exit", (code, signal) => stop(code ?? (signal === "SIGINT" ? 130 : 1)));
process.once("SIGINT", () => stop(130));
process.once("SIGTERM", () => stop(143));
