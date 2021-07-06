use anchor_lang::prelude::*;
use banksy::{UserAccount, Transfer as NftTransfer};
use anchor_lang::{AccountDeserialize, AnchorDeserialize};
use anchor_spl::token::{self, TokenAccount, Transfer as MoneyTransfer};

#[program]
pub mod auction {
    use super::*;
    pub fn create_auction(ctx: Context<CreateAuction>, price: u64) -> ProgramResult{
        let auction = &mut ctx.accounts.auction;
        auction.ongoing = true;
        auction.no_bid = true;
        auction.seller = *ctx.accounts.seller.key;
        auction.bider = *ctx.accounts.seller.key;  // bider's init value is seller
        auction.nft_holder = *ctx.accounts.nft_holder.to_account_info().key;
        auction.price = price;
        Ok(())
    } 

    pub fn process_bid(ctx: Context<Bid>, price: u64) -> ProgramResult {
        let auction = &mut ctx.accounts.auction;

        if price <= auction.price {
            //todo: return Error
            return Err(AuctionErr::BidPirceTooLow.into());
        }

        if auction.no_bid == false {
            // todo: transfer money from money_holder to money_refund
            let (_, seed) = Pubkey::find_program_address(&[&auction.seller.to_bytes()], &ctx.program_id);
            let seeds = &[auction.seller.as_ref(), &[seed]];
            let signer = &[&seeds[..]];

            let cpi_accounts = MoneyTransfer {
                from: ctx.accounts.money_holder.to_account_info().clone(),
                to: ctx.accounts.ori_money_refund.to_account_info().clone(),
                authority: ctx.accounts.money_holder_auth.clone(),
            };
            let cpi_program = ctx.accounts.money_program.clone();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

            token::transfer(cpi_ctx, auction.price)?;
        }

        let cpi_accounts = MoneyTransfer {
            from: ctx.accounts.from.to_account_info().clone(),
            to: ctx.accounts.money_holder.to_account_info().clone(),
            authority: ctx.accounts.from_auth.clone(),
        };
        let cpi_program = ctx.accounts.money_program.clone();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, price)?;

        auction.no_bid = false;
        auction.bider = *ctx.accounts.bider.key;
        auction.money_refund = *ctx.accounts.from.to_account_info().key;
        auction.price = price;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateAuction<'info> {
    #[account(init)]
    auction: ProgramAccount<'info, Auction>, 
    seller: AccountInfo<'info>,
    nft_holder: CpiAccount<'info, UserAccount>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Bid<'info> {
    auction: ProgramAccount<'info, Auction>,
    #[account(signer)]
    bider: AccountInfo<'info>,
    from: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    from_auth: AccountInfo<'info>,
    money_holder: CpiAccount<'info, TokenAccount>,
    money_holder_auth: AccountInfo<'info>,
    ori_money_refund: AccountInfo<'info>,   //
    money_program: AccountInfo<'info>,
}

#[account]
pub struct Auction {
    ongoing: bool,
    no_bid: bool,
    seller: Pubkey,
    bider: Pubkey,
    nft_holder: Pubkey,
    money_refund: Pubkey,
    price: u64,
}

#[error]
pub enum AuctionErr {
    #[msg("your bid price is too low")]
    BidPirceTooLow,
}