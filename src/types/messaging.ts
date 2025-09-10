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

// Popup -> Background
export interface CheckUrlsAndShowResultsMessage {
  type: 'CHECK_URLS_AND_SHOW_RESULTS';
  payload: { urls: string[] };
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

// Background -> Content to show URL edit modal
export interface ShowUrlEditModalMessage {
type: 'SHOW_URL_EDIT_MODAL';
payload: {
  urls: string[];
  source: string; // e.g., 'context-menu-single-link'
};
}

// Content -> Background after editing urls
export interface CheckEditedUrlsMessage {
 type: 'CHECK_EDITED_URLS';
 payload: {
   urls: string[];
   source: string;
 };
}

// Content -> Background to open a new tab
export interface OpenTabMessage {
 type: 'OPEN_TAB';
 payload: {
   url: string;
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
  | ShowMultipleLinksResultMessage
  | CheckUrlsAndShowResultsMessage
  | ShowUrlEditModalMessage
  | CheckEditedUrlsMessage
  | OpenTabMessage
  | SettingsUpdatedMessage;
 
// Background -> Content to notify of settings changes
export interface SettingsUpdatedMessage {
  type: 'SETTINGS_UPDATED';
}

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