document.addEventListener('DOMContentLoaded', () => {
  // 显示提示消息
  function showMessage(message: string, isSuccess = true) {
    // 移除已存在的提示
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isSuccess ? '#10b981' : '#f59e0b'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s, transform 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    // 显示动画
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 10);

    // 3秒后移除
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(() => {
        if (toast.parentElement) {
          toast.parentElement.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // 加载设置
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        // 基本设置
        (document.getElementById('enable-auto-marking') as HTMLInputElement).checked = result.settings.enableAutoMarking ?? false;
        (document.getElementById('show-notifications') as HTMLInputElement).checked = result.settings.showNotifications ?? true;
        // URL 编辑设置
        (document.getElementById('edit-before-check-single-link') as HTMLInputElement).checked = result.settings.editBeforeCheckSingleLink ?? false;
        (document.getElementById('edit-before-check-multi-link') as HTMLInputElement).checked = result.settings.editBeforeCheckMultiLink ?? false;
        (document.getElementById('edit-before-check-popup-page') as HTMLInputElement).checked = result.settings.editBeforeCheckPopupPage ?? false;
        (document.getElementById('edit-before-check-popup-text') as HTMLInputElement).checked = result.settings.editBeforeCheckPopupText ?? false;
       
        // 单链接操作设置
        const singleLinkAction = result.settings.singleLinkAction ?? 'page';
        (document.querySelector(`input[name="single-link-action"][value="${singleLinkAction}"]`) as HTMLInputElement).checked = true;
        
        // 多链接操作设置
        const multiLinkAction = result.settings.multiLinkAction ?? 'page';
        (document.querySelector(`input[name="multi-link-action"][value="${multiLinkAction}"]`) as HTMLInputElement).checked = true;

        // 通知详情操作
        const notificationDetailAction = result.settings.notificationDetailAction ?? 'page';
        (document.querySelector(`input[name="notification-detail-action"][value="${notificationDetailAction}"]`) as HTMLInputElement).checked = true;

        (document.getElementById('batch-size') as HTMLInputElement).value = result.settings.batchSize ?? 50;
        (document.getElementById('cache-days') as HTMLInputElement).value = result.settings.cacheDays ?? 7;
        (document.getElementById('notification-duration') as HTMLInputElement).value = result.settings.notificationDuration ?? 15;
        (document.getElementById('single-modal-duration') as HTMLInputElement).value = result.settings.singleModalDuration ?? 5;
        (document.getElementById('multi-modal-duration') as HTMLInputElement).value = result.settings.multiModalDuration ?? 15;

        // URL匹配设置（默认全部关闭）
        (document.getElementById('ignore-protocol') as HTMLInputElement).checked = result.settings.ignoreProtocol ?? false;
        (document.getElementById('ignore-trailing-slash') as HTMLInputElement).checked = result.settings.ignoreTrailingSlash ?? false;
        (document.getElementById('ignore-case') as HTMLInputElement).checked = result.settings.ignoreCase ?? false;
        (document.getElementById('ignore-www') as HTMLInputElement).checked = result.settings.ignoreWww ?? false;
        (document.getElementById('ignore-hash') as HTMLInputElement).checked = result.settings.ignoreHash ?? false;
      } else {
        // 如果没有保存的设置，则应用默认值
        resetForm();
      }
      toggleNotificationDetailOptions(); // 更新子选项的可见性
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  }

  // 恢复表单到默认值
  function resetForm() {
    // 基本设置
    (document.getElementById('enable-auto-marking') as HTMLInputElement).checked = false;
    (document.getElementById('show-notifications') as HTMLInputElement).checked = true;
   (document.querySelector('input[name="single-link-action"][value="page"]') as HTMLInputElement).checked = true;
    (document.querySelector('input[name="multi-link-action"][value="page"]') as HTMLInputElement).checked = true;
    (document.querySelector('input[name="notification-detail-action"][value="page"]') as HTMLInputElement).checked = true;
    
    // URL 编辑设置
    (document.getElementById('edit-before-check-single-link') as HTMLInputElement).checked = false;
    (document.getElementById('edit-before-check-multi-link') as HTMLInputElement).checked = false;
    (document.getElementById('edit-before-check-popup-page') as HTMLInputElement).checked = false;
    (document.getElementById('edit-before-check-popup-text') as HTMLInputElement).checked = false;
    (document.getElementById('batch-size') as HTMLInputElement).value = '50';
    (document.getElementById('cache-days') as HTMLInputElement).value = '7';
    
    // 持续时间设置（恢复默认值）
    (document.getElementById('notification-duration') as HTMLInputElement).value = '15';
    (document.getElementById('single-modal-duration') as HTMLInputElement).value = '5';
    (document.getElementById('multi-modal-duration') as HTMLInputElement).value = '15';

    // URL匹配设置（默认全部关闭）
    (document.getElementById('ignore-protocol') as HTMLInputElement).checked = false;
    (document.getElementById('ignore-trailing-slash') as HTMLInputElement).checked = false;
    (document.getElementById('ignore-case') as HTMLInputElement).checked = false;
    (document.getElementById('ignore-www') as HTMLInputElement).checked = false;
    (document.getElementById('ignore-hash') as HTMLInputElement).checked = false;
  }

  //切换通知详情选项的可见性
  function toggleNotificationDetailOptions() {
    const multiLinkAction = (document.querySelector('input[name="multi-link-action"]:checked') as HTMLInputElement).value;
    const detailOptions = document.getElementById('notification-detail-options') as HTMLDivElement;
    if (multiLinkAction === 'notification') {
      detailOptions.style.display = 'block';
    } else {
      detailOptions.style.display = 'none';
    }
  }

  // 保存设置
  document.getElementById('save-btn')?.addEventListener('click', async () => {
    try {
      const settings = {
        enableAutoMarking: (document.getElementById('enable-auto-marking') as HTMLInputElement).checked,
        showNotifications: (document.getElementById('show-notifications') as HTMLInputElement).checked,
       singleLinkAction: (document.querySelector('input[name="single-link-action"]:checked') as HTMLInputElement).value,
       multiLinkAction: (document.querySelector('input[name="multi-link-action"]:checked') as HTMLInputElement).value,
       notificationDetailAction: (document.querySelector('input[name="notification-detail-action"]:checked') as HTMLInputElement).value,
       
        // URL 编辑设置
        editBeforeCheckSingleLink: (document.getElementById('edit-before-check-single-link') as HTMLInputElement).checked,
        editBeforeCheckMultiLink: (document.getElementById('edit-before-check-multi-link') as HTMLInputElement).checked,
        editBeforeCheckPopupPage: (document.getElementById('edit-before-check-popup-page') as HTMLInputElement).checked,
        editBeforeCheckPopupText: (document.getElementById('edit-before-check-popup-text') as HTMLInputElement).checked,
       batchSize: parseInt((document.getElementById('batch-size') as HTMLInputElement).value),
        cacheDays: parseInt((document.getElementById('cache-days') as HTMLInputElement).value),
        notificationDuration: parseInt((document.getElementById('notification-duration') as HTMLInputElement).value),
        singleModalDuration: parseInt((document.getElementById('single-modal-duration') as HTMLInputElement).value),
        multiModalDuration: parseInt((document.getElementById('multi-modal-duration') as HTMLInputElement).value),
        ignoreProtocol: (document.getElementById('ignore-protocol') as HTMLInputElement).checked,
        ignoreTrailingSlash: (document.getElementById('ignore-trailing-slash') as HTMLInputElement).checked,
        ignoreCase: (document.getElementById('ignore-case') as HTMLInputElement).checked,
        ignoreWww: (document.getElementById('ignore-www') as HTMLInputElement).checked,
        ignoreHash: (document.getElementById('ignore-hash') as HTMLInputElement).checked
      };

      await chrome.storage.local.set({ settings });

      // 异步发送消息，不等待后台处理完成，让UI立即响应
      chrome.runtime.sendMessage({ type: 'RELOAD_SETTINGS' }).catch(e => {
        console.warn('Background script might not be ready, but settings are saved:', e);
      });

      showMessage('✅ 设置已保存！后台将自动应用更改。', true);
    } catch (error) {
      console.error('保存设置失败:', error);
      showMessage('❌ 保存失败，请重试', false);
    }
  });

  // 恢复默认
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    resetForm();
    showMessage('✅ 已恢复默认设置，请点击"保存设置"应用更改', true);
  });

  // 恢复默认
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    resetForm();
    toggleNotificationDetailOptions();
    showMessage('✅ 已恢复默认设置，请点击"保存设置"应用更改', true);
  });

  // 为多链接操作的单选按钮添加事件监听器
  document.querySelectorAll('input[name="multi-link-action"]').forEach(radio => {
    radio.addEventListener('change', toggleNotificationDetailOptions);
  });

  // 初始化
  loadSettings();
});