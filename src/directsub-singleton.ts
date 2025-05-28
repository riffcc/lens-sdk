import type { Peerbit } from 'peerbit';

// Global map to store DirectSub instances per Peerbit client
const directSubInstances = new WeakMap<Peerbit, any>();

export async function getOrCreateDirectSub(client: Peerbit): Promise<any> {
  // Check if we already have a DirectSub instance for this client
  let pubsub = directSubInstances.get(client);
  
  if (!pubsub) {
    // Create new DirectSub instance
    const { DirectSub } = await import('@peerbit/pubsub');
    
    // @ts-ignore - libp2p types
    pubsub = new DirectSub(client.libp2p.components);
    
    try {
      // Start DirectSub
      await pubsub.start();
    } catch (error: any) {
      // If it's already started, that's fine
      if (!error.message?.includes('already registered')) {
        throw error;
      }
    }
    
    // Store it for future use
    directSubInstances.set(client, pubsub);
  }
  
  return pubsub;
}