import type { WithContext } from '@peerbit/document';
import type { Site } from '../programs/site/program';
import type {
  ContentCategoryData,
  FeaturedReleaseData,
  ImmutableProps,
  ReleaseData,
  SiteArgs,
  SubscriptionData,
} from '../programs/site/types';
import type { ContentCategory, FeaturedRelease, Release, Subscription } from '../programs/site/schemas';
import type { SearchOptions } from '../common/types';
import type { Identity, PublicSignKey, Secp256k1PublicKey } from '@peerbit/crypto';
import type { ProgramClient } from '@peerbit/program';
import type { Role } from '../programs/acl/rbac';

export interface BaseResponse {
  success: boolean;
  error?: string;
}

export interface IdResponse extends BaseResponse {
  id?: string;
}

export interface HashResponse extends IdResponse {
  hash?: string;
}

export interface AccountStatusResponse {
  isAdmin: boolean;
  roles: string[];
  permissions: string[];
}

export type AddInput<T> = T;

export type EditInput<T> = T & ImmutableProps;

export type LensServiceOptions = { 
  peerbit?: ProgramClient; 
  debug?: boolean, 
  customPrefix?: string,
  identity?: Identity<Secp256k1PublicKey>
};

export interface ILensService {
  init: (directory?: string) => Promise<void>;
  stop: () => Promise<void>;
  openSite: (siteOrAddress: Site | string, options: { siteArgs?: SiteArgs, federate?: boolean }) => Promise<void>;
  getAccountStatus: () => Promise<AccountStatusResponse>;

  // Release Methods
  getRelease: (id: string) => Promise<WithContext<Release> | undefined>;
  getReleases: (options?: SearchOptions) => Promise<WithContext<Release>[]>;
  addRelease: (data: AddInput<ReleaseData>) => Promise<HashResponse>;
  editRelease: (data: EditInput<ReleaseData>) => Promise<HashResponse>;
  deleteRelease: (id: string) => Promise<IdResponse>;

  // Featured Release Methods
  getFeaturedRelease: (id: string) => Promise<WithContext<FeaturedRelease> | undefined>;
  getFeaturedReleases: (options?: SearchOptions) => Promise<WithContext<FeaturedRelease>[]>;
  addFeaturedRelease: (data: AddInput<FeaturedReleaseData>) => Promise<HashResponse>;
  editFeaturedRelease: (data: EditInput<FeaturedReleaseData>) => Promise<HashResponse>;
  deleteFeaturedRelease: (id: string) => Promise<IdResponse>;

  // Category Methods
  getContentCategory: (id: string) => Promise<WithContext<ContentCategory> | undefined>;
  getContentCategories: (options?: SearchOptions) => Promise<WithContext<ContentCategory>[]>;
  addContentCategory: (data: AddInput<ContentCategoryData>) => Promise<HashResponse>;
  editContentCategory: (data: EditInput<ContentCategoryData>) => Promise<HashResponse>;
  deleteContentCategory: (id: string) => Promise<IdResponse>;

  // Subscription Methods
  getSubscriptions: (options?: SearchOptions) => Promise<Subscription[]>;
  addSubscription: (data: AddInput<SubscriptionData>) => Promise<HashResponse>;
  deleteSubscription: (data: { id?: string, to?: string }) => Promise<IdResponse>;

  // ACL Methods
  getRoles(): Promise<Role[]>;
  assignRole(publicKey: string | PublicSignKey, roleId: string): Promise<BaseResponse>;
  revokeRole(publicKey: string | PublicSignKey, roleId: string): Promise<BaseResponse>;
  addAdmin(publicKey: string | PublicSignKey): Promise<BaseResponse>;
}
