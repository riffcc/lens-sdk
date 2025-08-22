import { field, fixedArray, option, variant } from '@dao-xyz/borsh';
import { PublicSignKey, sha256Sync } from '@peerbit/crypto';
import { concat } from 'uint8arrays';
import { v4 as uuid } from 'uuid';

@variant('site_manifest')
export class SiteManifest {
  @field({ type: 'string' })
  id: string;

  @field({ type: 'string' })
  name: string;

  @field({ type: option('string') })
  description?: string;

  @field({ type: option('string') })
  icon?: string;

  @field({ type: option('string') })
  url?: string;

  constructor(props: { id?: string; name: string; description?: string; icon?: string; url?: string }) {
    this.id = props.id ?? uuid();
    this.name = props.name;
    this.description = props.description;
    this.icon = props.icon;
    this.url = props.url;
  }
}

export class IndexableSiteManifest {
  @field({ type: 'string' })
  id: string;

  @field({ type: 'string' })
  name: string;

  @field({ type: option('string') })
  description?: string;

  constructor(doc: SiteManifest) {
    this.id = doc.id;
    this.name = doc.name;
    this.description = doc.description;
  }
}

@variant('site_registration')
export class SiteRegistration {
  @field({ type: fixedArray('u8', 32) })
  id: Uint8Array;

  @field({ type: PublicSignKey })
  owner: PublicSignKey;

  @field({ type: SiteManifest })
  manifest: SiteManifest;

  @field({ type: 'string' })
  siteAddress: string;

  constructor(properties: { owner: PublicSignKey; manifest: SiteManifest; siteAddress: string }) {
    this.owner = properties.owner;
    this.manifest = properties.manifest;
    this.siteAddress = properties.siteAddress;
    this.id = sha256Sync(concat([this.owner.bytes, new TextEncoder().encode(this.siteAddress)]));
  }
}

export class IndexableSiteRegistration {
  @field({ type: Uint8Array })
  id: Uint8Array;

  @field({ type: Uint8Array })
  owner: Uint8Array;

  @field({ type: 'string' })
  name: string;

  @field({ type: 'string' })
  siteAddress: string;

  constructor(doc: SiteRegistration) {
    this.id = doc.id;
    this.owner = doc.owner.bytes;
    this.name = doc.manifest.name;
    this.siteAddress = doc.siteAddress;
  }
}
