// Load .env before any other module reads process.env (import this first).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the process environment (e.g. Docker env_file).
}
