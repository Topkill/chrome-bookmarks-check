import { BookmarkCacheService } from './services/bookmark-cache-service';
import type { Message, QueryResultPayload, CacheStatusPayload, ExtractAndShowResultsMessage, ReloadSettingsMessage, ShowSingleLinkResultMessage, ShowMultipleLinksResultMessage } from '@/types/messaging';

/**
 * Background Service Worker 入口
 */
class BackgroundService {
  private bookmarkCache: BookmarkCacheService;
  private singleLinkAction: 'page' | 'notification' | 'modal' = 'page';
  private multiLinkAction: 'page' | 'notification' | 'modal' = 'page';
  private notificationDuration: number = 15; // 通知存在时长（秒）
  private singleModalDuration: number = 5; // 单链接弹窗存在时长（秒）
  private multiModalDuration: number = 15; // 多链接弹窗存在时长（秒）
  private notificationResults: Map<string, any> = new Map(); // Store results for notifications

  constructor() {
    this.bookmarkCache = BookmarkCacheService.getInstance();
    this.initialize();
  }

  private async initialize() {
    console.log('[Background] 初始化开始');
    try {
      await this.bookmarkCache.initialize();
      this.setupMessageListener();
      this.setupContextMenu();
      this.setupInstallListener();
      this.setupNotificationListener();
      await this.loadSettings();
      console.log('[Background] 初始化完成');
    } catch (error) {
      console.error('[Background] 初始化失败:', error);
    }
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      return true;
    });
  }

  private async handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<any> {
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
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_ALL_URLS' });
          if (response && response.urls && response.urls.length > 0) {
            const detailedResults = await this.bookmarkCache.queryUrlsWithDetails(response.urls);
            const resultsData = {
              originalText: `从页面 ${tab.title || tab.url} 提取的URL`,
              results: detailedResults,
              isPageExtraction: true
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
      default:
        const exhaustiveCheck: never = message;
        throw new Error(`未知的消息类型: ${(exhaustiveCheck as any)?.type}`);
    }
  }

  private setupContextMenu() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'check-selected-text', title: '提取URL并在书签中搜索', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'check-link', title: '检查此链接是否已收藏', contexts: ['link'] });
      chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (!tab || tab.id === undefined) return;
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
      });
    });
  }
  
  private setupNotificationListener() {
    chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
      if (buttonIndex === 0 && this.notificationResults.has(notificationId)) {
        const results = this.notificationResults.get(notificationId);
        this.showResultsInTab(results);
        this.notificationResults.delete(notificationId);
      }
    });
  }

  private async searchInBookmarks(text: string, tabId: number) {
    try {
      const urls = this.extractUrlsFromText(text);
      let resultsData;
      let isSingle = false;
      
      if (urls.length > 0) {
        const detailedResults = await this.bookmarkCache.queryUrlsWithDetails(urls);
        resultsData = { originalText: text, results: detailedResults };
        // 判断是单链接还是多链接
        isSingle = urls.length === 1;
      } else {
        const results = await chrome.bookmarks.search(text);
        resultsData = { isTextSearch: true, originalText: text, query: text, results: results.map(b => ({ title: b.title, url: b.url })) };
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
      const resultsData = { originalText: url, results: [result] };
      this.showResults(resultsData, tabId, true);
    } catch (error) {
      console.error('[Background] 检查链接失败:', error);
      this.showNotification('错误', '检查失败，请重试');
    }
  }

  private showResults(resultsData: any, tabId: number, isSingle: boolean = false) {
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

  private setupInstallListener() {
    chrome.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') });
        this.showNotification('欢迎使用书签哨兵', '扩展已成功安装！正在初始化书签缓存...');
      } else if (details.reason === 'update') {
        await this.bookmarkCache.fullRebuild();
        this.showNotification('书签哨兵已更新', `已更新到版本 ${chrome.runtime.getManifest().version}`);
      }
    });
  }
 
  private async loadSettings() {
    try {
      const { settings } = await chrome.storage.local.get(['settings']);
      this.singleLinkAction = settings?.singleLinkAction || 'page';
      this.multiLinkAction = settings?.multiLinkAction || 'page';
      this.notificationDuration = settings?.notificationDuration ?? 15;
      this.singleModalDuration = settings?.singleModalDuration ?? 5;
      this.multiModalDuration = settings?.multiModalDuration ?? 15;
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

const backgroundService = new BackgroundService();
export { BackgroundService };