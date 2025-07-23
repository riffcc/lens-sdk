import type { WithContext } from '@peerbit/document';
import type { Site } from '../programs/site/program';
import type {
  AccountType,
  FeaturedReleaseData,
  ImmutableProps,
  ReleaseData,
  SiteArgs,
  SubscriptionData,
  WithOptionalPostedBy,
} from '../programs/site/types';
import type { FeaturedRelease, Release, Subscription } from '../programs/site/schemas';
import type { SearchOptions } from '../common/types';

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

export type AddInput<T> = WithOptionalPostedBy<T>;

export type EditInput<T> = T & ImmutableProps;

export interface ILensService {
  init: (directory?: string) => Promise<void>;
  stop: () => Promise<void>;
  openSite: (siteOrAddress: Site | string, options: { siteArgs?: SiteArgs, federate?: boolean }) => Promise<void>;
  getAccountStatus: (options?: { cached?: boolean }) => Promise<AccountType>;
  getRelease: (id: string) => Promise<WithContext<Release> | undefined>;
  getReleases: (options?: SearchOptions) => Promise<WithContext<Release>[]>;
  getFeaturedRelease: (id: string) => Promise<WithContext<FeaturedRelease> | undefined>;
  getFeaturedReleases: (options?: SearchOptions) => Promise<WithContext<FeaturedRelease>[]>;
  addRelease: (data: AddInput<ReleaseData>) => Promise<HashResponse>;
  // Admin methods
  editRelease: (data: EditInput<ReleaseData>) => Promise<HashResponse>;
  deleteRelease: (id: string) => Promise<IdResponse>;
  addFeaturedRelease: (data: AddInput<FeaturedReleaseData>) => Promise<HashResponse>;
  editFeaturedRelease: (data: EditInput<FeaturedReleaseData>) => Promise<HashResponse>;
  deleteFeaturedRelease: (id: string) => Promise<IdResponse>;
  getSubscriptions: (options?: SearchOptions) => Promise<Subscription[]>;
  addSubscription: (data: AddInput<SubscriptionData>) => Promise<HashResponse>;
  deleteSubscription: (data: { id?: string, to?: string }) => Promise<IdResponse>;
  grantAccess(accountType: AccountType, publicKey: string): Promise<BaseResponse>;
  revokeAccess(accountType: AccountType, publicKey: string): Promise<BaseResponse>;
}
