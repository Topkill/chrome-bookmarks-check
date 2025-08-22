import { BloomFilter } from '@/utils/bloom-filter';
import { StorageService } from './storage-service';
import type { BookmarkCache } from '@/types/messaging';

/**
 * 书签缓存服务 - 管理书签数据的完整生命周期
 */
export class BookmarkCacheService {
  private static instance: BookmarkCacheService;
  private bloomFilter: BloomFilter | null = null;
  private urlSet: Set<string> = new Set();
  private metadata = {
    version: 1,
    bookmarkCount: 0,
    lastUpdated: 0
  };
  private isBuilding = false;
  private saveDebounceTimer: number | null = null;
  
  // URL匹配设置（默认全部关闭，进行严格匹配）
  private urlMatchSettings = {
    ignoreProtocol: false,
    ignoreTrailingSlash: false,
    ignoreCase: false,
    ignoreWww: false,
    ignoreHash: false
  };

  private constructor() {
    // 单例模式
  }

  /**
   * 获取服务实例
   */
  static getInstance(): BookmarkCacheService {
    if (!this.instance) {
      this.instance = new BookmarkCacheService();
    }
    return this.instance;
  }

  /**
   * 初始化缓存服务
   */
  async initialize(): Promise<void> {
    console.log('[BookmarkCacheService] 初始化开始');
    
    try {
      // 尝试从存储加载缓存
      const cache = await StorageService.loadCache();
      
      if (cache && this.isValidCache(cache)) {
        // 缓存有效，加载到内存
        this.loadCacheToMemory(cache);
        console.log('[BookmarkCacheService] 从存储加载缓存成功');
      } else {
        // 缓存无效或不存在，触发全量重建
        console.log('[BookmarkCacheService] 缓存无效或不存在，开始全量重建');
        await this.fullRebuild();
      }

      // 设置书签变化监听器
      this.setupBookmarkListeners();
      
      // 加载URL匹配设置
      await this.loadUrlMatchSettings();
    } catch (error) {
      console.error('[BookmarkCacheService] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 全量重建缓存
   */
  async fullRebuild(): Promise<void> {
    if (this.isBuilding) {
      console.log('[BookmarkCacheService] 正在构建中，跳过重复请求');
      return;
    }

    this.isBuilding = true;
    
    try {
      console.log('[BookmarkCacheService] 开始全量重建');
      const startTime = performance.now();

      // 获取所有书签
      const bookmarkTree = await chrome.bookmarks.getTree();
      const urls = this.extractUrlsFromTree(bookmarkTree);
      
      console.log('[BookmarkCacheService] 提取到', urls.size, '个唯一URL');

      // 构建新的布隆过滤器
      this.bloomFilter = new BloomFilter(urls.size + 10000, 0.001); // 留一些增长空间
      for (const url of urls) {
        this.bloomFilter.add(url);
      }

      // 更新内存数据
      this.urlSet = urls;
      this.metadata = {
        version: 1,
        bookmarkCount: urls.size,
        lastUpdated: Date.now()
      };

      // 保存到存储
      await this.saveCache();

      const endTime = performance.now();
      console.log(`[BookmarkCacheService] 全量重建完成，耗时 ${(endTime - startTime).toFixed(2)}ms`);
    } catch (error) {
      console.error('[BookmarkCacheService] 全量重建失败:', error);
      throw error;
    } finally {
      this.isBuilding = false;
    }
  }

  /**
   * 查询URLs是否在书签中
   */
  async queryUrls(urls: string[]): Promise<string[]> {
    if (!this.bloomFilter || this.urlSet.size === 0) {
      console.log('[BookmarkCacheService] 缓存未就绪，触发初始化');
      await this.initialize();
    }

    const startTime = performance.now();
    const results: string[] = [];

    for (const url of urls) {
      // 规范化URL
      const normalizedUrl = this.normalizeUrl(url);
      
      // 一级过滤：布隆过滤器
      if (this.bloomFilter && this.bloomFilter.contains(normalizedUrl)) {
        // 二级确认：精确查找
        if (this.urlSet.has(normalizedUrl)) {
          results.push(url); // 返回原始URL
        }
      }
    }

    const endTime = performance.now();
    console.log(`[BookmarkCacheService] 查询 ${urls.length} 个URL，找到 ${results.length} 个匹配，耗时 ${(endTime - startTime).toFixed(2)}ms`);
    
    return results;
  }

  /**
   * 查询URLs并返回详细信息
   */
  async queryUrlsWithDetails(urls: string[]): Promise<{
    original: string;
    normalized: string;
    isBookmarked: boolean;
    bookmarkUrl?: string;
  }[]> {
    if (!this.bloomFilter || this.urlSet.size === 0) {
      console.log('[BookmarkCacheService] 缓存未就绪，触发初始化');
      await this.initialize();
    }

    const results: {
      original: string;
      normalized: string;
      isBookmarked: boolean;
      bookmarkUrl?: string;
    }[] = [];

    for (const url of urls) {
      const normalizedUrl = this.normalizeUrl(url);
      let isBookmarked = false;
      let bookmarkUrl: string | undefined;

      // 一级过滤：布隆过滤器
      if (this.bloomFilter && this.bloomFilter.contains(normalizedUrl)) {
        // 二级确认：精确查找
        if (this.urlSet.has(normalizedUrl)) {
          isBookmarked = true;
          // 找到书签中实际存储的URL
          bookmarkUrl = await this.findOriginalBookmarkUrl(normalizedUrl);
        }
      }

      results.push({
        original: url,
        normalized: normalizedUrl,
        isBookmarked,
        bookmarkUrl
      });
    }

    return results;
  }

  /**
   * 根据规范化URL查找原始书签URL
   */
  private async findOriginalBookmarkUrl(normalizedUrl: string): Promise<string | undefined> {
    try {
      // 搜索所有书签
      const bookmarkTree = await chrome.bookmarks.getTree();
      
      const findUrl = (nodes: chrome.bookmarks.BookmarkTreeNode[]): string | undefined => {
        for (const node of nodes) {
          if (node.url && this.normalizeUrl(node.url) === normalizedUrl) {
            return node.url;
          }
          if (node.children) {
            const found = findUrl(node.children);
            if (found) return found;
          }
        }
        return undefined;
      };

      return findUrl(bookmarkTree);
    } catch (error) {
      console.error('[BookmarkCacheService] 查找原始书签URL失败:', error);
      return undefined;
    }
  }

  /**
   * 获取缓存状态
   */
  getCacheStatus() {
    return {
      version: this.metadata.version,
      bookmarkCount: this.metadata.bookmarkCount,
      lastUpdated: this.metadata.lastUpdated,
      isBuilding: this.isBuilding,
      memoryUsage: this.bloomFilter ? this.bloomFilter.getStats().sizeInBytes : 0
    };
  }

  /**
   * 从书签树提取所有URL
   */
  private extractUrlsFromTree(nodes: chrome.bookmarks.BookmarkTreeNode[]): Set<string> {
    const urls = new Set<string>();

    const traverse = (node: chrome.bookmarks.BookmarkTreeNode) => {
      if (node.url) {
        const normalizedUrl = this.normalizeUrl(node.url);
        if (normalizedUrl) {
          urls.add(normalizedUrl);
        }
      }
      
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    for (const node of nodes) {
      traverse(node);
    }

    return urls;
  }

  /**
   * 加载URL匹配设置
   */
  async loadUrlMatchSettings() {
    try {
      const result = await StorageService.loadSettings();
      if (result) {
        this.urlMatchSettings = {
          ignoreProtocol: result.ignoreProtocol ?? false,
          ignoreTrailingSlash: result.ignoreTrailingSlash ?? false,
          ignoreCase: result.ignoreCase ?? false,
          ignoreWww: result.ignoreWww ?? false,
          ignoreHash: result.ignoreHash ?? false
        };
      }
      console.log('[BookmarkCacheService] URL匹配设置已加载:', this.urlMatchSettings);
    } catch (error) {
      console.error('[BookmarkCacheService] 加载URL匹配设置失败:', error);
    }
  }

  /**
   * 重新加载设置并重建缓存
   */
  async reloadSettings() {
    console.log('[BookmarkCacheService] 重新加载设置');
    await this.loadUrlMatchSettings();
    // 重建缓存以应用新设置
    await this.fullRebuild();
  }

  /**
   * 规范化URL
   *
   * 规范化是指将不同格式的URL转换为统一格式，用于比较和匹配。
   * 根据用户设置，可以选择忽略以下差异：
   * 1. 协议差异 (http vs https) - 统一为https用于比较
   * 2. 末尾斜杠 - 移除末尾的/
   * 3. 大小写（域名部分）- 域名转小写
   * 4. www前缀 - 移除www.
   * 5. URL片段（#后的内容）- 移除#及其后内容
   */
  normalizeUrl(url: string): string {
    try {
      let workingUrl = url;
      
      // 1. 处理末尾斜杠
      if (this.urlMatchSettings.ignoreTrailingSlash) {
        workingUrl = workingUrl.replace(/\/+$/, '');
      }
      
      // 解析URL
      const urlObj = new URL(workingUrl);
      
      // 2. 处理协议
      if (this.urlMatchSettings.ignoreProtocol) {
        // 统一使用https作为标准协议（仅用于比较）
        if (urlObj.protocol === 'http:') {
          urlObj.protocol = 'https:';
        }
      }
      
      // 3. 处理hash片段
      if (this.urlMatchSettings.ignoreHash) {
        urlObj.hash = '';
      }
      
      // 4. 处理大小写（仅域名）
      if (this.urlMatchSettings.ignoreCase) {
        urlObj.hostname = urlObj.hostname.toLowerCase();
      }
      
      // 5. 处理www前缀
      if (this.urlMatchSettings.ignoreWww) {
        urlObj.hostname = urlObj.hostname.replace(/^www\./, '');
      }
      
      // 6. 移除默认端口（总是处理）
      if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
          (urlObj.protocol === 'https:' && urlObj.port === '443')) {
        urlObj.port = '';
      }
      
      // 重新构建URL
      let normalized = urlObj.toString();
      
      // 再次处理末尾斜杠
      if (this.urlMatchSettings.ignoreTrailingSlash && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      
      return normalized;
    } catch {
      // 无法解析的URL，根据设置处理大小写
      if (this.urlMatchSettings.ignoreCase) {
        return url.toLowerCase();
      }
      return url;
    }
  }

  /**
   * 设置书签监听器
   */
  private setupBookmarkListeners() {
    // 书签创建
    chrome.bookmarks.onCreated.addListener((id, bookmark) => {
      if (bookmark.url) {
        this.onBookmarkAdded(bookmark.url);
      }
    });

    // 书签删除
    chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
      // 需要重新获取书签信息
      await this.debouncedRebuild();
    });

    // 书签修改
    chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
      if (changeInfo.url) {
        this.onBookmarkChanged(changeInfo.url);
      }
    });

    // 书签移动（不影响URL集合）
    chrome.bookmarks.onMoved.addListener(() => {
      // 仅更新时间戳
      this.metadata.lastUpdated = Date.now();
      this.debouncedSave();
    });
  }

