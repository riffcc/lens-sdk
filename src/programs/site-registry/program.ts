import { deserialize, field, fixedArray, variant } from '@dao-xyz/borsh';
import { Program } from '@peerbit/program';
import { Documents, type CanPerformOperations } from '@peerbit/document';
import { sha256Sync } from '@peerbit/crypto';
import type { Site } from '../site/program.js';
import type { SiteManifest } from './schemas.js';
import { SiteRegistration, IndexableSiteRegistration } from './schemas.js';
import { concat } from 'uint8arrays';

export const SITE_REGISTRY_ID_STRING = 'riffcc_sites_v1';
export const SITE_REGISTRY_ID = sha256Sync(new TextEncoder().encode(SITE_REGISTRY_ID_STRING));

@variant('site_registry')
export class SiteRegistry extends Program {
  @field({ type: fixedArray('u8', 32) })
  id: Uint8Array;

  @field({ type: Documents })
  registrations: Documents<SiteRegistration, IndexableSiteRegistration>;

  constructor(props?: { id?: Uint8Array; }) {
    super();
    this.id = props?.id ?? SITE_REGISTRY_ID;
    this.registrations = new Documents({
      id: sha256Sync(concat([
        this.id,
        new TextEncoder().encode('registrations'),
      ])),
    });
  }

  async open(): Promise<void> {
    await this.registrations.open({
      type: SiteRegistration,
      replicate: { factor: 1 },
      index: {
        canRead: () => true,
        type: IndexableSiteRegistration,
        transform: (doc) => new IndexableSiteRegistration(doc),
      },
      // --- ACCESS CONTROL LOGIC ---
      canPerform: async (op: CanPerformOperations<SiteRegistration>) => {
        // The signer of the operation
        const signer = op.entry.signatures[0].publicKey;

        // Use the 'type' property to discriminate the union
        if (op.type === 'put') {
          // This is a create or update operation
          const registration = deserialize(op.operation.data, SiteRegistration);

          // Rule 1: The signer must be the owner of the registration.
          if (!signer.equals(registration.owner)) {
            return false;
          }

          // Rule 2: (For updates) Ensure the owner is not changed.
          const existing = await this.registrations.index.get(registration.id);
          if (existing && !existing.owner.equals(registration.owner)) {
            return false;
          }

          return true;
        }
        else if (op.type === 'delete') { // Using else if for clarity
          // This is a delete operation
          // The key on DeleteOperation is an object { key: primitive }, so we need .key.key
          const registrationId = op.operation.key.key;
          const existing = await this.registrations.index.get(registrationId);

          if (!existing) {
            return true; // Deleting something that doesn't exist is OK.
          }

          // Rule 3: Only the owner can delete their registration.
          if (!signer.equals(existing.owner)) {
            return false;
          }

          return true;
        }

        // Fallback for any other potential operation types in the future
        return false;
      },
    });
  }

  // --- Helper Methods ---

  // A site owner publishes their site
  async publishSite(site: Site, manifest: SiteManifest): Promise<SiteRegistration> {
    // The owner is the root admin of the site program.
    const owner = site.access.admins.rootTrust;

    // Ensure the person calling this IS the owner
    if (!this.node.identity.publicKey.equals(owner)) {
      throw new Error('Only the site owner can publish its registration.');
    }

    const registration = new SiteRegistration({
      owner,
      manifest,
      siteAddress: site.address,
    });

    await this.registrations.put(registration);
    return registration;
  }

  async updateManifest(siteAddress: string, newManifest: SiteManifest): Promise<SiteRegistration> {
    const owner = this.node.identity.publicKey;

    // Re-calculate the deterministic ID to find the existing document
    const registrationId = sha256Sync(concat([owner.bytes, new TextEncoder().encode(siteAddress)]));
    const existing = await this.registrations.index.get(registrationId);

    if (!existing) {
      throw new Error(`Site registration for address ${siteAddress} by this owner not found.`);
    }

    const registration = new SiteRegistration({
      owner,
      manifest: newManifest,
      siteAddress: siteAddress,
    });

    await this.registrations.put(registration);
    return registration;
  }
}