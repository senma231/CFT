const { app, BrowserWindow, Menu, Tray, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const log = require('electron-log');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const axios = require('axios');

// 初始化日志
log.initialize({ preload: true });
log.transports.file.level = 'info';
// 设置控制台输出编码为 UTF-8
log.transports.console.format = '{h}:{i}:{s} > {text}';
// 在 Windows 上设置控制台代码页为 UTF-8
if (process.platform === 'win32') {
    try {
        require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
    } catch (e) {
        // 忽略错误
    }
}
log.info('应用启动');

// 初始化存储
const store = new Store();

// 全局变量
let mainWindow;
let tray;

// 应用配置
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const APP_NAME = 'Cloudflare隧道管理器';

class TunnelManager {
    constructor() {
        this.tunnels = [];
        this.configPath = path.join(require('os').homedir(), '.cloudflared');
        this.logs = []; // 存储应用日志
        this.maxLogs = 1000; // 最多保存1000条日志
        this.cloudflaredProcess = null; // cloudflared 进程
        this.serviceStartTime = null; // 服务启动时间
        this.tunnelProcesses = new Map(); // 存储隧道进程引用 (tunnelId -> ChildProcess)
        this.loadTunnels();
        this.initializeLogging();
    }

    initializeLogging() {
        // 拦截 electron-log 的输出，同时保存到内存
        const originalLog = log.info;
        const originalWarn = log.warn;
        const originalError = log.error;

        log.info = (...args) => {
            this.addLog('info', args.join(' '));
            originalLog.apply(log, args);
        };

        log.warn = (...args) => {
            this.addLog('warn', args.join(' '));
            originalWarn.apply(log, args);
        };

        log.error = (...args) => {
            this.addLog('error', args.join(' '));
            originalError.apply(log, args);
        };
    }

    addLog(level, message) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message
        };

        this.logs.push(logEntry);

        // 限制日志数量
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // 通知渲染进程有新日志
        if (mainWindow) {
            mainWindow.webContents.send('new-log', logEntry);
        }
    }

    getLogs(filter = 'all') {
        if (filter === 'all') {
            return this.logs;
        }
        return this.logs.filter(log => log.level === filter);
    }

    clearLogs() {
        this.logs = [];
        return true;
    }

    async loadTunnels() {
        try {
            // 从 electron-store 加载隧道数据
            const savedTunnels = store.get('tunnels');

            if (savedTunnels && Array.isArray(savedTunnels)) {
                // 如果有保存的数据（包括空数组），使用保存的数据
                this.tunnels = savedTunnels.map(t => ({
                    ...t,
                    createdAt: new Date(t.createdAt), // 转换日期字符串为 Date 对象
                    // 应用重启后，所有隧道状态重置为 stopped
                    // 因为进程引用已丢失，无法确定隧道是否真的在运行
                    status: 'stopped',
                    isRunning: false
                }));
                log.info(`从存储加载了 ${this.tunnels.length} 个隧道`);
                log.info('应用重启，所有隧道状态已重置为 stopped');
            } else {
                // 只有在第一次运行（没有任何存储数据）时才创建示例隧道
                this.tunnels = [];
                // 保存空数组，避免下次再创建示例隧道
                this.saveTunnels();
                log.info('首次运行，隧道列表为空');
            }

            return this.tunnels;
        } catch (error) {
            log.error('加载隧道失败:', error);
            return [];
        }
    }

    saveTunnels() {
        try {
            // 保存时排除 process 字段（不能序列化）
            const tunnelsToSave = this.tunnels.map(tunnel => {
                const { process, ...tunnelData } = tunnel;
                return tunnelData;
            });
            store.set('tunnels', tunnelsToSave);
            log.info(`保存了 ${this.tunnels.length} 个隧道到存储`);
        } catch (error) {
            log.error('保存隧道失败:', error);
        }
    }

    async startTunnel(tunnelId) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) {
            log.error(`隧道不存在: ${tunnelId}`);
            return false;
        }

        try {
            tunnel.status = 'starting';
            this.saveTunnels();
            mainWindow?.webContents.send('tunnel-updated', tunnel);
            log.info(`开始启动隧道: ${tunnel.name}`);

            // 检查是否为 Cloudflare 隧道
            if (tunnel.cloudflareId && tunnel.configPath) {
                // 检查配置文件是否存在
                const fs = require('fs').promises;
                try {
                    await fs.access(tunnel.configPath);
                } catch (error) {
                    log.warn(`配置文件不存在，尝试生成: ${tunnel.configPath}`);
                    await this.generateConfigFile(tunnelId);
                }

                // 使用配置文件启动
                log.info(`使用配置文件启动隧道: ${tunnel.configPath}`);
                const { spawn } = require('child_process');

                const cloudflaredProcess = spawn('cloudflared', [
                    'tunnel',
                    '--config', tunnel.configPath,
                    'run'
                ], {
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                // 保存进程引用到 Map 中
                this.tunnelProcesses.set(tunnel.id, cloudflaredProcess);

                cloudflaredProcess.stdout.on('data', (data) => {
                    const message = data.toString();
                    log.info(`[${tunnel.name}] ${message}`);
                });

                cloudflaredProcess.stderr.on('data', (data) => {
                    const message = data.toString().trim();

                    // 解析日志级别 - cloudflared 把所有日志都输出到 stderr
                    if (message.includes(' INF ')) {
                        log.info(`[${tunnel.name}] ${message}`);
                    } else if (message.includes(' WRN ')) {
                        log.warn(`[${tunnel.name}] ${message}`);
                    } else if (message.includes(' ERR ')) {
                        log.error(`[${tunnel.name}] ${message}`);
                    } else {
                        log.info(`[${tunnel.name}] ${message}`);
                    }

                    // 检测隧道连接成功
                    if (message.includes('Registered tunnel connection')) {
                        if (tunnel.status !== 'running') {
                            tunnel.status = 'running';
                            tunnel.isRunning = true;
                            this.saveTunnels();
                            mainWindow?.webContents.send('tunnel-updated', tunnel);
                            log.info(`隧道 ${tunnel.name} 启动成功`);
                        }
                    }
                });

                cloudflaredProcess.on('error', (error) => {
                    log.error(`隧道 ${tunnel.name} 启动失败:`, error);
                    tunnel.status = 'error';
                    tunnel.isRunning = false;
                    this.tunnelProcesses.delete(tunnel.id);
                    this.saveTunnels();
                    mainWindow?.webContents.send('tunnel-updated', tunnel);
                });

                cloudflaredProcess.on('exit', (code) => {
                    log.info(`隧道 ${tunnel.name} 进程退出，代码: ${code}`);
                    tunnel.status = 'stopped';
                    tunnel.isRunning = false;
                    this.tunnelProcesses.delete(tunnel.id);
                    this.saveTunnels();
                    mainWindow?.webContents.send('tunnel-updated', tunnel);
                });

                return true;
            } else {
                // 旧的模拟启动方式（用于非 Cloudflare 隧道）
                setTimeout(() => {
                    tunnel.status = 'running';
                    tunnel.isRunning = true;
                    this.saveTunnels();
                    mainWindow?.webContents.send('tunnel-updated', tunnel);
                    log.info(`隧道 ${tunnel.name} 启动成功（模拟模式）`);
                }, 2000);
                return true;
            }
        } catch (error) {
            log.error(`启动隧道 ${tunnel.name} 失败:`, error);
            tunnel.status = 'error';
            tunnel.isRunning = false;
            this.saveTunnels();
            mainWindow?.webContents.send('tunnel-updated', tunnel);
            return false;
        }
    }

    async stopTunnel(tunnelId) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) {
            log.error(`隧道不存在: ${tunnelId}`);
            return false;
        }

        try {
            tunnel.status = 'stopping';
            this.saveTunnels();
            mainWindow?.webContents.send('tunnel-updated', tunnel);
            log.info(`开始停止隧道: ${tunnel.name}`);

            // 从 Map 中获取进程引用
            const process = this.tunnelProcesses.get(tunnel.id);

            // 如果有进程在运行，杀死它
            if (process && !process.killed) {
                process.kill('SIGTERM');

                // 等待进程退出
                setTimeout(() => {
                    if (process && !process.killed) {
                        log.warn(`隧道 ${tunnel.name} 未响应 SIGTERM，发送 SIGKILL`);
                        process.kill('SIGKILL');
                    }
                }, 5000);
            }

            // 更新状态
            setTimeout(() => {
                tunnel.status = 'stopped';
                tunnel.isRunning = false;
                this.tunnelProcesses.delete(tunnel.id);
                this.saveTunnels();
                mainWindow?.webContents.send('tunnel-updated', tunnel);
                log.info(`隧道 ${tunnel.name} 已停止`);
            }, 1500);

            return true;
        } catch (error) {
            log.error(`停止隧道 ${tunnel.name} 失败:`, error);
            tunnel.status = 'error';
            this.saveTunnels();
            mainWindow?.webContents.send('tunnel-updated', tunnel);
            return false;
        }
    }

    async restartTunnel(tunnelId) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (tunnel) {
            await this.stopTunnel(tunnelId);
            setTimeout(() => this.startTunnel(tunnelId), 2000);
            return true;
        }
        return false;
    }

    async deleteTunnel(tunnelId) {
        const index = this.tunnels.findIndex(t => t.id === tunnelId);
        if (index !== -1) {
            const tunnel = this.tunnels[index];

            // 如果隧道正在运行，先停止它
            if (tunnel.isRunning) {
                log.info(`隧道 ${tunnel.name} 正在运行，先停止...`);
                await this.stopTunnel(tunnelId);
                // 等待进程完全停止
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // 如果是 Cloudflare 隧道，调用 API 删除
            if (tunnel.cloudflareId && cloudflareAPI.credentials) {
                try {
                    log.info(`通过 Cloudflare API 删除隧道: ${tunnel.name} (${tunnel.cloudflareId})`);

                    // 先清理隧道配置（删除所有连接）
                    try {
                        await cloudflareAPI.cleanupTunnelConfig(tunnel.cloudflareId);
                        log.info(`隧道配置已清理`);
                    } catch (cleanupError) {
                        log.warn(`清理隧道配置失败（可能已经清理过）:`, cleanupError.message);
                    }

                    // 等待一下，确保配置清理完成
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // 删除隧道
                    await cloudflareAPI.deleteTunnel(tunnel.cloudflareId);
                    log.info(`Cloudflare 隧道 ${tunnel.name} 已从云端删除`);
                } catch (error) {
                    log.error(`删除 Cloudflare 隧道失败:`, error.message);
                    if (error.response?.data) {
                        log.error(`API 错误详情:`, JSON.stringify(error.response.data, null, 2));
                    }
                    // 即使 API 删除失败，也继续删除本地记录
                }
            }

            // 删除进程引用
            this.tunnelProcesses.delete(tunnelId);

            // 从列表中删除
            this.tunnels.splice(index, 1);
            this.saveTunnels(); // 保存更改到存储
            log.info(`隧道 ${tunnel.name} 已从本地删除`);
            return true;
        }
        return false;
    }

    async createTunnel(tunnelData) {
        try {
            // 如果提供了 Cloudflare API，则通过 API 创建真实隧道
            let cloudflareResult = null;
            if (tunnelData.useCloudflareAPI && cloudflareAPI.credentials) {
                log.info(`通过 Cloudflare API 创建隧道: ${tunnelData.name}`);
                cloudflareResult = await cloudflareAPI.createTunnel({
                    name: tunnelData.name,
                    secret: tunnelData.secret
                });
                log.info(`Cloudflare 隧道创建成功，ID: ${cloudflareResult.id}`);
            }

            const tunnelId = `tunnel-${Date.now()}`;
            const tunnelName = tunnelData.name.toLowerCase().replace(/\s+/g, '-');

            const newTunnel = {
                id: tunnelId,
                name: tunnelData.name,
                description: tunnelData.description || '',
                status: 'stopped',
                createdAt: new Date(),

                // Cloudflare 相关
                cloudflareId: cloudflareResult?.id || null,
                tunnelToken: cloudflareResult?.token || null,
                accountId: cloudflareResult?.account_id || null,

                // 路由配置
                routes: tunnelData.routes || [],

                // 配置文件路径
                configPath: path.join(this.configPath, `${tunnelName}.yml`),
                credentialsPath: cloudflareResult ? path.join(this.configPath, `${cloudflareResult.id}.json`) : null,

                isRunning: false,
                url: cloudflareResult?.cname || `https://${tunnelName}.example.com`
            };

            // 如果有 Cloudflare 隧道，保存 credentials 文件
            if (cloudflareResult) {
                await this.saveCredentialsFile(cloudflareResult.id, cloudflareResult);
            }

            this.tunnels.push(newTunnel);
            this.saveTunnels();
            log.info(`新隧道 ${newTunnel.name} 已创建`);

            return newTunnel;
        } catch (error) {
            log.error('创建隧道失败:', error);
            throw error;
        }
    }

    async saveCredentialsFile(tunnelId, tunnelData) {
        try {
            const fs = require('fs').promises;
            const credentialsPath = path.join(this.configPath, `${tunnelId}.json`);

            // 确保目录存在
            await fs.mkdir(this.configPath, { recursive: true });

            // 打印调试信息
            log.info('Cloudflare API 返回的隧道数据:', JSON.stringify(tunnelData, null, 2));

            // Cloudflare API 返回的数据中，credentials_file 对象已经包含了正确的格式
            // 直接使用它，或者手动构建
            let credentials;

            if (tunnelData.credentials_file) {
                // 如果 API 返回了 credentials_file，直接使用
                credentials = tunnelData.credentials_file;
            } else {
                // 否则手动构建
                credentials = {
                    AccountTag: tunnelData.account_tag || tunnelData.account?.id || cloudflareAPI.credentials?.accountId,
                    TunnelSecret: tunnelData.tunnel_secret,
                    TunnelID: tunnelId
                };
            }

            log.info('准备保存的 credentials:', JSON.stringify(credentials, null, 2));

            await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));
            log.info(`Credentials 文件已保存: ${credentialsPath}`);

            return credentialsPath;
        } catch (error) {
            log.error('保存 credentials 文件失败:', error);
            throw error;
        }
    }

    async addRoute(tunnelId, routeData) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) {
            throw new Error('隧道不存在');
        }

        // 验证 hostname
        if (!routeData.hostname || routeData.hostname.trim() === '') {
            throw new Error('路由的 hostname 不能为空');
        }

        if (!tunnel.routes) {
            tunnel.routes = [];
        }

        const newRoute = {
            id: `route-${Date.now()}`,
            hostname: routeData.hostname.trim(),
            service: routeData.service,
            protocol: routeData.protocol || 'http',
            originRequest: routeData.originRequest || {}
        };

        tunnel.routes.push(newRoute);
        this.saveTunnels();

        // 重新生成配置文件
        await this.generateConfigFile(tunnelId);

        log.info(`路由已添加到隧道 ${tunnel.name}: ${newRoute.hostname} -> ${newRoute.service}`);
        return newRoute;
    }

    async updateRoute(tunnelId, routeId, routeData) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) {
            throw new Error('隧道不存在');
        }

        const route = tunnel.routes?.find(r => r.id === routeId);
        if (!route) {
            throw new Error('路由不存在');
        }

        // 验证 hostname
        const newHostname = routeData.hostname || route.hostname;
        if (!newHostname || newHostname.trim() === '') {
            throw new Error('路由的 hostname 不能为空');
        }

        Object.assign(route, {
            hostname: newHostname.trim(),
            service: routeData.service || route.service,
            protocol: routeData.protocol || route.protocol,
            originRequest: routeData.originRequest || route.originRequest
        });

        this.saveTunnels();

        // 重新生成配置文件
        await this.generateConfigFile(tunnelId);

        log.info(`路由已更新: ${route.hostname} -> ${route.service}`);
        return route;
    }

    async deleteRoute(tunnelId, routeId) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) {
            throw new Error('隧道不存在');
        }

        const index = tunnel.routes?.findIndex(r => r.id === routeId);
        if (index === -1 || index === undefined) {
            throw new Error('路由不存在');
        }

        tunnel.routes.splice(index, 1);
        this.saveTunnels();

        // 重新生成配置文件
        await this.generateConfigFile(tunnelId);

        log.info(`路由已删除`);
        return true;
    }

    async generateConfigFile(tunnelId) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) {
            throw new Error('隧道不存在');
        }

        if (!tunnel.cloudflareId) {
            throw new Error('隧道未关联 Cloudflare 隧道');
        }

        try {
            const yaml = require('js-yaml');
            const fs = require('fs').promises;

            // 生成 ingress 规则
            const ingress = [];

            if (tunnel.routes && tunnel.routes.length > 0) {
                tunnel.routes.forEach(route => {
                    // 跳过没有 hostname 的路由
                    if (!route.hostname || route.hostname.trim() === '') {
                        log.warn(`跳过无效路由（hostname 为空）: ${JSON.stringify(route)}`);
                        return;
                    }

                    const rule = {
                        hostname: route.hostname,
                        service: route.service
                    };

                    if (route.originRequest && Object.keys(route.originRequest).length > 0) {
                        rule.originRequest = route.originRequest;
                    }

                    ingress.push(rule);
                });
            }

            // 添加默认的 catch-all 规则
            ingress.push({
                service: 'http_status:404'
            });

            // 生成配置对象
            const config = {
                tunnel: tunnel.cloudflareId,
                'credentials-file': tunnel.credentialsPath,
                ingress: ingress
            };

            // 转换为 YAML
            const yamlContent = yaml.dump(config, {
                indent: 2,
                lineWidth: -1
            });

            // 确保目录存在
            await fs.mkdir(this.configPath, { recursive: true });

            // 保存配置文件
            await fs.writeFile(tunnel.configPath, yamlContent, 'utf8');

            log.info(`配置文件已生成: ${tunnel.configPath}`);
            return tunnel.configPath;
        } catch (error) {
            log.error('生成配置文件失败:', error);
            throw error;
        }
    }

    async getConfigFileContent(tunnelId) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) {
            throw new Error('隧道不存在');
        }

        try {
            const fs = require('fs').promises;
            const content = await fs.readFile(tunnel.configPath, 'utf8');
            return content;
        } catch (error) {
            log.error('读取配置文件失败:', error);
            throw error;
        }
    }

    getTunnelStats() {
        return {
            total: this.tunnels.length,
            running: this.tunnels.filter(t => t.status === 'running').length,
            stopped: this.tunnels.filter(t => t.status === 'stopped').length,
            error: this.tunnels.filter(t => t.status === 'error').length
        };
    }

    // 服务管理方法
    async checkCloudflared() {
        const { execSync } = require('child_process');
        try {
            let version = '';
            let execPath = '';

            if (process.platform === 'win32') {
                // Windows
                try {
                    version = execSync('cloudflared --version', { encoding: 'utf8' }).trim();
                    execPath = execSync('where cloudflared', { encoding: 'utf8' }).trim().split('\n')[0];
                } catch (e) {
                    return { installed: false };
                }
            } else {
                // macOS/Linux
                try {
                    version = execSync('cloudflared --version', { encoding: 'utf8' }).trim();
                    execPath = execSync('which cloudflared', { encoding: 'utf8' }).trim();
                } catch (e) {
                    return { installed: false };
                }
            }

            return {
                installed: true,
                version: version.replace('cloudflared version ', ''),
                path: execPath
            };
        } catch (error) {
            log.error('检查 cloudflared 失败:', error);
            return { installed: false };
        }
    }

    getServiceStatus() {
        // 检查是否有任何隧道在运行（使用 Map 检查进程）
        const runningTunnels = this.tunnels.filter(t => {
            const process = this.tunnelProcesses.get(t.id);
            return t.isRunning && process && !process.killed;
        });
        const isRunning = runningTunnels.length > 0 || (this.cloudflaredProcess !== null && !this.cloudflaredProcess.killed);

        // 收集所有运行中隧道的详细信息
        const runningTunnelDetails = runningTunnels.map(t => {
            const process = this.tunnelProcesses.get(t.id);
            return {
                id: t.id,
                name: t.name,
                pid: process?.pid || null,
                status: t.status
            };
        });

        return {
            running: isRunning,
            tunnelCount: runningTunnels.length,
            runningTunnels: runningTunnelDetails,
            totalTunnels: this.tunnels.length
        };
    }

    async startCloudflaredService() {
        if (this.cloudflaredProcess) {
            log.warn('cloudflared 服务已在运行');
            return { success: false, message: '服务已在运行' };
        }

        try {
            const { spawn } = require('child_process');

            // 启动 cloudflared tunnel run（需要配置文件）
            // 这里使用 --hello-world 作为示例
            this.cloudflaredProcess = spawn('cloudflared', ['tunnel', '--hello-world'], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this.serviceStartTime = Date.now();

            log.info(`cloudflared 服务已启动，PID: ${this.cloudflaredProcess.pid}`);

            // 监听输出
            this.cloudflaredProcess.stdout.on('data', (data) => {
                const message = data.toString().trim();
                if (mainWindow) {
                    mainWindow.webContents.send('service-log', {
                        timestamp: new Date().toISOString(),
                        level: 'info',
                        message: message
                    });
                }
            });

            this.cloudflaredProcess.stderr.on('data', (data) => {
                const message = data.toString().trim();
                if (mainWindow) {
                    mainWindow.webContents.send('service-log', {
                        timestamp: new Date().toISOString(),
                        level: 'error',
                        message: message
                    });
                }
            });

            this.cloudflaredProcess.on('close', (code) => {
                log.info(`cloudflared 进程退出，代码: ${code}`);
                this.cloudflaredProcess = null;
                this.serviceStartTime = null;
                if (mainWindow) {
                    mainWindow.webContents.send('service-status-changed', this.getServiceStatus());
                }
            });

            log.info('cloudflared 服务已启动');

            // 立即发送状态更新到前端
            if (mainWindow) {
                mainWindow.webContents.send('service-status-changed', this.getServiceStatus());
            }

            return { success: true, message: '服务启动成功' };
        } catch (error) {
            log.error('启动 cloudflared 服务失败:', error);
            return { success: false, message: error.message };
        }
    }

    async stopCloudflaredService() {
        if (!this.cloudflaredProcess) {
            log.warn('cloudflared 服务未运行');
            return { success: false, message: '服务未运行' };
        }

        try {
            this.cloudflaredProcess.kill();
            this.cloudflaredProcess = null;
            this.serviceStartTime = null;
            log.info('cloudflared 服务已停止');

            // 立即发送状态更新到前端
            if (mainWindow) {
                mainWindow.webContents.send('service-status-changed', this.getServiceStatus());
            }

            return { success: true, message: '服务停止成功' };
        } catch (error) {
            log.error('停止 cloudflared 服务失败:', error);
            return { success: false, message: error.message };
        }
    }

    async restartCloudflaredService() {
        const stopResult = await this.stopCloudflaredService();
        if (!stopResult.success && stopResult.message !== '服务未运行') {
            return stopResult;
        }

        // 等待一秒后重启
        await new Promise(resolve => setTimeout(resolve, 1000));

        return await this.startCloudflaredService();
    }
}

