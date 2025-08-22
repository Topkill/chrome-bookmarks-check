<template>
  <div class="popup-container">
    <!-- 头部 -->
    <header class="header">
      <div class="logo">
        <span class="icon">⭐</span>
        <h1>书签哨兵</h1>
      </div>
      <span class="version">v{{ version }}</span>
    </header>

    <!-- 缓存状态 -->
    <section class="status-section">
      <h2>缓存状态</h2>
      <div class="status-grid">
        <div class="status-item">
          <span class="label">书签总数</span>
          <span class="value">{{ cacheStatus.bookmarkCount }}</span>
        </div>
        <div class="status-item">
          <span class="label">最后更新</span>
          <span class="value">{{ lastUpdateTime }}</span>
        </div>
        <div class="status-item">
          <span class="label">缓存版本</span>
          <span class="value">v{{ cacheStatus.version }}</span>
        </div>
        <div class="status-item">
          <span class="label">状态</span>
          <span class="value" :class="statusClass">
            {{ cacheStatus.isBuilding ? '重建中...' : '就绪' }}
          </span>
        </div>
      </div>
    </section>

    <!-- 当前页面统计 -->
    <section class="stats-section" v-if="pageStats">
      <h2>当前页面</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="label">链接总数</span>
          <span class="value">{{ pageStats.totalLinks }}</span>
        </div>
        <div class="stat-item">
          <span class="label">已处理</span>
          <span class="value">{{ pageStats.processedLinks }}</span>
        </div>
        <div class="stat-item">
          <span class="label">已标记</span>
          <span class="value highlight">{{ pageStats.markedLinks }}</span>
        </div>
        <div class="stat-item">
          <span class="label">标记状态</span>
          <span class="value" :class="pageStats.isEnabled ? 'status-on' : 'status-off'">
            {{ pageStats.isEnabled ? '已开启' : '已关闭' }}
          </span>
        </div>
      </div>
    </section>

    <!-- 操作按钮 -->
    <section class="actions-section">
      <button
        class="btn btn-primary"
        @click="enableMarking"
        :disabled="!pageStats || pageStats.isEnabled || markingLoading"
      >
        <span v-if="markingLoading" class="loading-spinner"></span>
        {{ markingLoading ? '开启中...' : '手动开启标记' }}
      </button>
      
      <button
        class="btn btn-secondary"
        @click="disableMarking"
        :disabled="!pageStats || !pageStats.isEnabled || markingLoading"
      >
        <span v-if="markingLoading" class="loading-spinner"></span>
        {{ markingLoading ? '关闭中...' : '关闭标记' }}
      </button>
      
      <button
        class="btn btn-secondary"
        @click="refreshMarks"
        :disabled="!pageStats || !pageStats.isEnabled || refreshingMarks"
      >
        <span v-if="refreshingMarks" class="loading-spinner"></span>
        {{ refreshingMarks ? '刷新中...' : '刷新标记' }}
      </button>

      <button
        class="btn btn-info"
        @click="extractAllUrls"
        :disabled="extracting"
      >
        <span v-if="extracting" class="loading-spinner"></span>
        {{ extracting ? '提取中...' : '提取页面URL' }}
      </button>
      
      <button
        class="btn btn-warning"
        @click="rebuildCache"
        :disabled="cacheStatus.isBuilding"
      >
        <span v-if="cacheStatus.isBuilding" class="loading-spinner"></span>
        {{ cacheStatus.isBuilding ? '重建中...' : '重建缓存' }}
      </button>
    </section>

    <!-- 进度提示 -->
    <div v-if="cacheStatus.isBuilding" class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: rebuildProgress + '%' }"></div>
      </div>
      <p class="progress-text">正在重建缓存... {{ rebuildProgress }}%</p>
    </div>

    <!-- 操作提示 -->
    <div v-if="notification.show" class="notification" :class="notification.type">
      <span>{{ notification.message }}</span>
    </div>

    <!-- 底部链接 -->
    <footer class="footer">
      <a @click="openOptions">设置</a>
      <span class="separator">|</span>
      <a @click="openHelp">帮助</a>
      <span class="separator">|</span>
      <a href="https://github.com/Topkill/chrome-bookmarks-check" target="_blank">GitHub</a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { CacheStatusPayload } from '@/types/messaging';

// 响应式数据
const version = ref('1.0.0');
const cacheStatus = ref<CacheStatusPayload>({
  version: 1,
  bookmarkCount: 0,
  lastUpdated: 0,
  isBuilding: false
});

