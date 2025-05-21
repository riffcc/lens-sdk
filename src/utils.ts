import {
  Ed25519PublicKey,
  fromHexString,
  Secp256k1PublicKey,
  type PublicSignKey,
} from '@peerbit/crypto';

export function publicSignKeyFromString(keyString: string): PublicSignKey {
  const parts = keyString.split('/');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid key string format. Expected "type/hexdata", got "${keyString}"`,
    );
  }

  const typeIdentifier = parts[0];
  const hexKeyData = parts[1];

  // Convert hex data back to Uint8Array
  const keyBytes = fromHexString(hexKeyData);

  if (typeIdentifier === 'ed25119p') {
    if (keyBytes.length !== 32) {
      throw new Error(
        `Invalid Ed25519 public key length. Expected 32, got ${keyBytes.length}`,
      );
    }
    return new Ed25519PublicKey({ publicKey: keyBytes });
  } else if (typeIdentifier === 'sepc256k1') {
    // Matches the 'sepc256k1' prefix in toString()
    if (keyBytes.length !== 33) {
      throw new Error(
        `Invalid Secp256k1 public key length. Expected 33, got ${keyBytes.length}`,
      );
    }
    return new Secp256k1PublicKey({ publicKey: keyBytes });
  } else {
    throw new Error(
      `Unsupported public sign key type identifier: "${typeIdentifier}"`,
    );
  }
}

