import { Peerbit } from 'peerbit';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_IDENTITY_PATH = join(__dirname, '.test-identity');

export async function getTestPeerbit(): Promise<{ peerbit: Peerbit; publicKey: string }> {
  // Check if test identity exists
  try {
    await fs.access(TEST_IDENTITY_PATH);
    console.log('Using existing test identity from:', TEST_IDENTITY_PATH);
  } catch {
    console.log('Creating new test identity at:', TEST_IDENTITY_PATH);
    await fs.mkdir(TEST_IDENTITY_PATH, { recursive: true });
  }
  
  // Create Peerbit with persistent test identity
  const peerbit = await Peerbit.create({
    directory: TEST_IDENTITY_PATH
  });
  
  await peerbit.start();
  
  const publicKey = peerbit.identity.publicKey.toString();
  console.log('Test identity public key:', publicKey);
  console.log('This key needs to be authorized as MEMBER or ADMIN on the target site');
  
  return { peerbit, publicKey };
}