const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 隧道管理
    loadTunnels: () => ipcRenderer.invoke('load-tunnels'),
    startTunnel: (tunnelId) => ipcRenderer.invoke('start-tunnel', tunnelId),
    stopTunnel: (tunnelId) => ipcRenderer.invoke('stop-tunnel', tunnelId),
    restartTunnel: (tunnelId) => ipcRenderer.invoke('restart-tunnel', tunnelId),
    deleteTunnel: (tunnelId) => ipcRenderer.invoke('delete-tunnel', tunnelId),
    createTunnel: (tunnelData) => ipcRenderer.invoke('create-tunnel', tunnelData),
    getTunnelStats: () => ipcRenderer.invoke('get-tunnel-stats'),

    // 路由管理
    addRoute: (tunnelId, routeData) => ipcRenderer.invoke('add-route', tunnelId, routeData),
    updateRoute: (tunnelId, routeId, routeData) => ipcRenderer.invoke('update-route', tunnelId, routeId, routeData),
    deleteRoute: (tunnelId, routeId) => ipcRenderer.invoke('delete-route', tunnelId, routeId),

    // 配置文件管理
    generateConfig: (tunnelId) => ipcRenderer.invoke('generate-config', tunnelId),
    getConfigContent: (tunnelId) => ipcRenderer.invoke('get-config-content', tunnelId),

    // 系统功能
    openConfigFolder: () => ipcRenderer.invoke('open-config-folder'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    showMessage: (options) => ipcRenderer.invoke('show-message', options),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // 日志管理
    getLogs: (filter) => ipcRenderer.invoke('get-logs', filter),
    clearLogs: () => ipcRenderer.invoke('clear-logs'),
    exportLogs: () => ipcRenderer.invoke('export-logs'),

    // 服务管理
    checkCloudflared: () => ipcRenderer.invoke('check-cloudflared'),
    getServiceStatus: () => ipcRenderer.invoke('get-service-status'),
    startCloudflaredService: () => ipcRenderer.invoke('start-cloudflared-service'),
    stopCloudflaredService: () => ipcRenderer.invoke('stop-cloudflared-service'),
    restartCloudflaredService: () => ipcRenderer.invoke('restart-cloudflared-service'),
    downloadCloudflared: () => ipcRenderer.invoke('download-cloudflared'),
    updateCloudflared: () => ipcRenderer.invoke('update-cloudflared'),

    // Cloudflare API 功能
    testCloudflareConnection: (credentials) => ipcRenderer.invoke('test-cloudflare-connection', credentials),
    saveCloudflareSettings: (settings) => ipcRenderer.invoke('save-cloudflare-settings', settings),
    loadCloudflareSettings: () => ipcRenderer.invoke('load-cloudflare-settings'),
    getCloudflareAccount: () => ipcRenderer.invoke('get-cloudflare-account'),
    getCloudflareTunnels: () => ipcRenderer.invoke('get-cloudflare-tunnels'),
    getCloudflareZones: () => ipcRenderer.invoke('get-cloudflare-zones'),
    createCloudflareTunnel: (tunnelData) => ipcRenderer.invoke('create-cloudflare-tunnel', tunnelData),
    deleteCloudflareTunnel: (tunnelId) => ipcRenderer.invoke('delete-cloudflare-tunnel', tunnelId),
    getTunnelConfiguration: (tunnelId) => ipcRenderer.invoke('get-tunnel-configuration', tunnelId),
    updateTunnelConfiguration: (tunnelId, configuration) => ipcRenderer.invoke('update-tunnel-configuration', tunnelId, configuration),

    // 应用设置
    saveAppSettings: (settings) => ipcRenderer.invoke('save-app-settings', settings),
    loadAppSettings: () => ipcRenderer.invoke('load-app-settings'),

    // 事件监听
    onTunnelUpdated: (callback) => {
        ipcRenderer.on('tunnel-updated', (event, tunnel) => callback(tunnel));
    },
    onRefreshTunnels: (callback) => {
        ipcRenderer.on('refresh-tunnels', () => callback());
    },
    onNavigateTo: (callback) => {
        ipcRenderer.on('navigate-to', (event, page) => callback(page));
    },
    onShowNewTunnelDialog: (callback) => {
        ipcRenderer.on('show-new-tunnel-dialog', () => callback());
    },
    onNewLog: (callback) => {
        ipcRenderer.on('new-log', (event, logEntry) => callback(logEntry));
    },
    onServiceLog: (callback) => {
        ipcRenderer.on('service-log', (event, logEntry) => callback(logEntry));
    },
    onServiceStatusChanged: (callback) => {
        ipcRenderer.on('service-status-changed', (event, status) => callback(status));
    },
    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (event, progress) => callback(progress));
    },

    // 移除监听器
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

// 开发环境下暴露调试接口
if (process.env.NODE_ENV === 'development') {
    contextBridge.exposeInMainWorld('debugAPI', {
        log: (...args) => console.log('[Renderer]', ...args),
        error: (...args) => console.error('[Renderer]', ...args),
        warn: (...args) => console.warn('[Renderer]', ...args),
    });
}

console.log('预加载脚本已加载');