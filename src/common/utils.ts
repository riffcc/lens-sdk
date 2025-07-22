import {
  Ed25519PublicKey,
  fromHexString,
  Secp256k1PublicKey,
  type PublicSignKey,
} from '@peerbit/crypto';
import { SearchRequest } from '@peerbit/document';
import type { Access, IdentityAccessController} from '@peerbit/identity-access-controller';
import { PublicKeyAccessCondition } from '@peerbit/identity-access-controller';

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