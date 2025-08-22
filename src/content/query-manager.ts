import type { DomMarker } from './dom-marker';
import type { QueryUrlsMessage, QueryResultPayload } from '@/types/messaging';

/**
 * 查询管理器 - 管理与Background的通信
 */
export class QueryManager {
  private domMarker: DomMarker;
  private queryQueue: string[] = [];
  private isQuerying: boolean = false;
  private queryTimer: number | null = null;
  private readonly BATCH_SIZE = 50; // 每批查询的URL数量
  private readonly QUERY_DELAY = 100; // 查询间隔（毫秒）

  constructor(domMarker: DomMarker) {
    this.domMarker = domMarker;
  }

  /**
   * 查询URL是否在书签中
   */
  async queryUrls(urls: string[]): Promise<void> {
    // 添加到查询队列
    this.queryQueue.push(...urls);
    
    // 开始处理队列
    this.processQueue();
  }

  /**
   * 处理查询队列
   */
  private async processQueue() {
    if (this.isQuerying || this.queryQueue.length === 0) {
      return;
    }
    
    this.isQuerying = true;
    
    try {
      while (this.queryQueue.length > 0) {
        // 取出一批URL
        const batch = this.queryQueue.splice(0, this.BATCH_SIZE);
        
        // 发送查询请求
        await this.sendQuery(batch);
        
        // 如果还有更多URL，稍等一下再继续
        if (this.queryQueue.length > 0) {
          await this.delay(this.QUERY_DELAY);
        }
      }
    } catch (error) {
      console.error('[QueryManager] 处理队列失败:', error);
    } finally {
      this.isQuerying = false;
    }
  }

  /**
   * 发送查询请求到Background
   */
  private async sendQuery(urls: string[]): Promise<void> {
    try {
      console.log('[QueryManager] 查询', urls.length, '个URL');
      
      const message: QueryUrlsMessage = {
        type: 'QUERY_URLS',
        payload: { urls }
      };
      
      // 发送消息到Background
      const response = await this.sendMessage(message);
      
      if (response && 'bookmarkedUrls' in response) {
        const result = response as QueryResultPayload;
        console.log('[QueryManager] 收到结果，', result.bookmarkedUrls.length, '个已收藏');
        
        // 标记已收藏的链接
        if (result.bookmarkedUrls.length > 0) {
          this.domMarker.markUrls(result.bookmarkedUrls);
        }
      }
    } catch (error) {
      console.error('[QueryManager] 查询失败:', error);
      
      // 将失败的URL重新加入队列末尾
      this.queryQueue.push(...urls);
    }
  }

  /**
   * 发送消息到Background
   */
  private sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 清空查询队列
   */
  clearQueue() {
    this.queryQueue = [];
  }

  /**
   * 获取队列大小
   */
  getQueueSize(): number {
    return this.queryQueue.length;
  }
}