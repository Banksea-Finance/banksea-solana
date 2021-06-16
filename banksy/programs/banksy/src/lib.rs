use anchor_lang::prelude::*;

#[program]
pub mod banksy {
    use super::*;
    pub fn create(ctx: Context<CreateNft>, uri: [u8; 128], supply: u64) -> ProgramResult {
        ctx.accounts.nft.supply = supply;
        ctx.accounts.nft.uri = uri;

        ctx.accounts.owner.authority = *ctx.accounts.authority.key;
        ctx.accounts.owner.nft = *ctx.accounts.nft.to_account_info().key;
        ctx.accounts.owner.amount = supply;
        Ok(())
    }

}

#[derive(Accounts)]
pub struct CreateNft<'info> {
    #[account(init)]
    nft: ProgramAccount<'info, Nft>,
    #[account(init, associated = authority, with = nft)]
    owner: ProgramAccount<'info, Owner>,
    #[account(mut, signer)]
    authority: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}

#[account]
pub struct Nft {
    pub supply: u64,
    pub uri: [u8; 128],
}


#[associated]
pub struct Owner {
    pub authority: Pubkey,
    pub nft: Pubkey,
    pub amount: u64,
}
