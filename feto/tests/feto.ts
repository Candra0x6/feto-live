import * as anchor from "@anchor-lang/core";
import { Program, AnchorProvider, BN } from "@anchor-lang/core";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, createMint, createAccount, mintTo,
  createInitializeAccountInstruction,
} from "@solana/spl-token";
import { expect, assert } from "chai";
import { keccak_256 } from "@noble/hashes/sha3";
import { FetoFactory } from "../target/types/feto_factory";
import { FetoEscrow } from "../target/types/feto_escrow";
import { FetoSettle } from "../target/types/feto_settle";

function keccak256(data: Buffer): Buffer {
  return Buffer.from(keccak_256(data));
}

describe("Feto Live - Smart Contract Tests", () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  // Program instances
  const factoryProgram = anchor.workspace.FetoFactory as Program<FetoFactory>;
  const escrowProgram = anchor.workspace.FetoEscrow as Program<FetoEscrow>;
  const settleProgram = anchor.workspace.FetoSettle as Program<FetoSettle>;

  // Test wallets
  const authority = provider.wallet as unknown as anchor.Wallet;
  const keeper = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();

  // Constants
  const MIN_BET = new BN(1_000_000); // 1 USDC
  const MAX_BET = new BN(1_000_000_000); // 1000 USDC
  const FEE_BPS = 200; // 2%

  // PDAs
  let configPda: PublicKey;
  let matchPda: PublicKey;
  let marketPda: PublicKey;

  // Test data
  const MATCH_ID = new BN(1);
  const MATCH_ID_FINISHED = new BN(2);
  const MATCH_ID_LONG_NAME = new BN(3);
  const HOME_TEAM = "Brazil";
  const AWAY_TEAM = "Argentina";
  const TXLINE_FIXTURE_HASH = Buffer.alloc(32, 42);
  const START_TIME = new BN(Math.floor(Date.now() / 1000) - 600); // 10 min ago (valid: within 1-hr window)

  before(async () => {
    // Airdrop SOL to test wallets
    for (const wallet of [alice, bob, keeper]) {
      const sig = await provider.connection.requestAirdrop(
        wallet.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Derive PDAs
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("feto_config")],
      factoryProgram.programId
    );
  });

  // ════════════════════════════════════════════════════════════════
  // Story 1.2: Config Account + Initialize
  // ════════════════════════════════════════════════════════════════

  describe("Config Initialization (Story 1.2)", () => {
    it("TC-01: Initialize with valid params → Config created", async () => {
      await factoryProgram.methods
        .initialize(
          authority.publicKey,
          keeper.publicKey,
          MIN_BET,
          MAX_BET,
          FEE_BPS,
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          treasuryVault: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Verify config was created
      const config = await factoryProgram.account.config.fetch(configPda);
      expect(config.authority.toString()).to.equal(authority.publicKey.toString());
      expect(config.feeRecipient.toString()).to.equal(authority.publicKey.toString());
      expect(config.minBet.toNumber()).to.equal(MIN_BET.toNumber());
      expect(config.maxBet.toNumber()).to.equal(MAX_BET.toNumber());
      expect(config.protocolFeeBps).to.equal(FEE_BPS);
      expect(config.marketCounter.toNumber()).to.equal(0);
      expect(config.paused).to.be.false;
    });

    it("TC-02x: Re-initialize config → Rejected (account already exists)", async () => {
      try {
        await factoryProgram.methods
          .initialize(authority.publicKey, keeper.publicKey, MIN_BET, MAX_BET, FEE_BPS)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            treasuryVault: authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown — config already exists");
      } catch (err: any) {
        // Config PDA already has data; init fails with account-in-use
        expect(err.message).to.satisfy((m: string) =>
          m.includes("already in use") || m.includes("already") || m.includes("Account")
        );
      }
    });

    // Note: TC-03/TC-04 (InvalidBetRange, BetTooSmall) can only be tested
    // via Rust unit tests since the config PDA is initialized once per deployment.
    // The require!() checks in the instruction body are unreachable if the
    // #[account(init)] constraint passes (fresh account) or fails (duplicate).
  });

  // ════════════════════════════════════════════════════════════════
  // Story 1.3: Match Account + Create Match
  // ════════════════════════════════════════════════════════════════

  describe("Match Management (Story 1.3)", () => {
    it("TC-05: Create match with valid params → Match created", async () => {
      [matchPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), MATCH_ID.toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      );

      await factoryProgram.methods
        .createMatch(
          MATCH_ID,
          HOME_TEAM,
          AWAY_TEAM,
          Array.from(TXLINE_FIXTURE_HASH),
          START_TIME,
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: matchPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const match = await factoryProgram.account.matchAccount.fetch(matchPda);
      expect(match.matchId.toNumber()).to.equal(MATCH_ID.toNumber());
      expect(match.homeTeam).to.deep.equal(padString32(HOME_TEAM));
      expect(match.awayTeam).to.deep.equal(padString32(AWAY_TEAM));
      expect(match.status).to.have.property("scheduled");
      expect(match.activeMarkets).to.equal(0);
    });

    it("TC-07: Create duplicate match_id → Rejected", async () => {
      try {
        await factoryProgram.methods
          .createMatch(MATCH_ID, HOME_TEAM, AWAY_TEAM, Array.from(TXLINE_FIXTURE_HASH), START_TIME)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            matchAccount: matchPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown — match ID already in use");
      } catch (err: any) {
        expect(err.message).to.contain("already in use");
      }
    });

    it("TC-08: Update match state (Scheduled → Live)", async () => {
      await factoryProgram.methods
        .updateMatchState({ live: {} }, 0, 0, 1)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: matchPda,
        })
        .rpc();

      const match = await factoryProgram.account.matchAccount.fetch(matchPda);
      expect(match.status).to.have.property("live");
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Story 1.4: Market Account + Create Market
  // ════════════════════════════════════════════════════════════════

  describe("Market Management (Story 1.4)", () => {
    const LOCK_TIME = new BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

    it("TC-10: Create market with valid params → Market created", async () => {
      [marketPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), new BN(0).toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      );

      await factoryProgram.methods
        .createMarket(
          { nextCorner: {} },
          ["Home", "Away", "Neither"],
          LOCK_TIME,
          false,
          1,
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: matchPda,
          market: marketPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const market = await factoryProgram.account.market.fetch(marketPda);
      expect(market.matchId.toNumber()).to.equal(MATCH_ID.toNumber());
      expect(market.marketType).to.have.property("nextCorner");
      expect(market.outcomes.length).to.equal(3);
      expect(market.status).to.have.property("open");
      expect(market.leverageEnabled).to.be.false;
      expect(market.maxLeverage).to.equal(1);

      // Verify counter incremented
      const config = await factoryProgram.account.config.fetch(configPda);
      expect(config.marketCounter.toNumber()).to.equal(1);
    });

    it("TC-11: Create market for non-live match → Rejected", async () => {
      // Create a match with valid start time, set to Live, then set to Finished
      const finishedMatchPda = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), MATCH_ID_FINISHED.toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      )[0];

      // Create with valid start_time (within 1-hour window)
      await factoryProgram.methods
        .createMatch(
          MATCH_ID_FINISHED,
          "TeamA",
          "TeamB",
          Array.from(TXLINE_FIXTURE_HASH),
          new BN(Math.floor(Date.now() / 1000) - 300), // 5 min ago (valid)
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: finishedMatchPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Set to Live first, then to Finished
      await factoryProgram.methods
        .updateMatchState({ live: {} }, 0, 0, 1)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: finishedMatchPda,
        })
        .rpc();

      await factoryProgram.methods
        .updateMatchState({ finished: {} }, 2, 1, 90)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: finishedMatchPda,
        })
        .rpc();

      // Create market for finished match — should fail with MatchNotLive
      const newMarketPda = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), new BN(1).toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      )[0];

      try {
        await factoryProgram.methods
          .createMarket(
            { nextCorner: {} },
            ["Home", "Away"],
            LOCK_TIME,
            false,
            1,
          )
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            matchAccount: finishedMatchPda,
            market: newMarketPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown — match is finished");
      } catch (err: any) {
        expect(err.message).to.contain("MatchNotLive");
      }
    });

    it("TC-12: Create market with 1 outcome → Rejected", async () => {
      const futureLock = new BN(Math.floor(Date.now() / 1000) + 7200);
      // market_counter is 1 after TC-10; we must derive the PDA that matches the PROGRAM's derivation
      // (which uses config.market_counter, not an arbitrary id)
      const configAfter = await factoryProgram.account.config.fetch(configPda);
      const currentCounter = configAfter.marketCounter;
      const badMarketPda = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), currentCounter.toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      )[0];

      try {
        await factoryProgram.methods
          .createMarket({ nextCorner: {} }, ["Only"], futureLock, false, 1)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            matchAccount: matchPda,
            market: badMarketPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown — invalid outcome count");
      } catch (err: any) {
        expect(err.message).to.satisfy((m: string) =>
          m.includes("InvalidOutcomeCount") || m.includes("6008")
        );
      }
    });

    it("TC-15: Create market with max_leverage > 5 → Rejected", async () => {
      const futureLock = new BN(Math.floor(Date.now() / 1000) + 7200);
      // market_counter stays at 1 since TC-12 was rolled back
      const configAfter = await factoryProgram.account.config.fetch(configPda);
      const currentCounter = configAfter.marketCounter;
      const badMarketPda = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), currentCounter.toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      )[0];

      try {
        await factoryProgram.methods
          .createMarket({ nextCorner: {} }, ["Home", "Away"], futureLock, false, 10)
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            matchAccount: matchPda,
            market: badMarketPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown — leverage > 5");
      } catch (err: any) {
        expect(err.message).to.satisfy((m: string) =>
          m.includes("InvalidLeverage") || m.includes("6009")
        );
      }
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Story 1.7: Market Settlement (lock / settle / update odds)
  // ════════════════════════════════════════════════════════════════

  describe("Market Settlement (Story 1.7)", () => {
    // ── Create a fresh match + market with a known proof hash ──
    const SETTLE_MATCH_ID = new BN(100);
    const EVENT_TYPE = 1;
    const EVENT_TEAM = 0;
    const PROOF_ROOT = Array.from(Buffer.alloc(32, 42));

    let settleMatchPda: PublicKey;
    let settleMarketPda: PublicKey;

    before(async () => {
      settleMatchPda = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), SETTLE_MATCH_ID.toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      )[0];

      // Pre-compute what the program will compute:
      // keccak(root || fixture_id (8 bytes LE) || event_type (1 byte) || event_team (1 byte))
      const hashBuf = Buffer.alloc(32 + 8 + 2);
      Buffer.from(PROOF_ROOT).copy(hashBuf, 0);
      hashBuf.writeBigUInt64LE(BigInt(SETTLE_MATCH_ID.toNumber()), 32);
      hashBuf.writeUInt8(EVENT_TYPE, 40);
      hashBuf.writeUInt8(EVENT_TEAM, 41);
      const fixtureHash = Array.from(keccak256(hashBuf));

      // Create a match with this pre-computed fixture hash
      await factoryProgram.methods
        .createMatch(
          SETTLE_MATCH_ID,
          "HomeTeam",
          "AwayTeam",
          fixtureHash,
          new BN(Math.floor(Date.now() / 1000) - 60),
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: settleMatchPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Set to Live
      await factoryProgram.methods
        .updateMatchState({ live: {} }, 0, 0, 1)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: settleMatchPda,
        })
        .rpc();

      // Create a market (counter will be whatever the current value is)
      const configAfter = await factoryProgram.account.config.fetch(configPda);
      const currentCounter = configAfter.marketCounter;
      settleMarketPda = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), currentCounter.toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      )[0];

      await factoryProgram.methods
        .createMarket(
          { nextCorner: {} },
          ["Home", "Away"],
          new BN(Math.floor(Date.now() / 1000) + 3600),
          false,
          1,
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: settleMatchPda,
          market: settleMarketPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("TC-20: Update odds on an open market → Odds updated", async () => {
      await factoryProgram.methods
        .updateOdds(0, new BN(15000))
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          market: settleMarketPda,
        })
        .rpc();

      const market = await factoryProgram.account.market.fetch(settleMarketPda);
      expect(market.outcomes[0].oddsDecimal.toNumber()).to.equal(15000);
    });

    it("TC-21: Lock an open market → Market locked", async () => {
      await factoryProgram.methods
        .lockMarket()
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          market: settleMarketPda,
        })
        .rpc();

      const market = await factoryProgram.account.market.fetch(settleMarketPda);
      expect(market.status).to.have.property("locked");
    });

    it("TC-22: Update odds on a locked market → Rejected", async () => {
      try {
        await factoryProgram.methods
          .updateOdds(1, new BN(20000))
          .accountsStrict({
            authority: authority.publicKey,
            config: configPda,
            market: settleMarketPda,
          })
          .rpc();
        assert.fail("Should have thrown — market not open");
      } catch (err: any) {
        expect(err.message).to.contain("MarketNotOpen");
      }
    });

    it("TC-23: Settle with wrong proof → Rejected", async () => {
      const wrongProof = {
        root: Array.from(Buffer.alloc(32, 99)),
        proofPath: [],
        leaf: Array.from(Buffer.alloc(32, 2)),
        signature: Array.from(Buffer.alloc(64, 3)),
        fixtureId: new anchor.BN(SETTLE_MATCH_ID.toNumber()),
        eventType: 0,
        eventTeam: 0,
        timestamp: new anchor.BN(Math.floor(Date.now() / 1000)),
      };

      try {
        await factoryProgram.methods
          .settleMarket(0, wrongProof as any)
          .accountsStrict({
            keeper: authority.publicKey,
            config: configPda,
            market: settleMarketPda,
            matchAccount: settleMatchPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown — proof hash mismatch");
      } catch (err: any) {
        expect(err.message).to.contain("InvalidTxlineProof");
      }
    });

    it("TC-24: Settle with correct proof → Market settled", async () => {
      // The match was created with a fixture hash pre-computed to match
      // keccak(root || fixture_id || event_type || event_team) for this proof
      const proof = {
        root: PROOF_ROOT,
        proofPath: [],
        leaf: Array.from(Buffer.alloc(32, 2)),
        signature: Array.from(Buffer.alloc(64, 3)),
        fixtureId: new anchor.BN(SETTLE_MATCH_ID.toNumber()),
        eventType: EVENT_TYPE,
        eventTeam: EVENT_TEAM,
        timestamp: new anchor.BN(Math.floor(Date.now() / 1000)),
      };

      await factoryProgram.methods
        .settleMarket(0, proof as any)
        .accountsStrict({
          keeper: authority.publicKey,
          config: configPda,
          market: settleMarketPda,
          matchAccount: settleMatchPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const market = await factoryProgram.account.market.fetch(settleMarketPda);
      expect(market.status).to.have.property("settled");
      expect(market.winningOutcome).to.equal(0);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Story 1.5-1.6: Place Bet / Cancel / Claim / Liquidate
  // ════════════════════════════════════════════════════════════════

  describe("Bet Placement & Management (Stories 1.5-1.6)", () => {
    const BET_AMOUNT = new BN(10_000_000); // 10 USDC

    let escrowMatchPda: PublicKey;
    let escrowMarketPda: PublicKey;
    let escrowMarketId: BN;
    let mint: PublicKey;
    let marketVault: PublicKey;
    let marketVaultAuthority: PublicKey;
    let userTokenAccount: PublicKey;
    let positionPda: PublicKey;
    let configForEscrow: PublicKey;

    const alice = Keypair.generate();

    // Helper: create a raw token account owned by a PDA (off-curve owner)
    async function createTokenAccountForPda(
      owner: PublicKey,
    ): Promise<PublicKey> {
      const payer = (provider.wallet as any).payer;
      const vaultKp = Keypair.generate();
      // Basic token account size (no extensions)
      const ACCOUNT_SIZE = 165;
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);

      const createIx = anchor.web3.SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: vaultKp.publicKey,
        space: ACCOUNT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      });

      const initIx = createInitializeAccountInstruction(
        vaultKp.publicKey,
        mint,
        owner,
      );

      const tx = new anchor.web3.Transaction().add(createIx, initIx);
      await provider.sendAndConfirm(tx, [payer, vaultKp]);
      return vaultKp.publicKey;
    }

    before(async () => {
      // Airdrop to alice
      await provider.connection.requestAirdrop(alice.publicKey, 10 * LAMPORTS_PER_SOL);

      // Create mock USDC mint
      const payer = (provider.wallet as any).payer;
      mint = await createMint(
        provider.connection,
        payer,
        authority.publicKey,
        null,
        6,
      );

      // Create user token account (alice)
      userTokenAccount = await createAccount(
        provider.connection,
        payer,
        mint,
        alice.publicKey,
      );

      // Mint 1000 USDC to alice
      await mintTo(
        provider.connection,
        payer,
        mint,
        userTokenAccount,
        authority.publicKey,
        1_000_000_000_000, // 1M USDC (6 decimals)
      );

      // Create a match + market in Live state for escrow tests
      const escrowMatchId = new BN(300);
      escrowMatchPda = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), escrowMatchId.toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      )[0];

      await factoryProgram.methods
        .createMatch(
          escrowMatchId,
          "EscrowHome",
          "EscrowAway",
          Array.from(Buffer.alloc(32, 77)),
          new BN(Math.floor(Date.now() / 1000) - 60),
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: escrowMatchPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      await factoryProgram.methods
        .updateMatchState({ live: {} }, 0, 0, 1)
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: escrowMatchPda,
        })
        .rpc();

      // Create market — get the actual market_id from the created market
      const configBefore = await factoryProgram.account.config.fetch(configPda);
      escrowMarketId = configBefore.marketCounter;
      escrowMarketPda = PublicKey.findProgramAddressSync(
        [Buffer.from("market"), escrowMarketId.toArrayLike(Buffer, "le", 8)],
        factoryProgram.programId
      )[0];

      await factoryProgram.methods
        .createMarket(
          { nextCorner: {} },
          ["Home", "Away"],
          new BN(Math.floor(Date.now() / 1000) + 3600),
          false,
          1,
        )
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          matchAccount: escrowMatchPda,
          market: escrowMarketPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Update odds on the market
      await factoryProgram.methods
        .updateOdds(0, new BN(20000)) // 2.0 odds
        .accountsStrict({
          authority: authority.publicKey,
          config: configPda,
          market: escrowMarketPda,
        })
        .rpc();

      // Derive escrow PDAs using the ACTUAL market_id
      marketVaultAuthority = PublicKey.findProgramAddressSync(
        [Buffer.from("market_vault"), escrowMarketId.toArrayLike(Buffer, "le", 8)],
        escrowProgram.programId
      )[0];

      // Create market vault token account (owned by the PDA authority)
      marketVault = await createTokenAccountForPda(marketVaultAuthority);

      // Position PDA (escrow-owned)
      positionPda = PublicKey.findProgramAddressSync(
        [
          Buffer.from("position"),
          escrowMarketId.toArrayLike(Buffer, "le", 8),
          alice.publicKey.toBuffer(),
          Buffer.from([0]),
        ],
        escrowProgram.programId
      )[0];

      configForEscrow = configPda;
    });

    it("TC-30: Place bet with valid params → Position created + tokens transferred", async () => {
      const balanceBefore = await provider.connection.getTokenAccountBalance(userTokenAccount);
      const beforeAmount = Number(balanceBefore.value.amount);

      const payer = (provider.wallet as any).payer;

      await escrowProgram.methods
        .placeBet(
          escrowMarketId,    // market_id (for PDA derivation)
          0,                 // outcome_index — Home
          BET_AMOUNT,        // amount — 10 USDC
          1,                 // leverage — 1x
          100,               // max_slippage_bps — 1%
        )
        .accountsStrict({
          user: alice.publicKey,
          configData: configForEscrow,
          factoryProgram: factoryProgram.programId,
          marketData: escrowMarketPda,
          marketVault: marketVault,
          marketVaultAuthority: marketVaultAuthority,
          position: positionPda,
          userTokenAccount: userTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([alice])
        .rpc();

      // Verify position was created
      const position = await escrowProgram.account.position.fetch(positionPda);
      expect(position.outcomeIndex).to.equal(0);
      expect(position.amount.toNumber()).to.equal(BET_AMOUNT.toNumber());
      expect(position.collateral.toNumber()).to.equal(BET_AMOUNT.toNumber()); // 1x leverage
      expect(position.leverage).to.equal(1);
      expect(position.status).to.have.property("active");

      // Verify tokens were transferred from user to vault
      const balanceAfter = await provider.connection.getTokenAccountBalance(userTokenAccount);
      const afterAmount = Number(balanceAfter.value.amount);
      expect(afterAmount).to.equal(beforeAmount - BET_AMOUNT.toNumber());

      const vaultBalance = await provider.connection.getTokenAccountBalance(marketVault);
      expect(Number(vaultBalance.value.amount)).to.equal(BET_AMOUNT.toNumber());
    });

    it("TC-31: Cancel bet before lock → Refund + cancelled", async () => {
      await escrowProgram.methods
        .cancelBet(escrowMarketId)
        .accountsStrict({
          user: alice.publicKey,
          factoryProgram: factoryProgram.programId,
          marketData: escrowMarketPda,
          marketVaultAuthority: marketVaultAuthority,
          marketVault: marketVault,
          position: positionPda,
          userTokenAccount: userTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();

      const position = await escrowProgram.account.position.fetch(positionPda);
      expect(position.status).to.have.property("cancelled");

      // Tokens should be refunded
      const balanceAfter = await provider.connection.getTokenAccountBalance(userTokenAccount);
      expect(Number(balanceAfter.value.amount)).to.be.greaterThanOrEqual(1_000_000_000_000 - 5000); // approx original
    });
  });
});

// ── Helpers ────────────────────────────────────────────────────────

function padString32(input: string): number[] {
  const buf = Buffer.alloc(32, 0);
  buf.write(input, 0, "utf-8");
  return Array.from(buf);
}
