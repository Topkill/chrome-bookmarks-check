import { BookmarkCacheService } from './services/bookmark-cache-service';
import type { Message, QueryResultPayload, CacheStatusPayload, ExtractAndShowResultsMessage, ReloadSettingsMessage, ShowSingleLinkResultMessage, ShowMultipleLinksResultMessage, CheckUrlsAndShowResultsMessage } from '@/types/messaging';

/**
 * Background Service Worker 入口
 *
 * 提供两种解决方案：
 * 1. 快速恢复方案（当前使用）：Service Worker被回收后第一次调用时立即响应
 * 2. 保活机制方案（注释代码）：防止Service Worker被回收
 */
class BackgroundService {
  private bookmarkCache: BookmarkCacheService;
  private singleLinkAction: 'page' | 'notification' | 'modal' = 'page';
  private multiLinkAction: 'page' | 'notification' | 'modal' = 'page';
  private notificationDuration: number = 15; // 通知存在时长（秒）
  private singleModalDuration: number = 5; // 单链接弹窗存在时长（秒）
  private multiModalDuration: number = 15; // 多链接弹窗存在时长（秒）
  private notificationResults: Map<string, any> = new Map(); // Store results for notifications
 
  // URL 编辑设置
  private editBeforeCheckSingleLink: boolean = false;
  private editBeforeCheckMultiLink: boolean = false;
  private editBeforeCheckPopupPage: boolean = false;
  private editBeforeCheckPopupText: boolean = false;
 
  private initialized: boolean = false;
  private initializingPromise: Promise<void> | null = null;
  private isInitializing: boolean = false;

  // === 保活机制方案相关属性（注释代码） ===
  // private keepAliveInterval: number | null = null;

  constructor() {
    console.log('[Background] Service Worker 启动');
    this.bookmarkCache = BookmarkCacheService.getInstance();
    // 立即设置所有事件监听器，确保Service Worker重启时能够立即响应
    this.setupAllListeners();
    
    // === 保活机制方案（注释代码） ===
    // 如果要使用保活机制，取消注释下面这行，并在manifest.ts中添加'alarms'权限
    // this.startKeepAlive();
    
    // 异步初始化其他服务（不阻塞事件响应）
    this.initialize();
  }