const tunnelManager = new TunnelManager();

// Cloudflare API 管理类
class CloudflareAPI {
    constructor() {
        this.baseURL = 'https://api.cloudflare.com/client/v4';
        this.credentials = null;
        this.loadCredentials();
    }

    loadCredentials() {
        try {
            this.credentials = store.get('cloudflare.credentials', null);
        } catch (error) {
            log.error('加载 Cloudflare 凭证失败:', error);
        }
    }

    saveCredentials(credentials) {
        try {
            this.credentials = credentials;
            store.set('cloudflare.credentials', credentials);
            log.info('Cloudflare 凭证已保存');
            return true;
        } catch (error) {
            log.error('保存 Cloudflare 凭证失败:', error);
            return false;
        }
    }

    async testConnection(credentials) {
        try {
            log.info('开始测试 Cloudflare 连接...');
            log.info('API Token 长度:', credentials.apiToken?.length || 0);

            const config = {
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            if (credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${credentials.apiToken}`;
                log.info('使用 API Token 认证');
            } else if (credentials.globalKey) {
                config.headers['X-Auth-Email'] = credentials.email;
                config.headers['X-Auth-Key'] = credentials.globalKey;
                log.info('使用 Global API Key 认证');
            } else {
                throw new Error('缺少 API 凭证');
            }

            log.info('请求 URL:', `${this.baseURL}/user/tokens/verify`);

            // 使用 verify 端点来验证 token
            const response = await axios.get(`${this.baseURL}/user/tokens/verify`, config);

            log.info('API 响应状态:', response.status);
            log.info('API 响应数据:', JSON.stringify(response.data, null, 2));

            if (response.data.success) {
                // 获取用户信息
                const userResponse = await axios.get(`${this.baseURL}/user`, config);

                return {
                    success: true,
                    account: userResponse.data.result,
                    tokenInfo: response.data.result
                };
            } else {
                const errorMsg = response.data.errors?.[0]?.message || '未知错误';
                log.error('API 返回错误:', errorMsg);
                return {
                    success: false,
                    error: errorMsg
                };
            }
        } catch (error) {
            log.error('Cloudflare 连接测试失败:', error.message);
            if (error.response) {
                log.error('响应状态:', error.response.status);
                log.error('响应数据:', JSON.stringify(error.response.data, null, 2));
            }

            return {
                success: false,
                error: error.response?.data?.errors?.[0]?.message || error.message,
                details: error.response?.data
            };
        }
    }

    async getAccountInfo() {
        if (!this.credentials) {
            throw new Error('未设置 Cloudflare 凭证');
        }

        try {
            const config = {
                headers: {}
            };

            if (this.credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
            } else {
                config.headers['X-Auth-Email'] = this.credentials.email;
                config.headers['X-Auth-Key'] = this.credentials.globalKey;
            }

            const response = await axios.get(`${this.baseURL}/user`, config);

            if (response.data.success) {
                return response.data.result;
            } else {
                throw new Error(response.data.errors?.[0]?.message || '获取账号信息失败');
            }
        } catch (error) {
            log.error('获取 Cloudflare 账号信息失败:', error);
            throw error;
        }
    }

    async getTunnels() {
        if (!this.credentials) {
            throw new Error('未设置 Cloudflare 凭证');
        }

        try {
            const config = {
                headers: {}
            };

            if (this.credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
            } else {
                config.headers['X-Auth-Email'] = this.credentials.email;
                config.headers['X-Auth-Key'] = this.credentials.globalKey;
            }

            // 先获取账号ID
            const accountResponse = await axios.get(`${this.baseURL}/accounts`, config);
            if (!accountResponse.data.success || accountResponse.data.result.length === 0) {
                throw new Error('无法获取账号信息');
            }

            const accountId = accountResponse.data.result[0].id;

            // 获取隧道列表
            const tunnelResponse = await axios.get(`${this.baseURL}/accounts/${accountId}/tunnels`, config);

            if (tunnelResponse.data.success) {
                return tunnelResponse.data.result;
            } else {
                throw new Error(tunnelResponse.data.errors?.[0]?.message || '获取隧道列表失败');
            }
        } catch (error) {
            log.error('获取 Cloudflare 隧道失败:', error);
            throw error;
        }
    }

    async getZones() {
        if (!this.credentials) {
            throw new Error('未设置 Cloudflare 凭证');
        }

        try {
            const config = {
                headers: {}
            };

            if (this.credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
            } else {
                config.headers['X-Auth-Email'] = this.credentials.email;
                config.headers['X-Auth-Key'] = this.credentials.globalKey;
            }

            // 获取域名列表
            const response = await axios.get(`${this.baseURL}/zones`, config);

            if (response.data.success) {
                return response.data.result;
            } else {
                throw new Error(response.data.errors?.[0]?.message || '获取域名列表失败');
            }
        } catch (error) {
            log.error('获取 Cloudflare 域名失败:', error);
            throw error;
        }
    }

    async createTunnel(tunnelData) {
        if (!this.credentials) {
            throw new Error('未设置 Cloudflare 凭证');
        }

        try {
            const config = {
                headers: {}
            };

            if (this.credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
            } else {
                config.headers['X-Auth-Email'] = this.credentials.email;
                config.headers['X-Auth-Key'] = this.credentials.globalKey;
            }

            // 获取账号ID - 优先使用用户提供的，否则从 API 获取
            let accountId = this.credentials.accountId;

            if (!accountId) {
                log.info('未提供 Account ID，尝试从 API 获取...');
                try {
                    const accountResponse = await axios.get(`${this.baseURL}/accounts`, config);
                    if (accountResponse.data.success && accountResponse.data.result.length > 0) {
                        accountId = accountResponse.data.result[0].id;
                        log.info(`从 API 获取到 Account ID: ${accountId}`);
                    } else {
                        throw new Error('API 返回的账号列表为空');
                    }
                } catch (error) {
                    log.error('获取 Account ID 失败:', error.message);
                    throw new Error('无法获取 Account ID。请在设置中手动输入 Account ID，或确保 API Token 有 "Account - Account Settings - Read" 权限');
                }
            } else {
                log.info(`使用提供的 Account ID: ${accountId}`);
            }

            // 创建隧道
            const response = await axios.post(
                `${this.baseURL}/accounts/${accountId}/cfd_tunnel`,
                {
                    name: tunnelData.name,
                    tunnel_secret: tunnelData.secret || this.generateTunnelSecret()
                },
                config
            );

            if (response.data.success) {
                log.info(`Cloudflare 隧道 ${tunnelData.name} 创建成功`);
                return response.data.result;
            } else {
                throw new Error(response.data.errors?.[0]?.message || '创建隧道失败');
            }
        } catch (error) {
            log.error('创建 Cloudflare 隧道失败:', error);
            throw error;
        }
    }

    async cleanupTunnelConfig(tunnelId) {
        if (!this.credentials) {
            throw new Error('未设置 Cloudflare 凭证');
        }

        try {
            const config = {
                headers: {}
            };

            if (this.credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
            } else {
                config.headers['X-Auth-Email'] = this.credentials.email;
                config.headers['X-Auth-Key'] = this.credentials.globalKey;
            }

            // 获取账号ID
            let accountId = this.credentials.accountId;
            if (!accountId) {
                const accountResponse = await axios.get(`${this.baseURL}/accounts`, config);
                accountId = accountResponse.data.result[0].id;
            }

            // 清空隧道配置（设置为空配置）
            const response = await axios.put(
                `${this.baseURL}/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
                {
                    config: {
                        ingress: [
                            {
                                service: 'http_status:404'
                            }
                        ]
                    }
                },
                config
            );

            if (response.data.success) {
                log.info(`隧道配置已清理: ${tunnelId}`);
                return { success: true };
            } else {
                throw new Error(response.data.errors?.[0]?.message || '清理隧道配置失败');
            }
        } catch (error) {
            log.error('清理隧道配置失败:', error);
            throw error;
        }
    }

    async deleteTunnel(tunnelId) {
        if (!this.credentials) {
            throw new Error('未设置 Cloudflare 凭证');
        }

        try {
            const config = {
                headers: {}
            };

            if (this.credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
            } else {
                config.headers['X-Auth-Email'] = this.credentials.email;
                config.headers['X-Auth-Key'] = this.credentials.globalKey;
            }

            // 获取账号ID - 优先使用用户提供的，否则从 API 获取
            let accountId = this.credentials.accountId;

            if (!accountId) {
                try {
                    const accountResponse = await axios.get(`${this.baseURL}/accounts`, config);
                    if (accountResponse.data.success && accountResponse.data.result.length > 0) {
                        accountId = accountResponse.data.result[0].id;
                    } else {
                        throw new Error('API 返回的账号列表为空');
                    }
                } catch (error) {
                    throw new Error('无法获取 Account ID。请在设置中手动输入 Account ID');
                }
            }

            // 删除隧道（添加 cascade=true 参数强制删除）
            const response = await axios.delete(
                `${this.baseURL}/accounts/${accountId}/cfd_tunnel/${tunnelId}?cascade=true`,
                config
            );

            if (response.data.success) {
                log.info(`Cloudflare 隧道 ${tunnelId} 删除成功`);
                return { success: true };
            } else {
                throw new Error(response.data.errors?.[0]?.message || '删除隧道失败');
            }
        } catch (error) {
            log.error('删除 Cloudflare 隧道失败:', error);
            throw error;
        }
    }

    generateTunnelSecret() {
        const crypto = require('crypto');
        return crypto.randomBytes(32).toString('base64');
    }

    async getAccountId() {
        // 优先使用用户提供的 Account ID
        if (this.credentials.accountId) {
            return this.credentials.accountId;
        }

        const config = {
            headers: {}
        };

        if (this.credentials.apiToken) {
            config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
        } else {
            config.headers['X-Auth-Email'] = this.credentials.email;
            config.headers['X-Auth-Key'] = this.credentials.globalKey;
        }

        try {
            const accountResponse = await axios.get(`${this.baseURL}/accounts`, config);
            if (accountResponse.data.success && accountResponse.data.result.length > 0) {
                return accountResponse.data.result[0].id;
            } else {
                throw new Error('API 返回的账号列表为空');
            }
        } catch (error) {
            throw new Error('无法获取 Account ID。请在设置中手动输入 Account ID，或确保 API Token 有 "Account - Account Settings - Read" 权限');
        }
    }

    async getTunnelConfiguration(tunnelId) {
        if (!this.credentials) {
            throw new Error('未设置 Cloudflare 凭证');
        }

        try {
            const config = {
                headers: {}
            };

            if (this.credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
            } else {
                config.headers['X-Auth-Email'] = this.credentials.email;
                config.headers['X-Auth-Key'] = this.credentials.globalKey;
            }

            const accountId = await this.getAccountId();

            // 获取隧道配置
            const response = await axios.get(
                `${this.baseURL}/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
                config
            );

            if (response.data.success) {
                return response.data.result;
            } else {
                throw new Error(response.data.errors?.[0]?.message || '获取隧道配置失败');
            }
        } catch (error) {
            log.error('获取隧道配置失败:', error);
            throw error;
        }
    }

    async updateTunnelConfiguration(tunnelId, configuration) {
        if (!this.credentials) {
            throw new Error('未设置 Cloudflare 凭证');
        }

        try {
            const config = {
                headers: {}
            };

            if (this.credentials.apiToken) {
                config.headers['Authorization'] = `Bearer ${this.credentials.apiToken}`;
            } else {
                config.headers['X-Auth-Email'] = this.credentials.email;
                config.headers['X-Auth-Key'] = this.credentials.globalKey;
            }

            const accountId = await this.getAccountId();

            // 更新隧道配置
            const response = await axios.put(
                `${this.baseURL}/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
                { config: configuration },
                config
            );

            if (response.data.success) {
                log.info(`隧道 ${tunnelId} 配置更新成功`);
                return response.data.result;
            } else {
                throw new Error(response.data.errors?.[0]?.message || '更新隧道配置失败');
            }
        } catch (error) {
            log.error('更新隧道配置失败:', error);
            throw error;
        }
    }
}

const cloudflareAPI = new CloudflareAPI();

function createWindow() {
    // 获取图标路径（兼容开发和生产环境）
    const getIconPath = () => {
        if (process.platform === 'win32') {
            // Windows 使用 .ico 文件
            const icoPath = path.join(__dirname, '../../assets/icons/icon.ico');
            if (require('fs').existsSync(icoPath)) {
                return icoPath;
            }
        }
        // 其他平台或找不到 .ico 时使用 .png
        return path.join(__dirname, '../../assets/icons/icon.png');
    };

    // 创建浏览器窗口
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, '../preload/preload.js')
        }
    });

    // 加载构建后的渲染进程
    const indexPath = isDev
        ? path.join(__dirname, '../../build/index.html')
        : path.join(__dirname, '../../build/index.html');

    mainWindow.loadFile(indexPath);

    // 窗口准备好后显示
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        // 开发环境下打开开发者工具
        // 检查是否为打包后的应用
        const isPackaged = app.isPackaged;
        if (!isPackaged || isDev) {
            mainWindow.webContents.openDevTools();
            log.info('开发者工具已打开');
        }
    });

    // 处理窗口关闭事件（点击 X 按钮）
    mainWindow.on('close', (event) => {
        // 获取设置
        const settings = store.get('app.settings', {});
        const minimizeToTray = settings.minimizeToTray !== false; // 默认为 true

        if (minimizeToTray) {
            // 如果启用了最小化到托盘，阻止窗口关闭，改为隐藏
            event.preventDefault();
            mainWindow.hide();
            log.info('窗口已隐藏到系统托盘');
        } else {
            // 如果未启用，正常关闭
            log.info('窗口正在关闭');
        }
    });

    // 处理窗口最小化事件
    mainWindow.on('minimize', (event) => {
        // 获取设置
        const settings = store.get('app.settings', {});
        const minimizeToTray = settings.minimizeToTray !== false; // 默认为 true

        if (minimizeToTray) {
            // 如果启用了最小化到托盘，阻止默认最小化，改为隐藏
            event.preventDefault();
            mainWindow.hide();
            log.info('窗口已最小化到系统托盘');
        }
        // 否则使用默认的最小化行为
    });

    // 当窗口被关闭时发出
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 创建系统托盘
    createTray();
}

