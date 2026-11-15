// Load .env / .env.local the same way `next dev` does. Import this first in every script.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
