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
  if (!resultsContainer) return;

  try {
    const { searchResults } = await chrome.storage.local.get('searchResults');
    if (!searchResults) {
      resultsContainer.innerHTML = '<p>未找到搜索结果。</p>';
      return;
    }

    // 清空旧内容
    resultsContainer.innerHTML = '';

    if (searchResults.isTextSearch) {
      renderTextSearchResults(searchResults, resultsContainer);
    } else {
      renderUrlSearchResults(searchResults, resultsContainer);
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

function renderUrlSearchResults(data: { originalText: string; results: BookmarkQueryResult[] }, container: HTMLElement) {
  const { originalText, results } = data;
  const bookmarkedItems = results.filter(item => item.isBookmarked);
  const unbookmarkedItems = results.filter(item => !item.isBookmarked);

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

  // 渲染其余内容
  let otherHtml = `
    <div class="result-section">
      <h2>摘要</h2>
      <p>检查了 ${results.length} 个URL，找到 ${bookmarkedItems.length} 个已收藏，${unbookmarkedItems.length} 个未收藏。</p>
    </div>
    <div class="result-section">
      <h2>提取到的URL</h2>
      <ul>
        ${results.map(item => `<li><a href="${item.original}" target="_blank">${item.original}</a></li>`).join('')}
      </ul>
    </div>
    <div class="result-section">
      <h2>规范化后的URL</h2>
      <ul>
        ${results.map(item => `<li><a href="${item.normalized}" target="_blank">${item.normalized}</a></li>`).join('')}
      </ul>
    </div>
    <div class="result-section">
      <h2>已收藏的详情</h2>
      <ul>
        ${bookmarkedItems.length > 0
          ? bookmarkedItems.map(item => {
            // 只有当书签URL与原始URL有实质性差异时才显示
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
    <div class="result-section">
      <h2>未收藏的详情</h2>
      <ul>
        ${unbookmarkedItems.length > 0
          ? unbookmarkedItems.map(item => `
            <li>
              <a href="${item.original}" target="_blank">${item.original}</a>
            </li>
          `).join('')
          : '<li>无</li>'
        }
      </ul>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', otherHtml);
}