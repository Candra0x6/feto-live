use anchor_lang::prelude::*;

declare_id!("DmRQTT8rJSSxNNjDiXwSMjzotP2xwdfngBnqtggRsPGz");

#[program]
pub mod feto_settle {
    use super::*;

    /// Verify a TxLINE proof and emit verified settlement data.
    pub fn settle_market(
        ctx: Context<SettleMarket>,
        winning_outcome: u8,
        proof: TxlineProof,
    ) -> Result<()> {
        let clock = Clock::get()?;

        // Manually deserialize factory-owned accounts
        let market = MarketData::from_account(&ctx.accounts.market_data, &ctx.accounts.factory_program.key())?;
        let match_acct = MatchData::from_account(&ctx.accounts.match_data, &ctx.accounts.factory_program.key())?;

        // Market must be locked
        require!(
            market.status == MarketStatus::Locked,
            SettleError::MarketNotLocked
        );
        // Validate winning outcome is valid
        require!(
            (winning_outcome as usize) < market.outcomes.len(),
            SettleError::InvalidOutcome
        );

        // MVP proof verification: hash matches match fixture
        let proof_hash = hash_proof(&proof);
        require!(
            proof_hash == match_acct.txline_fixture_hash,
            SettleError::InvalidTxlineProof
        );

        // Calculate keeper reward
        let keeper_reward = market
            .total_pool
            .checked_mul(10)
            .ok_or(SettleError::Overflow)?
            .checked_div(10000)
            .ok_or(SettleError::Overflow)?;

        emit!(MarketSettled {
            market_id: market.market_id,
            match_id: market.match_id,
            winning_outcome,
            total_pool: market.total_pool,
            keeper: ctx.accounts.keeper.key(),
            keeper_reward,
            settlement_time: clock.unix_timestamp,
            proof_hash,
        });

        Ok(())
    }

    /// Verify market state and emit lock event
    pub fn lock_market(ctx: Context<LockMarket>) -> Result<()> {
        let market = MarketData::from_account(&ctx.accounts.market_data, &ctx.accounts.factory_program.key())?;

        require!(
            market.status == MarketStatus::Open,
            SettleError::MarketNotOpen
        );

        emit!(MarketLocked {
            market_id: market.market_id,
            match_id: market.match_id,
        });

        Ok(())
    }

    /// Verify odds update authorization and emit event
    pub fn update_odds(
        ctx: Context<UpdateOdds>,
        outcome_index: u8,
        new_odds_decimal: u64,
    ) -> Result<()> {
        let market = MarketData::from_account(&ctx.accounts.market_data, &ctx.accounts.factory_program.key())?;
        let config = ConfigData::from_account(&ctx.accounts.config_data, &ctx.accounts.factory_program.key())?;

        require!(
            ctx.accounts.authority.key() == config.authority,
            SettleError::Unauthorized
        );
        require!(
            market.status == MarketStatus::Open,
            SettleError::MarketNotOpen
        );
        require!(
            (outcome_index as usize) < market.outcomes.len(),
            SettleError::InvalidOutcome
        );

        emit!(OddsUpdated {
            market_id: market.market_id,
            outcome_index,
            new_odds_decimal,
        });

        Ok(())
    }
}

// ── Helper: Deserialize factory-owned accounts ─────────────────────

/// Helper trait: read Anchor account data (skip 8-byte discriminator)
/// and validate ownership.
trait FromFactoryAccount: AnchorDeserialize + Sized {
    fn from_account(info: &anchor_lang::prelude::UncheckedAccount, expected_owner: &Pubkey) -> Result<Self> {
        // Validate owner
        require!(
            info.owner == expected_owner,
            SettleError::Unauthorized
        );
        // Borrow data and skip 8-byte Anchor discriminator
        let data = info.try_borrow_data()?;
        let (_, payload) = data.split_at(8);
        let mut src: &[u8] = payload;
        Ok(Self::deserialize(&mut src)?)
    }
}

impl FromFactoryAccount for MarketData {}
impl FromFactoryAccount for MatchData {}
impl FromFactoryAccount for ConfigData {}

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
fn hash_proof(proof: &TxlineProof) -> [u8; 32] {
    use solana_program::keccak;
    let mut data = Vec::with_capacity(32 + 8 + 2);
    data.extend_from_slice(&proof.root);
    data.extend_from_slice(&proof.fixture_id.to_le_bytes());
    data.push(proof.event_type);
    data.push(proof.event_team);
    let hash = keccak::hash(&data);
    hash.to_bytes()
}

// ── Data Mirrors (for reading factory-owned accounts) ─────────────

/// Mirror of factory's Market — must match field-for-field
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct MarketData {
    pub market_id: u64,
    pub match_id: u64,
    pub market_type: MarketType,
    pub status: MarketStatus,
    #[max_len(5)]
    pub outcomes: Vec<OutcomeData>,
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

/// Mirror of factory's Outcome
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OutcomeData {
    pub label: [u8; 32],
    pub total_bets: u64,
    pub odds_decimal: u64,
    pub num_bettors: u32,
}

/// Mirror of factory's MatchAccount
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct MatchData {
    pub match_id: u64,
    pub home_team: [u8; 32],
    pub away_team: [u8; 32],
    pub status: u8,
    pub home_score: u8,
    pub away_score: u8,
    pub current_minute: u16,
    pub txline_fixture_hash: [u8; 32],
    pub start_time: i64,
    pub end_time: i64,
    pub active_markets: u8,
    pub bump: u8,
}

/// Mirror of factory's Config
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct ConfigData {
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

// ── Enums ──────────────────────────────────────────────────────────

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

/// Verify a TxLINE proof and emit settlement event
#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    /// CHECK: Factory program — used to validate account ownership
    pub factory_program: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Market account — manually deserialized
    pub market_data: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Match account — manually deserialized
    pub match_data: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Verify lock condition and emit event
#[derive(Accounts)]
pub struct LockMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Factory program — used to validate account ownership
    pub factory_program: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Market account — manually deserialized
    pub market_data: UncheckedAccount<'info>,
}

/// Verify odds update authorization and emit event
#[derive(Accounts)]
pub struct UpdateOdds<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Factory program — used to validate account ownership
    pub factory_program: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Config account — manually deserialized
    pub config_data: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Market account — manually deserialized
    pub market_data: UncheckedAccount<'info>,
}

// ── Events ─────────────────────────────────────────────────────────

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
pub struct MarketLocked {
    pub market_id: u64,
    pub match_id: u64,
}

#[event]
pub struct OddsUpdated {
    pub market_id: u64,
    pub outcome_index: u8,
    pub new_odds_decimal: u64,
}

// ── Error Codes ────────────────────────────────────────────────────

#[error_code]
pub enum SettleError {
    #[msg("Market is not locked")]
    MarketNotLocked,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Invalid outcome index")]
    InvalidOutcome,
    #[msg("Invalid TxLINE proof")]
    InvalidTxlineProof,
    #[msg("TxLINE validation failed")]
    TxlineValidationFailed,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Math overflow")]
    Overflow,
}
