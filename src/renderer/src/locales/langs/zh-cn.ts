export default {
  common: {
    login: '登录',
    logout: '退出登录',
    cancel: '取消',
    confirm: '确认',
    save: '保存',
    edit: '编辑',
    delete: '删除',
    add: '新增',
    search: '搜索',
    refresh: '刷新',
    back: '返回',
    welcome: '欢迎回来'
  },
  page: {
    login: {
      title: '登录 hohu-admin-desktop',
      userName: '用户名',
      password: '密码',
      userNamePlaceholder: '请输入用户名',
      passwordPlaceholder: '请输入密码',
      demoAccount: '演示账号',
      invalidCredentials: '请输入用户名和密码',
      loginFailed: '登录失败'
    }
  },
  theme: {
    title: '主题设置',
    darkMode: '暗黑模式',
    primaryColor: '主色',
    preset: {
      default: '默认',
      green: '绿色',
      orange: '橙色',
      red: '红色'
    }
  },
  // 路由菜单翻译：与后端 meta.i18nKey 对齐，key 格式 'route.<route_name>'
  // 注意：连字符 key 需要加引号（JS 对象 key 含特殊字符）
  route: {
    home: '首页',
    ai: 'AI 助手',
    ai_chat: 'AI 对话',
    ai_provider: '模型管理',
    auth: '权限管理',
    system: '系统管理',
    task: '任务中心',
    system_dept: '组织管理',
    system_user: '用户管理',
    system_role: '角色管理',
    system_menu: '菜单管理',
    system_file: '文件管理',
    system_dict: '数据字典',
    system_config: '系统设置',
    system_dict_data: '字典数据',
    system_monitor: '监控管理',
    'system_operation-log': '操作日志',
    'system_login-log': '登录日志',
    system_job: '定时任务',
    'system_job-log': '任务日志'
  }
}
