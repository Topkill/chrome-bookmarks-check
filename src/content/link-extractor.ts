import type { QueryManager } from './query-manager';

/**
 * 链接提取器 - 从DOM中高效提取链接
 */
export class LinkExtractor {
  private queryManager: QueryManager;
  private observer: MutationObserver | null = null;
  private processedUrls: Set<string> = new Set();
  private pendingUrls: string[] = [];
  private processingTimer: number | null = null;
  public isActive: boolean = false;  // 改为public，允许外部访问
  private totalLinks: number = 0;

  constructor(queryManager: QueryManager) {
    this.queryManager = queryManager;
  }

  /**
   * 开始提取链接
   */
  async start() {
    if (this.isActive) {
      return;
    }
    
    this.isActive = true;
    console.log('[LinkExtractor] 开始提取链接');
    
    // 处理初始页面的链接
    await this.extractInitialLinks();
    
    // 设置DOM变化监听器
    this.setupMutationObserver();
  }

  /**
   * 暂停提取
   */
  pause() {
    this.isActive = false;
    
    if (this.observer) {
      this.observer.disconnect();
    }
    
    if (this.processingTimer) {
      cancelIdleCallback(this.processingTimer);
      this.processingTimer = null;
    }
  }

  /**
   * 恢复提取
   */
  resume() {
    if (this.isActive) {
      return;
    }
    
    this.isActive = true;
    
    if (this.observer) {
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href']
      });
    }
    
    this.processPendingUrls();
  }

  /**
   * 重新扫描页面
   */
  async rescan() {
    console.log('[LinkExtractor] 重新扫描页面');
    
    // 清除已处理记录
    this.processedUrls.clear();
    this.pendingUrls = [];
    this.totalLinks = 0;
    
    // 重新提取
    await this.extractInitialLinks();
  }

  /**
   * 清除已处理的URL记录
   */
  clearProcessedUrls() {
    this.processedUrls.clear();
    this.pendingUrls = [];
    console.log('[LinkExtractor] 已清除处理记录');
  }

  /**
   * 提取初始页面的所有链接
   */
  private async extractInitialLinks() {
    const links = document.querySelectorAll('a[href]');
    console.log('[LinkExtractor] 找到', links.length, '个链接');
    
    this.totalLinks = links.length;
    const urls: string[] = [];
    
    for (const link of links) {
      const url = this.normalizeUrl((link as HTMLAnchorElement).href);
      if (url && !this.processedUrls.has(url)) {
        urls.push(url);
        this.processedUrls.add(url);
      }
    }
    
    // 分批处理
    await this.processBatch(urls);
  }

  /**
   * 设置DOM变化监听器
   */
  private setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isActive) {
        return;
      }
      
      const newUrls: string[] = [];
      
      for (const mutation of mutations) {
        // 处理新增的节点
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.extractLinksFromElement(node as Element, newUrls);
            }
          });
        }
        
        // 处理属性变化（href变化）
        if (mutation.type === 'attributes' && mutation.attributeName === 'href') {
          const target = mutation.target as HTMLAnchorElement;
          if (target.href) {
            const url = this.normalizeUrl(target.href);
            if (url && !this.processedUrls.has(url)) {
              newUrls.push(url);
              this.processedUrls.add(url);
            }
          }
        }
      }
      
      if (newUrls.length > 0) {
        this.totalLinks += newUrls.length;
        this.pendingUrls.push(...newUrls);
        this.scheduleProcesing();
      }
    });
    
    // 开始观察
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });
  }

  /**
   * 从元素中提取链接
   */
  private extractLinksFromElement(element: Element, urls: string[]) {
    // 检查元素本身是否是链接
    if (element.tagName === 'A' && (element as HTMLAnchorElement).href) {
      const url = this.normalizeUrl((element as HTMLAnchorElement).href);
      if (url && !this.processedUrls.has(url)) {
        urls.push(url);
        this.processedUrls.add(url);
      }
    }
    
    // 查找子元素中的链接
    const links = element.querySelectorAll('a[href]');
    for (const link of links) {
      const url = this.normalizeUrl((link as HTMLAnchorElement).href);
      if (url && !this.processedUrls.has(url)) {
        urls.push(url);
        this.processedUrls.add(url);
      }
    }
  }

  /**
   * 规范化URL
   */
  private normalizeUrl(url: string): string | null {
    try {
      // 过滤无效协议
      const invalidProtocols = ['javascript:', 'mailto:', 'tel:', 'data:', '#'];
      for (const protocol of invalidProtocols) {
        if (url.startsWith(protocol)) {
          return null;
        }
      }
      
      // 处理相对URL
      const absoluteUrl = new URL(url, window.location.href);
      
      // 移除片段标识符
      absoluteUrl.hash = '';
      
      // 返回规范化的URL
      return absoluteUrl.toString();
    } catch {
      // 无法解析的URL
      return null;
    }
  }

  /**
   * 安排处理待处理的URL
   */
  private scheduleProcesing() {
    if (this.processingTimer) {
      return;
    }
    
    // 使用requestIdleCallback在浏览器空闲时处理
    this.processingTimer = requestIdleCallback(() => {
      this.processingTimer = null;
      this.processPendingUrls();
    }, { timeout: 1000 }) as unknown as number;
  }

  /**
   * 处理待处理的URL
   */
  private processPendingUrls() {
    if (this.pendingUrls.length === 0 || !this.isActive) {
      return;
    }
    
    // 批量处理（每批最多100个）
    const batch = this.pendingUrls.splice(0, 100);
    this.processBatch(batch);
    
    // 如果还有待处理的URL，继续安排处理
    if (this.pendingUrls.length > 0) {
      this.scheduleProcesing();
    }
  }

  /**
   * 处理一批URL
   */
  private async processBatch(urls: string[]) {
    if (urls.length === 0) {
      return;
    }
    
    console.log('[LinkExtractor] 处理批次，包含', urls.length, '个URL');
    
    try {
      await this.queryManager.queryUrls(urls);
    } catch (error) {
      console.error('[LinkExtractor] 处理批次失败:', error);
    }
  }

  /**
   * 获取统计信息
   */
  getTotalLinks(): number {
    return this.totalLinks;
  }

  getProcessedLinks(): number {
    return this.processedUrls.size;
  }
}