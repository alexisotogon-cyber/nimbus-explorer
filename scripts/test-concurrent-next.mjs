import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.NIMBUS_TEST_PORT || 3107);
const baseUrl = `http://127.0.0.1:${port}`;

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
}

async function waitForHealthy(timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // The development server is still compiling.
    }
    await delay(500);
  }
  throw new Error(`Development server did not become healthy at ${baseUrl}`);
}

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with ${code ?? signal}`));
    });
  });
}

const dev = run(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)]);

try {
  await waitForHealthy();

  const build = run(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    stdio: "inherit",
  });
  await waitForExit(build, "next build");

  const response = await fetch(baseUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Development server failed after build with HTTP ${response.status}`);
  }

  const html = await response.text();
  if (!html.includes("Nimbus")) {
    throw new Error("Development server returned an unexpected document after build");
  }

  console.log("PASS: next dev remained healthy while next build used separate artifacts.");
} finally {
  dev.kill("SIGTERM");
  await Promise.race([waitForExit(dev, "next dev").catch(() => undefined), delay(2_000)]);
  if (!dev.killed) dev.kill("SIGKILL");
}
