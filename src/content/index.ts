import { LinkExtractor } from './link-extractor';
import { QueryManager } from './query-manager';
import { DomMarker } from './dom-marker';

/**
 * Content Script 入口
 */
class ContentScript {
  private linkExtractor: LinkExtractor;
  private queryManager: QueryManager;
  private domMarker: DomMarker;
  private isAutoMarkingEnabled: boolean = false; // 默认关闭自动标记

  constructor() {
    console.log('[ContentScript] 初始化开始');
    
    // 创建各个组件
    this.domMarker = new DomMarker();
    this.queryManager = new QueryManager(this.domMarker);
    this.linkExtractor = new LinkExtractor(this.queryManager);
    
    // 初始化
    this.initialize();
  }

  /**
   * 初始化
   */
  private async initialize() {
    try {
      // 检查是否应该在当前页面运行
      if (!this.shouldRunOnPage()) {
        console.log('[ContentScript] 跳过当前页面');
        return;
      }
      
      // 注入样式
      this.injectStyles();
      
      // 加载设置
      await this.loadSettings();
      
      // 只有开启自动标记时才开始提取
      if (this.isAutoMarkingEnabled) {
        console.log('[ContentScript] 自动标记已开启，开始提取链接');
        await this.linkExtractor.start();
      } else {
        console.log('[ContentScript] 自动标记已关闭');
      }
      
      // 设置消息监听器
      this.setupMessageListener();
      
      console.log('[ContentScript] 初始化完成');
    } catch (error) {
      console.error('[ContentScript] 初始化失败:', error);
    }
  }

  /**
   * 检查是否应该在当前页面运行
   */
  private shouldRunOnPage(): boolean {
    // 排除某些特殊页面
    const excludedProtocols = ['chrome:', 'chrome-extension:', 'about:', 'file:'];
    const currentProtocol = window.location.protocol;
    
    if (excludedProtocols.includes(currentProtocol)) {
      return false;
    }
    
    // 排除某些域名（可配置）
    const excludedDomains = ['localhost', '127.0.0.1'];
    const currentDomain = window.location.hostname;
    
    if (excludedDomains.includes(currentDomain)) {
      return false;
    }
    
    return true;
  }

  /**
   * 注入样式
   */
  private injectStyles() {
    const styleId = 'bookmark-sentry-styles';
    
    // 检查是否已经注入
    if (document.getElementById(styleId)) {
      return;
    }
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 书签标记样式 */
      .bookmark-sentry-marked {
        position: relative;
      }
      
      .bookmark-sentry-icon {
        display: inline-block;
        width: 16px;
        height: 16px;
        margin-left: 4px;
        vertical-align: middle;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FFA500"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>');
        background-size: contain;
        background-repeat: no-repeat;
        opacity: 0.8;
        transition: opacity 0.2s;
      }
      
      .bookmark-sentry-icon:hover {
        opacity: 1;
      }
      
      /* 工具提示 */
      .bookmark-sentry-tooltip {
        position: absolute;
        bottom: 120%;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 10px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        font-size: 12px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 999999;
        min-width: 120px;
        text-align: center;
        margin-bottom: 5px;
      }
      
      .bookmark-sentry-tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: rgba(0, 0, 0, 0.9);
      }
      
      .bookmark-sentry-icon:hover .bookmark-sentry-tooltip {
        opacity: 1;
      }
      
      /* 高亮动画 */
      @keyframes bookmark-sentry-highlight {
        0% { background-color: rgba(255, 165, 0, 0); }
        50% { background-color: rgba(255, 165, 0, 0.2); }
        100% { background-color: rgba(255, 165, 0, 0); }
      }
      
      .bookmark-sentry-highlight {
        animation: bookmark-sentry-highlight 1s ease-in-out;
      }
      