  /**
   * 设置所有事件监听器
   * 这些监听器必须在Service Worker启动时立即设置，确保能够响应事件
   */
  private setupAllListeners() {
    // 1. 消息监听器 - 最重要，必须立即响应
    chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
      // 创建一个异步处理函数
      const handleAsync = async () => {
        try {
          // 如果还未初始化，先等待初始化完成
          if (!this.initialized) {
            console.log('[Background] 等待初始化完成...');
            await this.ensureInitialized();
          }
          
          // 处理消息
          const result = await this.handleMessage(message, sender);
          sendResponse(result);
        } catch (error: any) {
          console.error('[Background] 处理消息出错:', error);
          sendResponse({ error: error.message || '处理消息时发生错误' });
        }
      };
      
      // 立即开始处理，不阻塞
      handleAsync();
      
      // 返回true表示异步响应
      return true;
    });

    // 2. 安装/更新监听器
    chrome.runtime.onInstalled.addListener(async (details) => {
      console.log('[Background] onInstalled:', details.reason);
      if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') });
        this.showNotification('欢迎使用书签哨兵', '扩展已成功安装！正在初始化书签缓存...');
        // 强制初始化
        await this.ensureInitialized();
      } else if (details.reason === 'update') {
        await this.ensureInitialized();
        await this.bookmarkCache.fullRebuild();
        this.showNotification('书签哨兵已更新', `已更新到版本 ${chrome.runtime.getManifest().version}`);
      }
    });

    // 3. 启动监听器
    chrome.runtime.onStartup.addListener(() => {
      console.log('[Background] Chrome启动，Service Worker激活');
      // 触发初始化但不等待
      this.ensureInitialized();
    });

    // 4. 上下文菜单点击监听器
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      // 确保初始化后处理点击
      this.ensureInitialized().then(() => {
        this.handleContextMenuClick(info, tab);
      });
    });

    // 5. 通知按钮点击监听器
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      if (buttonIndex === 0 && this.notificationResults.has(notificationId)) {
        const results = this.notificationResults.get(notificationId);
        this.showResultsInTab(results);
        this.notificationResults.delete(notificationId);
      }
    });

    console.log('[Background] 所有事件监听器已设置');
  }

  // =============================================
  // === 保活机制方案（注释代码） ===
  // =============================================
  // 如果要使用保活机制，取消注释以下代码块，并在manifest.ts中添加'alarms'权限
  
  /*
  /**
   * 启动Service Worker保活机制
   * 使用Chrome Alarms API实现更可靠的保活
   */
  /*
  private startKeepAlive() {
    // 清除已存在的定时器
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // 方案1：使用Chrome Alarms API（更可靠）
    chrome.alarms.create('keep-alive', {
      periodInMinutes: 0.5  // 每30秒触发一次
    });

    // 监听alarm事件
    if (!chrome.alarms.onAlarm.hasListener(this.handleAlarm)) {
      chrome.alarms.onAlarm.addListener(this.handleAlarm);
    }

    // 方案2：同时使用setInterval作为备份（某些情况下alarms可能不够及时）
    this.keepAliveInterval = setInterval(() => {
      // 执行一些Chrome API调用来保持活跃
      this.performKeepAliveTask();
    }, 20000) as unknown as number;

    console.log('[Background] Keep-alive机制已启动（双重保护）');
  }

  /**
   * 处理alarm事件
   */
  /*
  private handleAlarm = (alarm: chrome.alarms.Alarm) => {
    if (alarm.name === 'keep-alive') {
      this.performKeepAliveTask();
    }
  }

  /**
   * 执行保活任务
   */
  /*
  private performKeepAliveTask() {
    // 执行多个Chrome API调用确保Service Worker保持活跃
    chrome.runtime.getPlatformInfo(() => {});
    chrome.storage.local.get(['_keepAlive'], (result) => {
      // 更新一个时间戳，表示Service Worker仍在运行
      chrome.storage.local.set({ '_keepAlive': Date.now() });
    });
    console.log('[Background] Keep-alive ping:', new Date().toISOString());
  }

  /**
   * 停止保活机制（一般不需要调用）
   */
  /*
  private stopKeepAlive() {
    // 清除alarm
    chrome.alarms.clear('keep-alive');
    
    // 清除interval
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    
    console.log('[Background] Keep-alive机制已停止');
  }
  */

  // =============================================
  // === 快速恢复方案（当前使用） ===
  // =============================================

  /**
   * 确保Service Worker已初始化
   * 如果未初始化则触发初始化，如果正在初始化则等待完成
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    return this.initialize();
  }

  private async initialize(): Promise<void> {
    // 防止重复初始化
    if (this.initialized) {
      return;
    }

    if (this.isInitializing) {
      // 如果正在初始化，等待初始化完成
      return this.initializingPromise || Promise.resolve();
    }

    console.log('[Background] 开始初始化...');
    this.isInitializing = true;
    const startTime = Date.now();

    this.initializingPromise = (async () => {
      try {
        // 1. 加载设置（快速）
        await this.loadSettings();
        console.log('[Background] 设置已加载');
        
        // 2. 设置上下文菜单（快速）
        await this.setupContextMenu();
        console.log('[Background] 上下文菜单已设置');
        
        // 3. 初始化书签缓存（可能较慢，但不阻塞基本功能）
        await this.bookmarkCache.initialize();
        console.log('[Background] 书签缓存已初始化');
        
        this.initialized = true;
        this.isInitializing = false;
        const duration = Date.now() - startTime;
        console.log(`[Background] 初始化完成，耗时 ${duration}ms`);
      } catch (error) {
        console.error('[Background] 初始化失败:', error);
        this.isInitializing = false;
        this.initializingPromise = null;
        
        // 初始化失败不影响基本功能，但会在5秒后重试
        setTimeout(() => {
          console.log('[Background] 重新尝试初始化...');
          this.initialize();
        }, 5000);
        
        throw error;
      }
    })();

    return this.initializingPromise;
  }


  private async handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<any> {
    console.log('[Background] 处理消息:', message.type);
    
    // === 保活机制方案中的消息处理（注释代码） ===
    // 如果使用保活机制，可以取消注释下面这行来触发保活
    // this.performKeepAliveTask();
    
    switch (message.type) {
      case 'QUERY_URLS': {
        const { urls } = message.payload;
        return { bookmarkedUrls: await this.bookmarkCache.queryUrls(urls) };
      }
      case 'GET_CACHE_STATUS':
        return this.bookmarkCache.getCacheStatus();
      case 'TRIGGER_CACHE_REBUILD':
        await this.bookmarkCache.fullRebuild();
        return { success: true };
      case 'RELOAD_SETTINGS':
        await this.bookmarkCache.reloadSettings();
        await this.loadSettings();
        return { success: true };
      case 'EXTRACT_AND_SHOW_RESULTS': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.id === undefined) throw new Error('无法获取当前标签页');
        
        // 检查URL是否有效
        if (!tab.url || !tab.url.startsWith('http')) {
          this.showNotification('提示', '此页面类型不支持提取URL。');
          return { success: false, message: '无效的页面类型' };
        }
        
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_ALL_URLS' });
          if (response && response.urls && response.urls.length > 0) {
            const detailedResults = await this.bookmarkCache.queryUrlsWithDetails(response.urls);
            const resultsData = {
              originalText: `从页面 ${tab.title || tab.url} 提取的URL`,
              results: detailedResults,
              isPageExtraction: true,
              source: 'popup-page-extraction'
            };
            this.showResults(resultsData, tab.id);
            return { success: true };
          } else {
            this.showNotification('提示', '当前页面未提取到有效URL。');
            return { success: false, message: '未能从页面提取到URL' };
          }
        } catch (error) {
          console.error('[Background] 提取页面URL失败:', error);
          this.showNotification('错误', '提取页面URL失败，请刷新页面或检查控制台。');
          throw error;
        }
      }
      case 'SHOW_SINGLE_LINK_RESULT':
      case 'SHOW_MULTIPLE_LINKS_RESULT':
        return; // These are outgoing messages, not handled here.
      case 'CHECK_URLS_AND_SHOW_RESULTS': {
        const { urls } = (message as CheckUrlsAndShowResultsMessage).payload;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.id === undefined) throw new Error('无法获取当前标签页');

        const detailedResults = await this.bookmarkCache.queryUrlsWithDetails(urls);
        const resultsData = {
          originalText: `来自用户输入的 ${urls.length} 个URL`,
          results: detailedResults,
          isPageExtraction: false,
          source: 'popup-text-extraction'
        };
        this.showResults(resultsData, tab.id);
        return { success: true };
      }
      case 'CHECK_EDITED_URLS': {
        const { urls, source } = message.payload;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.id === undefined) throw new Error('无法获取当前标签页');

        const detailedResults = await this.bookmarkCache.queryUrlsWithDetails(urls);
        const resultsData = {
          originalText: `来自编辑后的 ${urls.length} 个URL`,
          results: detailedResults,
          source: source
        };
        // 从编辑模态框返回后，总是直接显示结果，不再进行编辑判断
        const isSingle = urls.length === 1;
        const actionSetting = isSingle ? this.singleLinkAction : this.multiLinkAction;
        if (actionSetting === 'page') {
          this.showResultsInTab(resultsData);
        } else {
          this.showResults(resultsData, tab.id, isSingle, true); // forceShow = true
        }
        return { success: true };
      }
      case 'SHOW_URL_EDIT_MODAL':
        // This is an outgoing message, not handled here.
        return;
      default:
        const exhaustiveCheck: never = message;
        throw new Error(`未知的消息类型: ${(exhaustiveCheck as any)?.type}`);
    }
  }

  private async setupContextMenu(): Promise<void> {
    return new Promise<void>((resolve) => {
      chrome.contextMenus.removeAll(() => {
        try {
          chrome.contextMenus.create({
            id: 'check-selected-text',
            title: '从选中文本提取链接并检查是否已收藏',
            contexts: ['selection']
          });
          chrome.contextMenus.create({
            id: 'check-link',
            title: '检查此链接是否已收藏',
            contexts: ['link']
          });
          
          console.log('[Background] 上下文菜单已创建');
          resolve();
        } catch (error) {
          console.error('[Background] 设置上下文菜单失败:', error);
          resolve(); // 即使失败也继续
        }
      });
    });
  }

  /**
   * 处理上下文菜单点击事件
   */
  private handleContextMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
    if (!tab || tab.id === undefined) return;

    // 检查URL是否为http/https协议
    if (!tab.url || !tab.url.startsWith('http')) {
      this.showNotification('提示', '此页面类型不支持此操作。');
      return;
    }
    
    if (info.menuItemId === 'check-link' && info.linkUrl) {
      this.checkLinkBookmark(info.linkUrl, tab.id);
    } else if (info.menuItemId === 'check-selected-text') {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection()?.toString() },
        (injectionResults) => {
          if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) return;
          const selectedText = injectionResults[0].result;
          if (typeof selectedText === 'string' && selectedText) {
            this.searchInBookmarks(selectedText, tab.id as number);
          }
        }
      );
    }
  }

  private async searchInBookmarks(text: string, tabId: number) {
    try {
      const urls = this.extractUrlsFromText(text);
      let resultsData;
      let isSingle = false;
      
      if (urls.length > 0) {
        const detailedResults = await this.bookmarkCache.queryUrlsWithDetails(urls);
        resultsData = {
          originalText: text,
          results: detailedResults,
          source: 'context-menu-multi-link'
        };
        // 判断是单链接还是多链接
        isSingle = urls.length === 1;
      } else {
        const results = await chrome.bookmarks.search(text);
        resultsData = {
          isTextSearch: true,
          originalText: text,
          query: text,
          results: results.map(b => ({ title: b.title, url: b.url }))
        };
        // 文本搜索通常返回多个结果，视为多链接
        isSingle = false;
      }
      
      this.showResults(resultsData, tabId, isSingle);
    } catch (error) {
      console.error('[Background] 搜索书签失败:', error);
      this.showNotification('错误', '搜索失败，请重试');
    }
  }

  private extractUrlsFromText(text: string): string[] {
    const urls: Set<string> = new Set();
    const urlPatterns = [/https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi, /www\.[^\s<>"{}|\\^`\[\]]+/gi];
    for (const pattern of urlPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (let url of matches) {
          if (url.startsWith('www.')) url = 'https://' + url;
          url = url.replace(/[.,;:!?)]+$/, '');
          try {
            new URL(url);
            urls.add(url);
          } catch { /* Invalid URL */ }
        }
      }
    }
    return Array.from(urls);
  }

  private async checkLinkBookmark(url: string, tabId: number) {
    try {
      const [result] = await this.bookmarkCache.queryUrlsWithDetails([url]);
      const resultsData = {
        originalText: url,
        results: [result],
        source: 'context-menu-single-link'
      };
      this.showResults(resultsData, tabId, true);
    } catch (error) {
      console.error('[Background] 检查链接失败:', error);
      this.showNotification('错误', '检查失败，请重试');
    }
  }

  private showResults(resultsData: any, tabId: number, isSingle: boolean = false, forceShow: boolean = false) {
    const source = resultsData.source;
    let shouldEdit = false;
    
    if (source === 'context-menu-single-link' && this.editBeforeCheckSingleLink) shouldEdit = true;
    if (source === 'context-menu-multi-link' && this.editBeforeCheckMultiLink) shouldEdit = true;
    // Popup 内部的编辑逻辑由 popup 自己处理
    
    if (shouldEdit && !forceShow) {
      const urls = resultsData.results.map((r: any) => r.original);
      chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_URL_EDIT_MODAL',
        payload: { urls, source: resultsData.source }
      });
      return;
    }
 
    // 根据是单链接还是多链接选择相应的设置
    const actionSetting = isSingle ? this.singleLinkAction : this.multiLinkAction;
    
    if (actionSetting === 'page') {
      this.showResultsInTab(resultsData);
    } else if (actionSetting === 'modal') {
      const messageType = isSingle ? 'SHOW_SINGLE_LINK_RESULT' : 'SHOW_MULTIPLE_LINKS_RESULT';
      const modalDuration = isSingle ? this.singleModalDuration : this.multiModalDuration;
      const payload = isSingle
        ? { result: resultsData.results[0], modalDuration }
        : { results: resultsData, modalDuration };
      chrome.tabs.sendMessage(tabId, { type: messageType, payload });
    } else if (actionSetting === 'notification') {
      if (isSingle) {
        const result = resultsData.results[0];
        if (result.isBookmarked) {
          let message = `原始链接: ${this.truncateUrl(result.original)}\n`;
          message += `规范化: ${this.truncateUrl(result.normalized)}\n`;
          message += `书签位置: ${this.truncateUrl(result.bookmarkUrl || '未知')}`;
          this.showNotification('✅ 链接已收藏', message, result.original);
        } else {
          let message = `原始链接: ${this.truncateUrl(result.original)}\n`;
          message += `规范化: ${this.truncateUrl(result.normalized)}`;
          this.showNotification('ℹ️ 链接未收藏', message, result.original);
        }
      } else {
        const total = resultsData.results.length;
        const bookmarked = resultsData.results.filter((r: any) => r.isBookmarked).length;
        
        // 为多链接通知生成详细信息
        let message = `检查了 ${total} 个链接，找到 ${bookmarked} 个已收藏的书签。\n\n`;
        
        // 显示前几个链接的详细信息（最多显示3个）
        const displayCount = Math.min(3, resultsData.results.length);
        for (let i = 0; i < displayCount; i++) {
          const result = resultsData.results[i];
          const status = result.isBookmarked ? '✅' : '❌';
          message += `${status} ${this.truncateUrl(result.original, 50)}\n`;
          if (result.normalized !== result.original) {
            message += `   规范化: ${this.truncateUrl(result.normalized, 50)}\n`;
          }
        }
        
        if (resultsData.results.length > displayCount) {
          message += `\n...还有 ${resultsData.results.length - displayCount} 个链接`;
        }
        
        this.showNotification('🔍 检查完成', message, undefined, resultsData);
      }
    }
  }
  
  private truncateUrl(url: string, maxLength: number = 60): string {
    if (!url || url.length <= maxLength) return url || '';
    return url.substring(0, maxLength - 3) + '...';
  }

  private showNotification(title: string, message: string, url?: string, resultsForDetails?: any) {
    const iconUrl = chrome.runtime.getURL('icons/icon-48.png');
    const notificationId = `notification-${Date.now()}`;
    
    // 先清除所有现有的通知以避免替换延迟
    chrome.notifications.getAll((notifications) => {
      for (const id in notifications) {
        if (id.startsWith('notification-')) {
          chrome.notifications.clear(id);
          this.notificationResults.delete(id);
        }
      }
    });
    
    const options = {
      type: 'basic' as const,
      iconUrl,
      title,
      message,
    } as any;

    if (resultsForDetails) {
      options.buttons = [{ title: '查看详情' }];
      this.notificationResults.set(notificationId, resultsForDetails);
    } else if (url) {
      options.buttons = [{ title: '打开链接' }];
    }
    
    chrome.notifications.create(notificationId, options);
    
    // 设置自动清除通知
    if (this.notificationDuration > 0) {
      setTimeout(() => {
        chrome.notifications.clear(notificationId);
        this.notificationResults.delete(notificationId);
      }, this.notificationDuration * 1000);
    }
    
    if (url && !resultsForDetails) {
        const listener = (clickedId: string, buttonIndex: number) => {
            if (clickedId === notificationId && buttonIndex === 0) {
                chrome.tabs.create({ url });
                chrome.notifications.onButtonClicked.removeListener(listener);
            }
        };
        chrome.notifications.onButtonClicked.addListener(listener);
    }
  }

  private async showResultsInTab(results: any) {
    await chrome.storage.local.set({ searchResults: results });
    const resultsUrl = chrome.runtime.getURL('src/results/index.html');
    const tabs = await chrome.tabs.query({ url: resultsUrl });
    if (tabs.length > 0 && tabs[0].id) {
      const tabId = tabs[0].id;
      await chrome.tabs.update(tabId, { active: true });
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'NEW_RESULTS_AVAILABLE' });
      } catch (error) {
        chrome.tabs.reload(tabId);
      }
    } else {
      chrome.tabs.create({ url: resultsUrl });
    }
  }

 
  private async loadSettings() {
    try {
      const { settings } = await chrome.storage.local.get(['settings']);
      this.singleLinkAction = settings?.singleLinkAction || 'page';
      this.multiLinkAction = settings?.multiLinkAction || 'page';
      this.notificationDuration = settings?.notificationDuration ?? 15;
      this.singleModalDuration = settings?.singleModalDuration ?? 5;
      this.multiModalDuration = settings?.multiModalDuration ?? 15;
 
      // 加载URL编辑设置
      this.editBeforeCheckSingleLink = settings?.editBeforeCheckSingleLink ?? false;
      this.editBeforeCheckMultiLink = settings?.editBeforeCheckMultiLink ?? false;
      this.editBeforeCheckPopupPage = settings?.editBeforeCheckPopupPage ?? false;
      this.editBeforeCheckPopupText = settings?.editBeforeCheckPopupText ?? false;
 
      console.log('[Background] 单链接结果提示方式设置为:', this.singleLinkAction);
      console.log('[Background] 多链接结果提示方式设置为:', this.multiLinkAction);
      console.log('[Background] 通知存在时长设置为:', this.notificationDuration, '秒');
      console.log('[Background] 单链接弹窗存在时长设置为:', this.singleModalDuration, '秒');
      console.log('[Background] 多链接弹窗存在时长设置为:', this.multiModalDuration, '秒');
    } catch (error) {
      console.error('[Background] 加载设置失败:', error);
    }
  }
}

// 创建全局实例，确保Service Worker重启时能立即初始化
const backgroundService = new BackgroundService();

// 导出实例，方便其他模块使用
export { backgroundService, BackgroundService };

// 添加全局错误处理，防止Service Worker崩溃
self.addEventListener('error', (event: ErrorEvent) => {
  console.error('[Background] 全局错误:', event.error);
});

self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('[Background] 未处理的Promise拒绝:', event.reason);
});

// Service Worker激活事件
self.addEventListener('activate', (event: any) => {
  console.log('[Background] Service Worker 激活事件触发');
});

// Service Worker获取焦点事件（从休眠状态唤醒）
self.addEventListener('fetch', (event: any) => {
  // Chrome扩展不需要处理fetch事件，但可以用来检测唤醒
  console.log('[Background] Service Worker 被唤醒');
});