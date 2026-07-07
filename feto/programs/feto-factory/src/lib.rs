use anchor_lang::prelude::*;

declare_id!("8FRnebXM2T3xcvuPpirKRuPZVGPzXpyx1kEVGrkTg2D4");

#[program]
pub mod feto_factory {
    use super::*;

    /// Initialize the global config account with protocol parameters
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_recipient: Pubkey,
        txline_program: Pubkey,
        min_bet: u64,
        max_bet: u64,
        protocol_fee_bps: u16,
    ) -> Result<()> {
        require!(protocol_fee_bps <= 500, FactoryError::InvalidFeeBps);
        require!(min_bet < max_bet, FactoryError::InvalidBetRange);
        require!(min_bet >= 1_000_000, FactoryError::BetTooSmall);

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.fee_recipient = fee_recipient;
        config.txline_program = txline_program;
        config.treasury_vault = ctx.accounts.treasury_vault.key();
        config.min_bet = min_bet;
        config.max_bet = max_bet;
        config.protocol_fee_bps = protocol_fee_bps;
        config.market_counter = 0;
        config.paused = false;
        config.escrow_program = Pubkey::default(); // Set via separate admin call
        config.bump = ctx.bumps.config;

        emit!(ConfigInitialized {
            authority: config.authority,
            fee_recipient: config.fee_recipient,
            min_bet: config.min_bet,
            max_bet: config.max_bet,
            protocol_fee_bps: config.protocol_fee_bps,
        });

        Ok(())
    }

    /// Create a new match from TxLINE fixture data
    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_id: u64,
        home_team: String,
        away_team: String,
        txline_fixture_hash: [u8; 32],
        start_time: i64,
    ) -> Result<()> {
        require!(
            home_team.as_bytes().len() <= 32,
            FactoryError::TeamNameTooLong
        );
        require!(
            away_team.as_bytes().len() <= 32,
            FactoryError::TeamNameTooLong
        );
        let clock = Clock::get()?;
        require!(
            start_time > clock.unix_timestamp - 3600,
            FactoryError::InvalidStartTime
        );
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            FactoryError::Unauthorized
        );

        let match_acct = &mut ctx.accounts.match_account;
        match_acct.match_id = match_id;
        match_acct.home_team = fixed_bytes_32(home_team.as_bytes());
        match_acct.away_team = fixed_bytes_32(away_team.as_bytes());
        match_acct.status = MatchStatus::Scheduled;
        match_acct.home_score = 0;
        match_acct.away_score = 0;
        match_acct.current_minute = 0;
        match_acct.txline_fixture_hash = txline_fixture_hash;
        match_acct.start_time = start_time;
        match_acct.end_time = 0;
        match_acct.active_markets = 0;
        match_acct.bump = ctx.bumps.match_account;

        emit!(MatchCreated {
            match_id,
            home_team,
            away_team,
            start_time,
        });

        Ok(())
    }

    /// Update match state (score, minute, status)
    pub fn update_match_state(
        ctx: Context<UpdateMatchState>,
        status: MatchStatus,
        home_score: u8,
        away_score: u8,
        current_minute: u16,
    ) -> Result<()> {
        let match_acct = &mut ctx.accounts.match_account;
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            FactoryError::Unauthorized
        );

        match_acct.status = status;
        match_acct.home_score = home_score;
        match_acct.away_score = away_score;
        match_acct.current_minute = current_minute;

        if status == MatchStatus::Finished || status == MatchStatus::Abandoned {
            match_acct.end_time = Clock::get()?.unix_timestamp;
        }

        emit!(MatchStateUpdated {
            match_id: match_acct.match_id,
            status,
            home_score,
            away_score,
            current_minute,
        });

        Ok(())
    }

    /// Create a new micro-market for a match
    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_type: MarketType,
        outcomes: Vec<String>,
        lock_time: i64,
        leverage_enabled: bool,
        max_leverage: u8,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.config;
        let match_acct = &mut ctx.accounts.match_account;

        require!(
            match_acct.status == MatchStatus::Live,
            FactoryError::MatchNotLive
        );
        require!(lock_time > clock.unix_timestamp, FactoryError::InvalidLockTime);
        let outcome_count = outcomes.len();
        require!(
            outcome_count >= 2 && outcome_count <= 5,
            FactoryError::InvalidOutcomeCount
        );
        require!(max_leverage <= 5, FactoryError::InvalidLeverage);

        let market = &mut ctx.accounts.market;
        market.market_id = config.market_counter;
        market.match_id = match_acct.match_id;
        market.market_type = market_type;
        market.status = MarketStatus::Open;
        market.outcomes = Vec::with_capacity(outcome_count);
        for label in outcomes.iter() {
            market.outcomes.push(Outcome {
                label: fixed_bytes_32(label.as_bytes()),
                total_bets: 0,
                odds_decimal: 0,
                num_bettors: 0,
            });
        }
        market.total_pool = 0;
        market.creation_time = clock.unix_timestamp;
        market.lock_time = lock_time;
        market.settlement_time = 0;
        market.winning_outcome = 255;
        market.protocol_fee_bps = config.protocol_fee_bps;
        market.leverage_enabled = leverage_enabled;
        market.max_leverage = max_leverage;
        market.bump = ctx.bumps.market;

        match_acct.active_markets += 1;

        let config = &mut ctx.accounts.config;
        config.market_counter += 1;

        emit!(MarketCreated {
            market_id: market.market_id,
            match_id: match_acct.match_id,
            market_type: market_type as u8,
            lock_time,
            outcome_count: outcome_count as u8,
        });

        Ok(())
    }

    /// Lock a market (stop accepting bets)
    pub fn lock_market(ctx: Context<LockMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Open,
            FactoryError::MarketNotOpen
        );

        market.status = MarketStatus::Locked;

        emit!(MarketLocked {
            market_id: market.market_id,
            match_id: market.match_id,
        });

        Ok(())
    }

    /// Settle a market with winning outcome & TxLINE proof verification
    pub fn settle_market(
        ctx: Context<SettleMarket>,
        winning_outcome: u8,
        proof: TxlineProof,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let market = &mut ctx.accounts.market;
        let match_acct = &ctx.accounts.match_account;

        require!(
            market.status == MarketStatus::Locked,
            FactoryError::MarketNotLocked
        );
        require!(
            (winning_outcome as usize) < market.outcomes.len(),
            FactoryError::InvalidOutcome
        );

        // MVP proof verification: hash matches match fixture
        let proof_hash = hash_proof(&proof);
        require!(
            proof_hash == match_acct.txline_fixture_hash,
            FactoryError::InvalidTxlineProof
        );

        market.status = MarketStatus::Settled;
        market.winning_outcome = winning_outcome;
        market.settlement_time = clock.unix_timestamp;

        let match_acct = &mut ctx.accounts.match_account;
        match_acct.active_markets = match_acct.active_markets.saturating_sub(1);

        let keeper_reward = market
            .total_pool
            .checked_mul(10)
            .ok_or(FactoryError::Overflow)?
            .checked_div(10000)
            .ok_or(FactoryError::Overflow)?;

        emit!(MarketSettled {
            market_id: market.market_id,
            match_id: market.match_id,
            winning_outcome,
            total_pool: market.total_pool,
            keeper: ctx.accounts.keeper.key(),
            keeper_reward,
            settlement_time: market.settlement_time,
            proof_hash,
        });

        Ok(())
    }

    /// Update odds for a market outcome
    pub fn update_odds(
        ctx: Context<UpdateOdds>,
        outcome_index: u8,
        new_odds_decimal: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            FactoryError::Unauthorized
        );
        let market = &mut ctx.accounts.market;
        require!(
            market.status == MarketStatus::Open,
            FactoryError::MarketNotOpen
        );
        require!(
            (outcome_index as usize) < market.outcomes.len(),
            FactoryError::InvalidOutcome
        );

        market.outcomes[outcome_index as usize].odds_decimal = new_odds_decimal;

        emit!(OddsUpdated {
            market_id: market.market_id,
            outcome_index,
            new_odds_decimal,
        });

        Ok(())
    }

    /// Pause/unpause the entire protocol (emergency)
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority,
            FactoryError::Unauthorized
        );
        ctx.accounts.config.paused = paused;

        emit!(ProtocolPaused { paused });
        Ok(())
    }

    /// Cancel a market (match abandoned, VAR overturn, etc.)
    pub fn cancel_market(ctx: Context<CancelMarket>) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.config.authority
                || ctx.accounts.keeper.key() == ctx.accounts.config.authority,
            FactoryError::Unauthorized
        );
        let market = &mut ctx.accounts.market;
        require!(
            market.status != MarketStatus::Settled,
            FactoryError::MarketAlreadySettled
        );

        market.status = MarketStatus::Cancelled;
        market.settlement_time = Clock::get()?.unix_timestamp;

        let match_acct = &mut ctx.accounts.match_account;
        match_acct.active_markets = match_acct.active_markets.saturating_sub(1);

        emit!(MarketCancelled {
            market_id: market.market_id,
            match_id: market.match_id,
        });

        Ok(())
    }
}

