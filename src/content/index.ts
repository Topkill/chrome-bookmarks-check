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
  private batchOpenSize: number = 5;
  private modalCloseTimerId: number | null = null;
  private modalDuration: number = 0;
 
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
            
          case 'SHOW_SINGLE_LINK_RESULT':
            this.showResultModal([message.payload.result], message.payload.modalDuration);
            return { success: true };
            
          case 'SHOW_MULTIPLE_LINKS_RESULT':
            this.showResultModal(message.payload.results.results, message.payload.modalDuration);
            return { success: true };

          case 'SHOW_URL_EDIT_MODAL':
            this.showUrlEditModal(message.payload.urls, message.payload.source);
            return { success: true };
            
          case 'SETTINGS_UPDATED':
            console.log('[ContentScript] 收到设置更新通知，正在重新加载...');
            await this.loadSettings();
            return { success: true };

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
        this.batchOpenSize = result.settings.batchOpenSize ?? 5;
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
        urls.add(href);
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
            urls.add(url);
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

  /**
  * 显示结果弹窗
  */
  private showResultModal(results: any[], durationInSeconds: number) {
    this.modalDuration = durationInSeconds;
    // 移除已存在的弹窗
    const existingModal = document.getElementById('bookmark-sentry-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'bookmark-sentry-modal';
    
    // 根据结果数量调整弹窗大小
    const isMultiple = results.length > 1;
    const width = isMultiple ? '500px' : '350px';
    const maxHeight = isMultiple ? '400px' : 'auto';
    
    modal.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 99999999;
      background-color: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      width: ${width};
      max-width: 90%;
      max-height: ${maxHeight};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #333;
      ${isMultiple ? 'overflow-y: auto;' : ''}
    `;

    const closeButton = `<button id="bookmark-sentry-modal-close" style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 20px; cursor: pointer; color: #888;">&times;</button>`;
    
    let content = '';
    
    if (isMultiple) {
      // 多链接结果显示
      const total = results.length;
      const bookmarked = results.filter(r => r.isBookmarked).length;
      const title = `<h3 style="margin-top:0; margin-bottom: 15px; font-size: 16px; color: #111;">🔍 检查结果 (${bookmarked}/${total})</h3>`;
      
      content = title;

      //  添加一键打开按钮区域
      content += `<div id="modal-actions-bar" style="margin-bottom: 15px;"></div>`;
      content += `<div id="modal-batch-controls"></div>`;

      content += `<div style="max-height: 260px; overflow-y: auto; margin-top: 10px;">`;
      
      results.forEach((result, index) => {
        const statusIcon = result.isBookmarked ? '✅' : '❌';
        const bgColor = result.isBookmarked ? '#f8f9fa' : '#ffffff';
        const borderColor = result.isBookmarked ? '#28a745' : '#dc3545';
        
        content += `
          <div style="
            border: 1px solid ${borderColor};
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
            background-color: ${bgColor};
          ">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 16px; margin-right: 8px;">${statusIcon}</span>
              <span style="font-weight: 600; color: #111;">${result.isBookmarked ? '已收藏' : '未收藏'}</span>
            </div>
            <p style="margin: 0 0 6px 0; word-wrap: break-word; font-size: 12px;">
              <b>原始链接:</b> <a href="${result.original}" target="_blank" rel="noopener noreferrer" style="color: #007bff;">${this.truncateUrl(result.original, 50)}</a>
            </p>
            <p style="margin: 0 0 6px 0; word-wrap: break-word; font-size: 12px;">
              <b>规范化:</b> <span style="color: #666;">${this.truncateUrl(result.normalized, 50)}</span>
            </p>
            ${result.isBookmarked ?
              `<p style="margin: 0; word-wrap: break-word; font-size: 12px;">
                <b>书签位置:</b> <a href="${result.bookmarkUrl}" target="_blank" rel="noopener noreferrer" style="color: #28a745;">${this.truncateUrl(result.bookmarkUrl || '未知', 50)}</a>
              </p>` : ''
            }
          </div>
        `;
      });
      
      content += `</div>`;
    } else {
      // 单链接结果显示（保持原有样式）
      const result = results[0];
      const statusIcon = result.isBookmarked ? '✅' : 'ℹ️';
      const statusText = result.isBookmarked ? '链接已收藏' : '链接未收藏';
      const title = `<h3 style="margin-top:0; margin-bottom: 15px; font-size: 16px; color: #111;">${statusIcon} ${statusText}</h3>`;
      
      content = title;
      content += `<p style="margin: 0 0 10px 0; word-wrap: break-word;"><b>原始链接:</b> <a href="${result.original}" target="_blank" rel="noopener noreferrer" style="color: #007bff;">${result.original}</a></p>`;
      content += `<p style="margin: 0 0 10px 0; word-wrap: break-word;"><b>规范化:</b> <span style="color: #555;">${result.normalized}</span></p>`;
      if (result.isBookmarked) {
        content += `<p style="margin: 0; word-wrap: break-word;"><b>书签位置:</b> <a href="${result.bookmarkUrl}" target="_blank" rel="noopener noreferrer" style="color: #007bff;">${result.bookmarkUrl || '未知'}</a></p>`;
      }
    }

    modal.innerHTML = closeButton + content;
    document.body.appendChild(modal);

    if (isMultiple) {
      this.renderModalActionButtons(results);
    }
 
    document.getElementById('bookmark-sentry-modal-close')?.addEventListener('click', () => {
      modal.remove();
    });

    // 设置自动关闭
    this.setModalAutoClose();
  }

  private cancelModalAutoClose() {
    if (this.modalCloseTimerId) {
      clearTimeout(this.modalCloseTimerId);
      this.modalCloseTimerId = null;
      console.log('[ContentScript] 弹窗自动关闭已取消');
    }
  }

  private setModalAutoClose() {
    this.cancelModalAutoClose(); // Always clear previous timer
    if (this.modalDuration > 0) {
      const modal = document.getElementById('bookmark-sentry-modal');
      if (modal) {
        this.modalCloseTimerId = setTimeout(() => {
          modal.remove();
        }, this.modalDuration * 1000) as unknown as number;
      }
    }
  }
  
  /**
   * 截断URL显示
   */
  private truncateUrl(url: string, maxLength: number = 60): string {
    if (!url || url.length <= maxLength) return url || '';
    return url.substring(0, maxLength - 3) + '...';
  }

  // Custom modal for batch open choice, adapted for content script
  private showBatchOpenChoiceModal(question: string): Promise<'manual' | 'auto' | 'cancel'> {
      return new Promise((resolve) => {
          const existingModal = document.getElementById('bookmark-sentry-choice-modal-cs');
          if (existingModal) existingModal.remove();

          const modalOverlay = document.createElement('div');
          modalOverlay.id = 'bookmark-sentry-choice-modal-cs';
          modalOverlay.style.cssText = `
              position: fixed; top: 0; left: 0; width: 100%; height: 100%;
              background: rgba(0, 0, 0, 0.6); z-index: 100000000;
              display: flex; justify-content: center; align-items: center;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          `;

          const modalContent = document.createElement('div');
          modalContent.style.cssText = `
              background: white; padding: 24px; border-radius: 8px;
              box-shadow: 0 5px 15px rgba(0,0,0,0.3);
              text-align: center; color: #333;
              width: 90%; max-width: 400px;
          `;
          
          modalContent.innerHTML = `
              <h3 style="margin-top: 0; font-size: 16px; color: #111;">${question}</h3>
              <div style="display: flex; justify-content: center; gap: 12px; margin-top: 24px;">
                  <button id="cs-choice-manual" style="padding: 10px 16px; border: none; border-radius: 6px; background: #2563eb; color: white; cursor: pointer; font-size: 14px;">手动分批</button>
                  <button id="cs-choice-auto" style="padding: 10px 16px; border: none; border-radius: 6px; background: #6b7280; color: white; cursor: pointer; font-size: 14px;">自动分批</button>
                  <button id="cs-choice-cancel" style="padding: 10px 16px; border: none; border-radius: 6px; background: #e5e7eb; color: #333; cursor: pointer; font-size: 14px;">关闭</button>
              </div>
          `;
          
          modalOverlay.appendChild(modalContent);
          document.body.appendChild(modalOverlay);

          const cleanup = () => modalOverlay.remove();

          document.getElementById('cs-choice-manual')?.addEventListener('click', () => { cleanup(); resolve('manual'); });
          document.getElementById('cs-choice-auto')?.addEventListener('click', () => { cleanup(); resolve('auto'); });
          document.getElementById('cs-choice-cancel')?.addEventListener('click', () => { cleanup(); resolve('cancel'); });
      });
  }
  
  private renderModalActionButtons(results: any[]) {
    const container = document.getElementById('modal-actions-bar');
    if (!container) return;

    const bookmarkedItems = results.filter(item => item.isBookmarked);
    const unbookmarkedItems = results.filter(item => !item.isBookmarked);
    const performanceWarningThreshold = this.batchOpenSize * 3;

    const urlsByType = {
      bookmarked: bookmarkedItems.map(i => i.original),
      unbookmarked: unbookmarkedItems.map(i => i.original),
      all: results.map(i => i.original)
    };

    const actions = [
      { id: 'modal-open-unbookmarked', text: '打开未收藏', urls: urlsByType.unbookmarked },
      { id: 'modal-open-bookmarked', text: '打开已收藏', urls: urlsByType.bookmarked },
      { id: 'modal-open-all', text: '打开所有', urls: urlsByType.all },
    ];

    actions.forEach(action => {
      if (action.urls.length > 0) {
        const button = document.createElement('button');
        button.id = action.id;
        button.textContent = `${action.text} (${action.urls.length})`;
        button.style.cssText = `padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; background-color: #f8f9fa; cursor: pointer; font-size: 12px; margin-right: 8px;`;
        button.addEventListener('click', async () => {
          if (action.urls.length > performanceWarningThreshold && !confirm(`您将打开 ${action.urls.length} 个链接，这可能会影响浏览器性能。要继续吗？`)) {
            return;
          }
          
          const opener = new BatchLinkOpener(action.urls, this.batchOpenSize, () => this.cancelModalAutoClose());
          const batchControlsContainer = document.getElementById('modal-batch-controls') as HTMLDivElement;
          
          const triggerThreshold = Math.max(this.batchOpenSize, 10);
          if (action.urls.length > triggerThreshold) {
            this.cancelModalAutoClose(); // 在弹出选择框前，暂停计时器
            const choice = await this.showBatchOpenChoiceModal('链接数量较多，请选择打开方式：');
            
            if (choice === 'manual') {
              opener.startManual(batchControlsContainer);
            } else if (choice === 'auto') {
              opener.startAuto(batchControlsContainer);
            } else if (choice === 'cancel') {
              // 用户选择关闭，重新开始计时
              this.setModalAutoClose();
            }
          } else {
              // 链接数不多时，自动分批打开，避免一次性打开过多标签页
              opener.startAuto(batchControlsContainer);
          }
        });
        container.appendChild(button);
      }
    });
  }

  private showUrlEditModal(urls: string[], source: string) {
    const existingModal = document.getElementById('bookmark-sentry-edit-modal');
    if (existingModal) existingModal.remove();

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'bookmark-sentry-edit-modal';
    modalOverlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.6); z-index: 99999998;
      display: flex; justify-content: center; align-items: center;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: #fff; padding: 24px; border-radius: 8px; width: 90%;
      max-width: 500px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
      color: #333; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    const urlCount = urls.length;
    modalContent.innerHTML = `
      <h2 style="margin-top: 0; color: #111;">编辑URL (共 ${urlCount} 个)</h2>
      <p style="font-size: 14px; color: #666; margin-bottom: 16px;">每行一个URL。您可以修改或删除列表中的URL。</p>
      <textarea id="bookmark-sentry-edit-textarea" style="width: 100%; height: 200px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; resize: vertical;"></textarea>
      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px;">
        <button id="bookmark-sentry-edit-confirm" style="padding: 10px 16px; border: none; border-radius: 6px; background: #2563eb; color: white; cursor: pointer;">查询</button>
        <button id="bookmark-sentry-edit-cancel" style="padding: 10px 16px; border: none; border-radius: 6px; background: #e5e7eb; color: #333; cursor: pointer;">取消</button>
      </div>
    `;

    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    const textarea = document.getElementById('bookmark-sentry-edit-textarea') as HTMLTextAreaElement;
    textarea.value = urls.join('\n');

    document.getElementById('bookmark-sentry-edit-confirm')?.addEventListener('click', () => {
      const editedUrls = textarea.value.split('\n').map(url => url.trim()).filter(Boolean);
      chrome.runtime.sendMessage({
        type: 'CHECK_EDITED_URLS',
        payload: { urls: editedUrls, source }
      });
      modalOverlay.remove();
    });

    document.getElementById('bookmark-sentry-edit-cancel')?.addEventListener('click', () => {
      modalOverlay.remove();
    });
  }
}

