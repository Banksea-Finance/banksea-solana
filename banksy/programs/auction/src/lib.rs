use anchor_lang::prelude::*;
use banksy::{UserAccount, Transfer as NftTransfer};
use anchor_lang::{AccountDeserialize, AnchorDeserialize};

#[program]
pub mod auction {
    use super::*;
    pub fn create_auction(ctx: Context<CreateAuction>, price: u64) -> ProgramResult{
        let auction = &mut ctx.accounts.auction;
        auction.ongoing = true;
        auction.seller = *ctx.accounts.seller.key;
        auction.bider = *ctx.accounts.seller.key;  // bider's init value is seller
        auction.nft_holder = *ctx.accounts.nft_holder.to_account_info().key;
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

#[account]
pub struct Auction {
    ongoing: bool,
    seller: Pubkey,
    bider: Pubkey,
    nft_holder: Pubkey,
    price: u64,
}