// ── Account Structures ─────────────────────────────────────────────

/// Global protocol configuration
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub txline_program: Pubkey,
    pub treasury_vault: Pubkey,
    pub min_bet: u64,
    pub max_bet: u64,
    pub protocol_fee_bps: u16,
    pub market_counter: u64,
    pub paused: bool,
    pub escrow_program: Pubkey,
    pub bump: u8,
}

impl Config {
    pub const SEED: &'static [u8] = b"feto_config";
    pub const SPACE: usize = 8 + Config::INIT_SPACE;
}

/// A match on the platform (linked to TxLINE fixture)
#[account]
#[derive(InitSpace)]
pub struct MatchAccount {
    pub match_id: u64,
    pub home_team: [u8; 32],
    pub away_team: [u8; 32],
    pub status: MatchStatus,
    pub home_score: u8,
    pub away_score: u8,
    pub current_minute: u16,
    pub txline_fixture_hash: [u8; 32],
    pub start_time: i64,
    pub end_time: i64,
    pub active_markets: u8,
    pub bump: u8,
}

/// A micro-market for a specific event type
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub market_id: u64,
    pub match_id: u64,
    pub market_type: MarketType,
    pub status: MarketStatus,
    #[max_len(5)]
    pub outcomes: Vec<Outcome>,
    pub total_pool: u64,
    pub creation_time: i64,
    pub lock_time: i64,
    pub settlement_time: i64,
    pub winning_outcome: u8,
    pub protocol_fee_bps: u16,
    pub leverage_enabled: bool,
    pub max_leverage: u8,
    pub bump: u8,
}