      /* 隐藏原生标记（如果有的话） */
      a[data-bookmark-sentry="true"]::after {
        content: none !important;
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListener() {
    // 监听来自扩展的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[ContentScript] 收到消息:', message);
      
      // 处理异步操作
      const handleAsync = async () => {
        switch (message.type) {
          case 'ENABLE_MARKING':
            // 手动启用标记（从Popup触发）
            await this.enableMarking();
            return { success: true };
          
          case 'DISABLE_MARKING':
            // 手动禁用标记
            this.disableMarking();
            return { success: true };
            
          case 'REFRESH_MARKS':
            await this.refreshMarks();
            return { success: true };
            
          case 'GET_STATS':
            const stats = this.getStats();
            return stats;
            
          case 'EXTRACT_ALL_URLS':
            const urls = this.extractAllPageUrls();
            return { urls };
            
          default:
            return { error: '未知消息类型' };
        }
      };
      
      // 异步处理并响应
      handleAsync()
        .then(sendResponse)
        .catch(error => sendResponse({ error: error.message }));
      
      return true; // 异步响应
    });
  }

  /**
   * 加载设置
   */
  private async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        this.isAutoMarkingEnabled = result.settings.enableAutoMarking ?? false;
      }
    } catch (error) {
      console.error('[ContentScript] 加载设置失败:', error);
    }
  }
  
  /**
   * 手动启用标记
   */
  private async enableMarking() {
    console.log('[ContentScript] 开始手动启用标记');
    
    if (!this.linkExtractor.isActive) {
      await this.linkExtractor.start();
      // 等待初始扫描完成
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      this.linkExtractor.resume();
    }
    
    this.domMarker.showAllMarks();
    console.log('[ContentScript] 标记功能已手动启用，已标记数:', this.domMarker.getMarkedCount());
  }
  
  /**
   * 手动禁用标记
   */
  private disableMarking() {
    this.linkExtractor.pause();
    this.domMarker.hideAllMarks();
    // 清除LinkExtractor的已处理记录，以便重新开启时能够重新处理
    this.linkExtractor.clearProcessedUrls();
    console.log('[ContentScript] 标记功能已手动禁用');
  }

  /**
   * 刷新标记
   */
  private async refreshMarks() {
    console.log('[ContentScript] 刷新标记');
    
    // 清除现有标记
    this.domMarker.clearAllMarks();
    
    // 重新提取和标记
    await this.linkExtractor.rescan();
    
    // 等待一小段时间让异步处理完成
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('[ContentScript] 刷新标记完成，已标记数:', this.domMarker.getMarkedCount());
  }

  /**
   * 获取统计信息
   */
  private getStats() {
    return {
      totalLinks: this.linkExtractor.getTotalLinks(),
      processedLinks: this.linkExtractor.getProcessedLinks(),
      markedLinks: this.domMarker.getMarkedCount(),
      isEnabled: this.linkExtractor.isActive
    };
  }

  /**
   * 提取页面上的所有URL
   */
  private extractAllPageUrls(): string[] {
    const urls = new Set<string>();
    
    // 提取所有链接的href
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = (link as HTMLAnchorElement).href;
      if (this.isValidUrl(href)) {
        urls.add(this.normalizeUrl(href));
      }
    });
    
    // 提取文本中的URL
    const textNodes = this.getTextNodes(document.body);
    const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    
    textNodes.forEach(node => {
      const text = node.textContent || '';
      const matches = text.match(urlPattern);
      if (matches) {
        matches.forEach(url => {
          if (this.isValidUrl(url)) {
            urls.add(this.normalizeUrl(url));
          }
        });
      }
    });
    
    return Array.from(urls);
  }

  /**
   * 获取所有文本节点
   */
  private getTextNodes(element: Element): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }
    
    return textNodes;
  }

  /**
   * 验证URL是否有效
   */
  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      // 排除无效协议
      const invalidProtocols = ['javascript:', 'mailto:', 'tel:', 'data:', 'blob:', 'about:'];
      return !invalidProtocols.includes(urlObj.protocol);
    } catch {
      return false;
    }
  }

  /**
   * 规范化URL
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // 移除hash
      urlObj.hash = '';
      // 移除末尾斜杠
      let normalized = urlObj.toString();
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }
}

// 创建并启动Content Script
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentScript();
  });
} else {
  new ContentScript();
}