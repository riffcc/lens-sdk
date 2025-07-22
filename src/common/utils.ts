import {
  Ed25519PublicKey,
  fromHexString,
  Secp256k1PublicKey,
  type PublicSignKey,
} from '@peerbit/crypto';

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