use anchor_lang::prelude::*;
#[program]
pub mod banksy {
    use super::*;

    pub fn create_nft(ctx: Context<CreateNft>, uri: String , supply: u64) -> ProgramResult {

        ctx.accounts.nft.supply = supply;
        ctx.accounts.nft.uri = uri.clone();
        ctx.accounts.nft.authority = *ctx.accounts.authority.key;
        
        ctx.accounts.user.authority = *ctx.accounts.authority.key;
        ctx.accounts.user.nft = *ctx.accounts.nft.to_account_info().key;
        ctx.accounts.user.amount = supply;

        msg!("event: {{ name: CreateNftEvent, data: {{ nft:{:?}, supply:{:?}, uri:{:?} }} }}", *ctx.accounts.nft.to_account_info().key, supply, uri);
        emit!(CreateNftEvent{
            nft: *ctx.accounts.nft.to_account_info().key, 
            uri: uri, 
            supply: supply,
        }); 
        msg!(
            "event: {{ name: TransferEvent, data: {{ nft:{:?}, from:{:?}, to:{:?}, from_authority:{:?}, to_authority:{:?}, amount:{:?} }} }}",
            *ctx.accounts.nft.to_account_info().key, Pubkey::new(&[0u8; 32]), *ctx.accounts.user.to_account_info().key, Pubkey::new(&[0u8; 32]), ctx.accounts.user.authority, supply
        );
        
        emit!(TransferEvent{
            nft: *ctx.accounts.nft.to_account_info().key, 
            from: Pubkey::new(&[0u8; 32]), 
            to: *ctx.accounts.user.to_account_info().key, 
            from_authority: Pubkey::new(&[0u8; 32]), 
            to_authority: ctx.accounts.user.authority, 
            amount: supply
        });

        Ok(())
    }


    pub fn create_user(ctx: Context<CreateUser>) -> ProgramResult {
        ctx.accounts.user.authority = *ctx.accounts.authority.key;
        ctx.accounts.user.nft = *ctx.accounts.nft.to_account_info().key;
        ctx.accounts.user.amount = 0;
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

        msg!(
            "event: {{ name: TransferEvent, data: {{ nft:{:?}, from:{:?}, to:{:?}, from_authority:{:?}, to_authority:{:?}, amount:{:?} }} }}",
            ctx.accounts.from.nft, *ctx.accounts.from.to_account_info().key, *ctx.accounts.to.to_account_info().key, ctx.accounts.from.authority, ctx.accounts.to.authority, amount
        );

        emit!(TransferEvent{
            nft: ctx.accounts.from.nft, 
            from: *ctx.accounts.from.to_account_info().key, 
            to: *ctx.accounts.to.to_account_info().key, 
            from_authority: ctx.accounts.from.authority, 
            to_authority: ctx.accounts.to.authority, 
            amount: amount
        });
        Ok(())
    }

    /*pub fn approval(ctx: Context<Approval>, amount: u64) -> ProgramResult {
        ctx.accounts.to.delegate = *ctx.accounts.delegate.key;
        ctx.accounts.to.delegate_amount = amount;
        Ok(())
    }*/
}

#[derive(Accounts)]
pub struct CreateNft<'info> {
    #[account(init)]
    pub nft: ProgramAccount<'info, NftAccount>,
    #[account(signer)]
    pub authority: AccountInfo<'info>,
    #[account(init, associated = authority, with = nft, payer = payer)]
    pub user: ProgramAccount<'info, UserAccount>,
    #[account(signer)]
    pub payer: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
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
    pub uri: String,
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
    pub from_authority: Pubkey,
    pub to_authority: Pubkey,
    pub amount: u64,
}

#[event]
pub struct CreateNftEvent {
    pub nft: Pubkey,
    pub uri: String,
    pub supply: u64,
}