  /**
   * 处理书签添加
   */
  private onBookmarkAdded(url: string) {
    const normalizedUrl = this.normalizeUrl(url);
    
    if (normalizedUrl && !this.urlSet.has(normalizedUrl)) {
      this.urlSet.add(normalizedUrl);
      if (this.bloomFilter) {
        this.bloomFilter.add(normalizedUrl);
      }
      this.metadata.bookmarkCount++;
      this.metadata.lastUpdated = Date.now();
      this.debouncedSave();
    }
  }

  /**
   * 处理书签URL变化
   */
  private onBookmarkChanged(newUrl: string) {
    // URL变化比较复杂，触发防抖重建
    this.debouncedRebuild();
  }

  /**
   * 防抖保存
   */
  private debouncedSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    this.saveDebounceTimer = setTimeout(() => {
      this.saveCache();
      this.saveDebounceTimer = null;
    }, 1000) as unknown as number;
  }

  /**
   * 防抖重建（用于复杂变化）
   */
  private debouncedRebuild() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    this.saveDebounceTimer = setTimeout(() => {
      this.fullRebuild();
      this.saveDebounceTimer = null;
    }, 2000) as unknown as number;
  }

  /**
   * 保存缓存到存储
   */
  private async saveCache() {
    if (!this.bloomFilter) {
      console.error('[BookmarkCacheService] 无法保存：布隆过滤器未初始化');
      return;
    }

    try {
      const cache: BookmarkCache = {
        bloomFilterData: new ArrayBuffer(0), // 这里需要从布隆过滤器获取
        urlSet: this.urlSet,
        metadata: this.metadata
      };

      // 序列化布隆过滤器
      const serialized = this.bloomFilter.serialize();
      const encoder = new TextEncoder();
      cache.bloomFilterData = encoder.encode(serialized).buffer;

      await StorageService.saveCache(cache);
    } catch (error) {
      console.error('[BookmarkCacheService] 保存缓存失败:', error);
    }
  }

  /**
   * 将缓存加载到内存
   */
  private loadCacheToMemory(cache: BookmarkCache) {
    try {
      // 反序列化布隆过滤器
      const decoder = new TextDecoder();
      const serialized = decoder.decode(cache.bloomFilterData);
      this.bloomFilter = BloomFilter.deserialize(serialized);
      
      this.urlSet = cache.urlSet;
      this.metadata = cache.metadata;
    } catch (error) {
      console.error('[BookmarkCacheService] 加载缓存到内存失败:', error);
      throw error;
    }
  }

  /**
   * 验证缓存是否有效
   */
  private isValidCache(cache: BookmarkCache): boolean {
    // 检查版本
    if (cache.metadata.version !== 1) {
      return false;
    }

    // 检查时间（超过7天视为过期）
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - cache.metadata.lastUpdated > sevenDaysInMs) {
      return false;
    }

    // 检查数据完整性
    if (!cache.bloomFilterData || !cache.urlSet || cache.urlSet.size === 0) {
      return false;
    }

    return true;
  }
}