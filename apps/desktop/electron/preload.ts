import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('rutileaDesktop', {
  getConnection: profile => ipcRenderer.invoke('rutilea:connection', profile),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('rutilea:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('rutilea:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('rutilea:connection:revalidate'),
  touchBackend: profile => ipcRenderer.invoke('rutilea:backend:touch', profile),
  getGatewayWsUrl: profile => ipcRenderer.invoke('rutilea:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('rutilea:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('rutilea:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('rutilea:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('rutilea:window:openInTerminal', sessionId, opts),
  openWindow: () => ipcRenderer.invoke('rutilea:window:openInstance'),
  claimAmbientCue: key => ipcRenderer.invoke('rutilea:ambient:claim', key),
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('rutilea:wake-indicator:get'),
    setState: state => ipcRenderer.send('rutilea:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('rutilea:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('rutilea:wake-indicator:state', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('rutilea:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('rutilea:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('rutilea:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('rutilea:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('rutilea:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('rutilea:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('rutilea:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('rutilea:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('rutilea:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('rutilea:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('rutilea:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    open: request => ipcRenderer.invoke('rutilea:hud:open', request),
    close: () => ipcRenderer.invoke('rutilea:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('rutilea:hud:ignore-mouse', ignore),
    moveBy: delta => ipcRenderer.send('rutilea:hud:move-by', delta),
    setBounds: bounds => ipcRenderer.send('rutilea:hud:set-bounds', bounds),
    setVibrancy: on => ipcRenderer.invoke('rutilea:hud:vibrancy', on),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('rutilea:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('rutilea:hud:goto', listener)

      return () => ipcRenderer.removeListener('rutilea:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('rutilea:hud:changed', listener)

      return () => ipcRenderer.removeListener('rutilea:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('rutilea:hud:cursor', listener)

      return () => ipcRenderer.removeListener('rutilea:hud:cursor', listener)
    }
  },
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('rutilea:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('rutilea:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('rutilea:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('rutilea:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('rutilea:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('rutilea:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('rutilea:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('rutilea:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('rutilea:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('rutilea:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('rutilea:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('rutilea:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('rutilea:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('rutilea:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('rutilea:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('rutilea:connection-config:test', payload),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('rutilea:connections:list'),
    save: payload => ipcRenderer.invoke('rutilea:connections:save', payload),
    remove: id => ipcRenderer.invoke('rutilea:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('rutilea:connections:set-primary', id),
    test: id => ipcRenderer.invoke('rutilea:connections:test', id),
    // Fan out `rutilea update` to every eligible registered connection.
    updateAll: () => ipcRenderer.invoke('rutilea:connections:update-all'),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('rutilea:connections:changed', listener)

      return () => ipcRenderer.removeListener('rutilea:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('rutilea:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('rutilea:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('rutilea:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('rutilea:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('rutilea:connection-config:oauth-logout', remoteUrl),
  // Rutilea Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('rutilea:cloud:status'),
    login: () => ipcRenderer.invoke('rutilea:cloud:login'),
    logout: () => ipcRenderer.invoke('rutilea:cloud:logout'),
    discover: org => ipcRenderer.invoke('rutilea:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('rutilea:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    get: () => ipcRenderer.invoke('rutilea:profile:get'),
    set: name => ipcRenderer.invoke('rutilea:profile:set', name)
  },
  api: request => ipcRenderer.invoke('rutilea:api', request),
  notify: payload => ipcRenderer.invoke('rutilea:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('rutilea:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('rutilea:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('rutilea:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('rutilea:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('rutilea:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('rutilea:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('rutilea:readFileText', filePath),
  selectPaths: options => ipcRenderer.invoke('rutilea:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('rutilea:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('rutilea:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('rutilea:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('rutilea:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('rutilea:saveImageFromUrl', url),
  saveImageBuffer: (data, ext) => ipcRenderer.invoke('rutilea:saveImageBuffer', { data, ext }),
  saveClipboardImage: () => ipcRenderer.invoke('rutilea:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('rutilea:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('rutilea:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('rutilea:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('rutilea:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('rutilea:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('rutilea:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('rutilea:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('rutilea:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('rutilea:keep-awake', on),
  setDisableF12: blocked => ipcRenderer.send('rutilea:devtools:disable-f12', blocked),
  setPreviewShortcutActive: active => ipcRenderer.send('rutilea:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('rutilea:openExternal', url),
  openPreviewInBrowser: url => ipcRenderer.invoke('rutilea:openPreviewInBrowser', url),
  fetchLinkTitle: url => ipcRenderer.invoke('rutilea:fetchLinkTitle', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('rutilea:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('rutilea:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('rutilea:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('rutilea:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('rutilea:zoom:get'),
    setPercent: percent => ipcRenderer.send('rutilea:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('rutilea:zoom:changed', listener)

      return () => ipcRenderer.removeListener('rutilea:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('rutilea:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('rutilea:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('rutilea:logs:renderer-error', report),
  readDir: dirPath => ipcRenderer.invoke('rutilea:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('rutilea:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('rutilea:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('rutilea:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('rutilea:fs:desktopPluginsRoot'),
  agentPluginsRoot: () => ipcRenderer.invoke('rutilea:fs:agentPluginsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('rutilea:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('rutilea:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('rutilea:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('rutilea:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('rutilea:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('rutilea:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('rutilea:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('rutilea:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('rutilea:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('rutilea:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('rutilea:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('rutilea:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('rutilea:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('rutilea:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('rutilea:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('rutilea:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('rutilea:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('rutilea:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('rutilea:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('rutilea:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('rutilea:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('rutilea:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('rutilea:git:review:prList', repoPath, branches, numbers),
      fetchPrComment: (repoPath, url) => ipcRenderer.invoke('rutilea:git:review:fetchPrComment', repoPath, url),
      createPr: repoPath => ipcRenderer.invoke('rutilea:git:review:createPr', repoPath)
    }
  },
  terminal: {
    cwd: id => ipcRenderer.invoke('rutilea:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('rutilea:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('rutilea:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('rutilea:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('rutilea:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `rutilea:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `rutilea:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('rutilea:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('rutilea:close-preview-requested', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('rutilea:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('rutilea:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('rutilea:open-updates', listener)

    return () => ipcRenderer.removeListener('rutilea:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('rutilea:deep-link', listener)

    return () => ipcRenderer.removeListener('rutilea:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('rutilea:deep-link-ready'),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('rutilea:window-state-changed', listener)

    return () => ipcRenderer.removeListener('rutilea:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('rutilea:focus-session', listener)

    return () => ipcRenderer.removeListener('rutilea:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('rutilea:notification-action', listener)

    return () => ipcRenderer.removeListener('rutilea:notification-action', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('rutilea:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('rutilea:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('rutilea:backend-exit', listener)

    return () => ipcRenderer.removeListener('rutilea:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('rutilea:connection:applied', listener)

    return () => ipcRenderer.removeListener('rutilea:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('rutilea:power-resume', listener)

    return () => ipcRenderer.removeListener('rutilea:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('rutilea:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('rutilea:power-battery', listener)

    return () => ipcRenderer.removeListener('rutilea:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('rutilea:boot-progress', listener)

    return () => ipcRenderer.removeListener('rutilea:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('rutilea:bootstrap:get'),
  continueBootstrapLocal: () => ipcRenderer.invoke('rutilea:bootstrap:continue-local'),
  resetBootstrap: () => ipcRenderer.invoke('rutilea:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('rutilea:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('rutilea:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('rutilea:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('rutilea:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('rutilea:version'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('rutilea:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('rutilea:uninstall:summary'),
    run: mode => ipcRenderer.invoke('rutilea:uninstall:run', { mode })
  },
  updates: {
    check: () => ipcRenderer.invoke('rutilea:updates:check'),
    apply: opts => ipcRenderer.invoke('rutilea:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('rutilea:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('rutilea:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('rutilea:updates:progress', listener)

      return () => ipcRenderer.removeListener('rutilea:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('rutilea:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('rutilea:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('rutilea:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('rutilea:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('rutilea:found-in-page', listener)

    return () => ipcRenderer.removeListener('rutilea:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('rutilea:open-find-bar', listener)

    return () => ipcRenderer.removeListener('rutilea:open-find-bar', listener)
  }
})