function createTray() {
    try {
        // 获取托盘图标路径（打包后需要使用 .ico 文件）
        const getTrayIconPath = () => {
            if (process.platform === 'win32') {
                // Windows 托盘图标使用 .ico 文件
                const icoPath = path.join(__dirname, '../../assets/icons/icon.ico');
                if (require('fs').existsSync(icoPath)) {
                    log.info('使用 ICO 图标:', icoPath);
                    return icoPath;
                }
            }
            // 其他平台使用 .png
            const pngPath = path.join(__dirname, '../../assets/icons/icon.png');
            log.info('使用 PNG 图标:', pngPath);
            return pngPath;
        };

        const iconPath = getTrayIconPath();
        tray = new Tray(iconPath);

        const contextMenu = Menu.buildFromTemplate([
            {
                label: '显示主窗口',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    }
                }
            },
            { type: 'separator' },
            {
                label: '隧道管理',
                submenu: [
                    {
                        label: '启动所有隧道',
                        click: () => {
                            tunnelManager.tunnels.forEach(tunnel => {
                                if (tunnel.status === 'stopped') {
                                    tunnelManager.startTunnel(tunnel.id);
                                }
                            });
                        }
                    },
                    {
                        label: '停止所有隧道',
                        click: () => {
                            tunnelManager.tunnels.forEach(tunnel => {
                                if (tunnel.status === 'running') {
                                    tunnelManager.stopTunnel(tunnel.id);
                                }
                            });
                        }
                    }
                ]
            },
            { type: 'separator' },
            {
                label: '设置',
                click: () => {
                    if (mainWindow) {
                        mainWindow.webContents.send('navigate-to', 'settings');
                    }
                }
            },
            {
                label: '退出',
                click: () => {
                    app.quit();
                }
            }
        ]);

        tray.setToolTip(APP_NAME);
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            if (mainWindow) {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        });

        log.info('系统托盘创建成功');
    } catch (error) {
        log.error('创建系统托盘失败:', error);
    }
}