const pageStats = ref<{
  totalLinks: number;
  processedLinks: number;
  markedLinks: number;
  isEnabled: boolean;
} | null>(null);

const extracting = ref(false);
const markingLoading = ref(false);
const refreshingMarks = ref(false);
const rebuildProgress = ref(0);

// 通知提示
const notification = ref({
  show: false,
  message: '',
  type: 'success' // success | error | info
});

let updateTimer: number | null = null;
let autoRefreshTimer: number | null = null;

// 显示通知
function showNotification(message: string, type: string = 'success') {
  notification.value = { show: true, message, type };
  setTimeout(() => {
    notification.value.show = false;
  }, 3000);
}

// 计算属性
const lastUpdateTime = computed(() => {
  if (!cacheStatus.value.lastUpdated) {
    return '从未';
  }
  
  const date = new Date(cacheStatus.value.lastUpdated);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // 转换为友好的时间格式
  if (diff < 60000) {
    return '刚刚';
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`;
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
});

const statusClass = computed(() => {
  return cacheStatus.value.isBuilding ? 'building' : 'ready';
});

// 方法
async function loadCacheStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_CACHE_STATUS'
    });
    
    if (response && !response.error) {
      cacheStatus.value = response;
    }
  } catch (error) {
    console.error('加载缓存状态失败:', error);
  }
}

async function loadPageStats() {
  try {
    // 获取当前活动标签
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id || !tab.url || !tab.url.startsWith('http')) {
      pageStats.value = null;
      return;
    }
    
    // 向Content Script请求统计信息
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_STATS'
    });
    
    if (response && !response.error) {
      pageStats.value = response;
    }
  } catch (error) {
    // Content Script可能未注入
    console.log('无法获取页面统计:', error);
    pageStats.value = null;
  }
}

async function enableMarking() {
  try {
    markingLoading.value = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id || !tab.url || !tab.url.startsWith('http')) {
      showNotification('此页面不支持标记', 'error');
      markingLoading.value = false;
      return;
    }
    
    await chrome.tabs.sendMessage(tab.id, {
      type: 'ENABLE_MARKING'
    });
    
    // 等待标记完成，然后重新加载统计
    setTimeout(async () => {
      await loadPageStats();
      markingLoading.value = false;
      showNotification('标记功能已开启', 'success');
    }, 600);
  } catch (error) {
    console.error('开启标记失败:', error);
    markingLoading.value = false;
  }
}

async function disableMarking() {
  try {
    markingLoading.value = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id || !tab.url || !tab.url.startsWith('http')) {
      showNotification('此页面不支持标记', 'error');
      markingLoading.value = false;
      return;
    }
    
    await chrome.tabs.sendMessage(tab.id, {
      type: 'DISABLE_MARKING'
    });
    
    // 重新加载统计
    await loadPageStats();
    markingLoading.value = false;
    showNotification('标记功能已关闭', 'info');
  } catch (error) {
    console.error('关闭标记失败:', error);
    markingLoading.value = false;
  }
}

async function refreshMarks() {
  try {
    refreshingMarks.value = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id || !tab.url || !tab.url.startsWith('http')) {
      showNotification('此页面不支持刷新', 'error');
      refreshingMarks.value = false;
      return;
    }
    
    await chrome.tabs.sendMessage(tab.id, {
      type: 'REFRESH_MARKS'
    });
    
    // 等待刷新完成，然后重新加载统计
    setTimeout(async () => {
      await loadPageStats();
      refreshingMarks.value = false;
      showNotification('标记已刷新', 'success');
    }, 600);
  } catch (error) {
    console.error('刷新标记失败:', error);
    refreshingMarks.value = false;
  }
}

async function rebuildCache() {
  if (cacheStatus.value.isBuilding) {
    return;
  }
  
  try {
    cacheStatus.value.isBuilding = true;
    rebuildProgress.value = 0;
    
    await chrome.runtime.sendMessage({
      type: 'TRIGGER_CACHE_REBUILD'
    });
    
    // 开始轮询状态和模拟进度
    startPolling();
    simulateProgress();
    showNotification('开始重建缓存...', 'info');
  } catch (error) {
    console.error('重建缓存失败:', error);
    cacheStatus.value.isBuilding = false;
    rebuildProgress.value = 0;
  }
}

// 模拟进度条更新
function simulateProgress() {
  const interval = setInterval(() => {
    if (!cacheStatus.value.isBuilding) {
      rebuildProgress.value = 100;
      setTimeout(() => {
        rebuildProgress.value = 0;
        showNotification('缓存重建完成！', 'success');
      }, 500);
      clearInterval(interval);
    } else if (rebuildProgress.value < 90) {
      rebuildProgress.value += Math.random() * 10;
    }
  }, 300);
}

async function extractAllUrls() {
 if (extracting.value) return;

 try {
   extracting.value = true;
   
   // 向 background 发送消息，请求提取并显示结果
   await chrome.runtime.sendMessage({
     type: 'EXTRACT_AND_SHOW_RESULTS'
   });

   // 稍后自动关闭弹窗
   setTimeout(() => window.close(), 500);

 } catch (error) {
   console.error('提取URL并显示结果失败:', error);
 } finally {
   extracting.value = false;
 }
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

function openHelp() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('src/options/index.html#help')
  });
}

function startPolling() {
  if (updateTimer) {
    return;
  }
  
  updateTimer = setInterval(async () => {
    await loadCacheStatus();
    
    // 如果不再构建，停止轮询
    if (!cacheStatus.value.isBuilding) {
      stopPolling();
    }
  }, 1000) as unknown as number;
}

function stopPolling() {
  if (updateTimer) {
    clearInterval(updateTimer);
    updateTimer = null;
  }
}

// 自动刷新统计信息
function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(async () => {
    // 只在没有其他操作进行时自动刷新
    if (!markingLoading.value && !refreshingMarks.value && !extracting.value) {
      await loadPageStats();
    }
  }, 2000) as unknown as number; // 每2秒刷新一次
}

// 生命周期
onMounted(async () => {
  // 加载版本号
  const manifest = chrome.runtime.getManifest();
  version.value = manifest.version;
  
  // 加载初始数据
  await Promise.all([
    loadCacheStatus(),
    loadPageStats()
  ]);
  
  // 如果正在构建，开始轮询
  if (cacheStatus.value.isBuilding) {
    startPolling();
  }
  
  // 开始自动刷新统计信息
  startAutoRefresh();
});

onUnmounted(() => {
  stopPolling();
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
});
</script>

<style scoped>
.popup-container {
  width: 360px;
  min-height: 400px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0;
  margin: 0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo .icon {
  font-size: 24px;
}

.logo h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.version {
  font-size: 12px;
  opacity: 0.8;
}

/* 状态区域 */
.status-section,
.stats-section {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

h2 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  opacity: 0.9;
}

.status-grid,
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.status-item,
.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 12px;
  opacity: 0.7;
}

.value {
  font-size: 16px;
  font-weight: 600;
}

.value.ready {
  color: #4ade80;
}

.value.building {
  color: #fbbf24;
}

.value.highlight {
  color: #fbbf24;
}

.value.status-on {
  color: #4ade80;
  font-weight: 600;
}

.value.status-off {
  color: rgba(255, 255, 255, 0.6);
}

/* 操作按钮 */
.actions-section {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: white;
  color: #764ba2;
}

.btn-primary:not(:disabled):hover {
  background: #f3f4f6;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-secondary:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-secondary:active {
  transform: translateY(0);
}

.btn-warning {
  background: #fbbf24;
  color: #78350f;
}

.btn-warning:not(:disabled):hover {
  background: #f59e0b;
}

.btn-info {
  background: #3b82f6;
  color: white;
}

.btn-info:not(:disabled):hover {
  background: #2563eb;
}

/* 加载动画 */
.loading-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 进度条 */
.progress-section {
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.1);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ade80, #22c55e);
  border-radius: 4px;
  transition: width 0.3s ease;
  box-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
}

.progress-text {
  font-size: 12px;
  text-align: center;
  opacity: 0.9;
  margin: 0;
}

/* 通知提示 */
.notification {
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  z-index: 1000;
  animation: slideUp 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.notification.success {
  background: #4ade80;
  color: #14532d;
}

.notification.error {
  background: #f87171;
  color: #7f1d1d;
}

.notification.info {
  background: #60a5fa;
  color: #1e3a8a;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 底部 */
.footer {
  padding: 12px 20px;
  text-align: center;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.1);
}

.footer a {
  color: white;
  text-decoration: none;
  opacity: 0.8;
  cursor: pointer;
}

.footer a:hover {
  opacity: 1;
  text-decoration: underline;
}

.separator {
  margin: 0 8px;
  opacity: 0.4;
}
</style>