/**
 * Cloudflare隧道管理器 - 主应用逻辑
 */

class TunnelManagerApp {
    constructor() {
        this.currentPage = 'tunnels';
        this.tunnels = [];
        this.stats = { total: 0, running: 0, stopped: 0, error: 0 };
        this.serviceStatusTimer = null; // 服务状态定时器
        this.modalRoutes = []; // 创建隧道时的路由列表
        this.availableZones = []; // 可用的域名列表
        this.currentDetailTunnel = null; // 当前查看详情的隧道
        this.currentEditingTunnelId = null; // 当前正在编辑路由的隧道 ID
        this.logStreamActive = false; // 日志流是否激活

        // 图标映射 - 将 Bootstrap Icons 映射到本地 SVG
        this.iconMap = {
            'list-ul': 'tunnel',
            'file-text': 'logs',
            'gear': 'settings',
            'sliders': 'settings',
            'folder2-open': 'settings',
            'arrow-clockwise': 'restart',
            'plus-lg': 'plus',
            'inbox': 'tunnel',
            'calendar3': 'settings',
            'link-45deg': 'settings',
            'play-fill': 'play',
            'stop-fill': 'stop',
            'trash': 'delete'
        };

        this.init();
    }

    // 获取图标HTML
    getIcon(iconName, className = 'icon') {
        const svgName = this.iconMap[iconName] || iconName;
        return `<img src="assets/icons/ui/${svgName}.svg" class="${className}" alt="${iconName}">`;
    }

    async init() {
        console.log('应用初始化中...');

        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    }

    async start() {
        console.log('应用启动');

        // 初始化事件监听
        this.initEventListeners();

        // 初始化界面
        this.renderLayout();

        // 加载初始数据
        await this.loadTunnels();
        await this.loadSettings();

        console.log('应用启动完成');
    }

    initEventListeners() {
        // 侧边栏导航
        document.addEventListener('click', (e) => {
            if (e.target.matches('.nav-link')) {
                e.preventDefault();
                const page = e.target.dataset.page;
                if (page) {
                    this.switchPage(page);
                }
            }
        });

        // 主页面按钮事件
        document.addEventListener('click', (e) => {
            // 获取实际的按钮元素（可能点击的是按钮内的图标）
            const target = e.target.closest('button') || e.target;

            console.log('点击事件:', e.target, '目标:', target, 'ID:', target.id);

            if (target.matches('#refresh-btn') || target.id === 'refresh-btn') {
                console.log('刷新按钮被点击');
                this.loadTunnels();
            } else if (target.matches('#add-tunnel-btn') || target.id === 'add-tunnel-btn') {
                console.log('新建隧道按钮被点击');
                this.showAddTunnelModal();
            } else if (target.matches('#save-tunnel-btn') || target.id === 'save-tunnel-btn') {
                console.log('保存隧道按钮被点击');
                this.saveTunnel();
            } else if (target.matches('#open-config-btn') || target.id === 'open-config-btn') {
                console.log('打开配置按钮被点击');
                this.openConfigFolder();
            } else if (target.id === 'log-filter-all') {
                this.filterLogs('all');
            } else if (target.id === 'log-filter-info') {
                this.filterLogs('info');
            } else if (target.id === 'log-filter-warn') {
                this.filterLogs('warn');
            } else if (target.id === 'log-filter-error') {
                this.filterLogs('error');
            } else if (target.id === 'clear-logs-btn') {
                this.clearLogs();
            } else if (target.id === 'export-logs-btn') {
                this.exportLogs();
            } else if (target.id === 'check-cloudflared-btn') {
                this.checkCloudflared();
            } else if (target.id === 'download-cloudflared-btn') {
                this.downloadCloudflared();
            } else if (target.id === 'update-cloudflared-btn') {
                this.updateCloudflared();
            } else if (target.id === 'start-service-btn') {
                this.startService();
            } else if (target.id === 'stop-service-btn') {
                this.stopService();
            } else if (target.id === 'restart-service-btn') {
                this.restartService();
            } else if (target.id === 'toggle-log-stream-btn') {
                this.toggleLogStream();
            } else if (target.id === 'clear-service-logs-btn') {
                this.clearServiceLogs();
            } else if (target.id === 'export-service-logs-btn') {
                this.exportServiceLogs();
            } else if (target.id === 'test-cf-connection-btn') {
                this.testCloudflareConnection();
            } else if (target.id === 'save-cf-settings-btn') {
                this.saveCloudflareSettings();
            } else if (target.id === 'load-cf-settings-btn') {
                this.loadCloudflareSettings();
            } else if (target.id === 'add-route-btn') {
                this.addModalRoute();
            } else if (target.id === 'select-all-btn') {
                this.selectAllTunnels();
            } else if (target.id === 'deselect-all-btn') {
                this.deselectAllTunnels();
            } else if (target.id === 'batch-start-btn') {
                this.batchStartTunnels();
            } else if (target.id === 'batch-stop-btn') {
                this.batchStopTunnels();
            } else if (target.id === 'batch-restart-btn') {
                this.batchRestartTunnels();
            } else if (target.id === 'batch-delete-btn') {
                this.batchDeleteTunnels();
            } else if (target.id === 'save-settings-btn') {
                this.saveSettings();
            } else if (target.id === 'open-config-folder-btn') {
                this.openConfigFolder();
            } else if (target.id === 'reload-config-btn') {
                this.reloadConfig();
            }
        });

        // 监听来自主进程的事件
        window.electronAPI.onTunnelUpdated((tunnel) => {
            this.updateTunnelInList(tunnel);
        });

        window.electronAPI.onRefreshTunnels(() => {
            this.loadTunnels();
        });

        window.electronAPI.onNavigateTo((page) => {
            this.switchPage(page);
        });

        window.electronAPI.onShowNewTunnelDialog(() => {
            this.showAddTunnelModal();
        });

        // 监听新日志
        window.electronAPI.onNewLog((logEntry) => {
            this.appendLog(logEntry);
            // 如果日志流开启，也显示到实时日志流
            if (this.isLogStreamActive()) {
                this.appendServiceLog(logEntry);
            }
        });

        // 监听服务日志
        window.electronAPI.onServiceLog((logEntry) => {
            this.appendServiceLog(logEntry);
        });

        // 监听服务状态变化
        window.electronAPI.onServiceStatusChanged((status) => {
            this.updateServiceStatus(status);
        });

        // 监听下载进度
        window.electronAPI.onDownloadProgress((progress) => {
            this.showInfo(`下载进度: ${progress}%`);
        });

        // 窗口大小变化时调整布局
        window.addEventListener('resize', () => {
            this.adjustLayout();
        });
    }

