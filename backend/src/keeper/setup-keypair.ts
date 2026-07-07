/**
 * Generate a keeper keypair JSON for the .env file.
 *
 * Usage:
 *   bun run src/keeper/setup-keypair.ts
 *
 * Outputs the JSON secret array to stdout for pasting into
 * KEEPER_PRIVATE_KEY in .env.
 */
import { Keypair } from "@solana/web3.js";

const kp = Keypair.generate();

console.log("Public key:", kp.publicKey.toBase58());
console.log("\nAdd this to your .env file:");
console.log(`KEEPER_PRIVATE_KEY=${JSON.stringify(Array.from(kp.secretKey))}`);
console.log("\nThen fund this keypair with devnet SOL to pay for settlement tx.");
console.log("  solana airdrop 2", kp.publicKey.toBase58(), "--url devnet");
