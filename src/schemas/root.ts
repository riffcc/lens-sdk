import { deserialize } from '@dao-xyz/borsh';
import { Canvas } from './content.js';
import { Ed25519Keypair } from '@peerbit/crypto';

const ROOM_ID_SEED = new TextEncoder().encode('giga | place');

const ROOT_IDENTITY_DEVELOPMENT = deserialize(
    new Uint8Array([
        0, 0, 100, 171, 121, 177, 143, 132, 216, 160, 114, 206, 201, 210, 133,
        17, 161, 86, 242, 139, 211, 26, 91, 240, 38, 132, 155, 204, 167, 51, 69,
        114, 170, 211, 0, 4, 142, 151, 39, 126, 167, 96, 33, 175, 100, 38, 167,
        37, 133, 179, 14, 196, 158, 96, 228, 244, 241, 4, 115, 64, 172, 99, 30,
        2, 207, 129, 237,
    ]),
    Ed25519Keypair,
);

const rootDevelopment = new Canvas({
    seed: ROOM_ID_SEED,
    publicKey: ROOT_IDENTITY_DEVELOPMENT.publicKey,
});

export { rootDevelopment as rootDevelopment };
