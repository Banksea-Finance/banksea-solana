const anchor = require('@project-serum/anchor');
const assert = require("assert");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const serumCommon = require("@project-serum/common");
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(TokenInstructions.TOKEN_PROGRAM_ID.toString());

describe("exchange process", () =>{

    const provider = anchor.Provider.local();
    anchor.setProvider(provider);

    const price = 10;
    const nftExchangeAmount = 1;
    const exchangeProgram = anchor.workspace.Exchange;
    const nftProgram = anchor.workspace.Banksy;

    let seller  = anchor.web3.Keypair.generate();
    let buyer  = anchor.web3.Keypair.generate();


    let exchange = null;
    it("create a exchange", async() => {
      
      const uri = "ipfs://ipfs/QmVLAo3EQvkkQKjLTt1dawYsehSEnwYBi19vzh85pohpuw";
      const supply = new anchor.BN(100);
      const nft = await createNftAccount(nftProgram, uri, supply, seller); // create NFT
      const token = await createMint(provider, provider.wallet.publicKey); // create token

      exchange = await createExchange(provider, exchangeProgram, nftProgram, seller, nft, nftExchangeAmount, token, price); // exchange nft to token
      
      // check result
      const exchangeAccount = await exchangeProgram.account.exchange.fetch(exchange); // get exchange data
      const nftHolderAccount = await nftProgram.account.userAccount.fetch(exchangeAccount.itemHolder); // get nft user data
      const nftAccount = await nftProgram.account.nftAccount.fetch(exchangeAccount.item); // get nft data
      
      
      assert.ok(exchangeAccount.ongoing); // check if the exchange is ongoing
      assert.ok(nftAccount.uri == uri); // check the nft uri
      assert.ok(nftAccount.supply.toNumber() == supply); // check the nft supply
      assert.ok(nftHolderAccount.amount.toNumber() == nftExchangeAmount); // check the amount of nft on this exchange
      assert.ok(exchangeAccount.seller.equals(seller.publicKey)); // check seller
      assert.ok(exchangeAccount.currency.equals(token)); // check token type on this exchange
      assert.ok(exchangeAccount.price.toNumber() == price); // check amount of the token on this exchange

    });

    it("process exchange", async() => {

      let exchangeAccount = await exchangeProgram.account.exchange.fetch(exchange); // get exchange data
      let currencyHolder = await createTokenAccountWithBalance(provider, exchangeAccount.currency, buyer.publicKey, 100); // airdrop some test token to buyer's account
      let currencyHolderAuth = buyer.publicKey;
      let itemReceiver = await findUserAccount(nftProgram, buyer.publicKey, exchangeAccount.item);
      
      await processExchange(provider, exchangeProgram, nftProgram, exchange, buyer, currencyHolder, currencyHolderAuth, itemReceiver);
      
      
      exchangeAccount = await exchangeProgram.account.exchange.fetch(exchange); // get exchange data
      const nftHolderAccount = await nftProgram.account.userAccount.fetch(exchangeAccount.itemHolder); // get nft seller account
      const nftReciverAccount = await nftProgram.account.userAccount.fetch(itemReceiver); // get nft buyer account

      assert.ok(!exchangeAccount.ongoing); // check if the exchange is finished
      assert.ok(nftHolderAccount.amount.toNumber() == 0); // check if the nft is transfered
      assert.ok(nftReciverAccount.amount.toNumber() == nftExchangeAmount); // check if the nft is transfered
      assert.ok((await serumCommon.getTokenAccount(provider, exchangeAccount.currencyReceiver)).amount == 10); // check if the token is transfered

    })
})

async function processExchange(provider, exchangeProgram, nftProgram, exchange, buyer, currencyHolder, currencyHolderAuth, itemReceiver) {
  
  const exchangeAccount = await exchangeProgram.account.exchange.fetch(exchange); // get exchange data
  let [sellerPda] = await anchor.web3.PublicKey.findProgramAddress([exchangeAccount.item.toBuffer(), exchangeAccount.seller.toBuffer()], exchangeProgram.programId);
    
  await exchangeProgram.rpc.processExchange({
    accounts: {
      exchange: exchange,
      seller: exchangeAccount.seller,
      buyer: buyer.publicKey,
      currencyHolder: currencyHolder,
      currencyHolderAuth: currencyHolderAuth,
      itemHolder: exchangeAccount.itemHolder,
      itemHolderAuth: sellerPda,
      itemReceiver: itemReceiver,
      currencyReceiver: exchangeAccount.currencyReceiver,
      tokenProgram: TOKEN_PROGRAM_ID,
      nftProgram: nftProgram.programId,
    },
    signers: [buyer],
  });


}

async function createTokenAccount(provider, mint, owner) {
  const vault = new anchor.web3.Account();
  const tx = new anchor.web3.Transaction();
  tx.add(...(await createTokenAccountInstrs(provider, vault.publicKey, mint, owner)));
  await provider.send(tx, [vault]);
  return vault.publicKey;
}

async function createExchange(provider, exchangeProgram, nftProgram, seller, item, itemAmount, currency, currencyAmount) {
    let exchange = anchor.web3.Keypair.generate();

    // prepare pda to save the item before the exchange finished
    let [sellerPda] = await anchor.web3.PublicKey.findProgramAddress([item.toBuffer(), seller.publicKey.toBuffer()], exchangeProgram.programId);
    let itemHolder = await findUserAccount(nftProgram, sellerPda, item);
  
    await transferNft(nftProgram, item, seller, sellerPda, new anchor.BN(itemAmount));
    
    let currencyReceiver = await createTokenAccount(provider, currency, seller.publicKey);

    await exchangeProgram.rpc.createExchange(new anchor.BN(currencyAmount), {
        accounts: {
            exchange: exchange.publicKey,
            seller: seller.publicKey,
            item: item,
            currency: currency,
            itemHolder: itemHolder,
            currencyReceiver: currencyReceiver,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [exchange, seller],
        instructions: [await exchangeProgram.account.exchange.createInstruction(exchange)],
    });

    return exchange.publicKey;
}

async function findUserAccount(program, userPublicKey, nftAccount) {
  // create a user account
  const associatedToken = await program.account.userAccount.associatedAddress(userPublicKey, nftAccount);
  const accountInfo = await program.provider.connection.getAccountInfo(associatedToken);

  if(accountInfo == null) {
    await program.rpc.createUser({
      accounts: {
        nft: nftAccount,
        payer: program.provider.wallet.publicKey,
        user: associatedToken,
        authority: userPublicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
    });
  }

  return associatedToken;
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

async function createNftAccount(program, uri, supply, userKey) {
  const nftKey = anchor.web3.Keypair.generate();
  const userAccount = await program.account.userAccount.associatedAddress(userKey.publicKey, nftKey.publicKey);
  // create a nft to a account
  await program.rpc.createNft(uri, supply, {
    accounts: {
      nft: nftKey.publicKey,
      authority: userKey.publicKey,
      user: userAccount,
      payer: program.provider.wallet.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    signers: [nftKey, userKey],
    instructions: [await program.account.nftAccount.createInstruction(nftKey, 256)],
  });

  return nftKey.publicKey;
}

async function transferNft(program, nftAccount, user1Wallet, user2PublicKey, amount) {
  const user1Account = await findUserAccount(program, user1Wallet.publicKey, nftAccount);
  const user2Account = await findUserAccount(program, user2PublicKey, nftAccount);
  await program.rpc.transfer(amount, {
    accounts: {
      from: user1Account,
      to: user2Account,
      authority: user1Wallet.publicKey,
    },
    signers: [user1Wallet]
  });

}



