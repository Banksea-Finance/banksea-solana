const assert = require('assert');
const anchor = require('@project-serum/anchor');

describe('banksy', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  // Program for the tests.
  const program = anchor.workspace.Banksy;

  const ZERO_PUB = new anchor.web3.PublicKey(0);
  let nftAccount = null;
  let user1Wallet = anchor.web3.Keypair.generate();;
  let user2Wallet = anchor.web3.Keypair.generate();;

  it('Create a nft', async () => {
    anchor.setProvider(anchor.Provider.env());
    const uri = "ipfs://ipfs/QmVLAo3EQvkkQKjLTt1dawYsehSEnwYBi19vzh85pohpuw";
    const supply = new anchor.BN(100);

    nftAccount = await createNftAccount(program, uri, supply, user1Wallet);
    
    const nftAccountInfo = await getNftAccountInfo(program, nftAccount);

    assert.ok(nftAccountInfo.supply.toNumber() === supply.toNumber());
    assert.ok(nftAccountInfo.remain.toNumber() === supply.toNumber());
    assert.ok(bytes2Str(nftAccountInfo.uri) === uri);

  });

  it('create a account', async () => {
    const user1Account = await findUserAccount(program, user1Wallet.publicKey, nftAccount);

    const user1AccountInfo = await getUserAccountInfo(program, user1Account);
    assert.ok(user1AccountInfo.amount.toNumber() === 0);
    assert.ok(user1AccountInfo.authority.equals(user1Wallet.publicKey));
    assert.ok(user1AccountInfo.nft.equals(nftAccount));
  });



  it('dist to', async () => {
    const amount = new anchor.BN(100);
    let listener = null;

    let [event, slot] = await new Promise((resolve, _reject) => {
      listener = program.addEventListener("TransferEvent", (event, slot) => {
        resolve([event, slot]);
      });
      distTo(program, user1Wallet.publicKey, nftAccount, amount, user1Wallet);
    });
    await program.removeEventListener(listener);

    const user1Account = await findUserAccount(program, user1Wallet.publicKey, nftAccount);

    assert.ok(slot > 0);
    assert.ok(event.nft.equals(nftAccount));
    assert.ok(event.from.equals(ZERO_PUB));
    assert.ok(event.to.equals(user1Account));
    assert.ok(event.amount.toNumber() === amount.toNumber());
    
    const user1AccountInfo = await getUserAccountInfo(program, user1Account);

    assert.ok(user1AccountInfo.amount.toNumber() === amount.toNumber());
    assert.ok(user1AccountInfo.authority.equals(user1Wallet.publicKey));
    assert.ok(user1AccountInfo.nft.equals(nftAccount));
    
    const nftAccountInfo = await getNftAccountInfo(program, nftAccount);
    assert.ok(nftAccountInfo.remain.toNumber() === 0);
  });

  it('transfer', async () => {
    const amount = new anchor.BN(10);

    
    let [event, slot] = await new Promise((resolve, _reject) => {
      listener = program.addEventListener("TransferEvent", (event, slot) => {
        resolve([event, slot]);
      });
      transfer(program, nftAccount, user1Wallet, user2Wallet, amount);
    });
    await program.removeEventListener(listener);


    const user1Account = await findUserAccount(program, user1Wallet.publicKey, nftAccount);
    const user2Account = await findUserAccount(program, user2Wallet.publicKey, nftAccount);
    
    assert.ok(slot > 0);
    assert.ok(event.nft.equals(nftAccount));
    assert.ok(event.from.equals(user1Account));
    assert.ok(event.to.equals(user2Account));
    assert.ok(event.amount.toNumber() === amount.toNumber());

    const user1AccountInfo = await getUserAccountInfo(program, user1Account);

    assert.ok(user1AccountInfo.amount.toNumber() === 90);
    assert.ok(user1AccountInfo.authority.equals(user1Wallet.publicKey));
    assert.ok(user1AccountInfo.nft.equals(nftAccount));


    const user2AccountInfo = await getUserAccountInfo(program, user2Account);
    assert.ok(user2AccountInfo.amount.toNumber() === 10);
    assert.ok(user2AccountInfo.authority.equals(user2Wallet.publicKey));
    assert.ok(user2AccountInfo.nft.equals(nftAccount));
  });

});

async function createNftAccount(program, uri, supply, userKey) {
  const nftKey = anchor.web3.Keypair.generate();
  // create a nft to a account
  await program.rpc.createNft(str2Bytes(uri), supply, {
    accounts: {
      nft: nftKey.publicKey,
      authority: userKey.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    signers: [nftKey, userKey],
    instructions: [await program.account.nftAccount.createInstruction(nftKey)],
  });

  return nftKey.publicKey;
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

async function distTo(program, userPublicKey, nftAccount, amount, authority) {
  const userAccount = await findUserAccount(program, userPublicKey, nftAccount);
  
  await program.rpc.distTo(amount, {
    accounts: {
      nft: nftAccount,
      user: userAccount,
      authority: authority.publicKey,
    },
    signers:[authority]
  });

}

async function transfer(program, nftAccount, user1Wallet, user2Wallet, amount) {
  const user1Account = await findUserAccount(program, user1Wallet.publicKey, nftAccount);
  const user2Account = await findUserAccount(program, user2Wallet.publicKey, nftAccount);
  await program.rpc.transfer(amount, {
    accounts: {
      from: user1Account,
      to: user2Account,
      authority: user1Wallet.publicKey,
    },
    signers: [user1Wallet]
  });

}

async function getNftAccountInfo(program, nftAccount) {
  return await program.account.nftAccount.fetch(nftAccount);
}

async function getUserAccountInfo(program, userAccount) {
  return await program.account.userAccount.fetch(userAccount);
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