impl Market {
    pub const SEED: &'static [u8] = b"market";
    pub const MAX_OUTCOMES: usize = 5;
}

/// A single outcome within a market
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Outcome {
    pub label: [u8; 32],
    pub total_bets: u64,
    pub odds_decimal: u64,
    pub num_bettors: u32,
}

// ── Enums ──────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MatchStatus {
    Scheduled,
    Live,
    Paused,
    Finished,
    Abandoned,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketType {
    NextCorner,
    NextCard,
    NextSubstitution,
    NextGoalScorer,
    GoalInNextNMinutes,
    AnyGoal,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Open,
    Locked,
    Settled,
    Cancelled,
}

// ── Instruction Contexts ───────────────────────────────────────────

/// Initialize the protocol config
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Config::SPACE,
        seeds = [Config::SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: Treasury vault token account — validated by authority
    pub treasury_vault: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Create a new match
#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct CreateMatch<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = authority,
        space = 8 + MatchAccount::INIT_SPACE,
        seeds = [b"match", match_id.to_le_bytes().as_ref()],
        bump
    )]
    pub match_account: Account<'info, MatchAccount>,

    pub system_program: Program<'info, System>,
}

/// Update match state (score, minute, status)
#[derive(Accounts)]
pub struct UpdateMatchState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"match", match_account.match_id.to_le_bytes().as_ref()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, MatchAccount>,
}

/// Create a new market
#[derive(Accounts)]
#[instruction(market_type: MarketType)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"match", match_account.match_id.to_le_bytes().as_ref()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, MatchAccount>,

    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", config.market_counter.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,

    pub system_program: Program<'info, System>,
}

/// Lock a market (stop accepting bets)
#[derive(Accounts)]
pub struct LockMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

/// Settle a market with TxLINE proof
#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"match", match_account.match_id.to_le_bytes().as_ref()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, MatchAccount>,

    pub system_program: Program<'info, System>,
}

/// Update odds
#[derive(Accounts)]
pub struct UpdateOdds<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

/// Set protocol pause state
#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Config::SEED],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, Config>,
}

