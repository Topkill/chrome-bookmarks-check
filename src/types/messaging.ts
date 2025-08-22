// Content -> Background
export interface QueryUrlsMessage {
  type: 'QUERY_URLS';
  payload: { urls: string[] };
}

// Background -> Content (Response)
export interface QueryResultPayload {
  bookmarkedUrls: string[];
}

// UI -> Background
export interface GetCacheStatusMessage {
  type: 'GET_CACHE_STATUS';
}

export interface TriggerCacheRebuildMessage {
  type: 'TRIGGER_CACHE_REBUILD';
}

// Cache Status Response
export interface CacheStatusPayload {
  version: number;
  bookmarkCount: number;
  lastUpdated: number;
  isBuilding: boolean;
}

// Reload settings message
export interface ReloadSettingsMessage {
  type: 'RELOAD_SETTINGS';
}

// Extract and show results message
export interface ExtractAndShowResultsMessage {
  type: 'EXTRACT_AND_SHOW_RESULTS';
}

// Background -> Content
export interface ShowSingleLinkResultMessage {
 type: 'SHOW_SINGLE_LINK_RESULT';
 payload: {
   result: any; // A single DetailedQueryResult object
   modalDuration: number; // Duration in seconds, 0 means permanent
 };
}

// Background -> Content for multiple results
export interface ShowMultipleLinksResultMessage {
 type: 'SHOW_MULTIPLE_LINKS_RESULT';
 payload: {
   results: any; // The full results object
   modalDuration: number; // Duration in seconds, 0 means permanent
 };
}

// All message types
export type Message =
  | QueryUrlsMessage
  | GetCacheStatusMessage
  | TriggerCacheRebuildMessage
  | ReloadSettingsMessage
  | ExtractAndShowResultsMessage
  | ShowSingleLinkResultMessage
  | ShowMultipleLinksResultMessage;

// Bookmark Cache Interface
export interface BookmarkCache {
  bloomFilterData: ArrayBuffer;
  urlSet: Set<string>;
  metadata: {
    version: number;
    bookmarkCount: number;
    lastUpdated: number;
  };
}

// Serializable version for storage
export interface SerializedBookmarkCache {
  bloomFilterData: string; // Base64 encoded
  urls: string[];
  metadata: {
    version: number;
    bookmarkCount: number;
    lastUpdated: number;
  };
}