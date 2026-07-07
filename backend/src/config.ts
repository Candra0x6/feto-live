import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Supabase
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().optional(),

  // TxLINE
  TXLINE_API_URL: z.string().url(),
  TXLINE_WS_URL: z.string().url(),
  TXLINE_API_KEY: z.string().optional(),

  // Solana
  SOLANA_RPC_URL: z.string().url(),
  PROGRAM_FACTORY_ID: z.string().optional(),
  PROGRAM_ESCROW_ID: z.string().optional(),
  PROGRAM_SETTLE_ID: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().default("dev-secret"),
});

function parseConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = parseConfig();
export type Config = typeof config;
