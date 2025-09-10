interface BookmarkQueryResult {
  isBookmarked: boolean;
  original: string;
  normalized: string;
  bookmarkUrl?: string;
}

// 判断两个URL是否本质上相同（忽略协议、www、尾部斜杠等）
function areUrlsEssentiallySame(url1: string, url2: string): boolean {
  try {
    const normalize = (url: string) => {
      const u = new URL(url);
      // 移除协议差异、www前缀、尾部斜杠、hash
      let normalized = u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '') + u.search;
      return normalized.toLowerCase();
    };
    
    return normalize(url1) === normalize(url2);
  } catch {
    // 如果URL解析失败，回退到简单比较
    return url1.toLowerCase() === url2.toLowerCase();
  }
}

// 主加载和渲染函数
async function loadAndRenderResults() {
  const resultsContainer = document.getElementById('results-container');
  const actionsContainer = document.getElementById('actions-container');
  if (!resultsContainer || !actionsContainer) return;
 
  try {
    const data = await chrome.storage.local.get(['searchResults', 'settings']);
    const searchResults = data.searchResults;
    const settings = data.settings || {};
    const batchOpenSize = settings.batchOpenSize || 5;
    const performanceWarningThreshold = batchOpenSize * 3; // 超过3个批次就警告

    if (!searchResults) {
      resultsContainer.innerHTML = '<p>未找到搜索结果。</p>';
      return;
    }

    // 清空旧内容
    resultsContainer.innerHTML = '';
    actionsContainer.innerHTML = '';

    if (searchResults.isTextSearch) {
      renderTextSearchResults(searchResults, resultsContainer);
    } else {
      renderUrlSearchResults(searchResults, resultsContainer, actionsContainer, batchOpenSize, performanceWarningThreshold);
    }
  } catch (error) {
    console.error('加载搜索结果失败:', error);
    resultsContainer.innerHTML = '<p>加载结果时出错。</p>';
  }
}

// 监听来自 background 的消息以刷新页面
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'NEW_RESULTS_AVAILABLE') {
    console.log('收到新结果，正在刷新页面...');
    loadAndRenderResults();
  }
});

// 页面加载时首次渲染
document.addEventListener('DOMContentLoaded', loadAndRenderResults);


function renderTextSearchResults(data: { originalText: string; query: string; results: { title: string, url?: string }[] }, container: HTMLElement) {
  // 创建原始文本的安全容器
  const originalTextSection = document.createElement('div');
  originalTextSection.className = 'result-section';
  const h2 = document.createElement('h2');
  h2.textContent = '原始文本';
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordWrap = 'break-word';
  const code = document.createElement('code');
  code.textContent = data.originalText; // 安全地设置文本内容
  pre.appendChild(code);
  originalTextSection.appendChild(h2);
  originalTextSection.appendChild(pre);
  container.appendChild(originalTextSection);

  // 渲染其余内容
  let otherHtml = `
    <div class="result-section">
      <h2>文本搜索结果</h2>
      <p>为查询 "<strong>${data.query}</strong>" 找到了 ${data.results.length} 个书签。</p>
    </div>
  `;

  if (data.results.length > 0) {
    otherHtml += `
      <div class="result-section">
        <h2>找到的书签</h2>
        <ul>
          ${data.results.map(item => `
            <li>
              <strong>${item.title}</strong><br>
              <a href="${item.url}" target="_blank">${item.url}</a>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }
  
  container.insertAdjacentHTML('beforeend', otherHtml);
}

