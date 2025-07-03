// src/services/identity-service.ts

import { type PrivateKey } from '@libp2p/interface';
import { privateKeyFromRaw } from '@libp2p/crypto/keys';
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from 'bip39';
import sodium from 'libsodium-wrappers';
import { get, set, del } from 'idb-keyval'; // Simple IndexedDB wrapper

const STORAGE_KEY = 'encrypted-bip39-seed';

/**
 * Securely manages the user's identity (derived from a mnemonic) in the browser.
 * 
 * - Encrypts the BIP39 seed with a user-provided password.
 * - Stores the encrypted seed in IndexedDB.
 * - Never stores raw private keys or mnemonics on disk.
 */
export class IdentityService {
    /**
     * Checks if an identity is already stored in the browser's IndexedDB.
     */
    async hasIdentity(): Promise<boolean> {
        return !!(await get(STORAGE_KEY));
    }

    /**
     * Generates a new 12-word mnemonic phrase.
     */
    generateNewMnemonic(): string {
        return generateMnemonic(128); // 128 bits for a 12-word phrase
    }

    /**
     * Encrypts a mnemonic-derived seed with a password and saves it to IndexedDB.
     */
    async saveMnemonic(mnemonic: string, password: string): Promise<void> {
        if (!validateMnemonic(mnemonic)) {
            throw new Error('Invalid mnemonic phrase.');
        }
        const encryptedSeed = await this.encryptMnemonic(mnemonic, password);
        await set(STORAGE_KEY, encryptedSeed);
    }

    /**
     * Decrypts the stored seed with a password and derives the libp2p PrivateKey.
     * This is the primary method for returning users to get their identity material.
     */
    async getPrivateKey(password: string): Promise<PrivateKey> {
        const encryptedSeed = await get<Uint8Array>(STORAGE_KEY);
        if (!encryptedSeed) {
            throw new Error('No identity found in storage.');
        }

        const mnemonic = await this.decryptMnemonic(encryptedSeed, password);
        return this.derivePrivateKeyFromMnemonic(mnemonic);
    }

    /**
      * Wipes the identity from IndexedDB.
      */
    async clear(): Promise<void> {
        await del(STORAGE_KEY);
    }

    // --- Private Helper Methods ---

    /**
     * Derives a libp2p-compatible Ed25519 PrivateKey from a mnemonic.
     * This method is now public to be used after creation/import.
     */
    async derivePrivateKeyFromMnemonic(mnemonic: string): Promise<PrivateKey> {
        await sodium.ready;
        const seed = await mnemonicToSeed(mnemonic);
        const keypair = sodium.crypto_sign_seed_keypair(seed.slice(0, 32));

        const privateKeyBytes = new Uint8Array(64);
        privateKeyBytes.set(keypair.privateKey, 0);
        privateKeyBytes.set(keypair.publicKey, 32);

        return privateKeyFromRaw(privateKeyBytes);
    }

    private async encryptMnemonic(mnemonic: string, password: string): Promise<Uint8Array> {
        await sodium.ready;
        const passwordBytes = sodium.from_string(password);
        const mnemonicBytes = sodium.from_string(mnemonic);

        // Use a password-based key derivation function (PDKDF) like argon2id
        // to create a strong encryption key from the password.
        const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
        const key = sodium.crypto_pwhash(
            sodium.crypto_secretbox_KEYBYTES,
            passwordBytes,
            salt,
            sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
            sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
            sodium.crypto_pwhash_ALG_DEFAULT,
        );

        const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
        const encryptedMnemonic = sodium.crypto_secretbox_easy(mnemonicBytes, nonce, key);

        // We store the encrypted data, salt, and nonce together.
        const combined = new Uint8Array(salt.length + nonce.length + encryptedMnemonic.length);
        combined.set(salt, 0);
        combined.set(nonce, salt.length);
        combined.set(encryptedMnemonic, salt.length + nonce.length);

        return combined;
    }

    private async decryptMnemonic(encryptedData: Uint8Array, password: string): Promise<string> {
        await sodium.ready;
        const passwordBytes = sodium.from_string(password);

        // Extract the salt, nonce, and ciphertext from the stored data.
        const salt = encryptedData.slice(0, sodium.crypto_pwhash_SALTBYTES);
        const nonce = encryptedData.slice(sodium.crypto_pwhash_SALTBYTES, sodium.crypto_pwhash_SALTBYTES + sodium.crypto_secretbox_NONCEBYTES);
        const ciphertext = encryptedData.slice(sodium.crypto_pwhash_SALTBYTES + sodium.crypto_secretbox_NONCEBYTES);

        // Re-derive the same encryption key using the stored salt.
        const key = sodium.crypto_pwhash(
            sodium.crypto_secretbox_KEYBYTES,
            passwordBytes,
            salt,
            sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
            sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
            sodium.crypto_pwhash_ALG_DEFAULT,
        );

        const decryptedBytes = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
        if (!decryptedBytes) {
            throw new Error('Decryption failed. Invalid password.');
        }

        return sodium.to_string(decryptedBytes);
    }
}