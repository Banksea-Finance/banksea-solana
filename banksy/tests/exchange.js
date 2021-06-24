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
    const nftProgram = anchor.workspace.Banksy;

    it("create a exchange", async() => {
        const {exchange, seller, itemHolder, itemPublicKey, currencyPubkey} = await createExchange(provider, program, nftProgram, price);

        const exchangeAccount = await program.account.exchange.fetch(exchange.publicKey);
        const exchangeAccountItemHolder = await nftProgram.account.userAccount.fetch(exchangeAccount.itemHolder);

        assert.ok(exchangeAccount.ongoing);
        assert.ok(exchangeAccount.seller.equals(seller.publicKey));
        assert.ok(exchangeAccount.itemHolder.equals(itemHolder));
        assert.ok(exchangeAccountItemHolder.amount == 10);
        assert.ok(exchangeAccount.price == 10);
    });

    it("process exchange", async() => {
      const {exchange, seller, itemHolder,itemPublicKey, currencyPubkey} = await createExchange(provider, program, nftProgram, price);
      const {itemReceiver, currencyReceiver} = await processExchange(provider, program, nftProgram, exchange, seller, itemPublicKey, currencyPubkey);
      const exchangeAccount = await program.account.exchange.fetch(exchange.publicKey);
      const exchangeAccountItemHolder = await nftProgram.account.userAccount.fetch(exchangeAccount.itemHolder);
      const exchangeItemReceiver = await nftProgram.account.userAccount.fetch(itemReceiver);

      assert.ok(!exchangeAccount.ongoing);
      assert.ok(exchangeAccountItemHolder.amount == 0);
      assert.ok(exchangeItemReceiver.amount == 10);
      assert.ok((await serumCommon.getTokenAccount(provider, currencyReceiver)).amount == 10);
    })
})

async function processExchange(provider, program, nftProgram, exchange, seller, itemPublicKey, currencyPubkey) {
  let buyer = new anchor.web3.Account();
  const feePayerPubkey = provider.wallet.publicKey;
  let from = await createTokenAccountWithBalance(provider, currencyPubkey, buyer.publicKey, 100);
  let fromAuth = buyer.publicKey;
  const exchangeAccount = await program.account.exchange.fetch(exchange.publicKey);
  let [pda] = await anchor.web3.PublicKey.findProgramAddress([exchangeAccount.seller.toBuffer()], program.programId);
  const nftAuth = nftProgram.provider.wallet.publicKey;
  let itemReceiver = await createUser(nftProgram, nftAuth, itemPublicKey);
  //let itemReceiver = await createTokenAccountWithBalance(provider, itemPublicKey, buyer.publicKey, 0);

  let currencyReceiver = await createTokenAccountWithBalance(provider, currencyPubkey, seller.publicKey, 0);
  

  await program.rpc.processExchange({
    accounts: {
      exchange: exchange.publicKey,
      seller: seller.publicKey,
      buyer: buyer.publicKey,
      from: from,
      fromAuth: fromAuth,
      itemHolder: exchangeAccount.itemHolder,
      itemHolderAuth: nftAuth,
      itemReceiver: itemReceiver,
      currencyReceiver: currencyReceiver,
      tokenProgram: TOKEN_PROGRAM_ID,
      nftProgram: nftProgram.programId,
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

async function createExchange(provider, program, nftProgram, price) {
    const feePayerPubkey = provider.wallet.publicKey;
    const nftAuth = nftProgram.provider.wallet.publicKey;
    const uri = "ipfs://ipfs/QmVLAo3EQvkkQKjLTt1dawYsehSEnwYBi19vzh85pohpuw";
    const supply = new anchor.BN(100);

    let exchange = new anchor.web3.Account();
    let seller  = new anchor.web3.Account();
    let [pda] = await anchor.web3.PublicKey.findProgramAddress([seller.publicKey.toBuffer()], program.programId);
    //let itemPublicKey = await createMint(provider, feePayerPubkey);
    //let itemHolderPublicKey = await createTokenAccountWithBalance(provider, itemPublicKey, pda, 1);
    let itemPublicKey = await createNft(nftProgram, nftAuth, uri, supply);
    let itemHolderPublicKey = await createUser(nftProgram, nftAuth, itemPublicKey);
    let amount = new anchor.BN(10);
    await distTo(nftProgram, itemHolderPublicKey, nftAuth, itemPublicKey, amount);
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

async function createUser(nftProgram, authority, nft) {
  const userKey = anchor.web3.Keypair.generate();
  await nftProgram.rpc.createUser({
    accounts: {
      nft: nft,
      user: userKey.publicKey,
      authority: authority,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    signers: [userKey],
    instructions: [await nftProgram.account.userAccount.createInstruction(userKey)],
  });

  return userKey.publicKey;

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

  async function createNft(program, authority, uri, supply) {
    const nftKey = anchor.web3.Keypair.generate();
  
    // create a nft to a account
    await program.rpc.createNft(str2Bytes(uri), supply, {
      accounts: {
        nft: nftKey.publicKey,
        authority: authority,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [nftKey],
      instructions: [await program.account.nftAccount.createInstruction(nftKey)],
    });
  
    return nftKey.publicKey;
  }


  async function distTo(program, user, authority, nft, amount) {

    await program.rpc.distTo(amount, {
      accounts: {
        nft: nft,
        user: user,
        authority: authority,
      },
    });
  
  }

  function str2Bytes(str) {
    var bytes = new Array(128).fill(0);
    for (let index = 0; index < str.length; index++) {
      bytes[index] = str.charCodeAt(index);
      
    }
    return bytes;
  }
  
  function bytes2Str(bytes) {
    var str = new String();
    for (let index = 0; index < bytes.length && bytes[index] != 0; index++) {
      str += String.fromCharCode(bytes[index]);
    }
    return str;
  }