    renderLayout() {
        document.body.innerHTML = `
            <div class="app-container">
                <!-- 侧边栏 -->
                <aside class="sidebar">
                    <div class="sidebar-header">
                        <img src="../assets/images/logo.svg" alt="Cloudflare" class="logo">
                        <h3>隧道管理器</h3>
                    </div>
                    <nav class="sidebar-nav">
                        <div class="nav-item">
                            <a href="#" class="nav-link active" data-page="tunnels">
                                <img src="assets/icons/ui/tunnel.svg" class="icon me-2" alt="隧道">
                                隧道列表
                            </a>
                        </div>
                        <div class="nav-item">
                            <a href="#" class="nav-link" data-page="logs">
                                <img src="assets/icons/ui/logs.svg" class="icon me-2" alt="日志">
                                日志查看
                            </a>
                        </div>
                        <div class="nav-item">
                            <a href="#" class="nav-link" data-page="services">
                                <img src="assets/icons/ui/settings.svg" class="icon me-2" alt="服务">
                                服务管理
                            </a>
                        </div>
                        <div class="nav-item">
                            <a href="#" class="nav-link" data-page="settings">
                                <img src="assets/icons/ui/settings.svg" class="icon me-2" alt="设置">
                                设置
                            </a>
                        </div>
                    </nav>
                    <div class="sidebar-footer">
                        <div class="text-center">
                            <small class="text-white-50">v2.0.0</small>
                        </div>
                    </div>
                </aside>

                <!-- 主内容区 -->
                <main class="main-content">
                    <header class="main-header">
                        <div class="d-flex align-items-center">
                            <h1 class="h3 mb-0 me-3" id="page-title">隧道列表</h1>
                            <span class="badge bg-success" id="status-badge">就绪</span>
                        </div>
                        <div class="d-flex align-items-center">
                            <button class="btn btn-outline-primary btn-sm me-2" id="open-config-btn">
                                <img src="assets/icons/ui/settings.svg" class="icon" alt="文件夹"> 配置文件夹
                            </button>
                            <button class="btn btn-primary btn-sm" id="refresh-btn">
                                <img src="assets/icons/ui/restart.svg" class="icon" alt="刷新"> 刷新
                            </button>
                        </div>
                    </header>

                    <div class="main-body">
                        <!-- 隧道列表页面 -->
                        <div id="tunnels-page" class="page active">
                            <!-- 统计信息 -->
                            <div class="row mb-4">
                                <div class="col-md-3 col-sm-6">
                                    <div class="stats-card">
                                        <div class="stats-number text-primary" id="total-tunnels">0</div>
                                        <div class="stats-label">总隧道数</div>
                                    </div>
                                </div>
                                <div class="col-md-3 col-sm-6">
                                    <div class="stats-card">
                                        <div class="stats-number text-success" id="running-tunnels">0</div>
                                        <div class="stats-label">运行中</div>
                                    </div>
                                </div>
                                <div class="col-md-3 col-sm-6">
                                    <div class="stats-card">
                                        <div class="stats-number text-warning" id="stopped-tunnels">0</div>
                                        <div class="stats-label">已停止</div>
                                    </div>
                                </div>
                                <div class="col-md-3 col-sm-6">
                                    <div class="stats-card">
                                        <div class="stats-number text-danger" id="error-tunnels">0</div>
                                        <div class="stats-label">错误</div>
                                    </div>
                                </div>
                            </div>

                            <!-- 操作栏 -->
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <h5 class="mb-0">隧道管理</h5>
                                <button class="btn btn-primary" id="add-tunnel-btn">
                                    <img src="assets/icons/ui/plus.svg" class="icon" alt="新建"> 新建隧道
                                </button>
                            </div>

                            <!-- 批量操作工具栏 -->
                            <div id="batch-toolbar" class="card mb-3" style="display: none;">
                                <div class="card-body py-2">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div class="d-flex align-items-center">
                                            <span class="me-3">已选择 <strong id="selected-count">0</strong> 个隧道</span>
                                            <button class="btn btn-sm btn-outline-secondary me-2" id="select-all-btn">全选</button>
                                            <button class="btn btn-sm btn-outline-secondary" id="deselect-all-btn">取消全选</button>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            <button class="btn btn-sm btn-success" id="batch-start-btn">
                                                <img src="assets/icons/ui/play.svg" class="icon" alt="启动"> 批量启动
                                            </button>
                                            <button class="btn btn-sm btn-danger" id="batch-stop-btn">
                                                <img src="assets/icons/ui/stop.svg" class="icon" alt="停止"> 批量停止
                                            </button>
                                            <button class="btn btn-sm btn-warning" id="batch-restart-btn">
                                                <img src="assets/icons/ui/restart.svg" class="icon" alt="重启"> 批量重启
                                            </button>
                                            <button class="btn btn-sm btn-outline-danger" id="batch-delete-btn">
                                                <img src="assets/icons/ui/delete.svg" class="icon" alt="删除"> 批量删除
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 隧道列表容器 -->
                            <div id="tunnels-container">
                                <div class="loading">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">加载中...</span>
                                    </div>
                                    <p class="mt-2">正在加载隧道列表...</p>
                                </div>
                            </div>
                        </div>

                        <!-- 日志页面 -->
                        <div id="logs-page" class="page">
                            <div class="card">
                                <div class="card-header">
                                    <h5>隧道运行日志</h5>
                                </div>
                                <div class="card-body">
                                    <div class="mb-3">
                                        <div class="btn-group" role="group">
                                            <button class="btn btn-sm btn-outline-primary" id="log-filter-all">全部</button>
                                            <button class="btn btn-sm btn-outline-success" id="log-filter-info">信息</button>
                                            <button class="btn btn-sm btn-outline-warning" id="log-filter-warn">警告</button>
                                            <button class="btn btn-sm btn-outline-danger" id="log-filter-error">错误</button>
                                        </div>
                                        <button class="btn btn-sm btn-outline-secondary ms-2" id="clear-logs-btn">清空日志</button>
                                        <button class="btn btn-sm btn-outline-primary ms-2" id="export-logs-btn">导出日志</button>
                                    </div>
                                    <div id="log-container" style="height: 400px; overflow-y: auto; background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 5px; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px;">
                                        <div class="text-success">[${new Date().toLocaleTimeString()}] INFO: 应用已启动</div>
                                        <div class="text-info">[${new Date().toLocaleTimeString()}] INFO: 加载了 ${this.tunnels.length} 个隧道</div>
                                        <div class="text-muted">[${new Date().toLocaleTimeString()}] DEBUG: 初始化完成</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 服务管理页面 -->
                        <div id="services-page" class="page">
                            <!-- Cloudflare 账号配置 -->
                            <div class="row mb-3">
                                <div class="col-12">
                                    <div class="card">
                                        <div class="card-header d-flex justify-content-between align-items-center">
                                            <h5 class="mb-0">Cloudflare 账号配置</h5>
                                            <span id="cf-connection-status" class="badge bg-secondary">未连接</span>
                                        </div>
                                        <div class="card-body">
                                            <div class="row">
                                                <div class="col-md-6">
                                                    <div class="mb-3">
                                                        <label class="form-label">API Token <span class="text-danger">*</span></label>
                                                        <input type="password" class="form-control" id="cf-api-token" placeholder="输入 Cloudflare API Token">
                                                        <small class="text-muted">推荐使用 API Token，需要 Zone:Zone:Read 和 Account:Cloudflare Tunnel:Edit 权限</small>
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="mb-3">
                                                        <label class="form-label">Account ID（可选）</label>
                                                        <input type="text" class="form-control" id="cf-account-id" placeholder="自动获取">
                                                        <small class="text-muted">留空将自动使用第一个账号</small>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="row">
                                                <div class="col-12">
                                                    <div id="cf-account-info" class="alert alert-info d-none">
                                                        <strong>账号信息：</strong>
                                                        <div id="cf-account-details"></div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="d-flex gap-2">
                                                <button class="btn btn-primary" id="test-cf-connection-btn">测试连接</button>
                                                <button class="btn btn-success" id="save-cf-settings-btn">保存配置</button>
                                                <button class="btn btn-outline-secondary" id="load-cf-settings-btn">加载配置</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <div class="card">
                                        <div class="card-header">
                                            <h5>Cloudflared 客户端</h5>
                                        </div>
                                        <div class="card-body">
                                            <div class="mb-3">
                                                <p><strong>安装状态：</strong> <span class="badge bg-success">已安装</span></p>
                                                <p><strong>版本信息：</strong> <span>2024.10.0</span></p>
                                                <p><strong>可执行路径：</strong> <span class="text-muted small">/usr/local/bin/cloudflared</span></p>
                                            </div>
                                            <div class="d-flex gap-2">
                                                <button class="btn btn-sm btn-primary" id="check-cloudflared-btn">检查安装</button>
                                                <button class="btn btn-sm btn-success" id="download-cloudflared-btn">下载并安装</button>
                                                <button class="btn btn-sm btn-info" id="update-cloudflared-btn">更新客户端</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <div class="card">
                                        <div class="card-header">
                                            <h5>服务状态</h5>
                                        </div>
                                        <div class="card-body service-status-body">
                                            <p><strong>状态:</strong> <span class="badge bg-warning">未运行</span></p>
                                            <p><strong>运行中的隧道:</strong> <span class="text-muted">0 / 0</span></p>
                                            <p class="text-muted mb-0"><small>没有隧道在运行</small></p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-12">
                                    <div class="card">
                                        <div class="card-header">
                                            <h5>实时日志流</h5>
                                        </div>
                                        <div class="card-body">
                                            <div class="mb-3">
                                                <button class="btn btn-sm btn-outline-primary" id="toggle-log-stream-btn">开始日志流</button>
                                                <button class="btn btn-sm btn-outline-danger" id="clear-service-logs-btn">清空日志</button>
                                                <button class="btn btn-sm btn-outline-secondary" id="export-service-logs-btn">导出日志</button>
                                            </div>
                                            <div id="service-log-output" style="height: 300px; overflow-y: auto; background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 5px; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px;">
                                                <div class="text-muted">点击"开始日志流"查看 cloudflared 实时日志...</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 设置页面 -->
                        <div id="settings-page" class="page">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="card mb-4">
                                        <div class="card-header">
                                            <h5>常规设置</h5>
                                        </div>
                                        <div class="card-body">
                                            <div class="mb-3">
                                                <label class="form-label">启动时自动启动隧道</label>
                                                <select class="form-select" id="auto-start-tunnels">
                                                    <option value="no">否</option>
                                                    <option value="yes" selected>是</option>
                                                </select>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">最小化到系统托盘</label>
                                                <select class="form-select" id="minimize-to-tray">
                                                    <option value="no">否</option>
                                                    <option value="yes" selected>是</option>
                                                </select>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">开机自启动</label>
                                                <select class="form-select" id="auto-launch">
                                                    <option value="no" selected>否</option>
                                                    <option value="yes">是</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="card mb-4">
                                        <div class="card-header">
                                            <h5>通知设置</h5>
                                        </div>
                                        <div class="card-body">
                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="notify-status-change" checked>
                                                <label class="form-check-label">隧道状态变化时通知</label>
                                            </div>
                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="notify-error" checked>
                                                <label class="form-check-label">错误时通知</label>
                                            </div>
                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="notify-success">
                                                <label class="form-check-label">连接成功时通知</label>
                                            </div>
                                            <div class="form-check mb-2">
                                                <input class="form-check-input" type="checkbox" id="notify-tray" checked>
                                                <label class="form-check-label">显示系统托盘通知</label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-12">
                                    <div class="card">
                                        <div class="card-header">
                                            <h5>高级设置</h5>
                                        </div>
                                        <div class="card-body">
                                            <div class="row">
                                                <div class="col-md-6">
                                                    <div class="mb-3">
                                                        <label class="form-label">日志级别</label>
                                                        <select class="form-select" id="log-level-setting">
                                                            <option value="error">错误</option>
                                                            <option value="warn">警告</option>
                                                            <option value="info" selected>信息</option>
                                                            <option value="debug">调试</option>
                                                        </select>
                                                    </div>
                                                    <div class="mb-3">
                                                        <label class="form-label">连接超时（秒）</label>
                                                        <input type="number" class="form-control" id="connection-timeout" value="30">
                                                    </div>
                                                </div>
                                                <div class="col-md-6">
                                                    <div class="mb-3">
                                                        <label class="form-label">配置文件路径</label>
                                                        <input type="text" class="form-control" id="config-file-path" value="~/.cloudflared/config.yml" readonly>
                                                    </div>
                                                    <div class="mb-3">
                                                        <button class="btn btn-outline-primary me-2" id="open-config-folder-btn">打开配置文件夹</button>
                                                        <button class="btn btn-outline-secondary" id="reload-config-btn">重载配置</button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="text-end">
                                                <button class="btn btn-primary" id="save-settings-btn">保存设置</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            <!-- 新建隧道模态框 -->
            <div class="modal fade" id="addTunnelModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">新建隧道</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="tunnel-form">
                                <div class="mb-3">
                                    <label for="tunnel-name" class="form-label">隧道名称 *</label>
                                    <input type="text" class="form-control" id="tunnel-name" required>
                                    <div class="form-text">请输入易于识别的隧道名称（小写字母和连字符）</div>
                                </div>
                                <div class="mb-3">
                                    <label for="tunnel-description" class="form-label">描述</label>
                                    <textarea class="form-control" id="tunnel-description" rows="2"></textarea>
                                    <div class="form-text">可选，描述此隧道的用途</div>
                                </div>

                                <!-- Cloudflare API 选项 -->
                                <div class="mb-3">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="use-cloudflare-api" checked>
                                        <label class="form-check-label" for="use-cloudflare-api">
                                            使用 Cloudflare API 创建真实隧道
                                        </label>
                                    </div>
                                    <div class="form-text">推荐：通过 API 创建真实的 Cloudflare 隧道</div>
                                </div>

                                <!-- 路由配置 -->
                                <div class="mb-3">
                                    <label class="form-label">路由配置</label>
                                    <div id="routes-container">
                                        <!-- 路由列表将在这里动态添加 -->
                                    </div>
                                    <button type="button" class="btn btn-sm btn-outline-primary" id="add-route-btn">
                                        <img src="assets/icons/ui/plus.svg" class="icon" alt="添加"> 添加路由
                                    </button>
                                    <div class="form-text">可选：配置域名到本地服务的映射</div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-primary" id="save-tunnel-btn">创建隧道</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 隧道详情模态框 -->
            <div class="modal fade" id="tunnelDetailModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">隧道详情</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="tunnel-detail-content">
                            <!-- 详情内容将在这里动态加载 -->
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 添加路由模态框 -->
            <div class="modal fade" id="addRouteModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">添加路由</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="route-form">
                                <div class="mb-3">
                                    <label class="form-label">域名 *</label>
                                    <div class="row g-2">
                                        <div class="col-md-5">
                                            <input type="text" class="form-control" id="route-subdomain"
                                                   placeholder="子域名（如: app）">
                                            <div class="form-text">留空表示根域名</div>
                                        </div>
                                        <div class="col-md-1 d-flex align-items-center justify-content-center">
                                            <span class="text-muted">.</span>
                                        </div>
                                        <div class="col-md-6">
                                            <select class="form-select" id="route-domain" required>
                                                <option value="">选择域名...</option>
                                            </select>
                                            <div class="form-text" id="domain-loading-text" style="display: none;">
                                                <span class="spinner-border spinner-border-sm me-1"></span>
                                                加载域名中...
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-text mt-2">
                                        <strong>完整域名预览：</strong>
                                        <span id="hostname-preview" class="text-primary">-</span>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label for="route-service" class="form-label">服务地址 *</label>
                                    <input type="text" class="form-control" id="route-service"
                                           placeholder="例如: http://localhost:3000" required>
                                    <div class="form-text">本地服务的完整地址（包含协议）</div>
                                </div>
                                <div class="mb-3">
                                    <label for="route-protocol" class="form-label">协议</label>
                                    <select class="form-select" id="route-protocol">
                                        <option value="http">HTTP</option>
                                        <option value="https">HTTPS</option>
                                        <option value="tcp">TCP</option>
                                        <option value="ssh">SSH</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">取消</button>
                            <button type="button" class="btn btn-primary" id="save-route-btn">保存路由</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Toast 容器 -->
            <div class="toast-container"></div>
        `;
    }