/// Cancel a market
#[derive(Accounts)]
pub struct CancelMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub keeper: Signer<'info>,

    #[account(
        seeds = [Config::SEED],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"market", market.market_id.to_le_bytes().as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [b"match", match_account.match_id.to_le_bytes().as_ref()],
        bump = match_account.bump
    )]
    pub match_account: Account<'info, MatchAccount>,
}

// ── TxLINE Proof Types ────────────────────────────────────────────

/// Proof structure for TxLINE verification
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TxlineProof {
    pub root: [u8; 32],
    pub proof_path: Vec<[u8; 32]>,
    pub leaf: [u8; 32],
    pub signature: [u8; 64],
    pub fixture_id: u64,
    pub event_type: u8,
    pub event_team: u8,
    pub timestamp: i64,
}

/// Hash a proof for verification
pub fn hash_proof(proof: &TxlineProof) -> [u8; 32] {
    use solana_program::keccak;
    let mut data = Vec::with_capacity(32 + 8 + 2);
    data.extend_from_slice(&proof.root);
    data.extend_from_slice(&proof.fixture_id.to_le_bytes());
    data.push(proof.event_type);
    data.push(proof.event_team);
    let hash = keccak::hash(&data);
    hash.to_bytes()
}

// ── Events ─────────────────────────────────────────────────────────

#[event]
pub struct ConfigInitialized {
    pub authority: Pubkey,
    pub fee_recipient: Pubkey,
    pub min_bet: u64,
    pub max_bet: u64,
    pub protocol_fee_bps: u16,
}

#[event]
pub struct MatchCreated {
    pub match_id: u64,
    pub home_team: String,
    pub away_team: String,
    pub start_time: i64,
}

#[event]
pub struct MatchStateUpdated {
    pub match_id: u64,
    pub status: MatchStatus,
    pub home_score: u8,
    pub away_score: u8,
    pub current_minute: u16,
}

#[event]
pub struct MarketCreated {
    pub market_id: u64,
    pub match_id: u64,
    pub market_type: u8,
    pub lock_time: i64,
    pub outcome_count: u8,
}

#[event]
pub struct MarketLocked {
    pub market_id: u64,
    pub match_id: u64,
}

#[event]
pub struct MarketSettled {
    pub market_id: u64,
    pub match_id: u64,
    pub winning_outcome: u8,
    pub total_pool: u64,
    pub keeper: Pubkey,
    pub keeper_reward: u64,
    pub settlement_time: i64,
    pub proof_hash: [u8; 32],
}

#[event]
pub struct OddsUpdated {
    pub market_id: u64,
    pub outcome_index: u8,
    pub new_odds_decimal: u64,
}

#[event]
pub struct MarketCancelled {
    pub market_id: u64,
    pub match_id: u64,
}

#[event]
pub struct ProtocolPaused {
    pub paused: bool,
}

// ── Error Codes ────────────────────────────────────────────────────

#[error_code]
pub enum FactoryError {
    #[msg("Protocol fee cannot exceed 500 bps (5%)")]
    InvalidFeeBps,
    #[msg("Minimum bet must be less than maximum bet")]
    InvalidBetRange,
    #[msg("Bet amount below minimum (1 USDC)")]
    BetTooSmall,
    #[msg("Bet amount above maximum")]
    BetTooLarge,
    #[msg("Team name cannot exceed 32 bytes")]
    TeamNameTooLong,
    #[msg("Invalid start time")]
    InvalidStartTime,
    #[msg("Match is not live")]
    MatchNotLive,
    #[msg("Invalid lock time (must be in the future)")]
    InvalidLockTime,
    #[msg("Markets must have 2-5 outcomes")]
    InvalidOutcomeCount,
    #[msg("Invalid leverage multiplier (max 5x)")]
    InvalidLeverage,
    #[msg("Market is already settled")]
    MarketAlreadySettled,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Market is not locked")]
    MarketNotLocked,
    #[msg("Invalid outcome index")]
    InvalidOutcome,
    #[msg("Invalid TxLINE proof")]
    InvalidTxlineProof,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Math overflow")]
    Overflow,
}

// ── Helpers ────────────────────────────────────────────────────────

/// Convert a byte slice to a fixed 32-byte array, null-padded
fn fixed_bytes_32(input: &[u8]) -> [u8; 32] {
    let mut output = [0u8; 32];
    let len = input.len().min(32);
    output[..len].copy_from_slice(&input[..len]);
    output
}
