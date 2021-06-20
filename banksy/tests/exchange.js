const anchor = require('@project-serum/anchor');
const assert = require("assert");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(TokenInstructions.TOKEN_PROGRAM_ID.toString());

describe("start exchange", () =>{

    const provider = anchor.Provider.local();
    anchor.setProvider(provider);
    const program = anchor.workspace.Exchange;
    const price = new anchor.BN(10);

    it("create a exchange", async() => {
        const {exchange, seller, itemHolder} = await createExchange(provider, program, price);

        const exchangeAccount = await program.account.exchange.fetch(exchange.publicKey);

        assert.ok(exchangeAccount.ongoing);
        assert.ok(exchangeAccount.seller.equals(seller.publicKey));
        assert.ok(exchangeAccount.itemHolder.equals(itemHolder));
    })
})

async function createExchange(provider, program, price) {
    const feePayerPubkey = provider.wallet.publicKey;

    let exchange = new anchor.web3.Account();
    let seller  = new anchor.web3.Account();

    let [pda] = await anchor.web3.PublicKey.findProgramAddress([seller.publicKey.toBuffer()], program.programId);
    let itemPublicKey = await createMint(provider, feePayerPubkey);
    let itemHolderPublicKey = await createTokenAccountWithBalance(provider, itemPublicKey, pda, 1);

    await program.rpc.createExcahnge(price, {
        accounts: {
            exchange: exchange.publicKey,
            seller: seller.publicKey,
            itemHolder: itemHolderPublicKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [exchange],
        instructions: [await program.account.exchange.createInstruction(exchange)],
    });

    return {
      exchange: exchange,
      seller: seller,
      itemHolder: itemHolderPublicKey,
    };
}

async function createTokenAccountWithBalance(provider, mintPubkey, owner, initBalance) {
    const tx = new anchor.web3.Transaction();
    const newAccountPubkey = new anchor.web3.Account();
    tx.add(
        ...(await createTokenAccountInstrs(provider, newAccountPubkey.publicKey, mintPubkey, owner)),
        TokenInstructions.mintTo({
            mint: mintPubkey,
            destination: newAccountPubkey.publicKey,
            amount: initBalance,
            mintAuthority: provider.wallet.publicKey,
        })
    );
    await provider.send(tx, [newAccountPubkey]);
    return newAccountPubkey.publicKey;
}

async function createTokenAccountInstrs(provider, newAccountPubkey, mint, owner, lamports) {
    if (lamports === undefined) {
      lamports = await provider.connection.getMinimumBalanceForRentExemption(165);
    }
    return [
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey,
        space: 165,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      TokenInstructions.initializeAccount({
        account: newAccountPubkey,
        mint,
        owner,
      }),
    ];
  }

async function createMint(provider, feePayerPubkey) {
    const mint = new anchor.web3.Account();
    const tx = new anchor.web3.Transaction();
    const instructions = await createMintInstructions(provider, feePayerPubkey, mint.publicKey);

    tx.add(...instructions);
    await provider.send(tx, [mint]);
    return mint.publicKey;
}

async function createMintInstructions(provider, authority, mint) {
    let instructions = [
      anchor.web3.SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: mint,
        space: 82,
        lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
        programId: TOKEN_PROGRAM_ID,
      }),
      TokenInstructions.initializeMint({
        mint,
        decimals: 0,
        mintAuthority: authority,
      }),
    ];
    return instructions;
  }