    async loadTunnels() {
        try {
            this.showLoading();
            this.tunnels = await window.electronAPI.loadTunnels();
            this.stats = await window.electronAPI.getTunnelStats();
            this.renderTunnels();
            this.updateStats();
        } catch (error) {
            console.error('加载隧道失败:', error);
            this.showError('加载隧道失败: ' + error.message);
        }
    }

    renderTunnels() {
        const container = document.getElementById('tunnels-container');

        if (this.tunnels.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <img src="assets/icons/ui/tunnel.svg" class="icon" style="width: 64px; height: 64px; opacity: 0.5;" alt="空">
                    <h4>暂无隧道</h4>
                    <p>点击"新建隧道"按钮创建您的第一个隧道</p>
                    <button class="btn btn-primary" onclick="app.showAddTunnelModal()">
                        <img src="assets/icons/ui/plus.svg" class="icon" alt="新建"> 新建隧道
                    </button>
                </div>
            `;
            return;
        }

        const tunnelsHtml = this.tunnels.map(tunnel => this.createTunnelCard(tunnel)).join('');
        container.innerHTML = tunnelsHtml;
    }

    createTunnelCard(tunnel) {
        const statusClass = `status-${tunnel.status}`;
        const statusText = this.getStatusText(tunnel.status);
        const createdAt = new Date(tunnel.createdAt).toLocaleDateString('zh-CN');
        const cardClass = `tunnel-card ${tunnel.status}`;
        const routeCount = tunnel.routes ? tunnel.routes.length : 0;
        const isCloudflareTunnel = tunnel.cloudflareId ? true : false;

        return `
            <div class="card ${cardClass} fade-in" data-tunnel-id="${tunnel.id}">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <input type="checkbox" class="form-check-input tunnel-checkbox"
                                   data-tunnel-id="${tunnel.id}"
                                   style="width: 20px; height: 20px; cursor: pointer;"
                                   onchange="app.onTunnelCheckboxChange()">
                        </div>
                        <div class="col-md-7">
                            <div class="d-flex align-items-center mb-3">
                                <div class="status-indicator me-3">
                                    <div class="status-dot ${tunnel.status}"></div>
                                </div>
                                <div>
                                    <h5 class="card-title mb-1">
                                        ${tunnel.name}
                                        ${isCloudflareTunnel ? '<span class="badge bg-info ms-2" style="font-size: 0.7em;">CF</span>' : ''}
                                    </h5>
                                    <small class="text-muted">ID: ${tunnel.id}</small>
                                </div>
                            </div>
                            <p class="card-text text-muted mb-2">${tunnel.description || '暂无描述'}</p>
                            <div class="d-flex align-items-center text-muted small">
                                <img src="assets/icons/ui/settings.svg" class="icon me-1" style="width: 14px; height: 14px;" alt="日期">
                                <span class="me-3">创建: ${createdAt}</span>
                                ${routeCount > 0 ? `
                                    <img src="assets/icons/ui/tunnel.svg" class="icon me-1" style="width: 14px; height: 14px;" alt="路由">
                                    <span>${routeCount} 个路由</span>
                                ` : ''}
                            </div>
                        </div>
                        <div class="col text-end">
                            <div class="mb-3">
                                <span class="badge ${statusClass} status-badge">${statusText}</span>
                            </div>
                            <div class="btn-group" role="group">
                                ${this.createActionButtons(tunnel)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    createActionButtons(tunnel) {
        const isRunning = tunnel.status === 'running';
        const isStarting = tunnel.status === 'starting';
        const isStopping = tunnel.status === 'stopping';

        return `
            <button class="btn btn-sm ${isRunning ? 'btn-danger' : 'btn-success'}"
                    onclick="app.${isRunning ? 'stopTunnel' : 'startTunnel'}('${tunnel.id}')"
                    ${isStarting || isStopping ? 'disabled' : ''}
                    title="${isRunning ? '停止隧道' : '启动隧道'}">
                <img src="assets/icons/ui/${isRunning ? 'stop' : 'play'}.svg" class="icon" alt="${isRunning ? '停止' : '启动'}">
                ${isStarting ? '启动中...' : isStopping ? '停止中...' : (isRunning ? '停止' : '启动')}
            </button>
            <button class="btn btn-sm btn-warning"
                    onclick="app.restartTunnel('${tunnel.id}')"
                    ${isStarting || isStopping ? 'disabled' : ''}
                    title="重启隧道">
                <img src="assets/icons/ui/restart.svg" class="icon" alt="重启">
            </button>
            <button class="btn btn-sm btn-outline-secondary"
                    onclick="app.showTunnelDetail('${tunnel.id}')"
                    title="查看详情">
                <img src="assets/icons/ui/settings.svg" class="icon" alt="详情">
            </button>
            <button class="btn btn-sm btn-outline-danger"
                    onclick="app.deleteTunnel('${tunnel.id}')"
                    title="删除隧道">
                <img src="assets/icons/ui/delete.svg" class="icon" alt="删除">
            </button>
        `;
    }

    getStatusText(status) {
        const statusMap = {
            'running': '运行中',
            'stopped': '已停止',
            'starting': '启动中',
            'stopping': '停止中',
            'error': '错误'
        };
        return statusMap[status] || '未知';
    }

    updateStats() {
        document.getElementById('total-tunnels').textContent = this.stats.total;
        document.getElementById('running-tunnels').textContent = this.stats.running;
        document.getElementById('stopped-tunnels').textContent = this.stats.stopped;
        document.getElementById('error-tunnels').textContent = this.stats.error;
    }

    updateTunnelInList(updatedTunnel) {
        const index = this.tunnels.findIndex(t => t.id === updatedTunnel.id);
        if (index !== -1) {
            const oldTunnel = this.tunnels[index];
            this.tunnels[index] = updatedTunnel;

            // 检查状态变化并显示通知
            this.checkAndNotify(oldTunnel, updatedTunnel);

            // 重新计算统计数据
            this.stats = {
                total: this.tunnels.length,
                running: this.tunnels.filter(t => t.status === 'running').length,
                stopped: this.tunnels.filter(t => t.status === 'stopped').length,
                error: this.tunnels.filter(t => t.status === 'error').length
            };

            this.renderTunnels();
            this.updateStats();
        }
    }

    checkAndNotify(oldTunnel, newTunnel) {
        // 获取通知设置
        const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');

        console.log('检查通知 - 旧状态:', oldTunnel.status, '新状态:', newTunnel.status);
        console.log('通知设置:', settings);

        // 状态变化检测
        const statusChanged = oldTunnel.status !== newTunnel.status;

        if (!statusChanged) {
            console.log('状态未变化，不显示通知');
            return;
        }

        console.log('状态已变化，检查通知设置...');

        // 隧道状态变化通知
        if (settings.notifyStatusChange !== false) {
            console.log('显示状态变化通知');
            if (newTunnel.status === 'running') {
                this.showSuccess(`隧道 "${newTunnel.name}" 已启动`);
            } else if (newTunnel.status === 'stopped') {
                this.showInfo(`隧道 "${newTunnel.name}" 已停止`);
            }
        }

        // 连接成功通知
        if (settings.notifySuccess && newTunnel.status === 'running') {
            console.log('显示连接成功通知');
            this.showSuccess(`隧道 "${newTunnel.name}" 连接成功！`);
        }

        // 错误通知
        if (settings.notifyError !== false && newTunnel.status === 'error') {
            console.log('显示错误通知');
            this.showError(`隧道 "${newTunnel.name}" 发生错误`);
        }
    }

    switchPage(page) {
        // 更新导航状态
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`).classList.add('active');

        // 切换页面
        document.querySelectorAll('.page').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(`${page}-page`).classList.add('active');

        // 更新页面标题
        const titles = {
            'tunnels': '隧道列表',
            'logs': '日志查看',
            'services': '服务管理',
            'settings': '设置'
        };
        document.getElementById('page-title').textContent = titles[page] || '未知页面';

        this.currentPage = page;

        // 页面切换时的特殊处理
        if (page === 'logs') {
            this.loadLogs('all');
            // 离开服务页面时停止定时刷新
            this.stopServiceStatusPolling();
        } else if (page === 'services') {
            this.checkCloudflared();
            this.loadServiceStatus();
            this.loadCloudflareSettings(); // 自动加载 Cloudflare 配置
            // 进入服务页面时启动定时刷新
            this.startServiceStatusPolling();
        } else {
            // 离开服务页面时停止定时刷新
            this.stopServiceStatusPolling();
        }
    }

    showAddTunnelModal() {
        console.log('showAddTunnelModal 被调用');
        const modalElement = document.getElementById('addTunnelModal');
        console.log('模态框元素:', modalElement);

        if (!modalElement) {
            console.error('找不到模态框元素 #addTunnelModal');
            alert('错误：找不到模态框元素');
            return;
        }

        if (typeof bootstrap === 'undefined') {
            console.error('Bootstrap 未加载');
            alert('错误：Bootstrap 未加载');
            return;
        }

        // 重置表单
        document.getElementById('tunnel-form').reset();
        document.getElementById('use-cloudflare-api').checked = true;

        // 清空路由列表
        this.modalRoutes = [];
        this.renderModalRoutes();

        // 加载域名列表
        this.loadZonesForModal();

        console.log('创建 Bootstrap Modal 实例');
        const modal = new bootstrap.Modal(modalElement);
        console.log('显示模态框');
        modal.show();
    }

    async loadZonesForModal() {
        try {
            const zones = await window.electronAPI.getCloudflareZones();
            this.availableZones = zones || [];
            console.log('已加载域名列表:', this.availableZones);
        } catch (error) {
            console.error('加载域名列表失败:', error);
            this.availableZones = [];
        }
    }

    renderModalRoutes() {
        const container = document.getElementById('routes-container');
        if (!container) return;

        if (!this.modalRoutes || this.modalRoutes.length === 0) {
            container.innerHTML = '<div class="text-muted small">暂无路由配置</div>';
            return;
        }

        // 生成域名选项
        const domainOptions = this.availableZones && this.availableZones.length > 0
            ? this.availableZones.map(zone => `<option value="${zone.name}">${zone.name}</option>`).join('')
            : '<option value="">暂无域名</option>';

        container.innerHTML = this.modalRoutes.map((route, index) => {
            // 解析现有的 hostname 为子域名和域名
            let subdomain = '';
            let domain = '';
            if (route.hostname) {
                const parts = route.hostname.split('.');
                if (parts.length > 2) {
                    subdomain = parts[0];
                    domain = parts.slice(1).join('.');
                } else if (parts.length === 2) {
                    domain = route.hostname;
                }
            }

            return `
            <div class="card mb-2">
                <div class="card-body p-2">
                    <div class="row g-2 align-items-start">
                        <div class="col-md-10">
                            <!-- 域名配置 -->
                            <div class="row g-2 mb-2">
                                <div class="col-md-4">
                                    <input type="text" class="form-control form-control-sm"
                                           placeholder="子域名（如: app）"
                                           value="${subdomain}"
                                           onchange="app.updateModalRouteHostname(${index}, this.value, document.getElementById('modal-route-domain-${index}').value)">
                                    <div class="form-text small">留空表示根域名</div>
                                </div>
                                <div class="col-md-1 d-flex align-items-center justify-content-center pt-1">
                                    <span class="text-muted">.</span>
                                </div>
                                <div class="col-md-7">
                                    <select class="form-select form-select-sm" id="modal-route-domain-${index}"
                                            onchange="app.updateModalRouteHostname(${index}, document.querySelector('[onchange*=\\'modal-route-domain-${index}\\']').previousElementSibling.previousElementSibling.previousElementSibling.value, this.value)">
                                        <option value="">选择域名...</option>
                                        ${domainOptions}
                                    </select>
                                </div>
                            </div>
                            <!-- 服务地址 -->
                            <div class="row g-2">
                                <div class="col-md-8">
                                    <input type="text" class="form-control form-control-sm"
                                           placeholder="服务地址 (如: http://localhost:3000)"
                                           value="${route.service || ''}"
                                           onchange="app.updateModalRoute(${index}, 'service', this.value)">
                                </div>
                                <div class="col-md-4">
                                    <select class="form-select form-select-sm"
                                            onchange="app.updateModalRoute(${index}, 'protocol', this.value)">
                                        <option value="http" ${route.protocol === 'http' ? 'selected' : ''}>HTTP</option>
                                        <option value="https" ${route.protocol === 'https' ? 'selected' : ''}>HTTPS</option>
                                        <option value="tcp" ${route.protocol === 'tcp' ? 'selected' : ''}>TCP</option>
                                        <option value="ssh" ${route.protocol === 'ssh' ? 'selected' : ''}>SSH</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-2 d-flex align-items-center">
                            <button type="button" class="btn btn-sm btn-outline-danger w-100"
                                    onclick="app.removeModalRoute(${index})">
                                <img src="assets/icons/ui/delete.svg" class="icon" alt="删除">
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        }).join('');

        // 设置域名下拉框的值
        this.modalRoutes.forEach((route, index) => {
            if (route.hostname) {
                const parts = route.hostname.split('.');
                let domain = '';
                if (parts.length > 2) {
                    domain = parts.slice(1).join('.');
                } else if (parts.length === 2) {
                    domain = route.hostname;
                }
                const select = document.getElementById(`modal-route-domain-${index}`);
                if (select && domain) {
                    select.value = domain;
                }
            }
        });
    }

    updateModalRoute(index, field, value) {
        if (!this.modalRoutes) this.modalRoutes = [];
        if (!this.modalRoutes[index]) this.modalRoutes[index] = {};
        this.modalRoutes[index][field] = value;
    }

    updateModalRouteHostname(index, subdomain, domain) {
        if (!this.modalRoutes) this.modalRoutes = [];
        if (!this.modalRoutes[index]) this.modalRoutes[index] = {};

        // 构建完整的 hostname
        let hostname = '';
        if (subdomain && domain) {
            hostname = `${subdomain}.${domain}`;
        } else if (domain) {
            hostname = domain;
        }

        this.modalRoutes[index].hostname = hostname;
    }

    removeModalRoute(index) {
        if (!this.modalRoutes) return;
        this.modalRoutes.splice(index, 1);
        this.renderModalRoutes();
    }

    addModalRoute() {
        if (!this.modalRoutes) this.modalRoutes = [];
        this.modalRoutes.push({
            hostname: '',
            service: 'http://localhost:3000',
            protocol: 'http'
        });
        this.renderModalRoutes();
    }

    async showTunnelDetail(tunnelId) {
        console.log('showTunnelDetail 被调用，tunnelId:', tunnelId);

        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) {
            console.error('隧道不存在:', tunnelId);
            this.showError('隧道不存在');
            return;
        }

        console.log('找到隧道:', tunnel);
        this.currentDetailTunnel = tunnel;

        // 清除所有残留的 modal-backdrop
        const backdrops = document.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => backdrop.remove());

