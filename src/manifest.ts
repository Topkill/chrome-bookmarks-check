import { defineManifest } from '@crxjs/vite-plugin'
import packageJson from '../package.json'

export default defineManifest({
  manifest_version: 3,
  name: '书签哨兵 (Bookmark Sentry)',
  version: packageJson.version,
  description: '智能检测网页链接是否已被收藏，让你的书签管理更高效',
  
  permissions: [
    'bookmarks',
    'storage',
    'contextMenus',
    'notifications',
    'activeTab',
    'scripting'
    // 如果要使用保活机制方案，取消注释下面这行：
    // 'alarms'
  ],
  
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle'
    }
  ],
  
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png'
    }
  },
  
  options_page: 'src/options/index.html',
  
  web_accessible_resources: [
    {
      "resources": [
        "icons/icon-16.png",
        "icons/icon-32.png",
        "icons/icon-48.png",
        "icons/icon-128.png",
        "src/results/index.html",
        "src/help/index.html"
      ],
      "matches": [
        "<all_urls>"
      ]
    }
  ],
  
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png'
  },
  
})