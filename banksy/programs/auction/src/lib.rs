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

    pub fn close_auction(ctx: Context<CloseAuction>) -> ProgramResult {
        
        let auction = &mut ctx.accounts.auction;
        let (_, seed) = Pubkey::find_program_address(&[&auction.seller.to_bytes()], &ctx.program_id);
        let seeds = &[auction.seller.as_ref(), &[seed]];
        let signer = &[&seeds[..]];

        // anyone has bid 
        if auction.no_bid == false {
            let cpi_accounts = MoneyTransfer {
                from: ctx.accounts.money_holder.to_account_info().clone(),
                to: ctx.accounts.money_receiver.to_account_info().clone(),
                authority: ctx.accounts.money_holder_auth.clone(),
            };
            let cpi_program = ctx.accounts.money_program.clone();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::transfer(cpi_ctx, auction.price)?;
        }        

        let cpi_accounts = NftTransfer {
            from: ctx.accounts.nft_holder.clone().into(),
            to: ctx.accounts.nft_receiver.clone().into(),
            authority: ctx.accounts.nft_holder_auth.clone(),
        };
        let cpi_program = ctx.accounts.nft_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        banksy::cpi::transfer(cpi_ctx, ctx.accounts.nft_holder.amount)?;

        auction.ongoing = false;

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
    #[account(mut, "auction.ongoing")]
    auction: ProgramAccount<'info, Auction>,
    #[account(signer)]
    bider: AccountInfo<'info>,
    #[account(
        mut
    )]
    from: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    from_auth: AccountInfo<'info>,
    #[account(mut)]
    money_holder: CpiAccount<'info, TokenAccount>,
    #[account("&money_holder.owner == money_holder_auth.key")]
    money_holder_auth: AccountInfo<'info>,
    #[account(mut)]
    ori_money_refund: CpiAccount<'info, TokenAccount>,   
    #[account("money_program.key == &token::ID")]
    money_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CloseAuction<'info> {
    #[account(mut, "auction.ongoing")]
    auction: ProgramAccount<'info, Auction>,
    #[account(signer)]
    seller: AccountInfo<'info>,
    #[account(mut)]
    money_holder: CpiAccount<'info, TokenAccount>,
    #[account("&money_holder.owner == money_holder_auth.key")]
    money_holder_auth: AccountInfo<'info>,
    #[account(mut)]
    money_receiver: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    nft_holder: CpiAccount<'info, UserAccount>,
    nft_holder_auth: AccountInfo<'info>,
    #[account(mut)]
    nft_receiver: CpiAccount<'info, UserAccount>,
    #[account("money_program.key == &token::ID")]
    money_program: AccountInfo<'info>,
    nft_program: AccountInfo<'info>,
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