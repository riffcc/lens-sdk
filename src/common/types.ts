import type { Query, SearchRequest, Sort } from '@peerbit/document';

export type AnyObject = Record<string, unknown>;

export type SearchOptions = {
  request?: SearchRequest;
  query?:
    | Query[]
    | Query
    | Record<
        string,
        string | number | bigint | Uint8Array | boolean | null | undefined
      >;
  sort?: Sort[] | Sort;
  fetch?: number;
}