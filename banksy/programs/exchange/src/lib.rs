use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, AnchorDeserialize};
use anchor_spl::token::{self, TokenAccount, Transfer as CurrencyTransfer};
use banksy::{UserAccount, Transfer as NftTransfer};

#[program]
mod exchange {
    use super::*;

    pub fn create_exchange(ctx: Context<CreateExchange>, price: u64) -> Result<(), ProgramError> {
        let exchange = &mut ctx.accounts.exchange;
        exchange.ongoing = true;
        exchange.seller = *ctx.accounts.seller.key;
        exchange.item = *ctx.accounts.item.key;
        exchange.currency = *ctx.accounts.currency.key;
        exchange.item_holder = *ctx.accounts.item_holder.to_account_info().key;
        exchange.currency_receiver = *ctx.accounts.currency_receiver.to_account_info().key;
        exchange.price = price;
        Ok(())
    }

    pub fn process_exchange(ctx: Context<ProgressExchange>) -> Result<(), ProgramError> {
        let exchange = &mut ctx.accounts.exchange;
        exchange.buyer = *ctx.accounts.buyer.key;

        let (_, seed) = Pubkey::find_program_address(&[&exchange.item.to_bytes(), &exchange.seller.to_bytes()], &ctx.program_id);
        let seeds = &[&exchange.item.as_ref(), exchange.seller.as_ref(), &[seed]];
        let signer = &[&seeds[..]];

        // 货币转账
        let cpi_accounts = CurrencyTransfer {
            from: ctx.accounts.currency_holder.to_account_info().clone(),
            to: ctx.accounts.currency_receiver.to_account_info().clone(),
            authority: ctx.accounts.currency_holder_auth.clone(),
        };

        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        // 完成货币转账
        token::transfer(cpi_ctx, exchange.price)?;

        // NFT转账
        let cpi_accounts = NftTransfer {
            from: ctx.accounts.item_holder.clone().into(),
            to: ctx.accounts.item_receiver.clone().into(),
            authority: ctx.accounts.item_holder_auth.clone(),
        };
        let cpi_program = ctx.accounts.nft_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        banksy::cpi::transfer(cpi_ctx, ctx.accounts.item_holder.amount)?;
        
        exchange.ongoing = false;
        Ok(())
    }

}


#[derive(Accounts)]
pub struct CreateExchange<'info> {
    #[account(init)]
    exchange: ProgramAccount<'info, Exchange>,
    #[account(signer)]
    seller: AccountInfo<'info>,
    currency: AccountInfo<'info>,
    item: AccountInfo<'info>,
    #[account("&item_holder.authority == &Pubkey::find_program_address(&[&item.key.to_bytes(), &seller.key.to_bytes()], &program_id).0")]
    item_holder: CpiAccount<'info, UserAccount>,
    #[account("&currency_receiver.owner == seller.key")]
    currency_receiver: CpiAccount<'info, TokenAccount>,    
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ProgressExchange<'info> {
    #[account(mut, "exchange.ongoing")]
    exchange: ProgramAccount<'info, Exchange>,
    seller: AccountInfo<'info>,
    #[account(signer)]
    buyer: AccountInfo<'info>,
    #[account(
        mut,
        "currency_holder.mint == currency_receiver.mint",
        "&currency_holder.owner == currency_holder_auth.key",
    )]
    currency_holder: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    currency_holder_auth: AccountInfo<'info>,
    #[account(
        mut,
        "item_holder.to_account_info().key == &exchange.item_holder",
        //"&item_holder.owner == &Pubkey::find_program_address(&[&seller.key.to_bytes()], &program_id).0"
    )]
    item_holder: CpiAccount<'info, UserAccount>,
    item_holder_auth: AccountInfo<'info>,
    #[account(mut)]
    item_receiver: CpiAccount<'info, UserAccount>,
    /*#[account(
        mut,
        "currency_holder.to_account_info().key == &exchange.currency_holder"
    )]
    currency_holder: CpiAccount<'info, TokenAccount>,
    #[account("&currency_holder.owner == currency_holder_auth.key")]
    currency_holder_auth: AccountInfo<'info>,*/
    #[account(mut, "currency_receiver.to_account_info().key == &exchange.currency_receiver")]
    currency_receiver: CpiAccount<'info, TokenAccount>,
    #[account("token_program.key == &token::ID")]
    token_program: AccountInfo<'info>,
    //#[account("nft_program.key == &banksy::ID")]
    nft_program: AccountInfo<'info>,
}

#[account]
pub struct Exchange {
    ongoing: bool,
    seller: Pubkey,
    buyer: Pubkey,
    currency: Pubkey,
    item: Pubkey,
    item_holder: Pubkey,
    currency_receiver: Pubkey,
    price: u64,
}