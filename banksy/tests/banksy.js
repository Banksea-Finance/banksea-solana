const assert = require('assert');
const anchor = require('@project-serum/anchor');

describe('banksy', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  // Program for the tests.
  const program = anchor.workspace.Banksy;
  const authority = program.provider.wallet.publicKey;

  const ZERO_PUB = new anchor.web3.PublicKey(0);
  let nft = null;
  let user1 = null;
  let user2 = null;

  it('Create a nft', async () => {
    const uri = "ipfs://ipfs/QmVLAo3EQvkkQKjLTt1dawYsehSEnwYBi19vzh85pohpuw";
    const supply = new anchor.BN(100);
    nft = await createNft(program, authority, uri, supply);
    
    const nftAccount = await getNftAccount(program, nft);

    assert.ok(nftAccount.supply.toNumber() === supply.toNumber());
    assert.ok(nftAccount.remain.toNumber() === supply.toNumber());
    assert.ok(bytes2Str(nftAccount.uri) === uri);

  });

  it('create a account', async () => {
    user1 = await createUser(program, authority, nft);
    user2 = await createUser(program, authority, nft);

    const user1Account = await getUserAccount(program, user1);

    assert.ok(user1Account.amount.toNumber() === 0);
    assert.ok(user1Account.authority.equals(authority));
    assert.ok(user1Account.nft.equals(nft));
  });


  it('dist to', async () => {
    const amount = new anchor.BN(100);
    let listener = null;

    let [event, slot] = await new Promise((resolve, _reject) => {
      listener = program.addEventListener("TransferEvent", (event, slot) => {
        resolve([event, slot]);
      });
	  distTo(program, user1, authority, nft, amount);
    });
    await program.removeEventListener(listener);

    assert.ok(slot > 0);
    assert.ok(event.nft.equals(nft));
    assert.ok(event.from.equals(ZERO_PUB));
    assert.ok(event.to.equals(user1));
    assert.ok(event.amount.toNumber() === amount.toNumber());

    const user1Account = await getUserAccount(program, user1);

    assert.ok(user1Account.amount.toNumber() === amount.toNumber());
    assert.ok(user1Account.authority.equals(authority));
    assert.ok(user1Account.nft.equals(nft));

    
    const nftAccount = await getNftAccount(program, nft);
    assert.ok(nftAccount.remain.toNumber() === 0);
  });


  it('transfer', async () => {
    const amount = new anchor.BN(10);

    let [event, slot] = await new Promise((resolve, _reject) => {
      listener = program.addEventListener("TransferEvent", (event, slot) => {
        resolve([event, slot]);
      });
      transfer(program, user1, user2, authority, amount);
    });
    await program.removeEventListener(listener);

    assert.ok(slot > 0);
    assert.ok(event.nft.equals(nft));
    assert.ok(event.from.equals(user1));
    assert.ok(event.to.equals(user2));
    assert.ok(event.amount.toNumber() === amount.toNumber());

    const user1Account = await getUserAccount(program, user1);

    assert.ok(user1Account.amount.toNumber() === 90);
    assert.ok(user1Account.authority.equals(authority));
    assert.ok(user1Account.nft.equals(nft));


    const user2Account = await getUserAccount(program, user2);
    assert.ok(user2Account.amount.toNumber() === 10);
    assert.ok(user2Account.authority.equals(authority));
    assert.ok(user2Account.nft.equals(nft));
  });

});

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


async function createUser(program, authority, nft) {
  // create a user account
  const userKey = anchor.web3.Keypair.generate();
  await program.rpc.createUser({
    accounts: {
      nft: nft,
      user: userKey.publicKey,
      authority: authority,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    signers: [userKey],
    instructions: [await program.account.userAccount.createInstruction(userKey)],
  });

  return userKey.publicKey;

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

async function transfer(program, user1, user2, authority, amount) {
  await program.rpc.transfer(amount, {
    accounts: {
      from: user1,
      to: user2,
      authority: authority,
    },
  });

}

async function getNftAccount(program, nft) {
  return await program.account.nftAccount.fetch(nft);
}

async function getUserAccount(program, user) {
  return await program.account.userAccount.fetch(user);
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