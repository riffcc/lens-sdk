import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { Peerbit } from 'peerbit';

describe('DirectSub Basic Functionality', () => {
  let peer1: Peerbit;
  let peer2: Peerbit;
  let pubsub1: any;
  let pubsub2: any;

  beforeAll(async () => {
    // Create two peers
    peer1 = await Peerbit.create();
    peer2 = await Peerbit.create();
    
    // Connect them
    await peer2.dial(peer1.getMultiaddrs());
    
    // Import the singleton helper
    const { getOrCreateDirectSub } = await import('../src/directsub-singleton');
    
    // Get DirectSub instances
    pubsub1 = await getOrCreateDirectSub(peer1);
    pubsub2 = await getOrCreateDirectSub(peer2);
  });

  afterAll(async () => {
    await pubsub1.stop();
    await pubsub2.stop();
    await peer1.stop();
    await peer2.stop();
  });

  test('DirectSub can send and receive messages', async () => {
    const topic = 'test-topic';
    const testMessage = new TextEncoder().encode('Hello DirectSub!');
    
    let receivedMessage: any = null;
    
    // Set up listener on peer2
    pubsub2.addEventListener('data', (event: any) => {
      console.log('Received event:', event.detail);
      receivedMessage = event.detail;
    });
    
    // Subscribe peer2 to topic
    await pubsub2.subscribe(topic);
    
    // Request subscribers on peer1
    await pubsub1.requestSubscribers(topic);
    
    // Wait for subscriber discovery
    let subscribers;
    const start = Date.now();
    while (Date.now() - start < 5000) {
      subscribers = pubsub1.getSubscribers(topic);
      if (subscribers && subscribers.length > 0) {
        console.log('Found subscribers:', subscribers.length);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    expect(subscribers?.length).toBeGreaterThan(0);
    
    // Publish from peer1
    console.log('Publishing message...');
    await pubsub1.publish(testMessage, { topics: [topic] });
    
    // Wait a bit for message delivery
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if message was received
    expect(receivedMessage).not.toBeNull();
    expect(receivedMessage.data).toEqual(testMessage);
  });
});