function createMenu() {
    const template = [
        {
            label: '文件',
            submenu: [
                {
                    label: '新建隧道',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow?.webContents.send('show-new-tunnel-dialog');
                    }
                },
                { type: 'separator' },
                {
                    label: '退出',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '隧道',
            submenu: [
                {
                    label: '刷新列表',
                    accelerator: 'F5',
                    click: () => {
                        mainWindow?.webContents.send('refresh-tunnels');
                    }
                },
                { type: 'separator' },
                {
                    label: '启动所有',
                    click: () => {
                        tunnelManager.tunnels.forEach(tunnel => {
                            if (tunnel.status === 'stopped') {
                                tunnelManager.startTunnel(tunnel.id);
                            }
                        });
                    }
                },
                {
                    label: '停止所有',
                    click: () => {
                        tunnelManager.tunnels.forEach(tunnel => {
                            if (tunnel.status === 'running') {
                                tunnelManager.stopTunnel(tunnel.id);
                            }
                        });
                    }
                }
            ]
        },
        {
            label: '帮助',
            submenu: [
                {
                    label: '使用帮助',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: '使用帮助',
                            message: 'Cloudflare 隧道管理器 - 使用指南',
                            detail: `
【隧道管理】
• 新建隧道：点击"新建隧道"按钮，填写隧道名称和路由配置
• 启动隧道：点击隧道卡片上的"启动"按钮
• 停止隧道：点击隧道卡片上的"停止"按钮
• 重启隧道：点击隧道卡片上的"重启"按钮
• 删除隧道：点击隧道卡片上的"删除"按钮

【批量操作】
• 勾选隧道：点击隧道卡片左侧的复选框
• 批量启动：选中隧道后，点击"批量启动"按钮
• 批量停止：选中隧道后，点击"批量停止"按钮
• 批量重启：选中隧道后，点击"批量重启"按钮
• 批量删除：选中隧道后，点击"批量删除"按钮

【路由配置】
• 添加路由：在隧道详情中点击"添加路由"
• 配置域名：选择域名或输入子域名
• 配置服务：填写本地服务地址（如 http://localhost:3000）

【日志查看】
• 实时日志：在"服务管理"页面点击"开始日志流"
• 历史日志：在"日志查看"页面查看所有隧道的历史日志
• 日志过滤：按级别过滤日志（全部/信息/警告/错误）

【设置】
• 通知设置：配置隧道状态变化、错误、成功通知
• 常规设置：配置自动启动、最小化到托盘等
• 高级设置：配置日志级别、连接超时等

【Cloudflare 账号】
• 配置 API Token：在"Cloudflare 账号"页面输入 API Token
• 测试连接：点击"测试连接"验证 API Token
• 保存配置：点击"保存配置"保存 API Token

更多帮助请访问：https://github.com/cloudflare/cloudflared
                            `.trim(),
                            buttons: ['确定']
                        });
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: '关于',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: '关于',
                            message: APP_NAME,
                            detail: '版本: 2.0.0\n基于 Electron 的跨平台 Cloudflare 隧道管理器\n\n© 2024 Cloudflare Tunnel Manager Team',
                            buttons: ['确定']
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// IPC 处理程序
ipcMain.handle('load-tunnels', async () => {
    return await tunnelManager.loadTunnels();
});

ipcMain.handle('start-tunnel', async (event, tunnelId) => {
    return await tunnelManager.startTunnel(tunnelId);
});

ipcMain.handle('stop-tunnel', async (event, tunnelId) => {
    return await tunnelManager.stopTunnel(tunnelId);
});

ipcMain.handle('restart-tunnel', async (event, tunnelId) => {
    return await tunnelManager.restartTunnel(tunnelId);
});

ipcMain.handle('delete-tunnel', async (event, tunnelId) => {
    return await tunnelManager.deleteTunnel(tunnelId);
});

ipcMain.handle('create-tunnel', async (event, tunnelData) => {
    return await tunnelManager.createTunnel(tunnelData);
});

ipcMain.handle('get-tunnel-stats', async () => {
    return tunnelManager.getTunnelStats();
});

// 路由管理处理程序
ipcMain.handle('add-route', async (event, tunnelId, routeData) => {
    return await tunnelManager.addRoute(tunnelId, routeData);
});

ipcMain.handle('update-route', async (event, tunnelId, routeId, routeData) => {
    return await tunnelManager.updateRoute(tunnelId, routeId, routeData);
});

ipcMain.handle('delete-route', async (event, tunnelId, routeId) => {
    return await tunnelManager.deleteRoute(tunnelId, routeId);
});

// 配置文件管理处理程序
ipcMain.handle('generate-config', async (event, tunnelId) => {
    return await tunnelManager.generateConfigFile(tunnelId);
});

ipcMain.handle('get-config-content', async (event, tunnelId) => {
    return await tunnelManager.getConfigFileContent(tunnelId);
});

ipcMain.handle('open-config-folder', async () => {
    try {
        await shell.openExternal(require('os').homedir() + '/.cloudflared');
        return true;
    } catch (error) {
        log.error('打开配置文件夹失败:', error);
        return false;
    }
});

ipcMain.handle('show-message', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, options);
    return result;
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// 日志管理处理程序
ipcMain.handle('get-logs', async (event, filter) => {
    return tunnelManager.getLogs(filter);
});

ipcMain.handle('clear-logs', async () => {
    return tunnelManager.clearLogs();
});

ipcMain.handle('export-logs', async () => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: '导出日志',
            defaultPath: `tunnel-logs-${new Date().toISOString().split('T')[0]}.txt`,
            filters: [
                { name: '文本文件', extensions: ['txt'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });

        if (filePath) {
            const fs = require('fs');
            const logs = tunnelManager.getLogs();
            const logText = logs.map(log =>
                `[${new Date(log.timestamp).toLocaleString()}] ${log.level.toUpperCase()}: ${log.message}`
            ).join('\n');

            fs.writeFileSync(filePath, logText, 'utf8');
            return { success: true, path: filePath };
        }
        return { success: false };
    } catch (error) {
        log.error('导出日志失败:', error);
        return { success: false, error: error.message };
    }
});

// 服务管理处理程序
ipcMain.handle('check-cloudflared', async () => {
    return await tunnelManager.checkCloudflared();
});

ipcMain.handle('get-service-status', async () => {
    return tunnelManager.getServiceStatus();
});

ipcMain.handle('start-cloudflared-service', async () => {
    return await tunnelManager.startCloudflaredService();
});

ipcMain.handle('stop-cloudflared-service', async () => {
    return await tunnelManager.stopCloudflaredService();
});

ipcMain.handle('restart-cloudflared-service', async () => {
    return await tunnelManager.restartCloudflaredService();
});

// Cloudflare API 处理程序
ipcMain.handle('test-cloudflare-connection', async (event, credentials) => {
    return await cloudflareAPI.testConnection(credentials);
});

ipcMain.handle('save-cloudflare-settings', async (event, settings) => {
    return cloudflareAPI.saveCredentials(settings);
});

ipcMain.handle('load-cloudflare-settings', async () => {
    return cloudflareAPI.credentials;
});

// 应用设置处理程序
ipcMain.handle('save-app-settings', async (event, settings) => {
    try {
        store.set('app.settings', settings);
        log.info('应用设置已保存:', settings);
        return { success: true };
    } catch (error) {
        log.error('保存应用设置失败:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('load-app-settings', async () => {
    try {
        const settings = store.get('app.settings', {
            minimizeToTray: true,  // 默认启用最小化到托盘
            autoStart: false,
            notifications: {
                statusChange: true,
                errors: true,
                success: false
            }
        });
        log.info('应用设置已加载:', settings);
        return settings;
    } catch (error) {
        log.error('加载应用设置失败:', error);
        return {
            minimizeToTray: true,
            autoStart: false,
            notifications: {
                statusChange: true,
                errors: true,
                success: false
            }
        };
    }
});

ipcMain.handle('get-cloudflare-account', async () => {
    try {
        return await cloudflareAPI.getAccountInfo();
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('get-cloudflare-tunnels', async () => {
    try {
        return await cloudflareAPI.getTunnels();
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('get-cloudflare-zones', async () => {
    try {
        return await cloudflareAPI.getZones();
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('create-cloudflare-tunnel', async (event, tunnelData) => {
    try {
        return await cloudflareAPI.createTunnel(tunnelData);
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('delete-cloudflare-tunnel', async (event, tunnelId) => {
    try {
        return await cloudflareAPI.deleteTunnel(tunnelId);
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('get-tunnel-configuration', async (event, tunnelId) => {
    try {
        return await cloudflareAPI.getTunnelConfiguration(tunnelId);
    } catch (error) {
        throw error;
    }
});

ipcMain.handle('update-tunnel-configuration', async (event, tunnelId, configuration) => {
    try {
        return await cloudflareAPI.updateTunnelConfiguration(tunnelId, configuration);
    } catch (error) {
        throw error;
    }
});

// 打开外部链接
ipcMain.handle('open-external', async (event, url) => {
    try {
        const { shell } = require('electron');
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        log.error('打开外部链接失败:', error);
        return { success: false, error: error.message };
    }
});

// 下载 cloudflared
ipcMain.handle('download-cloudflared', async () => {
    try {
        const https = require('https');
        const fs = require('fs');
        const path = require('path');
        const { execSync } = require('child_process');

        // 检测平台
        let downloadUrl = '';
        let fileName = '';
        let installCommand = '';

        if (process.platform === 'win32') {
            // Windows
            downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
            fileName = 'cloudflared.exe';
            installCommand = null; // Windows 直接下载可执行文件
        } else if (process.platform === 'darwin') {
            // macOS
            downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
            fileName = 'cloudflared-darwin-amd64.tgz';
            installCommand = 'tar -xzf';
        } else {
            // Linux
            downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
            fileName = 'cloudflared';
            installCommand = null;
        }

        const downloadPath = path.join(require('os').tmpdir(), fileName);

        log.info(`开始下载 cloudflared: ${downloadUrl}`);

        // 发送下载进度
        const sendProgress = (progress) => {
            if (mainWindow) {
                mainWindow.webContents.send('download-progress', progress);
            }
        };

        // 下载文件
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(downloadPath);
            https.get(downloadUrl, (response) => {
                const totalSize = parseInt(response.headers['content-length'], 10);
                let downloadedSize = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    const progress = Math.round((downloadedSize / totalSize) * 100);
                    sendProgress(progress);
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(downloadPath, () => {});
                reject(err);
            });
        });

        log.info(`下载完成: ${downloadPath}`);

        // 安装
        if (process.platform === 'win32') {
            // Windows: 使用用户目录（不需要管理员权限）
            const installPath = path.join(require('os').homedir(), '.cloudflared', 'bin');
            if (!fs.existsSync(installPath)) {
                fs.mkdirSync(installPath, { recursive: true });
            }
            const targetPath = path.join(installPath, 'cloudflared.exe');
            fs.copyFileSync(downloadPath, targetPath);

            // 添加到用户 PATH（不需要管理员权限）
            try {
                execSync(`setx PATH "%PATH%;${installPath}"`, { stdio: 'ignore' });
            } catch (e) {
                log.warn('添加到 PATH 失败，请手动添加:', installPath);
            }

            log.info(`安装完成: ${targetPath}`);
            return { success: true, path: targetPath };
        } else if (process.platform === 'darwin') {
            // macOS: 解压并移动到 /usr/local/bin
            execSync(`tar -xzf ${downloadPath} -C /tmp`);
            execSync('sudo mv /tmp/cloudflared /usr/local/bin/cloudflared');
            execSync('sudo chmod +x /usr/local/bin/cloudflared');

            log.info('安装完成: /usr/local/bin/cloudflared');
            return { success: true, path: '/usr/local/bin/cloudflared' };
        } else {
            // Linux: 移动到 /usr/local/bin
            execSync(`sudo mv ${downloadPath} /usr/local/bin/cloudflared`);
            execSync('sudo chmod +x /usr/local/bin/cloudflared');

            log.info('安装完成: /usr/local/bin/cloudflared');
            return { success: true, path: '/usr/local/bin/cloudflared' };
        }
    } catch (error) {
        log.error('下载/安装 cloudflared 失败:', error);
        return { success: false, error: error.message };
    }
});

// 更新 cloudflared
ipcMain.handle('update-cloudflared', async () => {
    try {
        const { execSync } = require('child_process');

        // 先检查是否已安装
        const checkResult = await tunnelManager.checkCloudflared();
        if (!checkResult.installed) {
            return { success: false, error: 'cloudflared 未安装' };
        }

        log.info('开始更新 cloudflared');

        if (process.platform === 'darwin') {
            // macOS: 使用 brew 更新
            try {
                execSync('brew upgrade cloudflared', { stdio: 'inherit' });
                log.info('更新完成');
                return { success: true };
            } catch (e) {
                log.warn('brew 更新失败，使用下载方式');
            }
        }

        // 所有平台：使用下载方式更新
        // 直接调用下载逻辑（不是调用 ipcMain.handle）
        const https = require('https');
        const fs = require('fs');
        const path = require('path');

        // 检测平台
        let downloadUrl = '';
        let fileName = '';

        if (process.platform === 'win32') {
            downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
            fileName = 'cloudflared.exe';
        } else if (process.platform === 'darwin') {
            downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz';
            fileName = 'cloudflared-darwin-amd64.tgz';
        } else {
            downloadUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
            fileName = 'cloudflared';
        }

        const downloadPath = path.join(require('os').tmpdir(), fileName);

        log.info(`开始下载 cloudflared: ${downloadUrl}`);

        // 下载文件
        await new Promise((resolve, reject) => {
            const file = fs.createWriteStream(downloadPath);
            https.get(downloadUrl, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(downloadPath, () => {});
                reject(err);
            });
        });

        log.info(`下载完成: ${downloadPath}`);

        // 安装
        if (process.platform === 'win32') {
            // Windows: 使用用户目录
            const installPath = path.join(require('os').homedir(), '.cloudflared', 'bin');
            if (!fs.existsSync(installPath)) {
                fs.mkdirSync(installPath, { recursive: true });
            }
            const targetPath = path.join(installPath, 'cloudflared.exe');
            fs.copyFileSync(downloadPath, targetPath);

            log.info(`更新完成: ${targetPath}`);
            return { success: true, path: targetPath };
        } else if (process.platform === 'darwin') {
            execSync(`tar -xzf ${downloadPath} -C /tmp`);
            execSync('sudo mv /tmp/cloudflared /usr/local/bin/cloudflared');
            execSync('sudo chmod +x /usr/local/bin/cloudflared');

            log.info('更新完成: /usr/local/bin/cloudflared');
            return { success: true, path: '/usr/local/bin/cloudflared' };
        } else {
            execSync(`sudo mv ${downloadPath} /usr/local/bin/cloudflared`);
            execSync('sudo chmod +x /usr/local/bin/cloudflared');

            log.info('更新完成: /usr/local/bin/cloudflared');
            return { success: true, path: '/usr/local/bin/cloudflared' };
        }
    } catch (error) {
        log.error('更新 cloudflared 失败:', error);
        return { success: false, error: error.message };
    }
});

// Electron应用准备就绪时创建窗口
app.whenReady().then(() => {
    log.info('应用准备就绪');
    createWindow();
    createMenu();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 当所有窗口都被关闭时的处理
// 注意：当窗口隐藏到托盘时，不应该退出应用
app.on('window-all-closed', () => {
    // macOS 上通常不退出应用
    if (process.platform === 'darwin') {
        return;
    }

    // 检查是否启用了托盘
    // 如果有托盘，不退出应用（窗口可能只是隐藏了）
    // 用户需要通过托盘菜单的"退出"来真正退出应用
    const settings = store.get('app.settings', {});
    const minimizeToTray = settings.minimizeToTray !== false;

    if (!minimizeToTray) {
        // 如果未启用托盘，正常退出
        app.quit();
    }
    // 如果启用了托盘，不退出应用，让它在后台运行
});

// 应用退出前清理
app.on('before-quit', () => {
    log.info('应用即将退出');
    // 停止所有隧道
    tunnelManager.tunnels.forEach(tunnel => {
        if (tunnel.status === 'running') {
            tunnelManager.stopTunnel(tunnel.id);
        }
    });
});

// 自动更新配置
if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', () => {
        log.info('发现新版本');
    });

    autoUpdater.on('update-downloaded', () => {
        log.info('新版本下载完成');
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '更新可用',
            message: '新版本已下载完成',
            detail: '应用将重启以完成更新'
        }).then(() => {
            autoUpdater.quitAndInstall();
        });
    });
}

// 安全配置
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
    });
});

log.info('主进程初始化完成');