use anchor_lang::prelude::*;

#[program]
pub mod banksy {
    use super::*;
    pub fn create_nft(ctx: Context<CreateNft>, uri: [u8; 128], supply: u64) -> ProgramResult {
        ctx.accounts.nft.supply = supply;
        ctx.accounts.nft.uri = uri;
        ctx.accounts.nft.remain = supply;
        ctx.accounts.nft.authority = *ctx.accounts.authority.key;
        emit!(CreateNftEvent{
            nft: *ctx.accounts.nft.to_account_info().key, 
            uri: uri, 
            supply: supply,
        }); 
        Ok(())
    }


    pub fn create_user(ctx: Context<CreateUser>) -> ProgramResult {
        ctx.accounts.user.authority = *ctx.accounts.authority.key;
        ctx.accounts.user.nft = *ctx.accounts.nft.to_account_info().key;
        ctx.accounts.user.amount = 0;
        Ok(())
    }

    pub fn dist_to(ctx: Context<DistTo>, amount: u64) -> ProgramResult {
        ctx.accounts.nft.remain = ctx.accounts.nft.remain.checked_sub(amount).unwrap();
        ctx.accounts.user.amount = ctx.accounts.user.amount.checked_add(amount).unwrap();
        emit!(TransferEvent{
            nft: *ctx.accounts.nft.to_account_info().key, 
            from: Pubkey::new(&[0u8; 32]), 
            to: *ctx.accounts.user.to_account_info().key, 
            amount: amount
        });
        Ok(())
    }

    pub fn transfer(ctx: Context<Transfer>, amount: u64) -> ProgramResult {
        let authority = *ctx.accounts.authority.key;

        if ctx.accounts.from.nft != ctx.accounts.to.nft {
            panic!("transfer account's nft is not match");
        }

        if  (ctx.accounts.from.delegate == authority) && (ctx.accounts.from.delegate_amount > amount) {
            ctx.accounts.from.amount = ctx.accounts.from.delegate_amount.checked_sub(amount).unwrap();
        } else if ctx.accounts.from.authority != authority {
            panic!("transfer account's authority is not match");
        }

        ctx.accounts.from.amount = ctx.accounts.from.amount.checked_sub(amount).unwrap();
        ctx.accounts.to.amount = ctx.accounts.to.amount.checked_add(amount).unwrap();
        emit!(TransferEvent{
            nft: ctx.accounts.from.nft, 
            from: *ctx.accounts.from.to_account_info().key, 
            to: *ctx.accounts.to.to_account_info().key, 
            amount: amount
        });
        Ok(())
    }

    pub fn approval(ctx: Context<Approval>, amount: u64) -> ProgramResult {
        ctx.accounts.to.delegate = *ctx.accounts.delegate.key;
        ctx.accounts.to.delegate_amount = amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateNft<'info> {
    #[account(init)]
    pub nft: ProgramAccount<'info, NftAccount>,
    #[account(signer)]
    pub authority: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct DistTo<'info> {
    #[account(signer)]
    pub authority: AccountInfo<'info>,
    #[account(mut, has_one = authority)]
    pub nft: ProgramAccount<'info, NftAccount>,
    #[account(mut, has_one = nft)]
    pub user: ProgramAccount<'info, UserAccount>,
    
}


#[derive(Accounts)]
pub struct CreateUser<'info> {
    #[account(init, associated = authority, with = nft, payer = payer)]
    pub user: ProgramAccount<'info, UserAccount>,
    pub nft: ProgramAccount<'info, NftAccount>,
    pub authority: AccountInfo<'info>,
    #[account(signer)]
    pub payer: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Transfer<'info> {
    #[account(mut, has_one = authority)]
    pub from: ProgramAccount<'info, UserAccount>,
    #[account(mut)]
    pub to: ProgramAccount<'info, UserAccount>,
    #[account(signer)]
    pub authority: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Approval<'info> {
    #[account(mut, has_one = authority)]
    pub to: ProgramAccount<'info, UserAccount>,
    pub delegate: AccountInfo<'info>,
    #[account(signer)]
    pub authority: AccountInfo<'info>,
}

#[account]
pub struct NftAccount {
    pub supply: u64,
    pub remain: u64,
    pub uri: [u8; 128],
    pub authority: Pubkey,
}

#[associated]
#[derive(Default)]
pub struct UserAccount {
    pub authority: Pubkey,
    pub nft: Pubkey,
    pub amount: u64,
    pub delegate: Pubkey,
    pub delegate_amount: u64,
}

#[event]
pub struct TransferEvent {
    pub nft: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CreateNftEvent {
    pub nft: Pubkey,
    pub uri: [u8; 128],
    pub supply: u64,
}

