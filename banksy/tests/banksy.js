const assert = require('assert');
const anchor = require('@project-serum/anchor');

describe('banksy', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());
  const user1 = anchor.web3.Keypair.generate();
  const user2 = anchor.web3.Keypair.generate();
  // nft for the tests. this is a account of nft
  const nft = anchor.web3.Keypair.generate();

  // Program for the tests.
  const program = anchor.workspace.Banksy;

  it('Creates a nft to a account', async () => {

    // the authority of the associatedAddress is my wallet publicKey
    // console.log(await program.provider.connection.requestAirdrop(program.provider.wallet.publicKey,10000));
    // await program.provider.connection.sendEncodedTransaction(await program.provider.connection.requestAirdrop(program.provider.wallet.publicKey,10000));
    // console.log(await program.provider.connection.getBalance(program.provider.wallet.publicKey));
    const authority = program.provider.wallet.publicKey;
    // generate a associatedAddress by authority and a nft
    const associatedAddress = await program.account.owner.associatedAddress(
      authority,
      nft.publicKey
    );

    const uriStr = "ipfs://ipfs/QmVLAo3EQvkkQKjLTt1dawYsehSEnwYBi19vzh85pohpuw";

    // create a nft to a account
    await program.rpc.create(str2Bytes(uriStr), new anchor.BN(10), {
      accounts: {
        nft: nft.publicKey,
        owner: associatedAddress,
        authority: authority,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [nft],
      instructions: [await program.account.nft.createInstruction(nft)],
    });

    const nftAccount = await program.account.nft.fetch(nft.publicKey);
    const owner = await program.account.owner.associated(authority,nft.publicKey);

    assert.ok(nftAccount.supply.toNumber() === 10);
    assert.ok(bytes2Str(nftAccount.uri) === uriStr);

    assert.ok(owner.amount.toNumber() === 10);
    assert.ok(owner.authority.equals(authority));
    assert.ok(owner.nft.equals(nft.publicKey));
  });



})

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