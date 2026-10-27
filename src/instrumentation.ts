/**
 * Runs once when the Next.js server starts. On the Node.js runtime (Hostinger,
 * Docker, `next start`) it starts the pipeline sweeper, which recovers stuck
 * analyses and retries unsent proposal emails in the background.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "test" || process.env.ASD_DISABLE_SWEEPER === "true") return;
  const { startSweeper } = await import("./lib/pipeline/sweeper");
  startSweeper();
}