function renderUrlSearchResults(data: { originalText: string; results: BookmarkQueryResult[] }, container: HTMLElement, actionsContainer: HTMLElement, batchOpenSize: number, performanceWarningThreshold: number) {
  const { originalText, results } = data;
  const bookmarkedItems = results.filter(item => item.isBookmarked);
  const unbookmarkedItems = results.filter(item => !item.isBookmarked);

  // Inject styles for new components
  const styleId = 'results-page-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .collapsible .collapsible-header { cursor: pointer; position: relative; }
      .collapsible .collapsible-header::after { content: '\\25B8'; position: absolute; right: 10px; font-size: 12px; transition: transform 0.2s; transform: rotate(90deg); }
      .collapsible.collapsed .collapsible-header::after { transform: rotate(0deg); }
      .collapsible .collapsible-content { display: block; padding-top: 10px; }
      .collapsible.collapsed .collapsible-content { display: none; }
    `;
    document.head.appendChild(style);
  }

  // 渲染操作按钮
  renderActionButtons(actionsContainer, {
    bookmarked: bookmarkedItems.map(i => i.original),
    unbookmarked: unbookmarkedItems.map(i => i.original),
    all: results.map(i => i.original)
  }, batchOpenSize, performanceWarningThreshold);

  // 创建原始文本的安全容器
  const originalTextSection = document.createElement('div');
  originalTextSection.className = 'result-section';
  const h2 = document.createElement('h2');
  h2.textContent = '原始文本';
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordWrap = 'break-word';
  const code = document.createElement('code');
  code.textContent = originalText; // 安全地设置文本内容
  pre.appendChild(code);
  originalTextSection.appendChild(h2);
  originalTextSection.appendChild(pre);
  container.appendChild(originalTextSection);

  const urlListThreshold = 10;

  const createUrlListHtml = (title: string, items: {url: string, text?: string}[], isCollapsible: boolean) => {
    const listContent = items.map(item => `<li><a href="${item.url}" target="_blank">${item.text || item.url}</a></li>`).join('');

    if (isCollapsible) {
        return `
            <div class="result-section collapsible">
                <h2 class="collapsible-header">${title} (${items.length})</h2>
                <div class="collapsible-content">
                    <ul style="max-height: 200px; overflow-y: auto; border: 1px solid #eee; padding: 10px;">
                        ${listContent}
                    </ul>
                </div>
            </div>
        `;
    } else {
        return `
            <div class="result-section">
                <h2>${title}</h2>
                <ul>
                    ${listContent}
                </ul>
            </div>
        `;
    }
  };

  const originalUrls = results.map(item => ({ url: item.original }));
  const normalizedUrls = results.map(item => ({ url: item.normalized }));

  // 渲染其余内容
  let otherHtml = `
    <div class="result-section">
      <h2>摘要</h2>
      <p>检查了 ${results.length} 个URL，找到 ${bookmarkedItems.length} 个已收藏，${unbookmarkedItems.length} 个未收藏。</p>
    </div>
    <div id="filter-bar" class="result-section" style="padding: 10px; background-color: #f7f7f7; border-radius: 5px;">
        <button id="filter-all" style="margin-right: 8px;">查看全部 (${results.length})</button>
        <button id="filter-bookmarked" style="margin-right: 8px;">查看已收藏 (${bookmarkedItems.length})</button>
        <button id="filter-unbookmarked">查看未收藏 (${unbookmarkedItems.length})</button>
    </div>
    
    ${createUrlListHtml('提取到的URL', originalUrls, results.length > urlListThreshold)}
    ${createUrlListHtml('规范化后的URL', normalizedUrls, results.length > urlListThreshold)}
    
    <div class="result-section" id="bookmarked-section">
      <h2>已收藏的详情</h2>
      <ul>
        ${bookmarkedItems.length > 0
          ? bookmarkedItems.map(item => {
            const shouldShowBookmarkUrl = item.bookmarkUrl &&
              item.bookmarkUrl.toLowerCase() !== item.original.toLowerCase() &&
              !areUrlsEssentiallySame(item.bookmarkUrl, item.original);
            
            return `
              <li>
                <a href="${item.original}" target="_blank">${item.original}</a>
                ${shouldShowBookmarkUrl ? `<br><span class="meta">书签中保存为: <a href="${item.bookmarkUrl}" target="_blank">${item.bookmarkUrl}</a></span>` : ''}
              </li>
            `;
          }).join('')
          : '<li>无</li>'
        }
      </ul>
    </div>
    <div class="result-section" id="unbookmarked-section">
      <h2>未收藏的详情</h2>
      <ul>
        ${unbookmarkedItems.length > 0
          ? unbookmarkedItems.map(item => `<li><a href="${item.original}" target="_blank">${item.original}</a></li>`).join('')
          : '<li>无</li>'
        }
      </ul>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', otherHtml);
  
  // Add event listeners for collapsibles
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', event => {
      const collapsible = (event.currentTarget as HTMLElement).parentElement;
      collapsible?.classList.toggle('collapsed');
    });
  });

  // Add event listeners for filters
  const bookmarkedSection = document.getElementById('bookmarked-section') as HTMLElement;
  const unbookmarkedSection = document.getElementById('unbookmarked-section') as HTMLElement;

  if (bookmarkedSection && unbookmarkedSection) {
    const filterBar = document.getElementById('filter-bar');
    
    document.getElementById('filter-all')?.addEventListener('click', () => {
      bookmarkedSection.style.display = 'block';
      unbookmarkedSection.style.display = 'block';
      filterBar?.scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('filter-bookmarked')?.addEventListener('click', () => {
      bookmarkedSection.style.display = 'block';
      unbookmarkedSection.style.display = 'none';
      bookmarkedSection.scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('filter-unbookmarked')?.addEventListener('click', () => {
      bookmarkedSection.style.display = 'none';
      unbookmarkedSection.style.display = 'block';
      unbookmarkedSection.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

// 批量打开链接的管理器 (与 content/index.ts 同步)
class BatchLinkOpener {
  private urls: string[];
  private batchSize: number;
  private onManualBatchOpen?: () => void; // 回调设为可选
  private currentIndex: number = 0;
  private controlsContainer: HTMLDivElement | null = null;
  private intervalId: number | null = null;

  constructor(urls: string[], batchSize: number, onManualBatchOpen?: () => void) {
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
    batch.forEach(url => chrome.tabs.create({ url, active: false }));
    this.currentIndex += batch.length;
    if (container && !this.controlsContainer) this.renderControls(container, 'manual');
    this.updateControls();
  }

  startManual(container: HTMLElement) {
    this.renderControls(container, 'manual');
  }

  startAuto(container: HTMLElement) {
    this.renderControls(container, 'auto');
    this.openNextBatch(); // 自动模式立即打开第一批
    this.intervalId = setInterval(() => this.openNextBatch(), 2000) as unknown as number;
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.controlsContainer) this.controlsContainer.style.display = 'none';
  }

  renderControls(container: HTMLElement, mode: 'manual' | 'auto') {
    container.innerHTML = `
      <div id="batch-controls" class="batch-controls" style="display: block;">
        <p id="batch-status"></p>
        ${mode === 'manual' ? '<button id="next-batch-btn">打开下一批</button>' : ''}
        <button id="cancel-batch-btn">停止</button>
      </div>
    `;
    this.controlsContainer = container.firstElementChild as HTMLDivElement;
    this.updateControls();
    
    if (mode === 'manual') {
      const nextButton = document.getElementById('next-batch-btn');
      if (nextButton) {
        if (this.onManualBatchOpen) {
          nextButton.addEventListener('click', this.onManualBatchOpen, { once: true });
        }
        nextButton.addEventListener('click', () => this.openNextBatch());
      }
    }
    document.getElementById('cancel-batch-btn')?.addEventListener('click', () => this.stop());
  }

  updateControls() {
    const statusEl = this.controlsContainer?.querySelector('#batch-status');
    if (statusEl) {
      statusEl.textContent = `已打开 ${this.currentIndex} / ${this.urls.length} 个链接。`;
    }
    const nextBtn = this.controlsContainer?.querySelector('#next-batch-btn') as HTMLButtonElement;
    if(nextBtn) {
        nextBtn.disabled = this.currentIndex >= this.urls.length;
    }
  }
  
  updateControlsMessage(message: string) {
    const statusEl = this.controlsContainer?.querySelector('#batch-status');
    if (statusEl) {
        statusEl.textContent = message;
    }
     const nextBtn = this.controlsContainer?.querySelector('#next-batch-btn') as HTMLButtonElement;
    if(nextBtn) {
        nextBtn.style.display = 'none';
    }
  }
}

// Custom modal for batch open choice
function showBatchOpenChoiceModal(question: string): Promise<'manual' | 'auto' | 'cancel'> {
    return new Promise((resolve) => {
        const existingModal = document.getElementById('bookmark-sentry-choice-modal');
        if (existingModal) existingModal.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'bookmark-sentry-choice-modal';
        modalOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5); z-index: 10000;
            display: flex; justify-content: center; align-items: center;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white; padding: 20px; border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            text-align: center;
            font-family: sans-serif;
            color: black;
            width: 90%;
            max-width: 400px;
        `;
        
        modalContent.innerHTML = `
            <h3 style="margin-top: 0; font-size: 16px;">${question}</h3>
            <div style="display: flex; justify-content: center; gap: 10px; margin-top: 20px;">
                <button id="choice-manual" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; background-color: #007bff; color: white; cursor: pointer;">手动分批</button>
                <button id="choice-auto" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; background-color: #6c757d; color: white; cursor: pointer;">自动分批</button>
                <button id="choice-cancel" style="padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; background-color: #f8f9fa; cursor: pointer;">关闭</button>
            </div>
        `;
        
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        const cleanup = () => modalOverlay.remove();

        document.getElementById('choice-manual')?.addEventListener('click', () => { cleanup(); resolve('manual'); });
        document.getElementById('choice-auto')?.addEventListener('click', () => { cleanup(); resolve('auto'); });
        document.getElementById('choice-cancel')?.addEventListener('click', () => { cleanup(); resolve('cancel'); });
    });
}

function renderActionButtons(container: HTMLElement, urlsByType: { bookmarked: string[], unbookmarked: string[], all: string[] }, batchSize: number, warningThreshold: number) {
  const actions = [
    { id: 'open-unbookmarked', text: '一键打开未收藏链接', urls: urlsByType.unbookmarked },
    { id: 'open-bookmarked', text: '一键打开已收藏链接', urls: urlsByType.bookmarked },
    { id: 'open-all', text: '一键打开所有链接', urls: urlsByType.all },
  ];

  const actionsBar = document.createElement('div');
  actionsBar.className = 'actions-bar';
  
  const batchControlsContainer = document.createElement('div');

  actions.forEach(action => {
    if (action.urls.length > 0) {
      const button = document.createElement('button');
      button.id = action.id;
      button.textContent = `${action.text} (${action.urls.length})`;
      button.addEventListener('click', async () => {
        if (action.urls.length > warningThreshold && !confirm(`您将打开 ${action.urls.length} 个链接，这可能会影响浏览器性能。要继续吗？`)) {
          return;
        }

        const opener = new BatchLinkOpener(action.urls, batchSize);
        const triggerThreshold = Math.max(batchSize, 10);
        if (action.urls.length > triggerThreshold) {
           const choice = await showBatchOpenChoiceModal('链接数量较多，请选择打开方式：');
           if (choice === 'manual') {
             opener.startManual(batchControlsContainer);
           } else if (choice === 'auto') {
             opener.startAuto(batchControlsContainer);
           }
           // if 'cancel', do nothing.
        } else {
            // 链接数不多时，自动分批打开，避免一次性打开过多标签页
            opener.startAuto(batchControlsContainer);
        }
      });
      actionsBar.appendChild(button);
    }
  });

  container.appendChild(actionsBar);
  container.appendChild(batchControlsContainer);
}