// 批量打开链接的管理器 - 与 results/main.ts 中的类似
class BatchLinkOpener {
  private urls: string[];
  private batchSize: number;
  private onManualBatchOpen: () => void;
  private currentIndex: number = 0;
  private controlsContainer: HTMLDivElement | null = null;
  private intervalId: number | null = null;

  constructor(urls: string[], batchSize: number, onManualBatchOpen: () => void) {
    this.urls = urls;
    this.batchSize = batchSize;
    this.onManualBatchOpen = onManualBatchOpen;
  }

  openNextBatch(container?: HTMLElement) {
    if (this.currentIndex >= this.urls.length) {
      this.updateControlsMessage('所有链接已打开完毕。');
      if (this.intervalId) clearInterval(this.intervalId);
      return;
    }
    const batch = this.urls.slice(this.currentIndex, this.currentIndex + this.batchSize);
    batch.forEach(url => chrome.runtime.sendMessage({ type: 'OPEN_TAB', payload: { url } })); // 通过background打开
    this.currentIndex += batch.length;
    if (container && !this.controlsContainer) this.renderControls(container, 'manual');
    this.updateControls();
  }

  startManual(container: HTMLElement) {
    this.renderControls(container, 'manual');
  }

  startAuto(container: HTMLElement) {
    this.renderControls(container, 'auto');
    this.openNextBatch(); // Open first batch immediately
    this.intervalId = setInterval(() => this.openNextBatch(), 2000) as unknown as number;
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.controlsContainer) this.controlsContainer.style.display = 'none';
  }

  renderControls(container: HTMLElement, mode: 'manual' | 'auto') {
    container.innerHTML = `
      <div style="margin-top: 10px; padding: 8px; background-color: #f1f1f1; border-radius: 4px;">
        <p id="modal-batch-status" style="font-size: 12px; margin: 0 0 8px 0;"></p>
        ${mode === 'manual' ? '<button id="modal-next-batch-btn" style="padding: 4px 8px; font-size: 12px;">打开下一批</button>' : ''}
        <button id="modal-cancel-batch-btn" style="padding: 4px 8px; font-size: 12px;">停止</button>
      </div>
    `;
    this.controlsContainer = container.firstElementChild as HTMLDivElement;
    this.updateControls();
    
    if (mode === 'manual') {
      const nextButton = document.getElementById('modal-next-batch-btn');
      if (nextButton) {
        // 此监听器仅处理第一次点击，用于取消计时器，然后会自动移除。
        nextButton.addEventListener('click', this.onManualBatchOpen, { once: true });
        
        // 此监听器处理所有点击（包括第一次），用于打开链接。
        nextButton.addEventListener('click', () => this.openNextBatch());
      }
    }
    document.getElementById('modal-cancel-batch-btn')?.addEventListener('click', () => this.stop());
  }

  updateControls() {
    const statusEl = document.getElementById('modal-batch-status');
    if (statusEl) {
      statusEl.textContent = `已打开 ${this.currentIndex} / ${this.urls.length} 个链接。`;
    }
    const nextBtn = document.getElementById('modal-next-batch-btn') as HTMLButtonElement;
    if(nextBtn) {
        nextBtn.disabled = this.currentIndex >= this.urls.length;
    }
  }
  
  updateControlsMessage(message: string) {
    const statusEl = document.getElementById('modal-batch-status');
    if (statusEl) {
        statusEl.textContent = message;
    }
     const nextBtn = document.getElementById('modal-next-batch-btn') as HTMLButtonElement;
    if(nextBtn) {
        nextBtn.style.display = 'none';
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