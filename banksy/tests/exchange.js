const anchor = require('@project-serum/anchor');
const assert = require("assert");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const serumCommon = require("@project-serum/common");
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(TokenInstructions.TOKEN_PROGRAM_ID.toString());

describe("start exchange", () =>{

    const provider = anchor.Provider.local();
    anchor.setProvider(provider);
    const program = anchor.workspace.Exchange;
    const price = new anchor.BN(10);

    it("create a exchange", async() => {
        const {exchange, seller, itemHolder, itemPublicKey, currencyPubkey} = await createExchange(provider, program, price);

        const exchangeAccount = await program.account.exchange.fetch(exchange.publicKey);

        assert.ok(exchangeAccount.ongoing);
        assert.ok(exchangeAccount.seller.equals(seller.publicKey));
        assert.ok(exchangeAccount.itemHolder.equals(itemHolder));
    });

    /*it("close a auction which no one bid", async () => {
      const {exchange, seller, itemHolder, itemPublicKey, currencyPubkey} = await createExchange(provider, program, price);
  
      let itemReceiver = await createTokenAccountWithBalance(provider, itemPublicKey, seller.publicKey, 0);
      let currencyReceiver = await createTokenAccountWithBalance(provider, currencyPubkey, seller.publicKey, 0);
  
      let exchangeAccount = await program.account.exchange.fetch(exchange.publicKey);
      let [pda] = await anchor.web3.PublicKey.findProgramAddress([exchangeAccount.seller.toBuffer()], program.programId);
      let currencyHolder = exchangeAccount.currencyHolder;
      await program.rpc.closeAuction({
        accounts: {
          exchange: exchange.publicKey,
          seller: seller.publicKey,
          itemHolder: itemHolder,
          itemHolderAuth: pda,
          itemReceiver: itemReceiver,
          currencyHolder: currencyHolder,
          currencyHolderAuth: pda,
          currencyReceiver: currencyReceiver,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [seller],
      });
  
      exchangeAccount2 = await program.account.exchange.fetch(exchange.publicKey);
      assert.ok(!exchangeAccount2.ongoing);
    });*/

    it("process exchange", async() => {
      const {exchange, seller, itemHolder,itemPublicKey, currencyPubkey} = await createExchange(provider, program, price);
      const {itemReceiver, currencyReceiver} = await processExchange(provider, program, exchange, seller, itemPublicKey, currencyPubkey);
      const exchangeAccount = await program.account.exchange.fetch(exchange.publicKey);

      assert.ok(!exchangeAccount.ongoing);
      assert.ok((await serumCommon.getTokenAccount(provider, itemHolder)).amount == 0);
      assert.ok((await serumCommon.getTokenAccount(provider, itemReceiver)).amount == 1);
      assert.ok((await serumCommon.getTokenAccount(provider, currencyReceiver)).amount == 10);
    })
})

async function processExchange(provider, program, exchange, seller, itemPublicKey, currencyPubkey) {
  let buyer = new anchor.web3.Account();
  const feePayerPubkey = provider.wallet.publicKey;

  let from = await createTokenAccountWithBalance(provider, currencyPubkey, buyer.publicKey, 100);
  let fromAuth = buyer.publicKey;
  const exchangeAccount = await program.account.exchange.fetch(exchange.publicKey);
  let [pda] = await anchor.web3.PublicKey.findProgramAddress([exchangeAccount.seller.toBuffer()], program.programId);
  let itemReceiver = await createTokenAccountWithBalance(provider, itemPublicKey, buyer.publicKey, 0);
  let currencyReceiver = await createTokenAccountWithBalance(provider, currencyPubkey, seller.publicKey, 0);
  

  await program.rpc.processExchange({
    accounts: {
      exchange: exchange.publicKey,
      seller: seller.publicKey,
      buyer: buyer.publicKey,
      from: from,
      fromAuth: fromAuth,
      itemHolder: exchangeAccount.itemHolder,
      itemHolderAuth: pda,
      itemReceiver: itemReceiver,
      /*currencyHolder: exchangeAccount.currencyHolder,
      currencyHolderAuth: pda,*/
      currencyReceiver: currencyReceiver,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    signers: [buyer, seller],
  });

  return {
    itemReceiver,
    currencyReceiver,
  };
}

async function createTokenAccount(provider, mint, owner) {
  const vault = new anchor.web3.Account();
  const tx = new anchor.web3.Transaction();
  tx.add(...(await createTokenAccountInstrs(provider, vault.publicKey, mint, owner)));
  await provider.send(tx, [vault]);
  return vault.publicKey;
}

async function createExchange(provider, program, price) {
    const feePayerPubkey = provider.wallet.publicKey;

    let exchange = new anchor.web3.Account();
    let seller  = new anchor.web3.Account();

    let [pda] = await anchor.web3.PublicKey.findProgramAddress([seller.publicKey.toBuffer()], program.programId);
    let itemPublicKey = await createMint(provider, feePayerPubkey);
    let itemHolderPublicKey = await createTokenAccountWithBalance(provider, itemPublicKey, pda, 1);
    let currencyPubkey = await createMint(provider, feePayerPubkey);
    let currencyHolderPubkey = await createTokenAccount(provider, currencyPubkey, pda);

    await program.rpc.createExcahnge(price, {
        accounts: {
            exchange: exchange.publicKey,
            seller: seller.publicKey,
            itemHolder: itemHolderPublicKey,
            currencyHolder: currencyHolderPubkey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [exchange],
        instructions: [await program.account.exchange.createInstruction(exchange)],
    });

    return {
      exchange: exchange,
      seller: seller,    
      itemHolder: itemHolderPublicKey,
      itemPublicKey: itemPublicKey,
      currencyPubkey: currencyPubkey,
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

