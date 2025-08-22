import type { BookmarkCache, SerializedBookmarkCache } from '@/types/messaging';

/**
 * 存储服务 - 封装对chrome.storage.local的操作
 */
export class StorageService {
  private static readonly CACHE_KEY = 'bookmark_cache';
  private static readonly SETTINGS_KEY = 'settings';

  /**
   * 保存书签缓存
   */
  static async saveCache(cache: BookmarkCache): Promise<void> {
    try {
      // 将Set转换为Array以便序列化
      const serialized: SerializedBookmarkCache = {
        bloomFilterData: this.arrayBufferToBase64(cache.bloomFilterData),
        urls: Array.from(cache.urlSet),
        metadata: cache.metadata
      };

      await chrome.storage.local.set({
        [this.CACHE_KEY]: serialized
      });

      console.log('[StorageService] 缓存已保存，包含', serialized.urls.length, '个URL');
    } catch (error) {
      console.error('[StorageService] 保存缓存失败:', error);
      
      // 检查是否是存储空间不足
      if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
        // 通知用户存储空间不足
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/icons/icon-48.png',
          title: '存储空间不足',
          message: '书签哨兵缓存空间不足，请清理浏览器存储空间或减少书签数量。'
        });
      }
      
      throw error;
    }
  }

  /**
   * 加载书签缓存
   */
  static async loadCache(): Promise<BookmarkCache | null> {
    try {
      const result = await chrome.storage.local.get(this.CACHE_KEY);
      const serialized = result[this.CACHE_KEY] as SerializedBookmarkCache | undefined;

      if (!serialized) {
        console.log('[StorageService] 未找到缓存');
        return null;
      }

      // 验证缓存数据结构
      if (!this.validateCacheStructure(serialized)) {
        console.error('[StorageService] 缓存数据结构无效');
        return null;
      }

      // 反序列化
      const cache: BookmarkCache = {
        bloomFilterData: this.base64ToArrayBuffer(serialized.bloomFilterData),
        urlSet: new Set(serialized.urls),
        metadata: serialized.metadata
      };

      console.log('[StorageService] 缓存已加载，包含', serialized.urls.length, '个URL');
      return cache;
    } catch (error) {
      console.error('[StorageService] 加载缓存失败:', error);
      return null;
    }
  }

  /**
   * 清除缓存
   */
  static async clearCache(): Promise<void> {
    try {
      await chrome.storage.local.remove(this.CACHE_KEY);
      console.log('[StorageService] 缓存已清除');
    } catch (error) {
      console.error('[StorageService] 清除缓存失败:', error);
      throw error;
    }
  }

  /**
   * 获取存储使用情况
   */
  static async getStorageInfo(): Promise<{
    bytesInUse: number;
    quota: number;
    percentUsed: number;
  }> {
    const bytesInUse = await chrome.storage.local.getBytesInUse();
    const quota = chrome.storage.local.QUOTA_BYTES || 10485760; // 默认10MB
    
    return {
      bytesInUse,
      quota,
      percentUsed: (bytesInUse / quota) * 100
    };
  }

  /**
   * 保存设置
   */
  static async saveSettings(settings: any): Promise<void> {
    await chrome.storage.local.set({
      [this.SETTINGS_KEY]: settings
    });
  }

  /**
   * 加载设置
   */
  static async loadSettings(): Promise<any> {
    const result = await chrome.storage.local.get(this.SETTINGS_KEY);
    return result[this.SETTINGS_KEY] || {};
  }

  /**
   * ArrayBuffer转Base64
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Base64转ArrayBuffer
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * 验证缓存数据结构
   */
  private static validateCacheStructure(data: any): data is SerializedBookmarkCache {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.bloomFilterData === 'string' &&
      Array.isArray(data.urls) &&
      data.metadata &&
      typeof data.metadata.version === 'number' &&
      typeof data.metadata.bookmarkCount === 'number' &&
      typeof data.metadata.lastUpdated === 'number'
    );
  }
}