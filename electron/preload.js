const { contextBridge, ipcRenderer } = require('electron')

// Whitelist of allowed IPC channels for security
const INVOKE_CHANNELS = [
  'games:getAll', 'games:add', 'games:update', 'games:delete', 'games:getById', 'games:setTags', 'games:changeAppearance', 'games:toggleLaunchSteam',
  'dialog:openExe', 'dialog:openImage', 'dialog:openFolder',
  'steam:scan',
  'game:launch', 'game:isRunning', 'game:stop', 'game:resolveConflict',
  'settings:get', 'settings:set', 'settings:getDropZone', 'settings:setDropZone',
  'shell:openPath',
  'categories:getAll', 'categories:add', 'categories:update', 'categories:delete',
]

const SEND_CHANNELS = ['window:minimize', 'window:maximize', 'window:close']

const ON_CHANNELS = [
  'game:added',       // file-watcher detected a new game
  'game:updated',     // playtime updated
  'game:launched',    // process started
  'game:stopped',     // process ended
  'game:conflict',    // file-watcher detected multiple .exe (PENDING_RESOLUTION)
  'cover-updated',    // custom cover was changed in main process
]

contextBridge.exposeInMainWorld('api', {
  /** Two-way invoke */
  invoke: (channel, ...args) => {
    if (!INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },

  /** Fire-and-forget */
  send: (channel, ...args) => {
    if (!SEND_CHANNELS.includes(channel)) return
    ipcRenderer.send(channel, ...args)
  },

  /** Subscribe to pushed events from main process */
  on: (channel, callback) => {
    if (!ON_CHANNELS.includes(channel)) return () => {}
    const listener = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
