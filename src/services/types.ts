import type { WithContext } from '@peerbit/document';
import type { Site } from '../programs/site/program';
import type { 
  AccountType, 
  BaseData, 
  FeaturedReleaseData, 
  ReleaseData, 
  SiteArgs,
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

export interface ILensService {
  init: (directory?: string) => Promise<void>;
  stop: () => Promise<void>;
  openSite: (siteOrAddress: Site | string, options: { siteArgs?: SiteArgs, federate: boolean }) => Promise<void>;
  getAccountStatus: () => Promise<AccountType>;
  getRelease: (id: string) => Promise<WithContext<Release> | undefined>;
  getReleases: (options?: SearchOptions) => Promise<WithContext<Release>[]>;
  getFeaturedRelease: (id: string) => Promise<WithContext<FeaturedRelease> | undefined>;
  getFeaturedReleases: (options?: SearchOptions) => Promise<WithContext<FeaturedRelease>[]>;
  addRelease: (data: ReleaseData) => Promise<HashResponse>;
  // Admin methods
  editRelease: (data: ReleaseData) => Promise<HashResponse>;
  deleteRelease: (id: string) => Promise<IdResponse>;
  addFeaturedRelease: (data: FeaturedReleaseData) => Promise<HashResponse>;
  editFeaturedRelease: (data: FeaturedReleaseData) => Promise<HashResponse>;
  deleteFeaturedRelease: (id: string) => Promise<IdResponse>;
  getSubscriptions: (options?: SearchOptions) => Promise<Subscription[]>;
  addSubscription: (data: BaseData) => Promise<HashResponse>;
  deleteSubscription: (data: Partial<Pick<BaseData, 'id' | 'siteAddress'>>) => Promise<IdResponse>;
}
