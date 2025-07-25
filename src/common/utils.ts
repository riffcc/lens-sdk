import type { Identity} from '@peerbit/crypto';
import {
  Ed25519PublicKey,
  fromHexString,
  PreHash,
  Secp256k1PublicKey,
  SignatureWithKey,
  type PublicSignKey,
} from '@peerbit/crypto';
import { SearchRequest } from '@peerbit/document';
import type { Access, IdentityAccessController} from '@peerbit/identity-access-controller';
import { PublicKeyAccessCondition } from '@peerbit/identity-access-controller';
import type { Signer } from 'ethers';

const KEY_TYPES = {
  'ed25119p': {
    constructor: Ed25519PublicKey,
    expectedLength: 32,
  },
  'sepc256k1': {
    constructor: Secp256k1PublicKey,
    expectedLength: 33,
  },
} as const;

type KeyTypeIdentifier = keyof typeof KEY_TYPES;

export function publicSignKeyFromString(keyString: string): PublicSignKey {
  const parts = keyString.split('/');
  if (parts.length !== 2) {
    throw new Error(`Invalid key string format. Expected "type/hexdata", got "${keyString}"`);
  }

  const typeIdentifier = parts[0] as KeyTypeIdentifier;
  const hexKeyData = parts[1];

  const keyTypeInfo = KEY_TYPES[typeIdentifier];
  if (!keyTypeInfo) {
    throw new Error(`Unsupported public sign key type identifier: "${typeIdentifier}"`);
  }

  const keyBytes = fromHexString(hexKeyData);

  if (keyBytes.length !== keyTypeInfo.expectedLength) {
    throw new Error(
      `Invalid ${typeIdentifier} public key length. Expected ${keyTypeInfo.expectedLength}, got ${keyBytes.length}`,
    );
  }

  return new keyTypeInfo.constructor({ publicKey: keyBytes });
}

/**
 * A utility function to find the specific Access document for a given public key within an ACL.
 * @param acl The access controller's document store to search within.
 * @param publicKey The PublicSignKey of the user to find.
 * @returns The Access document if a grant is found, otherwise undefined.
 */
export async function findAccessGrant(
  acl: IdentityAccessController['access'],
  publicKey: PublicSignKey,
): Promise<Access | undefined> {
  // A broad search is efficient for ACLs, which are typically not large.
  const accessDocs = await acl.index.search(new SearchRequest({}));
  
  // Find the specific document where the condition matches the provided public key.
  return accessDocs.find(doc =>
    doc.accessCondition instanceof PublicKeyAccessCondition &&
    doc.accessCondition.key.equals(publicKey),
  );
}

/**
 * Creates a Peerbit-compatible Identity from an ethers.js Signer (like a Wallet or browser provider).
 * This allows users to sign Peerbit operations using their existing Ethereum wallet.
 * @param signer An ethers.js Signer instance.
 * @returns A promise that resolves to a Peerbit Identity object.
 */
export async function createIdentityFromSigner(signer: Signer): Promise<Identity<Secp256k1PublicKey>> {
  // We force the wallet to sign a dummy message to recover the public key.
  // This is a standard way to derive the public key from an ethers Signer.
  const walletPublicKey = await Secp256k1PublicKey.recover(signer);

  // From the signer, we can create a Peerbit-compatible identity.
  const walletIdentity: Identity<Secp256k1PublicKey> = {
    publicKey: walletPublicKey,

    // The sign function bridges the ethers signing method with Peerbit's expected format.
    sign: async (bytes: Uint8Array): Promise<SignatureWithKey> => {
      // Ethereum wallets expect to sign the keccak256 hash of the message.
      // Peerbit's `sign` method passes the raw bytes, so we let the wallet handle hashing internally.
      // The `signer.signMessage` method does this automatically.
      const signatureString = await signer.signMessage(bytes);

      // peerbit/crypto expects the UTF-8 bytes of the hex signature string,
      // not the actual signature bytes. We use TextEncoder to match this expectation.
      const signatureBytes = new TextEncoder().encode(signatureString);

      // We wrap the signature and public key in Peerbit's `SignatureWithKey` format.
      return new SignatureWithKey({
        prehash: PreHash.ETH_KECCAK_256,
        publicKey: walletPublicKey,
        signature: signatureBytes,
      });
    },
  };

  return walletIdentity;
}