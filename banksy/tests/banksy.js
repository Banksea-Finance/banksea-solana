const assert = require('assert');
const anchor = require('@project-serum/anchor');

describe('banksy', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  // Program for the tests.
  const program = anchor.workspace.Banksy;
  const authority = program.provider.wallet;
  const owner1 = anchor.web3.Keypair.generate();
  const owner2 = anchor.web3.Keypair.generate();

  const ZERO_PUB = new anchor.web3.PublicKey(0);
  let nftToken = null;

  it('Create a nft', async () => {
    const uri = "ipfs://ipfs/QmVLAo3EQvkkQKjLTt1dawYsehSEnwYBi19vzh85pohpuw";
    const supply = new anchor.BN(100);
    nftToken = await createNft(program, authority, uri, supply);
    
    const nftAccount = await getNftAccount(program, nftToken);

    assert.ok(nftAccount.supply.toNumber() === supply.toNumber());
    assert.ok(nftAccount.remain.toNumber() === supply.toNumber());
    assert.ok(bytes2Str(nftAccount.uri) === uri);

  });

  it('create a account', async () => {
    await createOwner(program, owner1, authority, nftToken);
    await createOwner(program, owner2, authority, nftToken);

    const owner1Account = await getOwnerAccount(program, owner1);

    assert.ok(owner1Account.amount.toNumber() === 0);
    assert.ok(owner1Account.authority.equals(authority.publicKey));
    assert.ok(owner1Account.nft.equals(nftToken));
  });


  it('dist to', async () => {
    const amount = new anchor.BN(100);
    let listener = null;

    let [event, slot] = await new Promise((resolve, _reject) => {
      listener = program.addEventListener("TransferEvent", (event, slot) => {
        resolve([event, slot]);
      });
      distTo(program, owner1, authority, nftToken, amount);
    });
    await program.removeEventListener(listener);

    assert.ok(slot > 0);
    assert.ok(event.nft.equals(nftToken));
    assert.ok(event.from.equals(ZERO_PUB));
    assert.ok(event.to.equals(owner1.publicKey));
    assert.ok(event.amount.toNumber() === amount.toNumber());

    const owner1Account = await getOwnerAccount(program, owner1);

    assert.ok(owner1Account.amount.toNumber() === amount.toNumber());
    assert.ok(owner1Account.authority.equals(authority.publicKey));
    assert.ok(owner1Account.nft.equals(nftToken));

    
    const nftAccount = await getNftAccount(program, nftToken);
    assert.ok(nftAccount.remain.toNumber() === 0);
  });


  it('transfer', async () => {
    const amount = new anchor.BN(10);

    let [event, slot] = await new Promise((resolve, _reject) => {
      listener = program.addEventListener("TransferEvent", (event, slot) => {
        resolve([event, slot]);
      });
      transfer(program, owner1, owner2, authority, amount);
    });
    await program.removeEventListener(listener);

    assert.ok(slot > 0);
    assert.ok(event.nft.equals(nftToken));
    assert.ok(event.from.equals(owner1.publicKey));
    assert.ok(event.to.equals(owner2.publicKey));
    assert.ok(event.amount.toNumber() === amount.toNumber());

    const owner1Account = await getOwnerAccount(program, owner1);

    assert.ok(owner1Account.amount.toNumber() === 90);
    assert.ok(owner1Account.authority.equals(authority.publicKey));
    assert.ok(owner1Account.nft.equals(nftToken));


    const owner2Account = await getOwnerAccount(program, owner2);
    assert.ok(owner2Account.amount.toNumber() === 10);
    assert.ok(owner2Account.authority.equals(authority.publicKey));
    assert.ok(owner2Account.nft.equals(nftToken));
  });
})

async function createNft(program, authority, uri, supply) {
  const nftKey = anchor.web3.Keypair.generate();
  const nftToken = nftKey.publicKey;


  // create a nft to a account
  await program.rpc.createNft(str2Bytes(uri), supply, {
    accounts: {
      nft: nftKey.publicKey,
      authority: authority.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    signers: [nftKey],
    instructions: [await program.account.nft.createInstruction(nftKey)],
  });

  return nftToken;
}


async function createOwner(program, account, authority, nftToken) {
  owner = anchor.web3.Keypair.generate();

  // create a nft to a account
  await program.rpc.createOwner({
    accounts: {
      nft: nftToken,
      owner: account.publicKey,
      authority: authority.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    },
    signers: [account],
    instructions: [await program.account.nft.createInstruction(account)],
  });

}

async function distTo(program, account, authority, nftToken, amount) {
  owner = anchor.web3.Keypair.generate();

  // create a nft to a account
  await program.rpc.distTo(amount, {
    accounts: {
      nft: nftToken,
      owner: account.publicKey,
      authority: authority.publicKey,
    },
  });

}

async function transfer(program, account1, account2, authority, amount) {
  owner = anchor.web3.Keypair.generate();

  // create a nft to a account
  await program.rpc.transfer(amount, {
    accounts: {
      from: account1.publicKey,
      to: account2.publicKey,
      authority: authority.publicKey,
    },
  });

}

async function getNftAccount(program, nftToken) {
  return await program.account.nft.fetch(nftToken);
}

async function getOwnerAccount(program, owner) {
  return await program.account.owner.fetch(owner.publicKey);
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