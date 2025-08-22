import { BookmarkCacheService } from './services/bookmark-cache-service';
import type { Message, QueryResultPayload, CacheStatusPayload } from '@/types/messaging';

/**
 * Background Service Worker 入口
 */
class BackgroundService {
  private bookmarkCache: BookmarkCacheService;

  constructor() {
    this.bookmarkCache = BookmarkCacheService.getInstance();
    this.initialize();
  }

  /**
   * 初始化服务
   */
  private async initialize() {
    console.log('[Background] 初始化开始');
    
    try {
      // 初始化书签缓存
      await this.bookmarkCache.initialize();
      
      // 设置消息监听器
      this.setupMessageListener();
      
      // 设置右键菜单
      this.setupContextMenu();
      
      // 设置安装/更新监听器
      this.setupInstallListener();
      
      console.log('[Background] 初始化完成');
    } catch (error) {
      console.error('[Background] 初始化失败:', error);
    }
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
      console.log('[Background] 收到消息:', message.type, 'from:', sender.tab?.id);
      
      // 处理异步响应
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          console.error('[Background] 处理消息失败:', error);
          sendResponse({ error: error.message });
        });
      
      // 返回true表示异步响应
      return true;
    });
  }

  /**
   * 处理消息
   */
  private async handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<any> {
    switch (message.type) {
      case 'QUERY_URLS': {
        const { urls } = message.payload;
        const bookmarkedUrls = await this.bookmarkCache.queryUrls(urls);
        const response: QueryResultPayload = { bookmarkedUrls };
        return response;
      }
      
      case 'GET_CACHE_STATUS': {
        const status = this.bookmarkCache.getCacheStatus();
        const response: CacheStatusPayload = status;
        return response;
      }
      
      case 'TRIGGER_CACHE_REBUILD': {
        await this.bookmarkCache.fullRebuild();
        return { success: true };
      }
      
      case 'RELOAD_SETTINGS': {
        await this.bookmarkCache.reloadSettings();
        return { success: true };
      }
      
      case 'EXTRACT_AND_SHOW_RESULTS': {
        // 获取当前活动标签
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.id) {
          throw new Error('无法获取当前标签页');
        }
        
        try {
          // 向Content Script请求提取所有URL
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'EXTRACT_ALL_URLS'
          });
          
          if (response && response.urls && response.urls.length > 0) {
            // 查询URL的详细信息
            const detailedResults = await this.bookmarkCache.queryUrlsWithDetails(response.urls);
            
            // 准备结果数据
            const resultsData = {
              originalText: `从页面 ${tab.url} 提取的URL`,
              results: detailedResults,
              isPageExtraction: true  // 标记这是页面提取的结果
            };
            
            // 在新标签页显示结果
            await this.showResultsInTab(resultsData);
            
            return { success: true };
          } else {
            throw new Error('未能从页面提取到URL');
          }
        } catch (error) {
          console.error('[Background] 提取页面URL失败:', error);
          throw error;
        }
      }
      
      default:
        throw new Error(`未知的消息类型: ${(message as any).type}`);
    }
  }

  /**
   * 设置右键菜单
   */
  private setupContextMenu() {
    // 移除所有旧的菜单项，以防重复创建
    chrome.contextMenus.removeAll(() => {
      // 创建右键菜单项
      chrome.contextMenus.create({
        id: 'check-selected-text',
      title: '提取url并在书签中搜索',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'check-link',
      title: '检查此链接是否已收藏',
      contexts: ['link']
    });

    // 监听菜单点击
    chrome.contextMenus.onClicked.addListener((info, tab) => {
     if (info.menuItemId === 'check-selected-text') {
       if (tab && tab.id) {
         chrome.scripting.executeScript(
           {
             target: { tabId: tab.id },
             func: () => window.getSelection()?.toString(),
           },
           (injectionResults) => {
             if (chrome.runtime.lastError) {
               console.error(`Scripting error: ${chrome.runtime.lastError.message}`);
               return;
             }
             if (injectionResults && injectionResults.length > 0) {
               for (const frameResult of injectionResults) {
                 if (typeof frameResult.result === 'string' && frameResult.result) {
                   this.searchInBookmarks(frameResult.result);
                   break;
                 }
               }
             }
           }
         );
       }
     } else if (info.menuItemId === 'check-link' && info.linkUrl) {
       this.checkLinkBookmark(info.linkUrl);
     }
   });
  });
}

  /**
   * 在书签中搜索文本（支持提取多个URL）
   */
  private async searchInBookmarks(text: string) {
    try {
      // 从文本中提取所有URL
      const urls = this.extractUrlsFromText(text);
      
      if (urls.length > 0) {
        // 查询这些URL的详细信息
        const detailedResults = await this.bookmarkCache.queryUrlsWithDetails(urls);
        const bookmarkedItems = detailedResults.filter(item => item.isBookmarked);
        
        if (bookmarkedItems.length > 0) {
          // 构建详细的通知消息
          let message = `检查了 ${detailedResults.length} 个URL，找到 ${bookmarkedItems.length} 个已收藏\n\n`;

          message += '--- 提取到的URL ---\n';
          detailedResults.forEach(item => {
            message += `• ${this.truncateUrl(item.original)}\n`;
          });
          message += '\n';

          message += '--- 规范化后的URL ---\n';
          detailedResults.forEach(item => {
            message += `• ${this.truncateUrl(item.normalized)}\n`;
          });
          message += '\n';

          message += '--- 已收藏的详情 ---\n';
          bookmarkedItems.forEach((item, index) => {
            message += `【${index + 1}】 ${this.truncateUrl(item.original)}\n`;
            if (item.bookmarkUrl && item.bookmarkUrl !== item.original) {
              message += `   书签: ${this.truncateUrl(item.bookmarkUrl)}\n`;
            }
          });

          this.showResultsInTab({ originalText: text, results: detailedResults });
        } else {
          this.showResultsInTab({ originalText: text, results: detailedResults });
        }
        
        // 在控制台输出详细信息
        console.log('[Background] URL检查详情:', detailedResults);
      } else {
        // 如果没有提取到URL，则进行普通文本搜索
        const results = await chrome.bookmarks.search(text);
        
        const textSearchResult = {
            isTextSearch: true,
            originalText: text,
            query: text,
            results: results.map(b => ({ title: b.title, url: b.url }))
        };
        
        this.showResultsInTab(textSearchResult);
      }
    } catch (error) {
      console.error('[Background] 搜索书签失败:', error);
      this.showNotification('错误', '搜索失败，请重试');
    }
  }

  /**
   * 从文本中提取所有URL
   */
  private extractUrlsFromText(text: string): string[] {
    const urls: string[] = [];
    
    // 多种URL匹配模式
    const urlPatterns = [
      // 标准URL（http/https）
      /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
      // 没有协议的URL（www开头）
      /www\.[^\s<>"{}|\\^`\[\]]+/gi,
      // 其他协议
      /(?:ftp|file):\/\/[^\s<>"{}|\\^`\[\]]+/gi
    ];
    
    for (const pattern of urlPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (let url of matches) {
          // 补全协议
          if (url.startsWith('www.')) {
            url = 'https://' + url;
          }
          
          // 清理URL末尾的标点符号
          url = url.replace(/[.,;:!?)]+$/, '');
          
          // 验证URL格式
          try {
            new URL(url);
            if (!urls.includes(url)) {
              urls.push(url);
            }
          } catch {
            // 无效URL，跳过
          }
        }
      }
    }
    
    return urls;
  }

  /**
   * 检查链接是否已收藏
   */
  private async checkLinkBookmark(url: string) {
    try {
      const [result] = await this.bookmarkCache.queryUrlsWithDetails([url]);
      
      if (result.isBookmarked) {
        let message = '✅ 此链接已收藏\n\n';
        message += `当前链接:\n${this.truncateUrl(result.original)}\n\n`;
        if (result.bookmarkUrl && result.bookmarkUrl !== result.original) {
          message += `书签中保存为:\n${this.truncateUrl(result.bookmarkUrl)}`;
        }
        this.showResultsInTab({ originalText: url, results: [result] });
      } else {
        this.showResultsInTab({ originalText: url, results: [result] });
      }
    } catch (error) {
      console.error('[Background] 检查链接失败:', error);
      this.showNotification('错误', '检查失败，请重试');
    }
  }

  /**
   * 截断URL显示
   */
  private truncateUrl(url: string, maxLength: number = 60): string {
    if (url.length <= maxLength) {
      return url;
    }
    return url.substring(0, maxLength - 3) + '...';
  }

  /**
   * 显示通知
   */
  private showNotification(title: string, message: string, url?: string) {
    const iconUrl = chrome.runtime.getURL('icons/icon-48.png');
    if (!iconUrl) {
      console.error("Could not get icon URL for notification.");
      return;
    }
    const notificationOptions: {
      type: 'basic';
      iconUrl: string;
      title: string;
      message: string;
      buttons?: { title: string }[];
    } = {
      type: 'basic',
      iconUrl,
      title,
      message,
    };

    if (url) {
      notificationOptions.buttons = [{ title: '打开链接' }];
    }

    const notificationId = `notification-${Date.now()}`;
    chrome.notifications.create(notificationId, notificationOptions);

    if (url) {
      chrome.notifications.onButtonClicked.addListener((clickedId, buttonIndex) => {
        if (clickedId === notificationId && buttonIndex === 0) {
          chrome.tabs.create({ url });
        }
      });
    }
  }

  /**
   * 在新标签页中显示结果
   */
  private async showResultsInTab(results: any) {
    await chrome.storage.local.set({ searchResults: results });

    const resultsUrl = chrome.runtime.getURL('src/results/index.html');
    
    // 查找是否已存在结果页面
    const tabs = await chrome.tabs.query({ url: resultsUrl });

    if (tabs.length > 0 && tabs[0].id) {
      const tabId = tabs[0].id;
      // 激活并发送消息通知页面更新，而不是重新加载
      await chrome.tabs.update(tabId, { active: true });
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'NEW_RESULTS_AVAILABLE' });
      } catch (error) {
        // 这可能在内容脚本尚未准备好时发生
        // 重新加载是一种可靠的后备方案
        console.warn("无法向结果标签页发送消息，将重新加载作为后备方案。", error);
        chrome.tabs.reload(tabId);
      }
    } else {
      // 如果不存在，则创建新页面
      chrome.tabs.create({ url: resultsUrl });
    }
  }

  /**
   * 设置安装/更新监听器
   */
  private setupInstallListener() {
    chrome.runtime.onInstalled.addListener(async (details) => {
      console.log('[Background] 扩展事件:', details.reason);
      
      if (details.reason === 'install') {
        // 首次安装
        console.log('[Background] 扩展首次安装');
        
        // 打开欢迎页面
        chrome.tabs.create({
          url: chrome.runtime.getURL('src/options/index.html')
        });
        
        // 显示欢迎通知
        this.showNotification(
          '欢迎使用书签哨兵',
          '扩展已成功安装！正在初始化书签缓存...'
        );
      } else if (details.reason === 'update') {
        // 扩展更新
        console.log('[Background] 扩展已更新到版本', chrome.runtime.getManifest().version);
        
        // 重建缓存以确保兼容性
        await this.bookmarkCache.fullRebuild();
        
        this.showNotification(
          '书签哨兵已更新',
          `已更新到版本 ${chrome.runtime.getManifest().version}`
        );
      }
    });
  }
}

// 创建并启动后台服务
const backgroundService = new BackgroundService();

// 导出给测试使用
export { BackgroundService };