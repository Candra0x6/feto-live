use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use spl_token_interface::ID as TOKEN_PROGRAM_ID;

declare_id!("ey3nM2h4qjMvs33F3nn5WfrEr8f8PAgbkkqyPtwgEGz");

/// Helper: deserialize a factory-owned Anchor account (skip 8-byte discriminator)
trait FromFactory: AnchorDeserialize + Sized {
    fn from_factory_account(
        info: &UncheckedAccount,
        expected_owner: &Pubkey,
    ) -> Result<Self> {
        require!(info.owner == expected_owner, EscrowError::Unauthorized);
        let data = info.try_borrow_data()?;
        let (_, payload) = data.split_at(8);
        let mut src: &[u8] = payload;
        Ok(Self::deserialize(&mut src)?)
    }
}

impl FromFactory for ConfigData {}
impl FromFactory for MarketWrapper {}

#[program]
pub mod feto_escrow {
    use super::*;

    /// Place a bet on a market outcome
    /// market_id is an instruction arg so it's available for PDA seed derivation
    #[allow(unused_variables)]
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        market_id: u64,
        outcome_index: u8,
        amount: u64,
        leverage: u8,
        _max_slippage_bps: u16,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let factory_pk = ctx.accounts.factory_program.key();

        // Deserialize factory-owned accounts
        let market = MarketWrapper::from_factory_account(&ctx.accounts.market_data, &factory_pk)?;
        let config = ConfigData::from_factory_account(&ctx.accounts.config_data, &factory_pk)?;

        // Protocol must not be paused
        require!(!config.paused, EscrowError::ProtocolPaused);
        // Market must be open
        require!(market.status == MarketStatus::Open, EscrowError::MarketNotOpen);
        // Must be before lock time
        require!(
            clock.unix_timestamp < market.lock_time,
            EscrowError::MarketExpired
        );
        // Valid outcome index
        require!(
            (outcome_index as usize) < market.outcomes.len(),
            EscrowError::InvalidOutcome
        );
        // Amount within range
        require!(amount >= config.min_bet, EscrowError::BetTooSmall);
        require!(amount <= config.max_bet, EscrowError::BetTooLarge);
        // Valid leverage
        require!(leverage >= 1, EscrowError::InvalidLeverage);
        if !market.leverage_enabled {
            require!(leverage == 1, EscrowError::LeverageDisabled);
        }
        require!(leverage <= market.max_leverage, EscrowError::InvalidLeverage);

        // Calculate collateral
        let collateral = amount
            .checked_div(leverage as u64)
            .ok_or(EscrowError::Overflow)?;

        // Calculate potential payout at current odds
        let current_odds = market.outcomes[outcome_index as usize].odds_decimal;
        let potential_payout = if current_odds > 0 {
            amount
                .checked_mul(current_odds)
                .ok_or(EscrowError::Overflow)?
                .checked_div(10000)
                .ok_or(EscrowError::Overflow)?
        } else {
            amount.checked_mul(2).ok_or(EscrowError::Overflow)?
        };

        // Calculate liquidation price for leveraged positions
        let liquidation_price = if leverage > 1 && current_odds > 0 {
            let entry_prob = 1_000_000u64
                .checked_div(current_odds)
                .ok_or(EscrowError::Overflow)?;
            let max_adverse = entry_prob
                .checked_mul(leverage as u64)
                .ok_or(EscrowError::Overflow)?
                .checked_div(100)
                .ok_or(EscrowError::Overflow)?;
            entry_prob
                .checked_add(max_adverse)
                .ok_or(EscrowError::Overflow)?
        } else {
            u64::MAX
        };

        // Transfer USDC from user to market vault
        let transfer_ctx = CpiContext::new(
            TOKEN_PROGRAM_ID,
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.market_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, collateral)?;

        // Create position
        let position = &mut ctx.accounts.position;
        position.position_id = config.market_counter;
        position.market_id = market.market_id;
        position.user = ctx.accounts.user.key();
        position.outcome_index = outcome_index;
        position.amount = amount;
        position.leverage = leverage;
        position.collateral = collateral;
        position.potential_payout = potential_payout;
        position.liquidation_price = liquidation_price;
        position.status = PositionStatus::Active;
        position.created_at = clock.unix_timestamp;
        position.settled_at = 0;
        position.claimed = false;
        position.bump = ctx.bumps.position;

