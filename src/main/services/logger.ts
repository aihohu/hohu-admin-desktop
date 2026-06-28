import log from 'electron-log'

// 文件位置（electron-log 默认）：
//   macOS: ~/Library/Logs/{appName}/main.log
//   Windows: %USERPROFILE%\AppData\Roaming\{appName}\logs\main.log
//   Linux: ~/.config/{appName}/logs/main.log
log.transports.file.level = import.meta.env.DEV ? 'debug' : 'info'
log.transports.file.maxSize = 1048576 // 1 MB → 自动轮转 main.log → main.old.log
log.transports.console.level = import.meta.env.DEV ? 'debug' : false
log.transports.console.format = '{h:i:s} [{level}] {text}'

export default log