        // 移除 body 上的 modal-open 类和样式
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';

        // 渲染详情内容
        const content = document.getElementById('tunnel-detail-content');
        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="mb-3">基本信息</h6>
                    <table class="table table-sm">
                        <tbody>
                            <tr>
                                <td class="text-muted" style="width: 120px;">隧道名称</td>
                                <td>${tunnel.name}</td>
                            </tr>
                            <tr>
                                <td class="text-muted">描述</td>
                                <td>${tunnel.description || '暂无描述'}</td>
                            </tr>
                            <tr>
                                <td class="text-muted">状态</td>
                                <td><span class="badge status-${tunnel.status}">${this.getStatusText(tunnel.status)}</span></td>
                            </tr>
                            <tr>
                                <td class="text-muted">创建时间</td>
                                <td>${new Date(tunnel.createdAt).toLocaleString('zh-CN')}</td>
                            </tr>
                            ${tunnel.cloudflareId ? `
                            <tr>
                                <td class="text-muted">Cloudflare ID</td>
                                <td><code>${tunnel.cloudflareId}</code></td>
                            </tr>
                            <tr>
                                <td class="text-muted">账号 ID</td>
                                <td><code>${tunnel.accountId || 'N/A'}</code></td>
                            </tr>
                            ` : ''}
                            <tr>
                                <td class="text-muted">配置文件</td>
                                <td><code>${tunnel.configPath || 'N/A'}</code></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6 class="mb-3">操作</h6>
                    <div class="d-grid gap-2">
                        <button class="btn btn-${tunnel.status === 'running' ? 'danger' : 'success'}"
                                onclick="app.${tunnel.status === 'running' ? 'stopTunnel' : 'startTunnel'}('${tunnel.id}')">
                            <img src="assets/icons/ui/${tunnel.status === 'running' ? 'stop' : 'play'}.svg" class="icon" alt="">
                            ${tunnel.status === 'running' ? '停止隧道' : '启动隧道'}
                        </button>
                        ${tunnel.cloudflareId ? `
                        <button class="btn btn-outline-primary" onclick="app.generateTunnelConfig('${tunnel.id}')">
                            <img src="assets/icons/ui/settings.svg" class="icon" alt="">
                            生成配置文件
                        </button>
                        <button class="btn btn-outline-info" onclick="app.viewTunnelConfig('${tunnel.id}')">
                            <img src="assets/icons/ui/logs.svg" class="icon" alt="">
                            查看配置文件
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>

            <hr class="my-4">

            <div class="row">
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6 class="mb-0">路由配置</h6>
                        ${tunnel.cloudflareId ? `
                        <button class="btn btn-sm btn-primary" onclick="app.showAddRouteDialog('${tunnel.id}')">
                            <img src="assets/icons/ui/plus.svg" class="icon" alt="">
                            添加路由
                        </button>
                        ` : ''}
                    </div>
                    <div id="tunnel-routes-list">
                        ${this.renderTunnelRoutes(tunnel)}
                    </div>
                </div>
            </div>
        `;

        // 显示模态框
        console.log('准备显示模态框');
        const modalElement = document.getElementById('tunnelDetailModal');
        console.log('模态框元素:', modalElement);

        if (!modalElement) {
            console.error('找不到模态框元素 #tunnelDetailModal');
            this.showError('无法打开详情页面');
            return;
        }

        try {
            const modal = new bootstrap.Modal(modalElement);
            console.log('Bootstrap Modal 实例创建成功');
            modal.show();
            console.log('模态框显示命令已执行');
        } catch (error) {
            console.error('显示模态框时出错:', error);
            this.showError('打开详情页面失败: ' + error.message);
        }
    }

