/**
 * DOM标记器 - 在页面上标记已收藏的链接
 */
export class DomMarker {
  private markedUrls: Set<string> = new Set();
  private markedElements: Map<string, HTMLElement[]> = new Map();
  private isVisible: boolean = true;

  /**
   * 标记指定的URL
   */
  markUrls(urls: string[]) {
    console.log('[DomMarker] 开始标记', urls.length, '个URL');
    
    for (const url of urls) {
      // 添加到已标记集合
      this.markedUrls.add(url);
      
      // 查找并标记对应的DOM元素
      this.markUrlInDom(url);
    }
  }

  /**
   * 在DOM中标记指定的URL
   */
  private markUrlInDom(url: string) {
    // 查找所有匹配的链接
    const links = this.findLinksWithUrl(url);
    
    if (links.length === 0) {
      return;
    }
    
    console.log('[DomMarker] 为URL标记', links.length, '个元素:', url);
    
    // 保存元素引用
    if (!this.markedElements.has(url)) {
      this.markedElements.set(url, []);
    }
    
    for (const link of links) {
      // 检查是否已经标记过
      if (link.hasAttribute('data-bookmark-sentry')) {
        continue;
      }
      
      // 添加标记
      this.addMarkToElement(link);
      
      // 保存引用
      this.markedElements.get(url)!.push(link);
    }
  }

  /**
   * 查找指定URL的所有链接元素
   */
  private findLinksWithUrl(url: string): HTMLAnchorElement[] {
    const normalizedUrl = this.normalizeUrl(url);
    const links: HTMLAnchorElement[] = [];
    
    // 查找所有链接
    const allLinks = document.querySelectorAll('a[href]');
    
    for (const link of allLinks) {
      const linkUrl = this.normalizeUrl((link as HTMLAnchorElement).href);
      
      // 比较URL（忽略末尾斜杠和协议差异）
      if (this.compareUrls(linkUrl, normalizedUrl)) {
        links.push(link as HTMLAnchorElement);
      }
    }
    
    return links;
  }

  /**
   * 为元素添加标记
   */
  private addMarkToElement(element: HTMLAnchorElement) {
    // 添加数据属性
    element.setAttribute('data-bookmark-sentry', 'true');
    
    // 添加CSS类
    element.classList.add('bookmark-sentry-marked');
    
    // 创建图标元素
    const icon = this.createIconElement();
    
    // 决定图标位置
    const insertPosition = this.getIconInsertPosition(element);
    
    if (insertPosition === 'after') {
      // 插入到链接后面
      element.insertAdjacentElement('afterend', icon);
    } else if (insertPosition === 'inside') {
      // 插入到链接内部末尾
      element.appendChild(icon);
    } else {
      // 插入到链接前面
      element.insertAdjacentElement('beforebegin', icon);
    }
    
    // 添加悬浮提示
    this.addTooltip(icon);
  }

  /**
   * 创建图标元素
   */
  private createIconElement(): HTMLElement {
    const icon = document.createElement('span');
    icon.className = 'bookmark-sentry-icon';
    icon.setAttribute('data-bookmark-sentry-icon', 'true');
    icon.title = '已收藏';
    
    // 如果不可见，立即隐藏
    if (!this.isVisible) {
      icon.style.display = 'none';
    }
    
    return icon;
  }

  /**
   * 决定图标插入位置
   */
  private getIconInsertPosition(element: HTMLAnchorElement): 'before' | 'after' | 'inside' {
    // 检查元素的显示类型
    const display = window.getComputedStyle(element).display;
    
    // 块级元素，插入到内部
    if (display === 'block' || display === 'flex' || display === 'grid') {
      return 'inside';
    }
    
    // 检查父元素是否是列表项
    const parent = element.parentElement;
    if (parent && (parent.tagName === 'LI' || parent.tagName === 'DD')) {
      return 'after';
    }
    
    // 默认插入到后面
    return 'after';
  }

  /**
   * 添加工具提示
   */
  private addTooltip(icon: HTMLElement) {
    const tooltip = document.createElement('div');
    tooltip.className = 'bookmark-sentry-tooltip';
    tooltip.textContent = '此链接已添加到书签';
    
    // 设置icon为相对定位，以便tooltip能正确定位
    icon.style.position = 'relative';
    
    icon.appendChild(tooltip);
  }

  /**
   * 规范化URL
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // 移除片段标识符
      urlObj.hash = '';
      
      // 移除末尾斜杠
      let normalized = urlObj.toString();
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      
      // 移除www前缀
      normalized = normalized.replace(/\/\/www\./, '//');
      
      return normalized.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  }

  /**
   * 比较两个URL是否相同
   */
  private compareUrls(url1: string, url2: string): boolean {
    // 直接比较
    if (url1 === url2) {
      return true;
    }
    
    // 忽略协议比较（http vs https）
    const withoutProtocol1 = url1.replace(/^https?:\/\//, '');
    const withoutProtocol2 = url2.replace(/^https?:\/\//, '');
    
    return withoutProtocol1 === withoutProtocol2;
  }

  /**
   * 清除所有标记
   */
  clearAllMarks() {
    console.log('[DomMarker] 清除所有标记');
    
    // 移除所有图标
    const icons = document.querySelectorAll('[data-bookmark-sentry-icon]');
    for (const icon of icons) {
      icon.remove();
    }
    
    // 移除所有标记属性和类
    const markedLinks = document.querySelectorAll('[data-bookmark-sentry]');
    for (const link of markedLinks) {
      link.removeAttribute('data-bookmark-sentry');
      link.classList.remove('bookmark-sentry-marked');
    }
    
    // 清空记录
    this.markedUrls.clear();
    this.markedElements.clear();
  }

  /**
   * 隐藏所有标记
   */
  hideAllMarks() {
    this.isVisible = false;
    console.log('[DomMarker] 隐藏所有标记');
    
    // 移除所有图标元素
    const icons = document.querySelectorAll('[data-bookmark-sentry-icon]');
    for (const icon of icons) {
      icon.remove();
    }
    
    // 移除所有标记属性和类
    const markedLinks = document.querySelectorAll('[data-bookmark-sentry]');
    for (const link of markedLinks) {
      link.removeAttribute('data-bookmark-sentry');
      link.classList.remove('bookmark-sentry-marked');
    }
    
    // 注意：保留 markedUrls 和 markedElements 的记录，以便重新启用时可以恢复
  }

  /**
   * 显示所有标记
   */
  showAllMarks() {
    this.isVisible = true;
    
    const icons = document.querySelectorAll('.bookmark-sentry-icon');
    for (const icon of icons) {
      (icon as HTMLElement).style.display = '';
    }
  }

  /**
   * 获取已标记的数量
   */
  getMarkedCount(): number {
    return this.markedUrls.size;
  }

  /**
   * 检查URL是否已标记
   */
  isUrlMarked(url: string): boolean {
    const normalized = this.normalizeUrl(url);
    
    for (const markedUrl of this.markedUrls) {
      if (this.compareUrls(normalized, this.normalizeUrl(markedUrl))) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 刷新标记（重新查找DOM元素）
   */
  refreshMarks() {
    console.log('[DomMarker] 刷新标记');
    
    // 保存当前标记的URL
    const urls = Array.from(this.markedUrls);
    
    // 清除所有标记
    this.clearAllMarks();
    
    // 重新标记
    this.markUrls(urls);
  }
}