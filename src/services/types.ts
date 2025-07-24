import type { WithContext } from '@peerbit/document';
import type { Site } from '../programs/site/program';
import type {
  FeaturedReleaseData,
  ImmutableProps,
  ReleaseData,
  SiteArgs,
  SubscriptionData,
  WithOptionalPostedBy,
} from '../programs/site/types';
import type { FeaturedRelease, Release, Subscription } from '../programs/site/schemas';
import type { SearchOptions } from '../common/types';
import type { PublicSignKey } from '@peerbit/crypto';

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

export type AddInput<T> = WithOptionalPostedBy<T>;

export type EditInput<T> = T & ImmutableProps;

export interface ILensService {
  init: (directory?: string) => Promise<void>;
  stop: () => Promise<void>;
  openSite: (siteOrAddress: Site | string, options: { siteArgs?: SiteArgs, federate?: boolean }) => Promise<void>;
  getAccountStatus: () => Promise<AccountStatusResponse>;
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
  /**
   * Assigns a specific role to a user.
   * This is a privileged action that can only be performed by an admin.
   * @param publicKey The public key of the user.
   * @param roleId The string identifier of the role to assign (e.g., "member", "moderator").
   */
  assignRole(publicKey: string | PublicSignKey, roleId: string): Promise<BaseResponse>;

  /**
   * Revokes a specific role from a user.
   * This is a privileged action that can only be performed by an admin.
   * @param publicKey The public key of the user.
   * @param roleId The string identifier of the role to revoke.
   */
  revokeRole(publicKey: string | PublicSignKey, roleId: string): Promise<BaseResponse>;

  /**
   * Promotes a user to a full administrator.
   * This is a privileged action that can only be performed by an existing admin.
   * @param publicKey The public key of the user to promote.
   */
  addAdmin(publicKey: string | PublicSignKey): Promise<BaseResponse>;
}
