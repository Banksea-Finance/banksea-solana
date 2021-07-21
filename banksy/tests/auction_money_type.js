const anchor = require('@project-serum/anchor');
const assert = require("assert");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const serumCommon = require("@project-serum/common");
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(TokenInstructions.TOKEN_PROGRAM_ID.toString());

describe("start Auction", () =>{

    const provider = anchor.Provider.local();
    anchor.setProvider(provider);
    const auctionProgram = anchor.workspace.Auction;
    const price = new anchor.BN(10);
    const nftProgram = anchor.workspace.Banksy;

    it("create a auction", async() => {
        const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);

        const auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);

        assert.ok(auctionAccount.ongoing);
        assert.ok(auctionAccount.noBid);
        assert.ok(auctionAccount.seller.equals(seller.publicKey));
        assert.ok(auctionAccount.bider.equals(seller.publicKey));
        assert.ok(auctionAccount.nftHolder.equals(nftHolder));
        const auctionNftHolder = await nftProgram.account.userAccount.fetch(auctionAccount.nftHolder);
        assert.ok(auctionNftHolder.amount == 10);
        assert.ok(auctionAccount.price == 10);
        assert.ok(auctionAccount.moneyType.equals(moneyPubkey));
    });  

    it("bid once (>price && right money_type)", async() => {
      const bidPrice = new anchor.BN(11);
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      const {biderMoneyAccount, pdaMoneyAccount, bider} = await bidOnce(provider, auctionProgram, auction, moneyPubkey, bidPrice);

      const auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
      assert.ok(auctionAccount.ongoing);
      assert.ok(!auctionAccount.noBid);
      assert.ok(auctionAccount.bider.equals(bider.publicKey));
      assert.ok(auctionAccount.moneyRefund.equals(biderMoneyAccount));
      const biderMoneyNum = (await serumCommon.getTokenAccount(provider, biderMoneyAccount)).amount;
      const pdaMoneyNum = (await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount;
      //console.log(biderMoneyNum);
      assert.ok(biderMoneyNum == 89);
      assert.ok(pdaMoneyNum == 11);
    });

    it("bid once (>price && wrong money_type)", async() => {
      const bidPrice = new anchor.BN(11);
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      let feePayerPubkey = provider.wallet.publicKey;
      let moneyPubkey2 = await createMint(provider, feePayerPubkey);
      const {biderMoneyAccount, pdaMoneyAccount, bider} = await bidOnce(provider, auctionProgram, auction, moneyPubkey2, bidPrice);
      
      const auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
      assert.ok(auctionAccount.ongoing);
      assert.ok(auctionAccount.noBid);
      assert.ok(auctionAccount.bider.equals(seller.publicKey));
      //assert.ok(auctionAccount.moneyRefund.equals(biderMoneyAccount));
      const biderMoneyNum = (await serumCommon.getTokenAccount(provider, biderMoneyAccount)).amount;
      const pdaMoneyNum = (await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount;
      //console.log(biderMoneyNum);
      assert.ok(biderMoneyNum == 100);
      assert.ok(pdaMoneyNum == 0);
    });

    it("bid once (==price && right money_type)", async() => {
      const bidPrice = new anchor.BN(10);
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      const {biderMoneyAccount, pdaMoneyAccount, bider} = await bidOnce(provider, auctionProgram, auction, moneyPubkey, bidPrice);

      const auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
      assert.ok(auctionAccount.ongoing);
      assert.ok(!auctionAccount.noBid);
      assert.ok(auctionAccount.bider.equals(bider.publicKey));
      assert.ok(auctionAccount.moneyRefund.equals(biderMoneyAccount));
      const biderMoneyNum = (await serumCommon.getTokenAccount(provider, biderMoneyAccount)).amount;
      const pdaMoneyNum = (await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount;
      //console.log(biderMoneyNum);
      assert.ok(biderMoneyNum == 90);
      assert.ok(pdaMoneyNum == 10);
    });

    it("bid once (<price && right money_type)", async() => {
      const bidPrice = new anchor.BN(9);
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      let feePayerPubkey = provider.wallet.publicKey;
      let moneyPubkey2 = await createMint(provider, feePayerPubkey);
      const {biderMoneyAccount, pdaMoneyAccount, bider} = await bidOnce(provider, auctionProgram, auction, moneyPubkey2, bidPrice);
      
      const auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
      assert.ok(auctionAccount.ongoing);
      assert.ok(auctionAccount.noBid);
      assert.ok(auctionAccount.bider.equals(seller.publicKey));
      //assert.ok(auctionAccount.moneyRefund.equals(biderMoneyAccount));
      const biderMoneyNum = (await serumCommon.getTokenAccount(provider, biderMoneyAccount)).amount;
      const pdaMoneyNum = (await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount;
      //console.log(biderMoneyNum);
      assert.ok(biderMoneyNum == 100);
      assert.ok(pdaMoneyNum == 0);
    });

    it("bid twice (second > first)", async() => {
      const firstPrice = new anchor.BN(11);
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      let {biderMoneyAccount, pdaMoneyAccount, bider} = await bidOnce(provider, auctionProgram, auction, moneyPubkey, firstPrice);
      const biderMoneyAccount1 = biderMoneyAccount;
      const bider1 = bider;

      {
        const secondPrice = new anchor.BN(15);
        let bider2 = new anchor.web3.Account();
        let biderMoneyAccount = await createTokenAccountWithBalance(provider, moneyPubkey, bider2.publicKey, 100);
        let auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
        let [pda] = await anchor.web3.PublicKey.findProgramAddress([auctionAccount.seller.toBuffer()], auctionProgram.programId);
  
        await auctionProgram.rpc.processBid(secondPrice, {
          accounts: {
            auction: auction.publicKey,
            bider: bider2.publicKey,
            moneyType: moneyPubkey,
            from: biderMoneyAccount,
            fromAuth: bider2.publicKey,
            moneyHolder: pdaMoneyAccount,
            moneyHolderAuth: pda,
            oriMoneyRefund: biderMoneyAccount1,
            moneyProgram: TOKEN_PROGRAM_ID,
          },
          signers: [bider2],
        });

        const biderMoneyAccount2 = biderMoneyAccount;
        

        auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
        assert.ok(auctionAccount.ongoing);
        assert.ok(!auctionAccount.noBid);
        assert.ok(auctionAccount.bider.equals(bider2.publicKey));
        assert.ok(auctionAccount.moneyRefund.equals(biderMoneyAccount2));
        assert.ok((await serumCommon.getTokenAccount(provider, biderMoneyAccount1)).amount == 100);
        assert.ok((await serumCommon.getTokenAccount(provider, biderMoneyAccount2)).amount == 85);
        assert.ok((await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount == 15);
      }      
    });

    it("bid twice (second == first)", async() => {
      const firstPrice = new anchor.BN(11);
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      let {biderMoneyAccount, pdaMoneyAccount, bider} = await bidOnce(provider, auctionProgram, auction, moneyPubkey, firstPrice);
      const biderMoneyAccount1 = biderMoneyAccount;
      const bider1 = bider;

      {
        const secondPrice = new anchor.BN(11);
        let bider2 = new anchor.web3.Account();
        let biderMoneyAccount = await createTokenAccountWithBalance(provider, moneyPubkey, bider2.publicKey, 100);
        let auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
        let [pda] = await anchor.web3.PublicKey.findProgramAddress([auctionAccount.seller.toBuffer()], auctionProgram.programId);
  
        try{
          await auctionProgram.rpc.processBid(secondPrice, {
            accounts: {
              auction: auction.publicKey,
              bider: bider2.publicKey,
              moneyType: moneyPubkey,
              from: biderMoneyAccount,
              fromAuth: bider2.publicKey,
              moneyHolder: pdaMoneyAccount,
              moneyHolderAuth: pda,
              oriMoneyRefund: biderMoneyAccount1,
              moneyProgram: TOKEN_PROGRAM_ID,
            },
            signers: [bider2],
          });
        }
        catch (error) {
          console.log("expected Error");
        }        

        const biderMoneyAccount2 = biderMoneyAccount;        

        auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
        assert.ok(auctionAccount.ongoing);
        assert.ok(!auctionAccount.noBid);
        assert.ok(auctionAccount.bider.equals(bider1.publicKey));
        assert.ok(auctionAccount.moneyRefund.equals(biderMoneyAccount1));
        assert.ok((await serumCommon.getTokenAccount(provider, biderMoneyAccount1)).amount == 89);
        assert.ok((await serumCommon.getTokenAccount(provider, biderMoneyAccount2)).amount == 100);
        assert.ok((await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount == 11);
      }      
    });

    it("bid twice (second < first)", async() => {
      const firstPrice = new anchor.BN(11);
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      let {biderMoneyAccount, pdaMoneyAccount, bider} = await bidOnce(provider, auctionProgram, auction, moneyPubkey, firstPrice);
      const biderMoneyAccount1 = biderMoneyAccount;
      const bider1 = bider;

      {
        const secondPrice = new anchor.BN(10);
        let bider2 = new anchor.web3.Account();
        let biderMoneyAccount = await createTokenAccountWithBalance(provider, moneyPubkey, bider2.publicKey, 100);
        let auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
        let [pda] = await anchor.web3.PublicKey.findProgramAddress([auctionAccount.seller.toBuffer()], auctionProgram.programId);
  
        try{
          await auctionProgram.rpc.processBid(secondPrice, {
            accounts: {
              auction: auction.publicKey,
              bider: bider2.publicKey,
              moneyType: moneyPubkey,
              from: biderMoneyAccount,
              fromAuth: bider2.publicKey,
              moneyHolder: pdaMoneyAccount,
              moneyHolderAuth: pda,
              oriMoneyRefund: biderMoneyAccount1,
              moneyProgram: TOKEN_PROGRAM_ID,
            },
            signers: [bider2],
          });
        }
        catch (error) {
          console.log("expected Error");
        }    

        const biderMoneyAccount2 = biderMoneyAccount;
        

        auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
        assert.ok(auctionAccount.ongoing);
        assert.ok(!auctionAccount.noBid);
        assert.ok(auctionAccount.bider.equals(bider1.publicKey));
        assert.ok(auctionAccount.moneyRefund.equals(biderMoneyAccount1));
        assert.ok((await serumCommon.getTokenAccount(provider, biderMoneyAccount1)).amount == 89);
        assert.ok((await serumCommon.getTokenAccount(provider, biderMoneyAccount2)).amount == 100);
        assert.ok((await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount == 11);
      }      
    });

    it("close auction", async() => {
      const bidPrice = new anchor.BN(11);
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      const {biderMoneyAccount, pdaMoneyAccount, bider} = await bidOnce(provider, auctionProgram, auction, moneyPubkey, bidPrice);

      let {sellerMoneyAccount, biderNftAccount} = await closeAuction(provider, auctionProgram, auction, pdaMoneyAccount, moneyPubkey, seller, nftHolder, bider, nftPubkey, nftProgram);

      let auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
      assert.ok(!auctionAccount.ongoing);
      assert.ok((await serumCommon.getTokenAccount(provider, sellerMoneyAccount)).amount == 11);
      assert.ok((await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount == 0);      
      const biderNftAccount2 = await nftProgram.account.userAccount.fetch(biderNftAccount);
      assert.ok(biderNftAccount2.amount == 10);
      const nftHolder2 = await nftProgram.account.userAccount.fetch(nftHolder);
      assert.ok(nftHolder2.amount == 0);
    })

    it("close auction without a bid", async() => {
      const {auction, seller, nftHolder, nftPubkey, moneyPubkey} = await createAuction(provider, auctionProgram, nftProgram, price);
      //let feePayerPubkey = provider.wallet.publicKey;
      //let moneyPubkey = await createMint(provider, feePayerPubkey);
      let [pda] = await anchor.web3.PublicKey.findProgramAddress([seller.publicKey.toBuffer()], auctionProgram.programId);
      let pdaMoneyAccount = await createTokenAccountWithBalance(provider, moneyPubkey, pda, 0);
      let sellerMoneyAccount = await createTokenAccount(provider, moneyPubkey, seller.publicKey);
      let sellerNftAccount = await findUserAccount(nftProgram, seller.publicKey, nftPubkey);

      await auctionProgram.rpc.closeAuction({
        accounts: {
          auction: auction.publicKey,
          seller: seller.publicKey,
          moneyHolder: pdaMoneyAccount,
          moneyHolderAuth: pda,
          moneyReceiver: sellerMoneyAccount,
          nftHolder: nftHolder,
          nftHolderAuth: pda,
          nftReceiver: sellerNftAccount,
          moneyProgram: TOKEN_PROGRAM_ID,
          nftProgram: nftProgram.programId,
        },
        signers: [seller],
      });

      let auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);

      assert.ok(!auctionAccount.ongoing);
      assert.ok(auctionAccount.noBid);
      const nftHolder2 = await nftProgram.account.userAccount.fetch(nftHolder);
      assert.ok(nftHolder2.amount == 0);
      const sellerNftAccount2 = await nftProgram.account.userAccount.fetch(sellerNftAccount);
      //console.log(sellerNftAccount2.amount);
      assert.ok(sellerNftAccount2.amount == 100);
      assert.ok((await serumCommon.getTokenAccount(provider, pdaMoneyAccount)).amount == 0);
      assert.ok((await serumCommon.getTokenAccount(provider, sellerMoneyAccount)).amount == 0);
    });
})

async function closeAuction(provider, auctionProgram, auction, pdaMoneyAccount, moneyPubkey, seller, nftHolder, bider, nftPubkey, nftProgram) {
  let auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
  let [pda] = await anchor.web3.PublicKey.findProgramAddress([auctionAccount.seller.toBuffer()], auctionProgram.programId);
  let sellerMoneyAccount = await createTokenAccount(provider, moneyPubkey, seller.publicKey);
  let biderNftAccount = await findUserAccount(nftProgram, bider.publicKey, nftPubkey);
  await auctionProgram.rpc.closeAuction({
    accounts: {
      auction: auction.publicKey,
      seller: seller.publicKey,
      moneyHolder: pdaMoneyAccount,
      moneyHolderAuth: pda, 
      moneyReceiver:sellerMoneyAccount,
      nftHolder: nftHolder,
      nftHolderAuth: pda,
      nftReceiver: biderNftAccount,
      moneyProgram: TOKEN_PROGRAM_ID,
      nftProgram: nftProgram.programId,
    },
    signers: [seller],
  });

  return {
    sellerMoneyAccount,
    biderNftAccount,
  }
}

async function bidOnce(provider, auctionProgram, auction, moneyPubkey, bidPrice) {
  let bider = new anchor.web3.Account();
  let biderMoneyAccount = await createTokenAccountWithBalance(provider, moneyPubkey, bider.publicKey, 100);
  let auctionAccount = await auctionProgram.account.auction.fetch(auction.publicKey);
  let [pda] = await anchor.web3.PublicKey.findProgramAddress([auctionAccount.seller.toBuffer()], auctionProgram.programId);
  let pdaMoneyAccount = await createTokenAccount(provider, moneyPubkey, pda);
  
  try {
    await auctionProgram.rpc.processBid(bidPrice, {
      accounts: {
        auction: auction.publicKey,
        bider: bider.publicKey,
        moneyType: moneyPubkey,
        from: biderMoneyAccount,
        fromAuth: bider.publicKey,
        moneyHolder: pdaMoneyAccount,
        moneyHolderAuth: pda,
        oriMoneyRefund: biderMoneyAccount,
        moneyProgram: TOKEN_PROGRAM_ID,
      },
      signers: [bider],
    });
  }
  catch (err) {
    console.log("Error");
  }  

  return {
    biderMoneyAccount,
    pdaMoneyAccount,
    bider,
  };
}

async function createAuction(provider, program, nftProgram, price) {
  let auction = new anchor.web3.Account();
  let seller = new anchor.web3.Account();
  let [pda] = await anchor.web3.PublicKey.findProgramAddress([seller.publicKey.toBuffer()], program.programId);
  const uri = "ipfs://ipfs/QmVLAo3EQvkkQKjLTt1dawYsehSEnwYBi19vzh85pohpuw";
  const supply = new anchor.BN(100);
  let nftPublicKey = await createNftAccount(nftProgram, uri, supply, seller);
  let nftHolderPubkey = await findUserAccount(nftProgram, pda, nftPublicKey);   
  let feePayerPubkey = provider.wallet.publicKey;
  let moneyPubkey = await createMint(provider, feePayerPubkey); 

  let amount = new anchor.BN(10);
  await transfer(nftProgram, nftPublicKey, seller, pda, amount);

  await program.rpc.createAuction(price, {
    accounts: {
      auction: auction.publicKey,
      seller: seller.publicKey,
      nftHolder: nftHolderPubkey,
      moneyType: moneyPubkey,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    signers: [auction],
    instructions: [await program.account.auction.createInstruction(auction)],
  });

  return {
    auction: auction,
    seller: seller,
    nftHolder: nftHolderPubkey,
    nftPubkey: nftPublicKey,
    moneyPubkey: moneyPubkey,
  };
}

async function createTokenAccount(provider, mint, owner) {
  const vault = new anchor.web3.Account();
  const tx = new anchor.web3.Transaction();
  tx.add(...(await createTokenAccountInstrs(provider, vault.publicKey, mint, owner)));
  await provider.send(tx, [vault]);
  return vault.publicKey;
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

  async function transfer(program, nftAccount, user1Wallet, user2PublicKey, amount) {
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