    renderTunnelRoutes(tunnel) {
        if (!tunnel.routes || tunnel.routes.length === 0) {
            return '<div class="alert alert-info">暂无路由配置</div>';
        }

        return `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>域名</th>
                            <th>服务地址</th>
                            <th>协议</th>
                            <th style="width: 100px;">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tunnel.routes.map(route => `
                            <tr>
                                <td><code>${route.hostname}</code></td>
                                <td><code>${route.service}</code></td>
                                <td><span class="badge bg-secondary">${route.protocol || 'http'}</span></td>
                                <td>
                                    <button class="btn btn-sm btn-outline-danger"
                                            onclick="app.deleteRoute('${tunnel.id}', '${route.id}')"
                                            title="删除路由">
                                        <img src="assets/icons/ui/delete.svg" class="icon" alt="删除">
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async saveTunnel() {
        const name = document.getElementById('tunnel-name').value.trim();
        const description = document.getElementById('tunnel-description').value.trim();
        const useCloudflareAPI = document.getElementById('use-cloudflare-api').checked;

        if (!name) {
            this.showError('请输入隧道名称');
            return;
        }

        // 验证隧道名称格式
        if (!/^[a-z0-9-]+$/.test(name)) {
            this.showError('隧道名称只能包含小写字母、数字和连字符');
            return;
        }

        try {
            // 准备隧道数据
            const tunnelData = {
                name,
                description,
                useCloudflareAPI,
                routes: this.modalRoutes || []
            };

            console.log('创建隧道:', tunnelData);

            const newTunnel = await window.electronAPI.createTunnel(tunnelData);
            if (newTunnel) {
                this.showSuccess(`隧道创建成功！${useCloudflareAPI ? ' Cloudflare 隧道 ID: ' + newTunnel.cloudflareId : ''}`);
                bootstrap.Modal.getInstance(document.getElementById('addTunnelModal')).hide();
                document.getElementById('tunnel-form').reset();
                this.modalRoutes = [];
                await this.loadTunnels();
            } else {
                this.showError('创建隧道失败');
            }
        } catch (error) {
            console.error('创建隧道异常:', error);
            this.showError('创建隧道异常: ' + error.message);
        }
    }

    async startTunnel(tunnelId) {
        try {
            const success = await window.electronAPI.startTunnel(tunnelId);
            if (success) {
                this.showSuccess('隧道启动命令已发送');
            } else {
                this.showError('启动隧道失败');
            }
        } catch (error) {
            this.showError('启动隧道异常: ' + error.message);
        }
    }

    async stopTunnel(tunnelId) {
        try {
            const success = await window.electronAPI.stopTunnel(tunnelId);
            if (success) {
                this.showSuccess('隧道停止命令已发送');
            } else {
                this.showError('停止隧道失败');
            }
        } catch (error) {
            this.showError('停止隧道异常: ' + error.message);
        }
    }

    async restartTunnel(tunnelId) {
        try {
            const success = await window.electronAPI.restartTunnel(tunnelId);
            if (success) {
                this.showSuccess('隧道重启命令已发送');
            } else {
                this.showError('重启隧道失败');
            }
        } catch (error) {
            this.showError('重启隧道异常: ' + error.message);
        }
    }

    async deleteTunnel(tunnelId) {
        const tunnel = this.tunnels.find(t => t.id === tunnelId);
        if (!tunnel) return;

        const result = await window.electronAPI.showMessage({
            type: 'question',
            buttons: ['取消', '删除'],
            defaultId: 0,
            title: '确认删除',
            message: `确定要删除隧道 "${tunnel.name}" 吗？`,
            detail: '此操作无法撤销。'
        });

        if (result.response === 1) {
            try {
                const success = await window.electronAPI.deleteTunnel(tunnelId);
                if (success) {
                    this.showSuccess('隧道删除成功');
                    await this.loadTunnels();
                } else {
                    this.showError('删除隧道失败');
                }
            } catch (error) {
                this.showError('删除隧道异常: ' + error.message);
            }
        }
    }

    viewLogs(tunnelId) {
        // 切换到日志页面
        this.switchPage('logs');
        // 可以在这里添加过滤特定隧道的日志
        this.showInfo(`查看隧道 ${tunnelId} 的日志`);
    }

    async showAddRouteDialog(tunnelId) {
        // 保存当前隧道 ID
        this.currentEditingTunnelId = tunnelId;

        // 重置表单
        document.getElementById('route-form').reset();
        document.getElementById('hostname-preview').textContent = '-';

        // 加载域名列表
        await this.loadDomainsForRoute();

        // 显示模态框
        const modal = new bootstrap.Modal(document.getElementById('addRouteModal'));
        modal.show();

        // 绑定输入事件以更新预览
        const subdomainInput = document.getElementById('route-subdomain');
        const domainSelect = document.getElementById('route-domain');

        const updatePreview = () => {
            const subdomain = subdomainInput.value.trim();
            const domain = domainSelect.value;

            if (domain) {
                const hostname = subdomain ? `${subdomain}.${domain}` : domain;
                document.getElementById('hostname-preview').textContent = hostname;
            } else {
                document.getElementById('hostname-preview').textContent = '-';
            }
        };

        // 移除旧的事件监听器
        const newSubdomainInput = subdomainInput.cloneNode(true);
        subdomainInput.parentNode.replaceChild(newSubdomainInput, subdomainInput);

        const newDomainSelect = domainSelect.cloneNode(true);
        domainSelect.parentNode.replaceChild(newDomainSelect, domainSelect);

        // 添加新的事件监听器
        newSubdomainInput.addEventListener('input', updatePreview);
        newDomainSelect.addEventListener('change', updatePreview);

        // 绑定保存按钮事件
        const saveBtn = document.getElementById('save-route-btn');
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

        newSaveBtn.addEventListener('click', async () => {
            await this.saveRoute(tunnelId, modal);
        });
    }

    async loadDomainsForRoute() {
        const domainSelect = document.getElementById('route-domain');
        const loadingText = document.getElementById('domain-loading-text');

        try {
            // 显示加载状态
            loadingText.style.display = 'block';
            domainSelect.disabled = true;

            // 获取域名列表
            const zones = await window.electronAPI.getCloudflareZones();

            // 清空现有选项
            domainSelect.innerHTML = '<option value="">选择域名...</option>';

            // 添加域名选项
            if (zones && zones.length > 0) {
                zones.forEach(zone => {
                    const option = document.createElement('option');
                    option.value = zone.name;
                    option.textContent = zone.name;
                    domainSelect.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '没有可用的域名';
                option.disabled = true;
                domainSelect.appendChild(option);
            }
        } catch (error) {
            console.error('加载域名失败:', error);
            this.showError('加载域名列表失败: ' + error.message);

            // 添加错误提示选项
            domainSelect.innerHTML = '<option value="">加载失败，请手动输入</option>';
        } finally {
            // 隐藏加载状态
            loadingText.style.display = 'none';
            domainSelect.disabled = false;
        }
    }

    async saveRoute(tunnelId, modal) {
        const subdomain = document.getElementById('route-subdomain').value.trim();
        const domain = document.getElementById('route-domain').value;
        const service = document.getElementById('route-service').value.trim();
        const protocol = document.getElementById('route-protocol').value;

        // 构建完整域名
        let hostname;
        if (!domain) {
            this.showError('请选择域名');
            return;
        }

        hostname = subdomain ? `${subdomain}.${domain}` : domain;

        if (!service) {
            this.showError('请填写服务地址');
            return;
        }

        try {
            await window.electronAPI.addRoute(tunnelId, {
                hostname,
                service,
                protocol
            });

            this.showSuccess('路由添加成功');

            // 关闭模态框并等待完全关闭
            const modalElement = document.getElementById('addRouteModal');
            modal.hide();

            // 等待模态框完全关闭（包括 backdrop 移除）
            modalElement.addEventListener('hidden.bs.modal', async () => {
                // 重新加载隧道数据
                await this.loadTunnels();

                // 刷新详情页面
                this.showTunnelDetail(tunnelId);
            }, { once: true }); // 只执行一次
        } catch (error) {
            this.showError('添加路由失败: ' + error.message);
        }
    }

    async deleteRoute(tunnelId, routeId) {
        const result = await window.electronAPI.showMessage({
            type: 'question',
            buttons: ['取消', '删除'],
            defaultId: 0,
            title: '确认删除',
            message: '确定要删除此路由吗？',
            detail: '此操作无法撤销。'
        });

        if (result.response !== 1) {
            return;
        }

        try {
            await window.electronAPI.deleteRoute(tunnelId, routeId);
            this.showSuccess('路由已删除');

            // 重新加载隧道数据
            await this.loadTunnels();

            // 刷新详情页面
            this.showTunnelDetail(tunnelId);
        } catch (error) {
            this.showError('删除路由失败: ' + error.message);
        }
    }

    async generateTunnelConfig(tunnelId) {
        try {
            const configPath = await window.electronAPI.generateConfig(tunnelId);
            this.showSuccess(`配置文件已生成: ${configPath}`);
        } catch (error) {
            this.showError('生成配置文件失败: ' + error.message);
        }
    }

    async viewTunnelConfig(tunnelId) {
        try {
            const content = await window.electronAPI.getConfigContent(tunnelId);

            // 创建一个新的模态框显示配置内容
            const configModal = document.createElement('div');
            configModal.className = 'modal fade';
            configModal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">配置文件内容</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <pre class="bg-dark text-light p-3 rounded"><code>${content}</code></pre>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                            <button type="button" class="btn btn-primary" onclick="navigator.clipboard.writeText(\`${content.replace(/`/g, '\\`')}\`)">
                                复制到剪贴板
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(configModal);
            const modal = new bootstrap.Modal(configModal);
            modal.show();

            // 模态框关闭后移除元素
            configModal.addEventListener('hidden.bs.modal', () => {
                configModal.remove();
            });
        } catch (error) {
            this.showError('查看配置文件失败: ' + error.message);
        }
    }

    // 日志管理方法
    async loadLogs(filter = 'all') {
        try {
            const logs = await window.electronAPI.getLogs(filter);
            this.displayLogs(logs);
        } catch (error) {
            console.error('加载日志失败:', error);
            this.showError('加载日志失败: ' + error.message);
        }
    }

    displayLogs(logs) {
        const container = document.getElementById('log-container');
        if (!container) return;

        container.innerHTML = '';

        if (logs.length === 0) {
            container.innerHTML = '<div class="text-muted">暂无日志</div>';
            return;
        }

        logs.forEach(log => {
            const logElement = this.createLogElement(log);
            container.appendChild(logElement);
        });

        // 滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    createLogElement(log) {
        const div = document.createElement('div');
        const time = new Date(log.timestamp).toLocaleTimeString();

        let colorClass = 'text-muted';
        if (log.level === 'info') colorClass = 'text-info';
        if (log.level === 'warn') colorClass = 'text-warning';
        if (log.level === 'error') colorClass = 'text-danger';

        div.className = colorClass;
        div.textContent = `[${time}] ${log.level.toUpperCase()}: ${log.message}`;

        return div;
    }

    appendLog(logEntry) {
        const container = document.getElementById('log-container');
        if (!container) return;

        // 如果显示"暂无日志"，先清空
        if (container.querySelector('.text-muted') && container.children.length === 1) {
            container.innerHTML = '';
        }

        const logElement = this.createLogElement(logEntry);
        container.appendChild(logElement);

        // 限制显示的日志数量
        while (container.children.length > 1000) {
            container.removeChild(container.firstChild);
        }

        // 滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    async clearLogs() {
        try {
            const success = await window.electronAPI.clearLogs();
            if (success) {
                const container = document.getElementById('log-container');
                if (container) {
                    container.innerHTML = '<div class="text-muted">日志已清空</div>';
                }
                this.showSuccess('日志已清空');
            }
        } catch (error) {
            this.showError('清空日志失败: ' + error.message);
        }
    }

    async exportLogs() {
        try {
            const result = await window.electronAPI.exportLogs();
            if (result.success) {
                this.showSuccess(`日志已导出到: ${result.path}`);
            } else {
                this.showError('导出日志失败');
            }
        } catch (error) {
            this.showError('导出日志失败: ' + error.message);
        }
    }

    filterLogs(level) {
        this.loadLogs(level);

        // 更新按钮状态
        document.querySelectorAll('#logs-page .btn-group button').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeBtn = document.getElementById(`log-filter-${level}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    }

    // 服务管理方法
    async checkCloudflared() {
        try {
            const result = await window.electronAPI.checkCloudflared();

            // 使用更精确的选择器
            const clientCard = document.querySelector('#services-page .row .col-md-6:nth-child(1) .card');
            if (!clientCard) {
                console.error('找不到客户端卡片');
                return;
            }

            const statusBadge = clientCard.querySelector('.card-body p:nth-child(1) span');
            const versionSpan = clientCard.querySelector('.card-body p:nth-child(2) span');
            const pathSpan = clientCard.querySelector('.card-body p:nth-child(3) span');

            if (result.installed) {
                statusBadge.className = 'badge bg-success';
                statusBadge.textContent = '已安装';
                versionSpan.textContent = result.version;
                pathSpan.textContent = result.path;
                this.showSuccess('cloudflared 已安装');
            } else {
                statusBadge.className = 'badge bg-danger';
                statusBadge.textContent = '未安装';
                versionSpan.textContent = '-';
                pathSpan.textContent = '-';
                this.showWarning('cloudflared 未安装');
            }
        } catch (error) {
            this.showError('检查 cloudflared 失败: ' + error.message);
        }
    }

    async downloadCloudflared() {
        try {
            // 显示确认对话框
            const confirmed = confirm('即将下载并安装 cloudflared 客户端。\n\n注意：\n- Windows 需要管理员权限\n- macOS/Linux 需要 sudo 权限\n\n是否继续？');

            if (!confirmed) {
                return;
            }

            this.showInfo('开始下载 cloudflared...');

            const result = await window.electronAPI.downloadCloudflared();

            if (result.success) {
                this.showSuccess(`cloudflared 安装成功！\n路径: ${result.path}`);
                // 重新检查安装状态
                await this.checkCloudflared();
            } else {
                this.showError('下载/安装失败: ' + result.error);
            }
        } catch (error) {
            this.showError('下载/安装异常: ' + error.message);
        }
    }

    async updateCloudflared() {
        try {
            // 显示确认对话框
            const confirmed = confirm('即将更新 cloudflared 客户端到最新版本。\n\n注意：\n- Windows 需要管理员权限\n- macOS/Linux 需要 sudo 权限\n\n是否继续？');

            if (!confirmed) {
                return;
            }

            this.showInfo('开始更新 cloudflared...');

            const result = await window.electronAPI.updateCloudflared();

            if (result.success) {
                this.showSuccess('cloudflared 更新成功！');
                // 重新检查安装状态
                await this.checkCloudflared();
            } else {
                this.showError('更新失败: ' + result.error);
            }
        } catch (error) {
            this.showError('更新异常: ' + error.message);
        }
    }

    async loadServiceStatus() {
        try {
            const status = await window.electronAPI.getServiceStatus();
            this.updateServiceStatus(status);
        } catch (error) {
            console.error('加载服务状态失败:', error);
        }
    }

    updateServiceStatus(status) {
        // 使用更精确的选择器
        const serviceCard = document.querySelector('#services-page .row .col-md-6:nth-child(2) .card');
        if (!serviceCard) {
            console.error('找不到服务状态卡片');
            return;
        }

        const cardBody = serviceCard.querySelector('.card-body');
        console.log('更新服务状态:', status);

        if (status.running) {
            // 运行中状态
            let html = `
                <p><strong>状态:</strong> <span class="badge bg-success">运行中</span></p>
                <p><strong>运行中的隧道:</strong> <span class="text-primary">${status.tunnelCount} / ${status.totalTunnels}</span></p>
            `;

            // 显示所有运行中隧道的详细信息
            if (status.runningTunnels && status.runningTunnels.length > 0) {
                html += '<p><strong>隧道详情:</strong></p>';
                html += '<div class="tunnel-list-scrollable">';
                html += '<ul class="list-unstyled ms-3 mb-0">';
                status.runningTunnels.forEach(tunnel => {
                    html += `
                        <li class="mb-1">
                            <span class="badge bg-info">${tunnel.name}</span>
                            <small class="text-muted ms-2">PID: ${tunnel.pid || 'N/A'}</small>
                        </li>
                    `;
                });
                html += '</ul>';
                html += '</div>';
            }

            cardBody.innerHTML = html;
        } else {
            // 未运行状态
            cardBody.innerHTML = `
                <p><strong>状态:</strong> <span class="badge bg-warning">未运行</span></p>
                <p><strong>运行中的隧道:</strong> <span class="text-muted">0 / ${status.totalTunnels || 0}</span></p>
                <p class="text-muted mb-0"><small>没有隧道在运行</small></p>
            `;
        }
    }

    async startService() {
        try {
            const result = await window.electronAPI.startCloudflaredService();
            if (result.success) {
                this.showSuccess('服务启动成功');
                // 等待一下让服务完全启动
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.loadServiceStatus();
                // 启动定时刷新
                this.startServiceStatusPolling();
            } else {
                this.showError('服务启动失败: ' + result.message);
            }
        } catch (error) {
            this.showError('服务启动异常: ' + error.message);
        }
    }

    async stopService() {
        try {
            const result = await window.electronAPI.stopCloudflaredService();
            if (result.success) {
                this.showSuccess('服务停止成功');
                await this.loadServiceStatus();
                // 停止定时刷新
                this.stopServiceStatusPolling();
            } else {
                this.showError('服务停止失败: ' + result.message);
            }
        } catch (error) {
            this.showError('服务停止异常: ' + error.message);
        }
    }

    async restartService() {
        try {
            const result = await window.electronAPI.restartCloudflaredService();
            if (result.success) {
                this.showSuccess('服务重启成功');
                await this.loadServiceStatus();
            } else {
                this.showError('服务重启失败: ' + result.message);
            }
        } catch (error) {
            this.showError('服务重启异常: ' + error.message);
        }
    }

    isLogStreamActive() {
        return this.logStreamActive;
    }

    toggleLogStream() {
        const btn = document.getElementById('toggle-log-stream-btn');
        if (btn.textContent === '开始日志流') {
            this.logStreamActive = true;
            btn.textContent = '停止日志流';
            btn.classList.remove('btn-outline-primary');
            btn.classList.add('btn-outline-danger');

            // 清空提示文字
            const container = document.getElementById('service-log-output');
            if (container && container.querySelector('.text-muted')) {
                container.innerHTML = '';
            }

            this.showInfo('日志流已开启（实时显示所有隧道日志）');
        } else {
            this.logStreamActive = false;
            btn.textContent = '开始日志流';
            btn.classList.remove('btn-outline-danger');
            btn.classList.add('btn-outline-primary');
            this.showInfo('日志流已停止');
        }
    }

    appendServiceLog(logEntry) {
        const container = document.getElementById('service-log-output');
        if (!container) return;

        // 如果显示提示文字，先清空
        if (container.querySelector('.text-muted') && container.children.length === 1) {
            container.innerHTML = '';
        }

        const div = document.createElement('div');
        const time = new Date(logEntry.timestamp).toLocaleTimeString();

        // 使用内联样式设置颜色，确保在黑色背景上可见
        let color = '#d4d4d4'; // 默认浅灰色
        if (logEntry.level === 'info') color = '#5bc0de'; // 蓝色
        if (logEntry.level === 'warn') color = '#f0ad4e'; // 橙色
        if (logEntry.level === 'error') color = '#d9534f'; // 红色

        div.style.color = color;
        div.style.marginBottom = '2px';
        div.textContent = `[${time}] ${logEntry.message}`;

        container.appendChild(div);

        // 限制显示的日志数量
        while (container.children.length > 500) {
            container.removeChild(container.firstChild);
        }

        // 滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    clearServiceLogs() {
        const container = document.getElementById('service-log-output');
        if (container) {
            container.innerHTML = '<div class="text-muted">日志已清空</div>';
            this.showSuccess('服务日志已清空');
        }
    }

    exportServiceLogs() {
        this.showInfo('服务日志导出功能开发中...');
    }

    // 设置管理方法
    async loadSettings() {
        try {
            // 从主进程加载设置
            const settings = await window.electronAPI.loadAppSettings();

            // 应用设置到界面
            if (settings.autoStartTunnels !== undefined) {
                document.getElementById('auto-start-tunnels').value = settings.autoStartTunnels ? 'yes' : 'no';
            }
            if (settings.minimizeToTray !== undefined) {
                document.getElementById('minimize-to-tray').value = settings.minimizeToTray ? 'yes' : 'no';
            }
            if (settings.autoLaunch !== undefined) {
                document.getElementById('auto-launch').value = settings.autoLaunch ? 'yes' : 'no';
            }
            if (settings.notifications) {
                if (settings.notifications.statusChange !== undefined) {
                    document.getElementById('notify-status-change').checked = settings.notifications.statusChange;
                }
                if (settings.notifications.errors !== undefined) {
                    document.getElementById('notify-error').checked = settings.notifications.errors;
                }
                if (settings.notifications.success !== undefined) {
                    document.getElementById('notify-success').checked = settings.notifications.success;
                }
            }
            // 兼容旧版本设置
            if (settings.notifyStatusChange !== undefined) {
                document.getElementById('notify-status-change').checked = settings.notifyStatusChange;
            }
            if (settings.notifyError !== undefined) {
                document.getElementById('notify-error').checked = settings.notifyError;
            }
            if (settings.notifySuccess !== undefined) {
                document.getElementById('notify-success').checked = settings.notifySuccess;
            }
            if (settings.notifyTray !== undefined) {
                document.getElementById('notify-tray').checked = settings.notifyTray;
            }
            if (settings.logLevel) {
                document.getElementById('log-level-setting').value = settings.logLevel;
            }
            if (settings.connectionTimeout !== undefined) {
                document.getElementById('connection-timeout').value = settings.connectionTimeout;
            }

            console.log('设置已加载:', settings);
        } catch (error) {
            console.error('加载设置失败:', error);
        }
    }

    async saveSettings() {
        try {
            // 收集设置
            const settings = {
                autoStartTunnels: document.getElementById('auto-start-tunnels').value === 'yes',
                minimizeToTray: document.getElementById('minimize-to-tray').value === 'yes',
                autoLaunch: document.getElementById('auto-launch').value === 'yes',
                notifications: {
                    statusChange: document.getElementById('notify-status-change').checked,
                    errors: document.getElementById('notify-error').checked,
                    success: document.getElementById('notify-success').checked
                },
                notifyTray: document.getElementById('notify-tray').checked,
                logLevel: document.getElementById('log-level-setting').value,
                connectionTimeout: parseInt(document.getElementById('connection-timeout').value)
            };

            // 保存到主进程
            const result = await window.electronAPI.saveAppSettings(settings);

            if (result.success) {
                this.showSuccess('设置已保存');
                console.log('设置已保存:', settings);
            } else {
                this.showError('保存设置失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            this.showError('保存设置失败: ' + error.message);
            console.error('保存设置失败:', error);
        }
    }

    async reloadConfig() {
        try {
            await this.loadSettings();
            await this.loadTunnels();
            this.showSuccess('配置已重载');
        } catch (error) {
            this.showError('重载配置失败: ' + error.message);
            console.error('重载配置失败:', error);
        }
    }

    // 启动服务状态定时刷新
    startServiceStatusPolling() {
        // 先清除已有的定时器
        this.stopServiceStatusPolling();

        // 每2秒刷新一次服务状态
        this.serviceStatusTimer = setInterval(async () => {
            await this.loadServiceStatus();
        }, 2000);
    }

    // 停止服务状态定时刷新
    stopServiceStatusPolling() {
        if (this.serviceStatusTimer) {
            clearInterval(this.serviceStatusTimer);
            this.serviceStatusTimer = null;
        }
    }

    async openConfigFolder() {
        try {
            const success = await window.electronAPI.openConfigFolder();
            if (!success) {
                this.showError('打开配置文件夹失败');
            }
        } catch (error) {
            this.showError('打开配置文件夹异常: ' + error.message);
        }
    }

    showLoading() {
        document.getElementById('tunnels-container').innerHTML = `
            <div class="loading">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <p class="mt-2">正在加载隧道列表...</p>
            </div>
        `;
    }

    showToast(message, type = 'info') {
        console.log('显示 Toast 通知:', message, '类型:', type);

        const toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            console.error('找不到 toast-container 元素！');
            return;
        }

        // 直接创建 toast 元素
        const toastElement = document.createElement('div');
        toastElement.className = `toast align-items-center text-white bg-${type} border-0 show`;
        toastElement.setAttribute('role', 'alert');
        toastElement.setAttribute('aria-live', 'assertive');
        toastElement.setAttribute('aria-atomic', 'true');
        toastElement.style.display = 'block';
        toastElement.style.opacity = '1';

        toastElement.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        // 添加到容器
        toastContainer.appendChild(toastElement);
        console.log('Toast 元素已添加到容器');

        // 打印样式信息
        const styles = window.getComputedStyle(toastElement);
        console.log('Toast 样式:', {
            display: styles.display,
            visibility: styles.visibility,
            opacity: styles.opacity,
            position: styles.position,
            zIndex: styles.zIndex
        });

        // 创建 Bootstrap Toast 实例并显示
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: 5000
        });

        console.log('Bootstrap Toast 实例已创建');
        toast.show();
        console.log('Toast 已显示');

        // 监听隐藏事件，隐藏后移除元素
        toastElement.addEventListener('hidden.bs.toast', () => {
            console.log('Toast 已隐藏，移除元素');
            toastElement.remove();
        });
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'danger');
    }

    showInfo(message) {
        this.showToast(message, 'info');
    }

    showWarning(message) {
        this.showToast(message, 'warning');
    }

    adjustLayout() {
        // 响应式布局调整
        if (window.innerWidth < 768) {
            document.body.classList.add('mobile-layout');
        } else {
            document.body.classList.remove('mobile-layout');
        }
    }

    // ==================== Cloudflare 账号配置 ====================

    async testCloudflareConnection() {
        try {
            const apiToken = document.getElementById('cf-api-token').value.trim();

            if (!apiToken) {
                this.showError('请输入 API Token');
                return;
            }

            console.log('开始测试 Cloudflare 连接...');
            console.log('API Token 长度:', apiToken.length);

            this.showInfo('正在测试连接...');

            const credentials = {
                apiToken: apiToken
            };

            const result = await window.electronAPI.testCloudflareConnection(credentials);

            console.log('连接测试结果:', result);

            if (result.success) {
                this.showSuccess('连接成功！');

                // 更新连接状态
                const statusBadge = document.getElementById('cf-connection-status');
                statusBadge.textContent = '已连接';
                statusBadge.className = 'badge bg-success';

                // 显示账号信息
                const accountInfo = document.getElementById('cf-account-info');
                const accountDetails = document.getElementById('cf-account-details');
                accountInfo.classList.remove('d-none');

                let detailsHtml = '';
                if (result.account) {
                    detailsHtml += `<div><strong>邮箱：</strong>${result.account.email || '未知'}</div>`;
                    detailsHtml += `<div><strong>用户名：</strong>${result.account.username || result.account.first_name || '未知'}</div>`;
                    detailsHtml += `<div><strong>用户 ID：</strong>${result.account.id || '未知'}</div>`;
                }
                if (result.tokenInfo) {
                    detailsHtml += `<div class="mt-2"><strong>Token 状态：</strong>${result.tokenInfo.status || '有效'}</div>`;
                    if (result.tokenInfo.expires_on) {
                        detailsHtml += `<div><strong>过期时间：</strong>${result.tokenInfo.expires_on}</div>`;
                    }
                }

                accountDetails.innerHTML = detailsHtml;
            } else {
                console.error('连接失败:', result.error);
                console.error('详细信息:', result.details);

                let errorMsg = '连接失败: ' + result.error;
                if (result.details) {
                    errorMsg += '\n详细信息: ' + JSON.stringify(result.details, null, 2);
                }

                this.showError(errorMsg);

                // 更新连接状态
                const statusBadge = document.getElementById('cf-connection-status');
                statusBadge.textContent = '连接失败';
                statusBadge.className = 'badge bg-danger';

                // 显示错误详情
                const accountInfo = document.getElementById('cf-account-info');
                const accountDetails = document.getElementById('cf-account-details');
                accountInfo.classList.remove('d-none');
                accountInfo.className = 'alert alert-danger';
                accountDetails.innerHTML = `
                    <div><strong>错误：</strong>${result.error}</div>
                    ${result.details ? `<div class="mt-2"><pre>${JSON.stringify(result.details, null, 2)}</pre></div>` : ''}
                `;
            }
        } catch (error) {
            console.error('测试连接异常:', error);
            this.showError('测试连接异常: ' + error.message);
        }
    }

    async saveCloudflareSettings() {
        try {
            const apiToken = document.getElementById('cf-api-token').value.trim();
            const accountId = document.getElementById('cf-account-id').value.trim();

            if (!apiToken) {
                this.showError('请输入 API Token');
                return;
            }

            const settings = {
                apiToken: apiToken,
                accountId: accountId || null
            };

            const success = await window.electronAPI.saveCloudflareSettings(settings);

            if (success) {
                this.showSuccess('配置已保存');

                // 更新连接状态
                const statusBadge = document.getElementById('cf-connection-status');
                statusBadge.textContent = '已配置';
                statusBadge.className = 'badge bg-info';
            } else {
                this.showError('保存配置失败');
            }
        } catch (error) {
            this.showError('保存配置异常: ' + error.message);
            console.error('保存 Cloudflare 配置失败:', error);
        }
    }

    async loadCloudflareSettings() {
        try {
            const settings = await window.electronAPI.loadCloudflareSettings();

            if (settings) {
                document.getElementById('cf-api-token').value = settings.apiToken || '';
                document.getElementById('cf-account-id').value = settings.accountId || '';

                this.showSuccess('配置已加载');

                // 更新连接状态
                const statusBadge = document.getElementById('cf-connection-status');
                statusBadge.textContent = '已配置';
                statusBadge.className = 'badge bg-info';
            } else {
                this.showInfo('未找到已保存的配置');
            }
        } catch (error) {
            this.showError('加载配置异常: ' + error.message);
            console.error('加载 Cloudflare 配置失败:', error);
        }
    }

    // 批量操作相关方法
    onTunnelCheckboxChange() {
        const checkboxes = document.querySelectorAll('.tunnel-checkbox');
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

        // 更新选中数量
        document.getElementById('selected-count').textContent = checkedCount;

        // 显示或隐藏批量操作工具栏
        const toolbar = document.getElementById('batch-toolbar');
        if (checkedCount > 0) {
            toolbar.style.display = 'block';
        } else {
            toolbar.style.display = 'none';
        }
    }

    selectAllTunnels() {
        const checkboxes = document.querySelectorAll('.tunnel-checkbox');
        checkboxes.forEach(cb => cb.checked = true);
        this.onTunnelCheckboxChange();
    }

    deselectAllTunnels() {
        const checkboxes = document.querySelectorAll('.tunnel-checkbox');
        checkboxes.forEach(cb => cb.checked = false);
        this.onTunnelCheckboxChange();
    }

    getSelectedTunnelIds() {
        const checkboxes = document.querySelectorAll('.tunnel-checkbox:checked');
        return Array.from(checkboxes).map(cb => cb.dataset.tunnelId);
    }

    async batchStartTunnels() {
        const tunnelIds = this.getSelectedTunnelIds();
        if (tunnelIds.length === 0) {
            this.showWarning('请先选择要启动的隧道');
            return;
        }

        const result = await window.electronAPI.showMessage({
            type: 'question',
            title: '批量启动',
            message: `确定要启动选中的 ${tunnelIds.length} 个隧道吗？`,
            buttons: ['确定', '取消']
        });

        if (result.response === 0) {
            let successCount = 0;
            let failCount = 0;

            for (const tunnelId of tunnelIds) {
                try {
                    await this.startTunnel(tunnelId);
                    successCount++;
                } catch (error) {
                    failCount++;
                    console.error(`启动隧道 ${tunnelId} 失败:`, error);
                }
            }

            this.showSuccess(`批量启动完成：成功 ${successCount} 个，失败 ${failCount} 个`);
            this.deselectAllTunnels();
        }
    }

    async batchStopTunnels() {
        const tunnelIds = this.getSelectedTunnelIds();
        if (tunnelIds.length === 0) {
            this.showWarning('请先选择要停止的隧道');
            return;
        }

        const result = await window.electronAPI.showMessage({
            type: 'question',
            title: '批量停止',
            message: `确定要停止选中的 ${tunnelIds.length} 个隧道吗？`,
            buttons: ['确定', '取消']
        });

        if (result.response === 0) {
            let successCount = 0;
            let failCount = 0;

            for (const tunnelId of tunnelIds) {
                try {
                    await this.stopTunnel(tunnelId);
                    successCount++;
                } catch (error) {
                    failCount++;
                    console.error(`停止隧道 ${tunnelId} 失败:`, error);
                }
            }

            this.showSuccess(`批量停止完成：成功 ${successCount} 个，失败 ${failCount} 个`);
            this.deselectAllTunnels();
        }
    }

    async batchRestartTunnels() {
        const tunnelIds = this.getSelectedTunnelIds();
        if (tunnelIds.length === 0) {
            this.showWarning('请先选择要重启的隧道');
            return;
        }

        const result = await window.electronAPI.showMessage({
            type: 'question',
            title: '批量重启',
            message: `确定要重启选中的 ${tunnelIds.length} 个隧道吗？`,
            buttons: ['确定', '取消']
        });

        if (result.response === 0) {
            let successCount = 0;
            let failCount = 0;

            for (const tunnelId of tunnelIds) {
                try {
                    await this.restartTunnel(tunnelId);
                    successCount++;
                } catch (error) {
                    failCount++;
                    console.error(`重启隧道 ${tunnelId} 失败:`, error);
                }
            }

            this.showSuccess(`批量重启完成：成功 ${successCount} 个，失败 ${failCount} 个`);
            this.deselectAllTunnels();
        }
    }

    async batchDeleteTunnels() {
        const tunnelIds = this.getSelectedTunnelIds();
        if (tunnelIds.length === 0) {
            this.showWarning('请先选择要删除的隧道');
            return;
        }

        const result = await window.electronAPI.showMessage({
            type: 'warning',
            title: '批量删除',
            message: `确定要删除选中的 ${tunnelIds.length} 个隧道吗？此操作不可恢复！`,
            buttons: ['确定', '取消']
        });

        if (result.response === 0) {
            let successCount = 0;
            let failCount = 0;

            for (const tunnelId of tunnelIds) {
                try {
                    const success = await window.electronAPI.deleteTunnel(tunnelId);
                    if (success) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                    // 等待一小段时间，确保删除操作完成
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    failCount++;
                    console.error(`删除隧道 ${tunnelId} 失败:`, error);
                }
            }

            this.showSuccess(`批量删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
            this.deselectAllTunnels();

            // 等待一小段时间后刷新列表
            await new Promise(resolve => setTimeout(resolve, 200));
            await this.loadTunnels();
        }
    }
}

// 添加CSS动画
const style = document.createElement('style');
style.textContent = `
    .status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        display: inline-block;
        position: relative;
    }

    .status-dot.running {
        background: var(--success-color);
        animation: pulse 2s infinite;
    }

    .status-dot.stopped {
        background: var(--warning-color);
    }

    .status-dot.error {
        background: var(--danger-color);
        animation: pulse 1s infinite;
    }

    .status-dot.starting,
    .status-dot.stopping {
        background: var(--info-color);
        animation: pulse 1.5s infinite;
    }
`;
document.head.appendChild(style);

// 初始化应用并暴露到全局
window.app = new TunnelManagerApp();

console.log('Cloudflare隧道管理器已加载完成');