        emit!(BetPlaced {
            position_id: position.position_id,
            market_id: market.market_id,
            user: ctx.accounts.user.key(),
            outcome_index,
            amount,
            leverage,
            collateral,
            potential_payout,
        });

        Ok(())
    }

    /// Cancel a bet before market locks
    pub fn cancel_bet(ctx: Context<CancelBet>, market_id: u64) -> Result<()> {
        let clock = Clock::get()?;
        let factory_pk = ctx.accounts.factory_program.key();
        let market = MarketWrapper::from_factory_account(&ctx.accounts.market_data, &factory_pk)?;
        let position = &mut ctx.accounts.position;

        require!(
            position.user == ctx.accounts.user.key(),
            EscrowError::Unauthorized
        );
        require!(
            position.status == PositionStatus::Active,
            EscrowError::PositionNotActive
        );
        require!(
            clock.unix_timestamp < market.lock_time,
            EscrowError::MarketExpired
        );

        // Refund full collateral from market vault
        let seeds = &[
            b"market_vault".as_ref(),
            &market.market_id.to_le_bytes(),
            &[ctx.bumps.market_vault_authority],
        ];
        let signer_seeds = &[&seeds[..]];
        let transfer_ctx = CpiContext::new_with_signer(
            TOKEN_PROGRAM_ID,
            Transfer {
                from: ctx.accounts.market_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.market_vault_authority.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(transfer_ctx, position.collateral)?;

        position.status = PositionStatus::Cancelled;

        emit!(BetCancelled {
            position_id: position.position_id,
            market_id: market.market_id,
            user: ctx.accounts.user.key(),
        });

        Ok(())
    }

    /// Claim payout for a settled market
    pub fn claim_payout(ctx: Context<ClaimPayout>, market_id: u64) -> Result<()> {
        let factory_pk = ctx.accounts.factory_program.key();
        let market = MarketWrapper::from_factory_account(&ctx.accounts.market_data, &factory_pk)?;
        let position = &mut ctx.accounts.position;

        require!(
            position.user == ctx.accounts.user.key(),
            EscrowError::Unauthorized
        );
        require!(!position.claimed, EscrowError::AlreadyClaimed);
        require!(
            market.status == MarketStatus::Settled
                || market.status == MarketStatus::Cancelled,
            EscrowError::MarketNotSettled
        );

        let payout = if market.status == MarketStatus::Cancelled {
            position.collateral
        } else if position.outcome_index == market.winning_outcome {
            let winning_pool = market.outcomes
                .get(position.outcome_index as usize)
                .map(|o| o.total_bets)
                .unwrap_or(0);

            let losing_pool = market.total_pool.saturating_sub(winning_pool);
            let protocol_fee = losing_pool
                .checked_mul(market.protocol_fee_bps as u64)
                .ok_or(EscrowError::Overflow)?
                .checked_div(10000)
                .ok_or(EscrowError::Overflow)?;

            let distributable = losing_pool.saturating_sub(protocol_fee);

            if winning_pool > 0 {
                let share = (position.collateral as u128)
                    .checked_mul(distributable as u128)
                    .ok_or(EscrowError::Overflow)?
                    .checked_div(winning_pool as u128)
                    .ok_or(EscrowError::Overflow)?;
                position
                    .collateral
                    .checked_add(share as u64)
                    .ok_or(EscrowError::Overflow)?
            } else {
                position.collateral
            }
        } else {
            0
        };

        if payout > 0 {
            let market_vault_seeds = &[
                b"market_vault".as_ref(),
                &market.market_id.to_le_bytes(),
                &[ctx.bumps.market_vault_authority],
            ];
            let signer_seeds = &[&market_vault_seeds[..]];

            let transfer_ctx = CpiContext::new_with_signer(
                TOKEN_PROGRAM_ID,
                Transfer {
                    from: ctx.accounts.market_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.market_vault_authority.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_ctx, payout)?;
        }

        position.status = if payout > 0 {
            PositionStatus::Won
        } else {
            PositionStatus::Lost
        };
        position.claimed = true;
        position.settled_at = Clock::get()?.unix_timestamp;

        emit!(PayoutClaimed {
            position_id: position.position_id,
            market_id: market.market_id,
            user: ctx.accounts.user.key(),
            payout,
        });

        Ok(())
    }

    /// Liquidate a leveraged position
    pub fn liquidate_position(ctx: Context<LiquidatePosition>, market_id: u64) -> Result<()> {
        let factory_pk = ctx.accounts.factory_program.key();
        let market = MarketWrapper::from_factory_account(&ctx.accounts.market_data, &factory_pk)?;
        let position = &mut ctx.accounts.position;

        require!(position.leverage > 1, EscrowError::NotLiquidatable);
        require!(
            position.status == PositionStatus::Active,
            EscrowError::AlreadyLiquidated
        );

        // Check if current odds have moved beyond liquidation threshold
        let current_odds = market.outcomes[position.outcome_index as usize].odds_decimal;
        require!(current_odds > 0, EscrowError::InvalidOdds);

        let current_prob = 1_000_000u64
            .checked_div(current_odds)
            .ok_or(EscrowError::Overflow)?;

        require!(
            current_prob >= position.liquidation_price,
            EscrowError::NotLiquidatable
        );

        // Mercy: return 10% of collateral to user
        let mercy_amount = position
            .collateral
            .checked_mul(10)
            .ok_or(EscrowError::Overflow)?
            .checked_div(100)
            .ok_or(EscrowError::Overflow)?;

        if mercy_amount > 0 {
            let market_vault_seeds = &[
                b"market_vault".as_ref(),
                &market.market_id.to_le_bytes(),
                &[ctx.bumps.market_vault_authority],
            ];
            let signer_seeds = &[&market_vault_seeds[..]];

            let transfer_ctx = CpiContext::new_with_signer(
                TOKEN_PROGRAM_ID,
                Transfer {
                    from: ctx.accounts.market_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.market_vault_authority.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_ctx, mercy_amount)?;
        }

        // Remaining goes to protocol treasury
        let protocol_amount = position.collateral.saturating_sub(mercy_amount);
        if protocol_amount > 0 {
            let market_vault_seeds = &[
                b"market_vault".as_ref(),
                &market.market_id.to_le_bytes(),
                &[ctx.bumps.market_vault_authority],
            ];
            let signer_seeds = &[&market_vault_seeds[..]];

            let transfer_ctx = CpiContext::new_with_signer(
                TOKEN_PROGRAM_ID,
                Transfer {
                    from: ctx.accounts.market_vault.to_account_info(),
                    to: ctx.accounts.treasury_vault.to_account_info(),
                    authority: ctx.accounts.market_vault_authority.to_account_info(),
                },
                signer_seeds,
            );
            token::transfer(transfer_ctx, protocol_amount)?;
        }

        position.status = PositionStatus::Liquidated;
        position.settled_at = Clock::get()?.unix_timestamp;

        emit!(PositionLiquidated {
            position_id: position.position_id,
            market_id: market.market_id,
            user: position.user.key(),
            collateral_lost: protocol_amount,
            mercy_returned: mercy_amount,
        });

        Ok(())
    }
}

// ── Account Structures ─────────────────────────────────────────────

/// A user's bet position (owned by escrow program)
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub position_id: u64,
    pub market_id: u64,
    pub user: Pubkey,
    pub outcome_index: u8,
    pub amount: u64,
    pub leverage: u8,
    pub collateral: u64,
    pub potential_payout: u64,
    pub liquidation_price: u64,
    pub status: PositionStatus,
    pub created_at: i64,
    pub settled_at: i64,
    pub claimed: bool,
    pub bump: u8,
}

// ── Enums ──────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionStatus {
    Active,
    Locked,
    Won,
    Lost,
    Liquidated,
    Cancelled,
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

// ── Factory-owned Account Mirrors (for manual deserialization) ─────

/// Mirror of factory's Market — must match field-for-field
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct MarketWrapper {
    pub market_id: u64,
    pub match_id: u64,
    pub market_type: MarketType,
    pub status: MarketStatus,
    #[max_len(5)]
    pub outcomes: Vec<OutcomeWrapper>,
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct OutcomeWrapper {
    pub label: [u8; 32],
    pub total_bets: u64,
    pub odds_decimal: u64,
    pub num_bettors: u32,
}

/// Mirror of factory's Config — manually deserialized via UncheckedAccount
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

// ── Instruction Contexts ───────────────────────────────────────────

/// Place a bet
#[derive(Accounts)]
#[instruction(market_id: u64, outcome_index: u8)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Factory-owned Config account — manually deserialized
    pub config_data: UncheckedAccount<'info>,

    /// CHECK: Factory program ID — validates account ownership
    pub factory_program: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Market account — manually deserialized
    #[account(mut)]
    pub market_data: UncheckedAccount<'info>,

    /// CHECK: Market vault token account
    #[account(mut)]
    pub market_vault: Account<'info, TokenAccount>,

    /// CHECK: PDA signing authority for vault
    #[account(
        seeds = [b"market_vault", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market_vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", market_id.to_le_bytes().as_ref(), user.key().as_ref(), &[0u8]],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Cancel a bet
#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CancelBet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Factory program ID — validates account ownership
    pub factory_program: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Market account — manually deserialized
    pub market_data: UncheckedAccount<'info>,

    /// CHECK: PDA signing authority for vault
    #[account(
        mut,
        seeds = [b"market_vault", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub market_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"position", market_id.to_le_bytes().as_ref(), user.key().as_ref(), &[0u8]],
        bump = position.bump,
        has_one = user
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Claim payout
#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Factory program ID — validates account ownership
    pub factory_program: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Market account — manually deserialized
    pub market_data: UncheckedAccount<'info>,

    /// CHECK: PDA signing authority for vault
    #[account(
        mut,
        seeds = [b"market_vault", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub market_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"position", market_id.to_le_bytes().as_ref(), user.key().as_ref(), &[0u8]],
        bump = position.bump,
        has_one = user
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Liquidate a leveraged position
#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct LiquidatePosition<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    /// CHECK: Factory program ID — validates account ownership
    pub factory_program: UncheckedAccount<'info>,

    /// CHECK: Factory-owned Market account — manually deserialized
    pub market_data: UncheckedAccount<'info>,

    /// CHECK: PDA signing authority for vault
    #[account(
        mut,
        seeds = [b"market_vault", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market_vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub market_vault: Account<'info, TokenAccount>,

    /// CHECK: Treasury vault token account
    #[account(mut)]
    pub treasury_vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"position", market_id.to_le_bytes().as_ref(), position.user.as_ref(), &[0u8]],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ── Events ─────────────────────────────────────────────────────────

#[event]
pub struct BetPlaced {
    pub position_id: u64,
    pub market_id: u64,
    pub user: Pubkey,
    pub outcome_index: u8,
    pub amount: u64,
    pub leverage: u8,
    pub collateral: u64,
    pub potential_payout: u64,
}

#[event]
pub struct BetCancelled {
    pub position_id: u64,
    pub market_id: u64,
    pub user: Pubkey,
}

#[event]
pub struct PayoutClaimed {
    pub position_id: u64,
    pub market_id: u64,
    pub user: Pubkey,
    pub payout: u64,
}

#[event]
pub struct PositionLiquidated {
    pub position_id: u64,
    pub market_id: u64,
    pub user: Pubkey,
    pub collateral_lost: u64,
    pub mercy_returned: u64,
}

// ── Error Codes ────────────────────────────────────────────────────

#[error_code]
pub enum EscrowError {
    #[msg("Market is not open for betting")]
    MarketNotOpen,
    #[msg("Invalid outcome index")]
    InvalidOutcome,
    #[msg("Bet amount below minimum")]
    BetTooSmall,
    #[msg("Bet amount above maximum")]
    BetTooLarge,
    #[msg("Market has expired or is locked")]
    MarketExpired,
    #[msg("Invalid leverage multiplier")]
    InvalidLeverage,
    #[msg("Leverage is not enabled for this market")]
    LeverageDisabled,
    #[msg("Insufficient user balance")]
    InsufficientBalance,
    #[msg("Position is not active")]
    PositionNotActive,
    #[msg("Payout already claimed")]
    AlreadyClaimed,
    #[msg("Market not yet settled")]
    MarketNotSettled,
    #[msg("Position already liquidated")]
    AlreadyLiquidated,
    #[msg("Position not subject to liquidation")]
    NotLiquidatable,
    #[msg("Invalid odds data")]
    InvalidOdds,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Math overflow")]
    Overflow,
    #[msg("Protocol is paused")]
    ProtocolPaused,
}
