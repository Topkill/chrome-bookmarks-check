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
  private urlMap: Map<string, string> = new Map(); // 新增：规范化URL -> 原始URL
  private metadata = {
    version: 1,
    bookmarkCount: 0,
    lastUpdated: 0
  };
  private isBuilding = false;
  private saveDebounceTimer: number | null = null;
  // 在您的类属性中定义两个定时器变量
 private saveTimer: number | null = null;
 private rebuildTimer: number | null = null;
  
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
        // 缓存有效但urlMap是内存独有的，需要重建
        this.buildUrlMap();
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
      const { urlSet, urlMap } = this.extractUrlsFromTree(bookmarkTree);
      
      console.log('[BookmarkCacheService] 提取到', urlSet.size, '个唯一URL');

      // 构建新的布隆过滤器
      this.bloomFilter = new BloomFilter(urlSet.size + 10000, 0.001); // 留一些增长空间
      for (const url of urlSet) {
        this.bloomFilter.add(url);
      }

      // 更新内存数据
      this.urlSet = urlSet;
      this.urlMap = urlMap;
      this.metadata = {
        version: 1,
        bookmarkCount: urlSet.size,
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

    // 安全检查：如果urlMap为空，则重建
    if (this.urlMap.size === 0 && this.urlSet.size > 0) {
      console.log('[BookmarkCacheService] urlMap为空，开始重建');
      await this.buildUrlMap();
    }
    // ===== 日志 8: 确认设置 =====
    console.log('[DEBUG-CacheService] 开始查询。URL匹配设置:', this.urlMatchSettings);
    console.log('----------------------------------------------------');

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
      // ===== 日志 9: 跟踪每个URL的规范化结果 =====
      console.log(`[DEBUG-CacheService] 
        原始:   "${url}"
        规范化后: "${normalizedUrl}"`);
      // ======================================

      // 一级过滤：布隆过滤器
      if (this.bloomFilter && this.bloomFilter.contains(normalizedUrl)) {
        // 二级确认：精确查找
        if (this.urlSet.has(normalizedUrl)) {
          isBookmarked = true;
          // 优化：直接从Map中获取原始URL，避免遍历
          bookmarkUrl = this.urlMap.get(normalizedUrl);
        }
      }

      results.push({
        original: url,
        normalized: normalizedUrl,
        isBookmarked,
        bookmarkUrl
      });
    }
    console.log('----------------------------------------------------');

    return results;
  }

  /**
   * 从书签树构建URL映射
   */
  private async buildUrlMap(): Promise<void> {
    try {
      const bookmarkTree = await chrome.bookmarks.getTree();
      const { urlMap } = this.extractUrlsFromTree(bookmarkTree);
      this.urlMap = urlMap;
      console.log(`[BookmarkCacheService] urlMap构建完成，包含 ${this.urlMap.size} 个条目`);
    } catch (error) {
      console.error('[BookmarkCacheService] buildUrlMap 失败:', error);
    }
  }

  /**
   * 根据规范化URL查找原始书签URL
   */

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
  private extractUrlsFromTree(nodes: chrome.bookmarks.BookmarkTreeNode[]): { urlSet: Set<string>, urlMap: Map<string, string> } {
    const urlSet = new Set<string>();
    const urlMap = new Map<string, string>();

    const traverse = (node: chrome.bookmarks.BookmarkTreeNode) => {
      if (node.url) {
        const normalizedUrl = this.normalizeUrl(node.url);
        if (normalizedUrl) {
          // 始终存储第一个遇到的原始URL
          if (!urlMap.has(normalizedUrl)) {
            urlMap.set(normalizedUrl, node.url);
          }
          urlSet.add(normalizedUrl);
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

    return { urlSet, urlMap };
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
      
      // // 4. 处理大小写（仅域名）
      // if (this.urlMatchSettings.ignoreCase) {
      //   urlObj.hostname = urlObj.hostname.toLowerCase();
      // }
     
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
      if (this.urlMatchSettings.ignoreTrailingSlash) {
        // "忽略" 设置为 ON：
        // 只要带了斜杠，就移除它
        if (normalized.endsWith('/')) {
          normalized = normalized.slice(0, -1);
        }
      } else {
        // "忽略" 设置为 OFF：
        // 检查：
        // 1. new URL() 加上了斜杠 (normalized.endsWith('/'))
        // 2. 并且它是一个根域名 (urlObj.pathname === '/')
        // 3. 并且我们传入的原始 URL 并没有斜杠 (!url.endsWith('/'))
        if (normalized.endsWith('/') && urlObj.pathname === '/' && !url.endsWith('/')) {
            // 把它改回去，以匹配原始输入
          normalized = normalized.slice(0, -1);
        }
      }

      // ===== 核心修改在这里 =====
      //处理大小写（全部）
      // 如果设置了"忽略大小写"，则将规范化后的【整个】URL字符串转换为小写
      if (this.urlMatchSettings.ignoreCase) {
        return normalized.toLowerCase();
      }
      // ========================
      
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
      this.urlMap.set(normalizedUrl, url); // 更新Map
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
  //  console.log('[DEBUG] debouncedSave: CALLED (保存任务被调用)');

    // if (this.saveDebounceTimer) {
    //   // 这一行日志就是您要找的证据！
    //   console.log(`[DEBUG] debouncedSave: 发现一个已存在的定时器 (ID: ${this.saveDebounceTimer})。正在清除它。(这可能是一个“重建”定时器！)`);
    //   clearTimeout(this.saveDebounceTimer);
    // }
    
    // this.saveDebounceTimer = setTimeout(() => {
    //   console.log('%c[DEBUG] debouncedSave: EXECUTING saveCache() (执行增量保存)', 'color: green;');
    //   this.saveCache();
    //   this.saveDebounceTimer = null;
    // }, 1000) as unknown as number;

    // console.log(`[DEBUG] debouncedSave: 已设置新的 [保存] 定时器 (ID: ${this.saveDebounceTimer})`);
    console.log('[DEBUG] debouncedSave: CALLED (保存任务被调用)');

    // 1. 如果一个重建已经在队列中，则无需“保存”
    //    (因为重建本身就会保存)
    if (this.rebuildTimer) {
      console.log(`[DEBUG] debouncedSave: 检测到一个 [重建] 定时器 (ID: ${this.rebuildTimer}) 正在等待。取消本次“保存”。`);
      return; 
    }
    
    // 2. 清除任何待处理的“保存”
    if (this.saveTimer) {
      console.log(`[DEBUG] debouncedSave: 发现一个已存在的 [保存] 定时器 (ID: ${this.saveTimer})。正在清除它。`);
      clearTimeout(this.saveTimer);
    }
    
    // 3. 设置新的保存定时器 (使用 3 秒)
    this.saveTimer = setTimeout(() => {
      console.log('%c[DEBUG] debouncedSave: EXECUTING saveCache() (执行增量保存)', 'color: green;');
      this.saveCache();
      this.saveTimer = null;
    }, 3000) as unknown as number; // <--- 3 秒

    console.log(`[DEBUG] debouncedSave: 已设置新的 [保存] 定时器 (ID: ${this.saveTimer})`);
  }

  /**
   * 防抖重建（用于复杂变化）
   */
  private debouncedRebuild() {
    // console.log('[DEBUG] debouncedRebuild: CALLED (重建任务被调用)');

    // if (this.saveDebounceTimer) {
    //   console.log(`[DEBUG] debouncedRebuild: 发现一个已存在的定时器 (ID: ${this.saveDebounceTimer})。正在清除它。`);
    //   clearTimeout(this.saveDebounceTimer);
    // }
    
    // this.saveDebounceTimer = setTimeout(() => {
    //   console.log('%c[DEBUG] debouncedRebuild: EXECUTING fullRebuild() (执行完整重建)', 'color: red; font-weight: bold;');
    //   this.fullRebuild();
    //   this.saveDebounceTimer = null;
    // }, 2000) as unknown as number;

    // console.log(`[DEBUG] debouncedRebuild: 已设置新的 [重建] 定时器 (ID: ${this.saveDebounceTimer})`);
    console.log('[DEBUG] debouncedRebuild: CALLED (重建任务被调用)');

    // 1. 清除任何待处理的重建
    if (this.rebuildTimer) {
      console.log(`[DEBUG] debouncedRebuild: 发现一个已存在的 [重建] 定时器 (ID: ${this.rebuildTimer})。正在清除它。`);
      clearTimeout(this.rebuildTimer);
    }

    // 2. 一个重建即将发生，所以任何待处理的“保存”都变得多余了
    if (this.saveTimer) {
      console.log(`[DEBUG] debouncedRebuild: 发现一个已存在的 [保存] 定时器 (ID: ${this.saveTimer})。正在清除它 (因为重建即将发生)。`);
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    
    // 3. 设置新的重建定时器 (使用 5 秒)
    this.rebuildTimer = setTimeout(() => {
      console.log('%c[DEBUG] debouncedRebuild: EXECUTING fullRebuild() (执行完整重建)', 'color: red; font-weight: bold;');
      this.fullRebuild();
      this.rebuildTimer = null;
    }, 5000) as unknown as number; // <--- 5 秒

    console.log(`[DEBUG] debouncedRebuild: 已设置新的 [重建] 定时器 (ID: ${this.rebuildTimer})`);
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
      this.urlMap = new Map(); // 初始化为空，将由buildUrlMap填充
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