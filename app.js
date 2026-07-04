(function () {
  "use strict";

  const COMMON_MATERIALS = ["paper", "ghast_tear", "wooden_sword", "wooden_axe", "wooden_pickaxe", "stick", "diamond", "emerald"];
  const DEFAULT_FOLDER = "test";
  const DEFAULT_NAMESPACE = "ecore";
  const ZIP_VERSION_NEEDED = 20;
  const ZIP_UTF8_FLAG = 0x0800;
  const ZIP_STORE_METHOD = 0;
  const ZIP_MAX_UINT32 = 0xffffffff;
  const ZIP_MAX_ENTRIES = 0xffff;
  const EASYCORE_EXPORT_ROOT = ["generated", "easycore"];
  const CRC32_TABLE = createCrc32Table();

  const elements = {
    entryGate: document.getElementById("entryGate"),
    workspace: document.getElementById("workspace"),
    textureBrowser: document.getElementById("textureBrowser"),
    folderStatus: document.getElementById("folderStatus"),
    textureBrowserBtn: document.getElementById("textureBrowserBtn"),
    editorViewBtn: document.getElementById("editorViewBtn"),
    pickFolderBtn: document.getElementById("pickFolderBtn"),
    importLegacyBtn: document.getElementById("importLegacyBtn"),
    addBlankBtn: document.getElementById("addBlankBtn"),
    addSampleBtn: document.getElementById("addSampleBtn"),
    exportBtn: document.getElementById("exportBtn"),
    dropZone: document.getElementById("dropZone"),
    fileInput: document.getElementById("fileInput"),
    itemCount: document.getElementById("itemCount"),
    itemList: document.getElementById("itemList"),
    emptyEditor: document.getElementById("emptyEditor"),
    itemForm: document.getElementById("itemForm"),
    removeItemBtn: document.getElementById("removeItemBtn"),
    previewImage: document.getElementById("previewImage"),
    displayNameInput: document.getElementById("displayNameInput"),
    folderInput: document.getElementById("folderInput"),
    textureNameInput: document.getElementById("textureNameInput"),
    identifierInput: document.getElementById("identifierInput"),
    javaIdentifierInput: document.getElementById("javaIdentifierInput"),
    materialGrid: document.getElementById("materialGrid"),
    validationBox: document.getElementById("validationBox"),
    outputPreview: document.getElementById("outputPreview"),
    downloadList: document.getElementById("downloadList"),
    copyNeigeBtn: document.getElementById("copyNeigeBtn"),
    browserTextureCount: document.getElementById("browserTextureCount"),
    browserTextureGrid: document.getElementById("browserTextureGrid"),
    browserEmpty: document.getElementById("browserEmpty"),
    browserDetail: document.getElementById("browserDetail"),
    browserPreviewImage: document.getElementById("browserPreviewImage"),
    browserTexturePath: document.getElementById("browserTexturePath"),
    browserIdentifier: document.getElementById("browserIdentifier"),
    browserJavaIdentifier: document.getElementById("browserJavaIdentifier"),
    browserMaterial: document.getElementById("browserMaterial"),
    browserNeigePreview: document.getElementById("browserNeigePreview"),
    copyBrowserNeigeBtn: document.getElementById("copyBrowserNeigeBtn")
  };

  const state = {
    viewMode: "editor",
    items: [],
    selectedId: "",
    componentDirectory: null,
    componentDirectoryName: "",
    componentTextureHashes: new Map(),
    componentTextureFileCount: 0,
    componentTextureItems: [],
    componentTextureGridDirty: true,
    componentTextureTileMap: new Map(),
    selectedComponentTexturePath: "",
    componentItemMaxNumber: 0,
    componentItemMaxLoaded: false,
    outputTab: "neige",
    generatedFiles: [],
    generatedArchive: null,
    downloadUrls: []
  };

  /**
   * 初始化编辑器事件和初始渲染。
   */
  function initApp() {
    bindEvents();
    renderAll();
    exposeTestHooks();
  }

  /**
   * 绑定页面上的全部交互事件。
   */
  function bindEvents() {
    elements.textureBrowserBtn.addEventListener("click", handleShowTextureBrowser);
    elements.editorViewBtn.addEventListener("click", handleShowEditor);
    elements.pickFolderBtn.addEventListener("click", handlePickFolder);
    elements.importLegacyBtn.addEventListener("click", handleImportLegacyConfig);
    elements.addBlankBtn.addEventListener("click", handleAddBlankItem);
    elements.addSampleBtn.addEventListener("click", handleAddSampleItem);
    elements.exportBtn.addEventListener("click", handleExport);
    elements.fileInput.addEventListener("change", handleFileInputChange);
    elements.dropZone.addEventListener("dragover", handleDragOver);
    elements.dropZone.addEventListener("dragleave", handleDragLeave);
    elements.dropZone.addEventListener("drop", handleDrop);
    elements.removeItemBtn.addEventListener("click", handleRemoveSelectedItem);
    elements.displayNameInput.addEventListener("input", handleEditorInput);
    elements.folderInput.addEventListener("input", handleEditorInput);
    elements.textureNameInput.addEventListener("input", handleEditorInput);
    elements.identifierInput.addEventListener("input", handleEditorInput);
    elements.javaIdentifierInput.addEventListener("input", handleJavaIdentifierInput);
    elements.copyNeigeBtn.addEventListener("click", handleCopyOutput);
    elements.copyBrowserNeigeBtn.addEventListener("click", handleCopyBrowserNeige);
    document.querySelectorAll("[data-output-tab]").forEach(function (button) {
      button.addEventListener("click", handleOutputTabClick);
    });
  }

  /**
   * 只读选择 EasyCore 组件目录。
   */
  async function handlePickFolder() {
    if (typeof window.showDirectoryPicker !== "function") {
      setStatus("当前浏览器不支持目录读取，仍可直接导出 ZIP。", "warn");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      elements.folderStatus.textContent = "正在读取组件已有贴图：" + handle.name;
      setStatus("正在载入 easycore组件 的 textures/items PNG，用于后续像素去重。", "warn");
      const textureIndex = await loadComponentTextureBundle(handle, true);
      const componentItemMaxNumber = await getComponentMaxItemNumberFromDirectory(handle);
      revokeComponentTextureUrls();
      state.componentDirectory = handle;
      state.componentDirectoryName = handle.name;
      state.componentTextureHashes = textureIndex.hashes;
      state.componentTextureFileCount = textureIndex.fileCount;
      state.componentTextureItems = textureIndex.browserItems;
      state.componentTextureGridDirty = true;
      state.componentTextureTileMap = new Map();
      state.selectedComponentTexturePath = textureIndex.browserItems.length > 0 ? textureIndex.browserItems[0].texturePath : "";
      state.componentItemMaxNumber = componentItemMaxNumber;
      state.componentItemMaxLoaded = true;
      renderAll();
      setStatus(
        "组件目录已读取，已载入 " + textureIndex.fileCount + " 张 textures/items 现有贴图用于像素去重，当前生效贴图物品 " + textureIndex.browserItems.length + " 个，默认物品编号将从 item_" + (componentItemMaxNumber + 1) + " 开始。",
        textureIndex.warnings.length > 0 ? "warn" : "ok"
      );
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      setStatus("选择目录失败：" + getErrorMessage(error), "error");
    }
  }

  /**
   * 切换到组件贴图阅览界面。
   */
  function handleShowTextureBrowser() {
    if (!requireEditorUnlocked()) {
      return;
    }
    state.viewMode = "browser";
    renderAll();
  }

  /**
   * 切换回物品编辑界面。
   */
  function handleShowEditor() {
    state.viewMode = "editor";
    renderAll();
  }

  /**
   * 导入旧 Textures、NeigeItems 和 EasyCore 资源包配置。
   */
  async function handleImportLegacyConfig() {
    if (!requireEditorUnlocked()) {
      return;
    }
    if (typeof window.showDirectoryPicker !== "function") {
      setStatus("当前浏览器不支持目录读取，无法导入旧配置。", "warn");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      setStatus("正在导入旧配置：" + handle.name, "warn");
      const result = await importLegacyDirectory(handle);
      renderAll();
      setStatus(formatLegacyImportSummary(result), result.items.length > 0 ? "ok" : "warn");
    } catch (error) {
      if (error && error.name === "AbortError") {
        return;
      }
      setStatus("导入旧配置失败：" + getErrorMessage(error), "error");
    }
  }

  /**
   * 添加一个没有贴图文件的空物品记录。
   */
  async function handleAddBlankItem() {
    if (!requireEditorUnlocked()) {
      return;
    }
    const item = await createItemRecord(null);
    state.items.push(item);
    state.selectedId = item.id;
    renderAll();
  }

  /**
   * 添加一个内置 PNG 示例物品。
   */
  async function handleAddSampleItem() {
    if (!requireEditorUnlocked()) {
      return;
    }
    const selected = getSelectedItem();
    if (selected == null) {
      await addFiles([createSamplePngFile()]);
      return;
    }
    await applyTextureFiles([createSamplePngFile()]);
  }

  /**
   * 处理当前物品贴图文件选择。
   */
  async function handleFileInputChange(event) {
    if (!requireEditorUnlocked()) {
      event.target.value = "";
      return;
    }
    const files = Array.from(event.target.files || []);
    await applyTextureFiles(files);
    event.target.value = "";
  }

  /**
   * 阻止浏览器默认拖拽行为并高亮放置区。
   */
  function handleDragOver(event) {
    if (!isEditorUnlocked()) {
      return;
    }
    event.preventDefault();
    elements.dropZone.classList.add("drag-over");
  }

  /**
   * 移除拖拽高亮状态。
   */
  function handleDragLeave() {
    elements.dropZone.classList.remove("drag-over");
  }

  /**
   * 处理拖入的 PNG 文件。
   */
  async function handleDrop(event) {
    event.preventDefault();
    elements.dropZone.classList.remove("drag-over");
    if (!requireEditorUnlocked()) {
      return;
    }
    await applyTextureFiles(Array.from(event.dataTransfer.files || []));
  }

  /**
   * 删除当前选中的物品记录。
   */
  function handleRemoveSelectedItem() {
    if (!requireEditorUnlocked()) {
      return;
    }
    const selected = getSelectedItem();
    if (selected == null) {
      return;
    }
    revokeItemUrl(selected);
    state.items = state.items.filter(function (item) {
      return item.id !== selected.id;
    });
    state.selectedId = state.items.length > 0 ? state.items[0].id : "";
    renderAll();
  }

  /**
   * 将表单输入同步到当前物品。
   */
  function handleEditorInput() {
    if (!isEditorUnlocked()) {
      return;
    }
    const item = getSelectedItem();
    if (item == null) {
      return;
    }
    item.displayName = elements.displayNameInput.value;
    item.folderName = sanitizeFolderName(elements.folderInput.value);
    item.textureName = sanitizeTextureFileName(elements.textureNameInput.value);
    item.identifier = normalizeIdentifier(elements.identifierInput.value);
    renderItemList();
    renderOutput();
  }

  /**
   * 将 java_identifier 字段同步到当前物品。
   */
  function handleJavaIdentifierInput() {
    if (!isEditorUnlocked()) {
      return;
    }
    const item = getSelectedItem();
    if (item == null) {
      return;
    }
    item.javaIdentifier = normalizeJavaIdentifier(elements.javaIdentifierInput.value);
    renderMaterialGrid();
    renderOutput();
  }

  /**
   * 切换输出预览页签。
   */
  function handleOutputTabClick(event) {
    if (!isEditorUnlocked()) {
      return;
    }
    const tab = event.currentTarget.getAttribute("data-output-tab");
    if (tab == null || tab === "") {
      return;
    }
    state.outputTab = tab;
    document.querySelectorAll("[data-output-tab]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-output-tab") === tab);
    });
    renderOutput();
  }

  /**
   * 复制当前输出页签内容到剪贴板。
   */
  async function handleCopyOutput() {
    if (!requireEditorUnlocked()) {
      return;
    }
    const result = buildExportPlan(null);
    if (result.errors.length > 0) {
      renderValidation(result);
      return;
    }
    try {
      await copyTextToClipboard(getOutputText(result));
      setStatus(getOutputCopyName() + " 已复制。", "ok");
    } catch (error) {
      setStatus("复制失败：" + getErrorMessage(error), "error");
    }
  }

  /**
   * 复制阅览器当前贴图的 NeigeItems 示例。
   */
  async function handleCopyBrowserNeige() {
    if (!requireEditorUnlocked()) {
      return;
    }
    const item = getSelectedComponentTextureItem();
    if (item == null) {
      return;
    }
    try {
      await copyTextToClipboard(item.neigeYaml);
      setStatus("当前贴图的 NeigeItems 示例已复制。", "ok");
    } catch (error) {
      setStatus("复制失败：" + getErrorMessage(error), "error");
    }
  }

  /**
   * 复制文本到剪贴板，并在 Clipboard API 不可用时降级。
   */
  async function copyTextToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        if (document.hasFocus()) {
          throw error;
        }
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) {
      throw new Error("浏览器拒绝写入剪贴板");
    }
  }

  /**
   * 打包全部导出文件为 ZIP 下载。
   */
  async function handleExport() {
    if (!requireEditorUnlocked()) {
      return;
    }
    const result = buildExportPlan(null);
    renderValidation(result);
    if (result.errors.length > 0) {
      state.generatedFiles = [];
      state.generatedArchive = null;
      renderDownloadList();
      return;
    }
    try {
      const exportResult = state.componentDirectory != null
        ? await buildExportPlanWithExistingTexture()
        : result;
      renderValidation(exportResult);
      if (exportResult.errors.length > 0) {
        state.generatedFiles = [];
        state.generatedArchive = null;
        renderDownloadList();
        return;
      }
      const archiveName = makeArchiveFileName();
      const archiveBlob = await createZipBlob(exportResult.files);
      state.generatedFiles = exportResult.files;
      state.generatedArchive = {
        blob: archiveBlob,
        fileName: archiveName
      };
      renderOutput();
      renderDownloadList();
      downloadBlob(archiveBlob, archiveName);
      setStatus("已生成 ZIP 下载包，不会修改任何选择过的源文件。", "ok");
    } catch (error) {
      setStatus("导出失败：" + getErrorMessage(error), "error");
    }
  }

  /**
   * 添加一组 PNG 文件到物品列表。
   */
  async function addFiles(files) {
    if (!requireEditorUnlocked()) {
      return;
    }
    const pngFiles = getPngFiles(files);
    for (const file of pngFiles) {
      const item = await createItemRecord(file);
      state.items.push(item);
      state.selectedId = item.id;
    }
    if (pngFiles.length === 0 && files.length > 0) {
      setStatus("只接受 PNG 文件。", "warn");
    }
    renderAll();
  }

  /**
   * 把 PNG 应用到当前选中的物品贴图。
   */
  async function applyTextureFiles(files) {
    if (!requireEditorUnlocked()) {
      return;
    }
    const pngFiles = getPngFiles(files);
    if (pngFiles.length === 0) {
      if (files.length > 0) {
        setStatus("只接受 PNG 文件。", "warn");
      }
      return;
    }
    const item = getSelectedItem();
    if (item == null) {
      await addFiles([pngFiles[0]]);
      return;
    }
    await applyTextureFileToItem(item, pngFiles[0]);
    renderAll();
  }

  /**
   * 筛出 PNG 文件。
   */
  function getPngFiles(files) {
    return files.filter(function (file) {
      return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    });
  }

  /**
   * 计算 PNG 解码后的像素哈希。
   */
  async function calculateTextureHash(file) {
    if (file == null) {
      return "";
    }
    try {
      return await calculatePixelHash(file);
    } catch (error) {
      return calculateFileByteHash(file);
    }
  }

  /**
   * 按像素 RGBA 数据计算哈希。
   */
  async function calculatePixelHash(file) {
    const image = await createImageBitmap(file);
    try {
      const canvas = createReadableCanvas(image.width, image.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context == null) {
        throw new Error("无法读取 PNG 像素。");
      }
      context.clearRect(0, 0, image.width, image.height);
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      const bytes = new Uint8Array(8 + pixels.byteLength);
      const view = new DataView(bytes.buffer);
      view.setUint32(0, image.width, true);
      view.setUint32(4, image.height, true);
      bytes.set(pixels, 8);
      return "px:" + await digestBytes(bytes);
    } finally {
      if (typeof image.close === "function") {
        image.close();
      }
    }
  }

  /**
   * 创建可读取像素的画布。
   */
  function createReadableCanvas(width, height) {
    if (typeof OffscreenCanvas === "function") {
      return new OffscreenCanvas(width, height);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * 像素读取失败时按文件字节兜底计算哈希。
   */
  async function calculateFileByteHash(file) {
    const buffer = await file.arrayBuffer();
    return "file:" + await digestBytes(new Uint8Array(buffer));
  }

  /**
   * 计算字节数组 SHA-256。
   */
  async function digestBytes(bytes) {
    if (!window.crypto || !window.crypto.subtle) {
      return fallbackHashBytes(bytes);
    }
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(digest));
  }

  /**
   * 将字节数组转成十六进制字符串。
   */
  function bytesToHex(bytes) {
    return Array.from(bytes, function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  /**
   * 没有 WebCrypto 时的轻量哈希兜底。
   */
  function fallbackHashBytes(bytes) {
    let hash = 2166136261;
    for (let index = 0; index < bytes.length; index += 1) {
      hash ^= bytes[index];
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  /**
   * 从旧配置目录导入物品生成记录。
   */
  async function importLegacyDirectory(rootHandle) {
    const legacyRoot = await findLegacyConfigRootHandle(rootHandle);
    const handles = await findLegacyConfigHandles(legacyRoot);
    const sources = await readLegacySourcesFromHandles(handles);
    const result = await importLegacySources(sources);
    replaceItems(result.items);
    return result;
  }

  /**
   * 查找真正包含旧配置三件套的目录。
   */
  async function findLegacyConfigRootHandle(rootHandle) {
    if (await hasLegacyConfigDirectories(rootHandle)) {
      return rootHandle;
    }
    for await (const pair of rootHandle.entries()) {
      const handle = pair[1];
      if (handle.kind !== "directory") {
        continue;
      }
      if (await hasLegacyConfigDirectories(handle)) {
        return handle;
      }
    }
    return rootHandle;
  }

  /**
   * 判断目录是否包含旧配置需要的三个目录。
   */
  async function hasLegacyConfigDirectories(rootHandle) {
    const texturesDirectory = await getOptionalDirectoryHandle(rootHandle, ["Textures配置"]);
    const neigeDirectory = await getOptionalDirectoryHandle(rootHandle, ["NeigeItems配置"]);
    const resourceDirectory = await getOptionalDirectoryHandle(rootHandle, ["easycore资源包", "easyCoreResource"]);
    return texturesDirectory != null && neigeDirectory != null && resourceDirectory != null;
  }

  /**
   * 查找旧配置根目录里的三个输入目录。
   */
  async function findLegacyConfigHandles(rootHandle) {
    const texturesDirectory = await getOptionalDirectoryHandle(rootHandle, ["Textures配置"]);
    const neigeDirectory = await getOptionalDirectoryHandle(rootHandle, ["NeigeItems配置"]);
    const resourceDirectory = await getOptionalDirectoryHandle(rootHandle, ["easycore资源包", "easyCoreResource"]);
    if (texturesDirectory == null) {
      throw new Error("未找到 Textures配置 目录。");
    }
    if (neigeDirectory == null) {
      throw new Error("未找到 NeigeItems配置 目录。");
    }
    if (resourceDirectory == null) {
      throw new Error("未找到 easycore资源包/easyCoreResource 目录。");
    }
    return {
      texturesDirectory: texturesDirectory,
      neigeDirectory: neigeDirectory,
      resourceDirectory: resourceDirectory
    };
  }

  /**
   * 从目录句柄读取旧配置文本和 PNG 加载器。
   */
  async function readLegacySourcesFromHandles(handles) {
    const textureFiles = await readTextFilesRecursive(handles.texturesDirectory, "");
    const neigeFiles = await readTextFilesRecursive(handles.neigeDirectory, "");
    const itemTextureFile = await readOptionalTextFile(handles.resourceDirectory, ["textures", "item_texture.json"]);
    const directoryCache = new Map();
    return {
      textureFiles: textureFiles,
      neigeFiles: neigeFiles,
      itemTextureJson: itemTextureFile || "",
      loadPng: async function (texturePath) {
        return readLegacyPngFile(handles.resourceDirectory, texturePath, directoryCache);
      }
    };
  }

  /**
   * 导入内存中的旧配置数据。
   */
  async function importLegacySources(sources) {
    const textureConfigMap = parseLegacyTextureFiles(sources.textureFiles || []);
    const itemTextureData = parseLegacyItemTextureJson(sources.itemTextureJson || "");
    const neigeEntries = parseLegacyNeigeFiles(sources.neigeFiles || []);
    const loadPng = typeof sources.loadPng === "function"
      ? sources.loadPng
      : createLegacyMemoryPngLoader(sources.pngFiles || []);
    const result = await buildLegacyImportResult(neigeEntries, itemTextureData, textureConfigMap, loadPng);
    return result;
  }

  /**
   * 构建旧配置导入结果。
   */
  async function buildLegacyImportResult(neigeEntries, itemTextureData, textureConfigMap, loadPng) {
    const items = [];
    const warnings = [];
    const seenIdentifiers = new Set();
    let duplicateCount = 0;
    let missingTextureCount = 0;
    let missingPngCount = 0;

    for (const entry of neigeEntries) {
      if (!entry.neteaseIdentifier) {
        continue;
      }
      if (seenIdentifiers.has(entry.neteaseIdentifier)) {
        duplicateCount += 1;
        continue;
      }

      const texturePath = resolveLegacyTexturePath(entry.neteaseIdentifier, itemTextureData, textureConfigMap);
      if (!texturePath) {
        missingTextureCount += 1;
        continue;
      }
      seenIdentifiers.add(entry.neteaseIdentifier);
      const file = await loadPng(texturePath);
      if (file == null) {
        missingPngCount += 1;
      }
      items.push(await createLegacyItemRecord(entry, texturePath, file));
    }

    if (duplicateCount > 0) {
      warnings.push("重复 identifier 已合并 " + duplicateCount + " 条。");
    }
    if (missingTextureCount > 0) {
      warnings.push("没有贴图路径的 NeigeItems 条目已跳过 " + missingTextureCount + " 条。");
    }
    if (missingPngCount > 0) {
      warnings.push("有贴图路径但 PNG 缺失 " + missingPngCount + " 条。");
    }

    return {
      items: items,
      warnings: warnings,
      totalNeigeEntries: neigeEntries.length,
      importedCount: items.length,
      duplicateCount: duplicateCount,
      missingTextureCount: missingTextureCount,
      missingPngCount: missingPngCount
    };
  }

  /**
   * 创建旧配置导入后的物品记录。
   */
  async function createLegacyItemRecord(entry, texturePath, file) {
    const textureInfo = getTextureInfoFromPath(texturePath);
    return {
      id: createId(),
      file: file,
      objectUrl: file == null ? "" : URL.createObjectURL(file),
      textureHash: await calculateTextureHash(file),
      displayName: entry.key || entry.neteaseIdentifier,
      folderName: textureInfo.folderName,
      textureName: textureInfo.textureName,
      identifier: normalizeIdentifier(entry.neteaseIdentifier),
      javaIdentifier: getJavaIdentifierByMaterial(entry.material)
    };
  }

  /**
   * 替换当前物品列表。
   */
  function replaceItems(items) {
    state.items.forEach(function (item) {
      revokeItemUrl(item);
    });
    state.items = items;
    state.selectedId = items.length > 0 ? items[0].id : "";
    state.generatedFiles = [];
    state.generatedArchive = null;
    revokeDownloadUrls();
  }

  /**
   * 格式化旧配置导入结果。
   */
  function formatLegacyImportSummary(result) {
    return [
      "已导入旧配置 " + result.importedCount + " 条。",
      "NeigeItems 条目 " + result.totalNeigeEntries + " 条。",
      result.warnings.join(" ")
    ].filter(function (part) {
      return part !== "";
    }).join(" ");
  }

  /**
   * 解析全部 NeigeItems 配置文件。
   */
  function parseLegacyNeigeFiles(files) {
    return files.reduce(function (entries, file) {
      return entries.concat(parseLegacyNeigeText(file.text || "", file.path || ""));
    }, []);
  }

  /**
   * 解析单个 NeigeItems 配置文本。
   */
  function parseLegacyNeigeText(text, sourcePath) {
    const entries = [];
    const lines = String(text || "").split(/\r?\n/);
    let current = null;
    lines.forEach(function (line) {
      const keyMatch = line.match(/^([^\s:#][^:]*):\s*$/);
      if (keyMatch != null) {
        if (current != null) {
          entries.push(current);
        }
        current = {
          key: keyMatch[1].trim(),
          sourcePath: sourcePath,
          material: null,
          neteaseIdentifier: ""
        };
        return;
      }
      if (current == null) {
        return;
      }
      const materialMatch = line.match(/^\s{2}material:\s*['"]?([^'"\s#]+)/);
      if (materialMatch != null) {
        current.material = Number(materialMatch[1]);
      }
      const identifierMatch = line.match(/^\s+netease_identifier:\s*['"]?([^'"\s#]+)/);
      if (identifierMatch != null) {
        current.neteaseIdentifier = normalizeIdentifier(identifierMatch[1]);
      }
    });
    if (current != null) {
      entries.push(current);
    }
    return entries.filter(function (entry) {
      return entry.neteaseIdentifier || entry.material != null;
    });
  }

  /**
   * 解析全部 Textures 配置文件。
   */
  function parseLegacyTextureFiles(files) {
    const map = {};
    files.forEach(function (file) {
      parseLegacyTextureText(file.text || "").forEach(function (entry) {
        if (entry.identifier && entry.defaultPath && map[entry.identifier] == null) {
          map[entry.identifier] = entry.defaultPath;
        }
      });
    });
    return map;
  }

  /**
   * 解析单个 Textures 配置文本。
   */
  function parseLegacyTextureText(text) {
    const entries = [];
    const lines = String(text || "").split(/\r?\n/);
    let current = null;
    lines.forEach(function (line) {
      const keyMatch = line.match(/^\s*['"]?([^'"\s:#][^'"]*?:[^'"]+?)['"]?:\s*$/);
      if (keyMatch != null && !/^\s+(default|hover|pressed)-path/.test(line)) {
        if (current != null) {
          entries.push(current);
        }
        current = {
          identifier: normalizeIdentifier(keyMatch[1]),
          defaultPath: ""
        };
        return;
      }
      if (current == null) {
        return;
      }
      const pathMatch = line.match(/^\s*default-path:\s*['"]?([^'"]+)['"]?/);
      if (pathMatch != null) {
        current.defaultPath = normalizeLegacyTexturePath(pathMatch[1]);
      }
    });
    if (current != null) {
      entries.push(current);
    }
    return entries;
  }

  /**
   * 解析 item_texture.json 的 texture_data。
   */
  function parseLegacyItemTextureJson(text) {
    if (!String(text || "").trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(text);
      return cloneTextureData(parsed);
    } catch (error) {
      return {};
    }
  }

  /**
   * 从 item_texture 或 Textures 配置里解析贴图路径。
   */
  function resolveLegacyTexturePath(identifier, itemTextureData, textureConfigMap) {
    if (textureConfigMap[identifier]) {
      return textureConfigMap[identifier];
    }
    const textureNode = itemTextureData[identifier];
    const itemTexturePath = getTexturePathFromTextureNode(textureNode);
    if (itemTexturePath) {
      return itemTexturePath;
    }
    return "";
  }

  /**
   * 获取 item_texture 单项里的贴图路径。
   */
  function getTexturePathFromTextureNode(node) {
    if (typeof node === "string") {
      return normalizeLegacyTexturePath(node);
    }
    if (node == null || typeof node !== "object") {
      return "";
    }
    if (typeof node.textures === "string") {
      return normalizeLegacyTexturePath(node.textures);
    }
    if (Array.isArray(node.textures) && node.textures.length > 0) {
      return normalizeLegacyTexturePath(node.textures[0]);
    }
    return "";
  }

  /**
   * 从贴图路径提取导出用文件夹和文件名。
   */
  function getTextureInfoFromPath(texturePath) {
    const normalized = normalizeLegacyTexturePath(texturePath);
    const withoutPrefix = normalized.replace(/^textures\/items\//, "").replace(/^textures\//, "");
    const parts = withoutPrefix.split("/").filter(function (part) {
      return part !== "";
    });
    const rawBase = parts.length > 0 ? parts[parts.length - 1] : "1";
    const folderParts = parts.slice(0, -1);
    return {
      folderName: sanitizeFolderName(folderParts.join("/")),
      textureName: sanitizeTextureFileName(rawBase + ".png")
    };
  }

  /**
   * 标准化旧配置里的贴图路径。
   */
  function normalizeLegacyTexturePath(value) {
    return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.png$/i, "");
  }

  /**
   * 按 material 数字推断 java_identifier。
   */
  function getJavaIdentifierByMaterial(material) {
    const materialNumber = Number(material);
    const materialMap = getMaterialMap();
    if (!Number.isFinite(materialNumber)) {
      return "paper";
    }
    for (const name of COMMON_MATERIALS) {
      if (materialMap[name] === materialNumber) {
        return name;
      }
    }
    const keys = Object.keys(materialMap);
    for (const key of keys) {
      if (materialMap[key] === materialNumber) {
        return key;
      }
    }
    return "paper";
  }

  /**
   * 创建内存 PNG 加载器。
   */
  function createLegacyMemoryPngLoader(pngFiles) {
    const map = {};
    pngFiles.forEach(function (entry) {
      const key = normalizeLegacyTexturePath(entry.path);
      map[key] = entry.file;
    });
    return async function (texturePath) {
      return map[normalizeLegacyTexturePath(texturePath)] || null;
    };
  }

  /**
   * 递归读取目录里的文本配置文件。
   */
  async function readTextFilesRecursive(directory, basePath) {
    const files = [];
    try {
      for await (const pair of directory.entries()) {
        const name = pair[0];
        const handle = pair[1];
        const currentPath = basePath ? basePath + "/" + name : name;
        if (handle.kind === "directory") {
          const childFiles = await readTextFilesRecursive(handle, currentPath);
          files.push.apply(files, childFiles);
          continue;
        }
        if (handle.kind === "file" && name.toLowerCase().endsWith(".yml")) {
          const text = await readFileHandleText(handle);
          if (text !== null) {
            files.push({ path: currentPath, text: text });
          }
        }
      }
    } catch (error) {
      return files;
    }
    return files;
  }

  /**
   * 读取文件句柄文本，文件失效时返回 null。
   */
  async function readFileHandleText(handle) {
    try {
      const file = await handle.getFile();
      return file.text();
    } catch (error) {
      return null;
    }
  }

  /**
   * 读取可选文本文件。
   */
  async function readOptionalTextFile(root, pathParts) {
    try {
      const fileHandle = await getFileHandle(root, pathParts);
      const file = await fileHandle.getFile();
      return file.text();
    } catch (error) {
      return "";
    }
  }

  /**
   * 读取旧资源包里的 PNG 文件。
   */
  async function readLegacyPngFile(resourceDirectory, texturePath, directoryCache) {
    const normalized = normalizeLegacyTexturePath(texturePath);
    if (!normalized) {
      return null;
    }
    try {
      const parts = normalized.split("/").filter(function (part) {
        return part !== "";
      });
      const baseName = parts.pop();
      if (!baseName) {
        return null;
      }
      const directory = await getCachedDirectoryHandle(resourceDirectory, parts, directoryCache);
      const fileHandle = await directory.getFileHandle(baseName + ".png", { create: false });
      return fileHandle.getFile();
    } catch (error) {
      return null;
    }
  }

  /**
   * 替换指定物品的贴图文件。
   */
  async function applyTextureFileToItem(item, file) {
    const currentBase = item.textureName.replace(/\.png$/i, "");
    const baseName = sanitizeTextureBaseName(file.name.replace(/\.png$/i, "")) || currentBase || "1";
    const textureHash = await calculateTextureHash(file);
    revokeItemUrl(item);
    item.file = file;
    item.objectUrl = URL.createObjectURL(file);
    item.textureHash = textureHash;
    item.textureName = baseName + ".png";
  }

  /**
   * 创建一条物品记录。
   */
  async function createItemRecord(file) {
    const itemIndex = await getNextItemNumber();
    const textureIndex = await getNextTextureNumber(DEFAULT_FOLDER);
    const baseName = file == null ? String(textureIndex) : sanitizeTextureBaseName(file.name.replace(/\.png$/i, "")) || String(textureIndex);
    const identifier = DEFAULT_NAMESPACE + ":item_" + itemIndex;
    const textureHash = await calculateTextureHash(file);
    return {
      id: createId(),
      file: file,
      objectUrl: file == null ? "" : URL.createObjectURL(file),
      textureHash: textureHash,
      displayName: "测试物品item_" + itemIndex,
      folderName: DEFAULT_FOLDER,
      textureName: baseName + ".png",
      identifier: identifier,
      javaIdentifier: "paper"
    };
  }

  /**
   * 生成页面内唯一 ID。
   */
  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "item_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  }

  /**
   * 获取下一次默认 identifier 编号。
   */
  async function getNextItemNumber() {
    const localMax = getMaxDefaultItemNumber(state.items.map(function (item) {
      return item.identifier;
    }));
    const componentMax = await getComponentMaxItemNumber();
    const maxNumber = Math.max(localMax, componentMax);
    return maxNumber + 1;
  }

  /**
   * 读取组件目录里已有 ecore:item_N 的最大编号。
   */
  async function getComponentMaxItemNumber() {
    if (state.componentDirectory == null) {
      return 0;
    }
    if (state.componentItemMaxLoaded) {
      return state.componentItemMaxNumber;
    }
    const maxNumber = await getComponentMaxItemNumberFromDirectory(state.componentDirectory);
    state.componentItemMaxNumber = maxNumber;
    state.componentItemMaxLoaded = true;
    return maxNumber;
  }

  /**
   * 从指定组件目录扫描已有 ecore:item_N 的最大编号。
   */
  async function getComponentMaxItemNumberFromDirectory(componentDirectory) {
    if (componentDirectory == null) {
      return 0;
    }
    const identifiers = [];
    const itemTexture = await readExistingItemTextureJson(componentDirectory);
    if (itemTexture != null && typeof itemTexture === "object" && itemTexture.texture_data != null) {
      identifiers.push.apply(identifiers, Object.keys(itemTexture.texture_data));
    }
    const behaviorDirectory = await getOptionalDirectoryHandle(componentDirectory, [
      "behavior_packs",
      "easyCoreBehavior",
      "netease_items_beh"
    ]);
    const resourceDirectory = await getOptionalDirectoryHandle(componentDirectory, [
      "resource_packs",
      "easyCoreResource",
      "netease_items_res"
    ]);
    if (behaviorDirectory != null) {
      identifiers.push.apply(identifiers, await readJsonIdentifiersRecursive(behaviorDirectory));
    }
    if (resourceDirectory != null) {
      identifiers.push.apply(identifiers, await readJsonIdentifiersRecursive(resourceDirectory));
    }
    return getMaxDefaultItemNumber(identifiers);
  }

  /**
   * 递归读取 JSON 文件里的 identifier 字段。
   */
  async function readJsonIdentifiersRecursive(directory) {
    const identifiers = [];
    try {
      for await (const pair of directory.entries()) {
        const name = pair[0];
        const handle = pair[1];
        if (handle.kind === "directory") {
          identifiers.push.apply(identifiers, await readJsonIdentifiersRecursive(handle));
          continue;
        }
        if (handle.kind === "file" && name.toLowerCase().endsWith(".json")) {
          const text = await readFileHandleText(handle);
          if (text !== null) {
            identifiers.push.apply(identifiers, parseJsonIdentifiers(text));
          }
        }
      }
    } catch (error) {
      return identifiers;
    }
    return identifiers;
  }

  /**
   * 从 JSON 文本提取 identifier 字段。
   */
  function parseJsonIdentifiers(text) {
    try {
      const parsed = JSON.parse(text);
      const identifiers = [];
      collectIdentifierValues(parsed, identifiers);
      return identifiers;
    } catch (error) {
      return [];
    }
  }

  /**
   * 递归收集对象里的 identifier 字符串。
   */
  function collectIdentifierValues(node, identifiers) {
    if (Array.isArray(node)) {
      node.forEach(function (item) {
        collectIdentifierValues(item, identifiers);
      });
      return;
    }
    if (node == null || typeof node !== "object") {
      return;
    }
    Object.keys(node).forEach(function (key) {
      const value = node[key];
      if (key === "identifier" && typeof value === "string") {
        identifiers.push(value);
      }
      collectIdentifierValues(value, identifiers);
    });
  }

  /**
   * 获取 identifier 列表中默认 ecore:item_N 的最大编号。
   */
  function getMaxDefaultItemNumber(identifiers) {
    return identifiers.reduce(function (max, identifier) {
      return Math.max(max, getDefaultItemNumber(identifier));
    }, 0);
  }

  /**
   * 从默认 identifier 中提取编号。
   */
  function getDefaultItemNumber(identifier) {
    const normalized = normalizeIdentifier(identifier);
    const prefix = DEFAULT_NAMESPACE + ":item_";
    if (normalized.indexOf(prefix) !== 0) {
      return 0;
    }
    const numberPart = normalized.slice(prefix.length);
    if (!/^\d+$/.test(numberPart)) {
      return 0;
    }
    return Number(numberPart);
  }

  /**
   * 获取指定贴图文件夹下一次可用的数字贴图名。
   */
  async function getNextTextureNumber(folderName) {
    const localMax = state.items.reduce(function (max, item) {
      const base = item.textureName.replace(/\.png$/i, "");
      const value = /^\d+$/.test(base) ? Number(base) : 0;
      return Math.max(max, value);
    }, 0);
    if (state.componentDirectory == null) {
      return localMax + 1;
    }
    try {
      const folder = await getDirectoryHandle(state.componentDirectory, [
        "resource_packs",
        "easyCoreResource",
        "textures",
        "items"
      ].concat(getFolderPathParts(folderName)));
      if (folder == null) {
        return localMax + 1;
      }
      let max = localMax;
      for await (const entry of folder.values()) {
        if (entry.kind !== "file") {
          continue;
        }
        const match = entry.name.match(/^(\d+)\.png$/i);
        if (match != null) {
          max = Math.max(max, Number(match[1]));
        }
      }
      return max + 1;
    } catch (error) {
      return localMax + 1;
    }
  }

  /**
   * 渲染全部页面区域。
   */
  function renderAll() {
    renderAccessState();
    renderFolderStatus();
    renderItemList();
    renderEditor();
    renderMaterialGrid();
    renderOutput();
    renderDownloadList();
    renderTextureBrowser();
  }

  /**
   * 渲染组件目录状态。
   */
  function renderFolderStatus() {
    if (state.componentDirectoryName) {
      elements.folderStatus.textContent = "已选择只读目录：" + state.componentDirectoryName
        + "（已载入 " + state.componentTextureFileCount + " 张现有贴图，" + state.componentTextureItems.length + " 个生效贴图物品）";
      return;
    }
    elements.folderStatus.textContent = typeof window.showDirectoryPicker === "function"
      ? "请先选择 easycore组件后进入编辑器"
      : "当前浏览器不支持目录读取，无法进入编辑器";
  }

  /**
   * 判断编辑器是否已允许进入。
   */
  function isEditorUnlocked() {
    return state.componentDirectory != null;
  }

  /**
   * 要求先选择组件目录才能继续操作。
   */
  function requireEditorUnlocked() {
    if (isEditorUnlocked()) {
      return true;
    }
    elements.folderStatus.textContent = "请先选择 easycore组件后进入编辑器";
    setStatus("请先选择 easycore组件后再操作。", "warn");
    return false;
  }

  /**
   * 渲染编辑器入口锁定状态。
   */
  function renderAccessState() {
    const unlocked = isEditorUnlocked();
    elements.entryGate.hidden = unlocked;
    elements.workspace.hidden = !unlocked || state.viewMode !== "editor";
    elements.textureBrowser.hidden = !unlocked || state.viewMode !== "browser";
    elements.textureBrowserBtn.disabled = !unlocked;
    elements.importLegacyBtn.disabled = !unlocked;
    elements.addBlankBtn.disabled = !unlocked;
    elements.addSampleBtn.disabled = !unlocked;
    elements.exportBtn.disabled = !unlocked;
    elements.copyNeigeBtn.disabled = !unlocked;
    elements.fileInput.disabled = !unlocked;
    elements.dropZone.classList.toggle("locked", !unlocked);
    document.querySelectorAll("[data-output-tab]").forEach(function (button) {
      button.disabled = !unlocked;
    });
  }

  /**
   * 渲染组件贴图阅览界面。
   */
  function renderTextureBrowser() {
    elements.browserTextureCount.textContent = String(state.componentTextureItems.length);
    renderTextureBrowserGrid();
    renderTextureBrowserDetail();
  }

  /**
   * 渲染组件贴图网格。
   */
  function renderTextureBrowserGrid() {
    if (!state.componentTextureGridDirty) {
      updateTextureBrowserActiveTile();
      return;
    }
    state.componentTextureGridDirty = false;
    state.componentTextureTileMap = new Map();
    elements.browserTextureGrid.innerHTML = "";
    if (!isEditorUnlocked()) {
      const locked = document.createElement("div");
      locked.className = "browser-grid-empty";
      locked.textContent = "请先选择 easycore组件";
      elements.browserTextureGrid.appendChild(locked);
      return;
    }
    if (state.componentTextureItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "browser-grid-empty";
      empty.textContent = "没有找到能从 netease_items_beh 反查到 java_identifier 的贴图物品";
      elements.browserTextureGrid.appendChild(empty);
      return;
    }
    state.componentTextureItems.forEach(function (item) {
      elements.browserTextureGrid.appendChild(createTextureBrowserTile(item));
    });
    updateTextureBrowserActiveTile();
  }

  /**
   * 创建组件贴图网格按钮。
   */
  function createTextureBrowserTile(item) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "browser-texture-tile" + (item.texturePath === state.selectedComponentTexturePath ? " active" : "");
    tile.title = item.texturePath;
    tile.addEventListener("click", function () {
      selectComponentTextureItem(item.texturePath);
    });
    state.componentTextureTileMap.set(item.texturePath, tile);

    const imageWrap = document.createElement("span");
    imageWrap.className = "browser-texture-thumb";
    const image = document.createElement("img");
    image.src = item.objectUrl;
    image.alt = "";
    imageWrap.appendChild(image);

    const text = document.createElement("span");
    text.className = "browser-texture-text";
    const name = document.createElement("span");
    name.className = "browser-texture-name";
    name.textContent = item.fileName;
    const identifier = document.createElement("span");
    identifier.className = "browser-texture-identifier";
    identifier.textContent = item.identifier || "未绑定 identifier";
    text.appendChild(name);
    text.appendChild(identifier);

    tile.appendChild(imageWrap);
    tile.appendChild(text);
    return tile;
  }

  /**
   * 选择组件贴图，只刷新选中态和详情。
   */
  function selectComponentTextureItem(texturePath) {
    const previousPath = state.selectedComponentTexturePath;
    state.selectedComponentTexturePath = texturePath;
    updateTextureBrowserTileClass(previousPath, false);
    updateTextureBrowserTileClass(texturePath, true);
    renderTextureBrowserDetail();
  }

  /**
   * 根据当前选择同步网格选中态。
   */
  function updateTextureBrowserActiveTile() {
    state.componentTextureTileMap.forEach(function (tile, texturePath) {
      tile.classList.toggle("active", texturePath === state.selectedComponentTexturePath);
    });
  }

  /**
   * 更新单个贴图按钮的选中态。
   */
  function updateTextureBrowserTileClass(texturePath, active) {
    const tile = state.componentTextureTileMap.get(texturePath);
    if (tile == null) {
      return;
    }
    tile.classList.toggle("active", active);
  }

  /**
   * 渲染组件贴图详情。
   */
  function renderTextureBrowserDetail() {
    const item = getSelectedComponentTextureItem();
    elements.browserDetail.hidden = item == null;
    elements.browserEmpty.hidden = item != null;
    if (item == null) {
      elements.browserEmpty.textContent = isEditorUnlocked() ? "请选择一个生效贴图物品" : "请先选择 easycore组件";
      elements.copyBrowserNeigeBtn.disabled = true;
      return;
    }
    elements.browserPreviewImage.src = item.objectUrl;
    elements.browserTexturePath.textContent = item.texturePath;
    elements.browserIdentifier.textContent = item.identifier || "未找到";
    elements.browserJavaIdentifier.textContent = item.javaIdentifier || "未找到";
    elements.browserMaterial.textContent = item.material || "未找到";
    elements.browserNeigePreview.textContent = item.neigeYaml;
    elements.copyBrowserNeigeBtn.disabled = !isBrowserNeigeCopyable(item);
  }

  /**
   * 渲染物品列表。
   */
  function renderItemList() {
    elements.itemCount.textContent = String(state.items.length);
    elements.itemList.innerHTML = "";
    if (!isEditorUnlocked()) {
      const locked = document.createElement("div");
      locked.className = "empty-state";
      locked.textContent = "请先选择 easycore组件";
      elements.itemList.appendChild(locked);
      return;
    }
    state.items.forEach(function (item) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "item-card" + (item.id === state.selectedId ? " active" : "");
      card.title = "点击编辑：" + (item.displayName || item.identifier);
      card.addEventListener("click", function () {
        state.selectedId = item.id;
        renderAll();
      });

      const thumb = document.createElement("div");
      thumb.className = "item-thumb" + (item.objectUrl ? "" : " empty");
      if (item.objectUrl) {
        const image = document.createElement("img");
        image.src = item.objectUrl;
        image.alt = "";
        thumb.appendChild(image);
      } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = "无图";
        thumb.appendChild(placeholder);
      }

      const body = document.createElement("span");
      const title = document.createElement("span");
      title.className = "item-title";
      title.textContent = item.displayName || item.identifier;
      const meta = document.createElement("span");
      meta.className = "item-meta";
      meta.textContent = item.identifier;
      body.appendChild(title);
      body.appendChild(meta);
      card.appendChild(thumb);
      card.appendChild(body);
      elements.itemList.appendChild(card);
    });
  }

  /**
   * 渲染当前选中物品的编辑表单。
   */
  function renderEditor() {
    const item = getSelectedItem();
    if (!isEditorUnlocked()) {
      elements.itemForm.hidden = true;
      elements.emptyEditor.hidden = false;
      elements.emptyEditor.textContent = "请先选择 easycore组件后进入编辑器";
      elements.removeItemBtn.disabled = true;
      return;
    }
    elements.itemForm.hidden = item == null;
    elements.emptyEditor.hidden = item != null;
    elements.removeItemBtn.disabled = item == null;
    if (item == null) {
      elements.emptyEditor.textContent = "添加物品后开始编辑";
      return;
    }
    if (elements.previewImage.parentElement != null) {
      elements.previewImage.parentElement.classList.toggle("empty", !item.objectUrl);
      elements.previewImage.parentElement.classList.toggle("has-image", Boolean(item.objectUrl));
    }
    if (item.objectUrl) {
      elements.previewImage.hidden = false;
      elements.previewImage.src = item.objectUrl;
    } else {
      elements.previewImage.hidden = true;
      elements.previewImage.removeAttribute("src");
    }
    elements.displayNameInput.value = item.displayName;
    elements.folderInput.value = item.folderName;
    elements.textureNameInput.value = item.textureName;
    elements.identifierInput.value = item.identifier;
    elements.javaIdentifierInput.value = item.javaIdentifier;
  }

  /**
   * 渲染 java_identifier 选择网格。
   */
  function renderMaterialGrid() {
    const item = getSelectedItem();
    const materials = getFilteredMaterials();
    elements.materialGrid.innerHTML = "";
    if (!isEditorUnlocked()) {
      const locked = document.createElement("div");
      locked.className = "material-empty";
      locked.textContent = "请先选择 easycore组件";
      elements.materialGrid.appendChild(locked);
      return;
    }
    if (materials.length === 0) {
      const empty = document.createElement("div");
      empty.className = "material-empty";
      empty.textContent = "没有匹配的 java_identifier";
      elements.materialGrid.appendChild(empty);
      return;
    }
    materials.forEach(function (entry) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "material-tile" + (item != null && item.javaIdentifier === entry.name ? " active" : "");
      tile.title = "点击选择 " + entry.name + "，对应 material " + entry.material;
      tile.addEventListener("click", function () {
        if (item == null) {
          return;
        }
        item.javaIdentifier = entry.name;
        elements.javaIdentifierInput.value = entry.name;
        renderMaterialGrid();
        renderOutput();
      });

      const icon = createMaterialIcon(entry);
      const text = document.createElement("span");
      text.className = "material-text";
      const name = document.createElement("span");
      name.className = "material-name";
      name.textContent = entry.name;
      const id = document.createElement("span");
      id.className = "material-id";
      id.textContent = "material " + entry.material;
      text.appendChild(name);
      text.appendChild(id);
      tile.appendChild(icon);
      tile.appendChild(text);
      elements.materialGrid.appendChild(tile);
    });
  }

  /**
   * 渲染输出预览。
   */
  function renderOutput() {
    if (!isEditorUnlocked()) {
      elements.validationBox.innerHTML = '<div class="warn">请先选择 easycore组件后进入编辑器。</div>';
      elements.outputPreview.textContent = "";
      return;
    }
    const result = buildExportPlan(null);
    renderValidation(result);
    renderCopyOutputButton();
    elements.outputPreview.textContent = getOutputText(result);
  }

  /**
   * 根据当前页签获取输出预览文本。
   */
  function getOutputText(result) {
    if (state.outputTab === "texture") {
      return result.itemTextureJson;
    }
    if (state.outputTab === "files") {
      return result.files.map(function (file) {
        return file.path;
      }).join("\n");
    }
    return result.neigeYaml;
  }

  /**
   * 根据当前页签获取复制对象名称。
   */
  function getOutputCopyName() {
    if (state.outputTab === "texture") {
      return "item_texture";
    }
    if (state.outputTab === "files") {
      return "文件列表";
    }
    return "NeigeItems";
  }

  /**
   * 渲染复制当前输出按钮的文案。
   */
  function renderCopyOutputButton() {
    const copyName = getOutputCopyName();
    elements.copyNeigeBtn.textContent = "复制 " + copyName;
    elements.copyNeigeBtn.title = "复制当前 " + copyName + " 输出文本";
  }

  /**
   * 渲染校验结果。
   */
  function renderValidation(result) {
    if (result.errors.length > 0) {
      elements.validationBox.innerHTML = result.errors.map(function (message) {
        return '<div class="error">' + escapeHtml(message) + "</div>";
      }).join("");
      return;
    }
    if (result.warnings.length > 0) {
      elements.validationBox.innerHTML = result.warnings.map(function (message) {
        return '<div class="warn">' + escapeHtml(message) + "</div>";
      }).join("");
      return;
    }
    elements.validationBox.innerHTML = '<div class="ok">配置有效。</div>';
  }

  /**
   * 渲染下载文件列表。
   */
  function renderDownloadList() {
    revokeDownloadUrls();
    elements.downloadList.innerHTML = "";
    if (state.generatedArchive != null) {
      const archiveLink = document.createElement("a");
      const archiveUrl = URL.createObjectURL(state.generatedArchive.blob);
      state.downloadUrls.push(archiveUrl);
      archiveLink.href = archiveUrl;
      archiveLink.download = state.generatedArchive.fileName;
      archiveLink.className = "archive-download";
      archiveLink.title = "下载全部导出文件组成的 ZIP 压缩包";
      archiveLink.textContent = "下载 ZIP：" + state.generatedArchive.fileName;
      elements.downloadList.appendChild(archiveLink);
    }
    state.generatedFiles.forEach(function (file) {
      const anchor = document.createElement("a");
      const url = URL.createObjectURL(file.blob);
      state.downloadUrls.push(url);
      anchor.href = url;
      anchor.download = file.downloadName;
      anchor.title = "单文件下载：" + file.path;
      anchor.textContent = "单文件：" + file.path;
      elements.downloadList.appendChild(anchor);
    });
  }

  /**
   * 构建导出计划。
   */
  function buildExportPlan(existingItemTexture) {
    const errors = [];
    const warnings = [];
    const textureData = existingItemTexture == null ? {} : cloneTextureData(existingItemTexture);
    const files = [];
    const neigeEntries = [];
    const normalizedItems = state.items.map(function (item, index) {
      return normalizeExportItem(item, index + 1);
    });
    const exportItems = applyDuplicateTextureSharing(normalizedItems, warnings);
    const seenIdentifiers = new Set();
    const writtenTexturePaths = new Map();
    const duplicateTextureCount = exportItems.filter(function (item) {
      return item.sharedTexture;
    }).length;
    const componentTextureReuseCount = exportItems.filter(function (item) {
      return item.usesExistingComponentTexture;
    }).length;

    if (state.items.length === 0) {
      errors.push("至少需要一个物品。");
    }

    if (duplicateTextureCount > 0) {
      warnings.push("发现 " + duplicateTextureCount + " 个像素重复贴图，已复用贴图路径，物品配置仍会分别导出。");
    }
    if (componentTextureReuseCount > 0) {
      warnings.push("发现 " + componentTextureReuseCount + " 个物品与组件已有 PNG 像素一致，已复用组件内贴图路径。");
    }

    exportItems.forEach(function (normalized) {
      if (!isValidIdentifier(normalized.identifier)) {
        errors.push(normalized.displayName + " 的 identifier 格式无效。");
      }
      if (normalized.writeDefinition && seenIdentifiers.has(normalized.identifier)) {
        errors.push(normalized.identifier + " 重复。");
      }
      if (normalized.writeDefinition) {
        seenIdentifiers.add(normalized.identifier);
      }
      if (!normalized.file && !normalized.usesExistingComponentTexture && !normalized.sharedTexture) {
        warnings.push(normalized.displayName + " 没有贴图 PNG。");
      }
      if (normalized.material == null) {
        errors.push(normalized.javaIdentifier + " 没有 material 映射。");
      }

      textureData[normalized.identifier] = {
        textures: normalized.texturePath
      };

      if (normalized.writeDefinition) {
        files.push(makeTextFile(
          makeEasyCoreExportPath(["behavior_packs", "easyCoreBehavior", "netease_items_beh", normalized.fileBase + ".json"]),
          JSON.stringify(makeBehaviorJson(normalized), null, 2)
        ));
        files.push(makeTextFile(
          makeEasyCoreExportPath(["resource_packs", "easyCoreResource", "netease_items_res", normalized.fileBase + ".json"]),
          JSON.stringify(makeResourceJson(normalized), null, 2)
        ));
      }
      if (normalized.file && !writtenTexturePaths.has(normalized.texturePath)) {
        writtenTexturePaths.set(normalized.texturePath, normalized.textureHash || "");
        files.push(makeBlobFile(
          makeEasyCoreExportPath(["resource_packs", "easyCoreResource", "textures", "items"].concat(normalized.folderPathParts, [normalized.textureFileName])),
          normalized.file,
          normalized.textureFileName
        ));
      } else if (normalized.file && writtenTexturePaths.get(normalized.texturePath) !== (normalized.textureHash || "")) {
        warnings.push(normalized.texturePath + " 路径重复但贴图像素不同，导出包保留首次写入的 PNG。");
      }
      neigeEntries.push(makeNeigeEntry(normalized));
    });

    const itemTextureJson = JSON.stringify({
      resource_pack_name: "vanilla",
      texture_data: textureData
    }, null, 2);
    files.push(makeTextFile(
      makeEasyCoreExportPath(["resource_packs", "easyCoreResource", "textures", "item_texture.json"]),
      itemTextureJson
    ));

    const neigeYaml = neigeEntries.join("\n");
    files.push(makeTextFile(["generated", "NeigeItems示例.yml"], neigeYaml));

    return {
      errors: errors,
      warnings: warnings,
      files: files,
      itemTextureJson: itemTextureJson,
      neigeYaml: neigeYaml
    };
  }

  /**
   * 给 EasyCore 导出文件追加 generated/easycore 根目录。
   */
  function makeEasyCoreExportPath(pathParts) {
    return EASYCORE_EXPORT_ROOT.concat(pathParts);
  }

  /**
   * 读取已有 item_texture 后构建导出计划。
   */
  async function buildExportPlanWithExistingTexture() {
    const existing = await readExistingItemTextureJson();
    return buildExportPlan(existing);
  }

  /**
   * 读取组件资源包里已有的 textures/items PNG 索引。
   */
  async function loadComponentTextureIndex(componentDirectory) {
    return loadComponentTextureBundle(componentDirectory, false);
  }

  /**
   * 读取组件贴图索引，按需生成阅览器贴图记录。
   */
  async function loadComponentTextureBundle(componentDirectory, includeBrowserItems) {
    const result = {
      hashes: new Map(),
      fileCount: 0,
      warnings: [],
      browserItems: []
    };
    const itemsDirectory = await getOptionalDirectoryHandle(componentDirectory, [
      "resource_packs",
      "easyCoreResource",
      "textures",
      "items"
    ]);
    if (itemsDirectory == null) {
      result.warnings.push("组件目录未找到 resource_packs/easyCoreResource/textures/items。");
      return result;
    }

    const identifierMap = await readExistingTextureIdentifierMap(componentDirectory);
    const javaIdentifierMap = includeBrowserItems ? await readBehaviorJavaIdentifierMap(componentDirectory) : new Map();
    const pngEntries = await readPngEntriesRecursive(itemsDirectory, []);
    for (const entry of pngEntries) {
      const file = await entry.handle.getFile();
      const textureHash = await calculateTextureHash(file);
      if (!textureHash) {
        result.warnings.push(entry.relativeParts.join("/") + " 贴图哈希计算失败，已跳过。");
        continue;
      }
      addComponentTextureRecord(result.hashes, makeComponentTextureRecord(entry.relativeParts, textureHash, identifierMap));
      if (includeBrowserItems) {
        const browserItem = makeComponentTextureBrowserItem(entry.relativeParts, file, identifierMap, javaIdentifierMap);
        if (browserItem != null) {
          result.browserItems.push(browserItem);
        }
      }
      result.fileCount += 1;
    }
    result.browserItems.sort(compareComponentTextureItems);
    return result;
  }

  /**
   * 创建组件贴图阅览器里的单张贴图记录。
   */
  function makeComponentTextureBrowserItem(relativeParts, file, identifierMap, javaIdentifierMap) {
    const texturePath = getTexturePathFromRelativeParts(relativeParts);
    const identifier = identifierMap.get(texturePath) || "";
    const javaIdentifier = identifier ? javaIdentifierMap.get(identifier) || "" : "";
    if (!javaIdentifier) {
      return null;
    }
    const material = javaIdentifier ? getMaterialMap()[javaIdentifier] : null;
    return {
      objectUrl: URL.createObjectURL(file),
      texturePath: texturePath,
      relativePath: relativeParts.join("/"),
      fileName: relativeParts.length > 0 ? relativeParts[relativeParts.length - 1] : file.name,
      identifier: identifier,
      javaIdentifier: javaIdentifier,
      material: material == null ? "" : String(material),
      neigeYaml: makeBrowserNeigeYaml(identifier, javaIdentifier, material)
    };
  }

  /**
   * 把 textures/items 下的相对路径转为 item_texture 路径。
   */
  function getTexturePathFromRelativeParts(relativeParts) {
    const pathParts = relativeParts.slice();
    const fileName = pathParts.pop() || "1.png";
    const textureBase = fileName.replace(/\.png$/i, "");
    return normalizeLegacyTexturePath(["textures", "items"].concat(pathParts, [textureBase]).join("/"));
  }

  /**
   * 组件贴图按路径稳定排序。
   */
  function compareComponentTextureItems(left, right) {
    return left.texturePath.localeCompare(right.texturePath);
  }

  /**
   * 为阅览器生成单条 NeigeItems 示例。
   */
  function makeBrowserNeigeYaml(identifier, javaIdentifier, material) {
    if (!identifier) {
      return "无法生成 NeigeItems：item_texture.json 中没有找到这张贴图对应的 identifier。";
    }
    if (!javaIdentifier) {
      return "无法生成 NeigeItems：netease_items_beh 中没有找到 " + identifier + " 对应的 java_identifier。";
    }
    if (material == null) {
      return "无法生成 NeigeItems：" + javaIdentifier + " 没有 material 映射。";
    }
    return makeNeigeEntry({
      displayName: identifierToFileBase(identifier),
      material: material,
      identifier: identifier
    });
  }

  /**
   * 读取 item_texture.json 并建立贴图路径到 identifier 的映射。
   */
  async function readExistingTextureIdentifierMap(componentDirectory) {
    const itemTexture = await readExistingItemTextureJson(componentDirectory);
    const source = itemTexture == null || typeof itemTexture !== "object" ? null : itemTexture.texture_data;
    const map = new Map();
    if (source == null || typeof source !== "object") {
      return map;
    }
    Object.keys(source).forEach(function (identifier) {
      const texturePath = getTexturePathFromTextureNode(source[identifier]);
      if (!texturePath || map.has(texturePath)) {
        return;
      }
      map.set(texturePath, normalizeIdentifier(identifier));
    });
    return map;
  }

  /**
   * 从行为包读取 identifier 到 java_identifier 的映射。
   */
  async function readBehaviorJavaIdentifierMap(componentDirectory) {
    const map = new Map();
    const behaviorDirectory = await getOptionalDirectoryHandle(componentDirectory, [
      "behavior_packs",
      "easyCoreBehavior",
      "netease_items_beh"
    ]);
    if (behaviorDirectory == null) {
      return map;
    }
    const files = await readJsonTextFilesRecursive(behaviorDirectory);
    files.forEach(function (file) {
      addBehaviorJavaIdentifierFromText(map, file.text);
    });
    return map;
  }

  /**
   * 递归读取目录中的 JSON 文本文件。
   */
  async function readJsonTextFilesRecursive(directory) {
    const files = [];
    try {
      for await (const pair of directory.entries()) {
        const name = pair[0];
        const handle = pair[1];
        if (handle.kind === "directory") {
          const childFiles = await readJsonTextFilesRecursive(handle);
          files.push.apply(files, childFiles);
          continue;
        }
        if (handle.kind === "file" && name.toLowerCase().endsWith(".json")) {
          const text = await readFileHandleText(handle);
          if (text !== null) {
            files.push({ name: name, text: text });
          }
        }
      }
    } catch (error) {
      return files;
    }
    return files;
  }

  /**
   * 从行为 JSON 文本里追加 java_identifier 映射。
   */
  function addBehaviorJavaIdentifierFromText(map, text) {
    try {
      const parsed = JSON.parse(text);
      const entries = [];
      collectBehaviorJavaIdentifierEntries(parsed, entries);
      entries.forEach(function (entry) {
        if (entry.identifier && entry.javaIdentifier && !map.has(entry.identifier)) {
          map.set(entry.identifier, entry.javaIdentifier);
        }
      });
    } catch (error) {
      return;
    }
  }

  /**
   * 递归收集行为 JSON 中的 identifier 和 java_identifier。
   */
  function collectBehaviorJavaIdentifierEntries(node, entries) {
    if (Array.isArray(node)) {
      node.forEach(function (item) {
        collectBehaviorJavaIdentifierEntries(item, entries);
      });
      return;
    }
    if (node == null || typeof node !== "object") {
      return;
    }
    const itemNode = node["minecraft:item"];
    if (itemNode != null && typeof itemNode === "object") {
      const identifier = getBehaviorItemIdentifier(itemNode);
      const javaIdentifier = normalizeJavaIdentifier(itemNode.java_identifier);
      if (identifier && javaIdentifier) {
        entries.push({
          identifier: identifier,
          javaIdentifier: javaIdentifier
        });
      }
    }
    Object.keys(node).forEach(function (key) {
      collectBehaviorJavaIdentifierEntries(node[key], entries);
    });
  }

  /**
   * 从 minecraft:item 节点读取 identifier。
   */
  function getBehaviorItemIdentifier(itemNode) {
    const description = itemNode.description;
    if (description == null || typeof description !== "object") {
      return "";
    }
    return normalizeIdentifier(description.identifier);
  }

  /**
   * 递归收集目录内全部 PNG 文件句柄。
   */
  async function readPngEntriesRecursive(directory, baseParts) {
    const files = [];
    for await (const pair of directory.entries()) {
      const name = pair[0];
      const handle = pair[1];
      const currentParts = baseParts.concat(name);
      if (handle.kind === "directory") {
        const childFiles = await readPngEntriesRecursive(handle, currentParts);
        files.push.apply(files, childFiles);
        continue;
      }
      if (handle.kind === "file" && name.toLowerCase().endsWith(".png")) {
        files.push({
          handle: handle,
          relativeParts: currentParts
        });
      }
    }
    return files;
  }

  /**
   * 创建组件已有贴图索引记录。
   */
  function makeComponentTextureRecord(relativeParts, textureHash, identifierMap) {
    const pathParts = relativeParts.slice();
    const fileName = pathParts.pop() || "1.png";
    const textureBase = fileName.replace(/\.png$/i, "");
    const texturePath = normalizeLegacyTexturePath(["textures", "items"].concat(pathParts, [textureBase]).join("/"));
    const textureInfo = getTextureInfoFromPath(texturePath);
    const identifier = identifierMap.get(texturePath) || "";
    return {
      source: "component",
      textureHash: textureHash,
      texturePath: texturePath,
      identifier: identifier,
      folderName: textureInfo.folderName,
      folderPathParts: getFolderPathParts(textureInfo.folderName),
      textureFileName: textureInfo.textureName,
      fileBase: identifier ? identifierToFileBase(identifier) : identifierToFileBase(textureBase),
      usesExistingComponentTexture: true
    };
  }

  /**
   * 写入组件贴图索引，同像素时优先保留能反查到 identifier 的记录。
   */
  function addComponentTextureRecord(hashMap, record) {
    if (!record.textureHash) {
      return;
    }
    const existing = hashMap.get(record.textureHash);
    if (existing == null || (!existing.identifier && record.identifier)) {
      hashMap.set(record.textureHash, record);
    }
  }

  /**
   * 对像素一致的贴图复用贴图路径，但保留每个物品的 identifier。
   */
  function applyDuplicateTextureSharing(items) {
    const textureHashMap = new Map(state.componentTextureHashes);
    return items.map(function (item) {
      if (!item.textureHash) {
        return item;
      }
      const existing = textureHashMap.get(item.textureHash);
      if (existing == null) {
        textureHashMap.set(item.textureHash, item);
        return item;
      }
      return makeItemUsingSharedTexture(item, existing);
    });
  }

  /**
   * 创建复用已有贴图路径的物品导出数据。
   */
  function makeItemUsingSharedTexture(item, existing) {
    return Object.assign({}, item, {
      folderName: existing.folderName,
      folderPathParts: existing.folderPathParts,
      textureFileName: existing.textureFileName,
      texturePath: existing.texturePath,
      file: existing.source === "component" || existing.usesExistingComponentTexture ? null : item.file,
      writeDefinition: true,
      sharedTexture: true,
      sharedFromIdentifier: existing.identifier || "",
      usesExistingComponentTexture: existing.source === "component" || Boolean(existing.usesExistingComponentTexture)
    });
  }

  /**
   * 标准化单个物品导出数据。
   */
  function normalizeExportItem(item, index) {
    const folderName = sanitizeFolderName(item.folderName) || DEFAULT_FOLDER;
    const textureFileName = sanitizeTextureFileName(item.textureName) || index + ".png";
    const textureBase = textureFileName.replace(/\.png$/i, "");
    const identifier = normalizeIdentifier(item.identifier) || DEFAULT_NAMESPACE + ":item_" + index;
    const javaIdentifier = item.javaIdentifier || "paper";
    return {
      displayName: item.displayName || "测试物品item_" + index,
      folderName: folderName,
      folderPathParts: getFolderPathParts(folderName),
      textureFileName: textureFileName,
      texturePath: "textures/items/" + folderName + "/" + textureBase,
      identifier: identifier,
      javaIdentifier: javaIdentifier,
      material: getMaterialMap()[javaIdentifier],
      fileBase: identifierToFileBase(identifier),
      file: item.file,
      textureHash: item.textureHash || "",
      writeDefinition: true,
      sharedTexture: false,
      sharedFromIdentifier: "",
      usesExistingComponentTexture: false
    };
  }

  /**
   * 生成行为包物品 JSON。
   */
  function makeBehaviorJson(item) {
    return {
      format_version: "1.10",
      "minecraft:item": {
        description: {
          identifier: item.identifier
        },
        java_identifier: item.javaIdentifier
      }
    };
  }

  /**
   * 生成资源包物品 JSON。
   */
  function makeResourceJson(item) {
    return {
      format_version: "1.10",
      "minecraft:item": {
        description: {
          identifier: item.identifier,
          category: "Items"
        },
        components: {
          "minecraft:icon": item.identifier
        }
      }
    };
  }

  /**
   * 生成单条 NeigeItems 配置。
   */
  function makeNeigeEntry(item) {
    return [
      yamlKey(item.displayName) + ":",
      "  material: " + item.material,
      "  nbt:",
      '    netease_identifier: "' + item.identifier + '"'
    ].join("\n") + "\n";
  }

  /**
   * 读取已有 item_texture.json。
   */
  async function readExistingItemTextureJson(componentDirectory) {
    const directoryRoot = componentDirectory || state.componentDirectory;
    if (directoryRoot == null) {
      return null;
    }
    try {
      const directory = await getDirectoryHandle(directoryRoot, [
        "resource_packs",
        "easyCoreResource",
        "textures"
      ]);
      if (directory == null) {
        return null;
      }
      const handle = await directory.getFileHandle("item_texture.json", { create: false });
      const file = await handle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  /**
   * 只读获取嵌套目录句柄。
   */
  async function getDirectoryHandle(root, pathParts) {
    let current = root;
    for (const part of pathParts) {
      current = await current.getDirectoryHandle(part, { create: false });
    }
    return current;
  }

  /**
   * 获取可选嵌套目录句柄。
   */
  async function getOptionalDirectoryHandle(root, pathParts) {
    try {
      return await getDirectoryHandle(root, pathParts);
    } catch (error) {
      return null;
    }
  }

  /**
   * 获取嵌套文件句柄。
   */
  async function getFileHandle(root, pathParts) {
    const directoryParts = pathParts.slice(0, -1);
    const fileName = pathParts[pathParts.length - 1];
    const directory = await getDirectoryHandle(root, directoryParts);
    return directory.getFileHandle(fileName, { create: false });
  }

  /**
   * 使用缓存获取嵌套目录句柄。
   */
  async function getCachedDirectoryHandle(root, pathParts, cache) {
    let current = root;
    let key = "";
    for (const part of pathParts) {
      key = key ? key + "/" + part : part;
      if (cache.has(key)) {
        current = cache.get(key);
        continue;
      }
      current = await current.getDirectoryHandle(part, { create: false });
      cache.set(key, current);
    }
    return current;
  }

  /**
   * 创建文本导出文件对象。
   */
  function makeTextFile(pathParts, text) {
    return makeBlobFile(pathParts, new Blob([text], { type: "text/plain;charset=utf-8" }), pathParts[pathParts.length - 1]);
  }

  /**
   * 创建 Blob 导出文件对象。
   */
  function makeBlobFile(pathParts, blob, downloadName) {
    return {
      pathParts: pathParts,
      path: pathParts.join("/"),
      blob: blob,
      downloadName: downloadName || pathParts[pathParts.length - 1]
    };
  }

  /**
   * 生成导出压缩包文件名。
   */
  function makeArchiveFileName() {
    const now = new Date();
    const date = [
      now.getFullYear(),
      padNumber(now.getMonth() + 1),
      padNumber(now.getDate())
    ].join("");
    const time = [
      padNumber(now.getHours()),
      padNumber(now.getMinutes()),
      padNumber(now.getSeconds())
    ].join("");
    return "EasyCore物品导出-" + date + "-" + time + ".zip";
  }

  /**
   * 补齐两位数字。
   */
  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  /**
   * 把导出文件列表打包为 ZIP Blob。
   */
  async function createZipBlob(files) {
    if (files.length > ZIP_MAX_ENTRIES) {
      throw new Error("导出文件过多，ZIP 条目数超过限制。");
    }
    const encoder = new TextEncoder();
    const dateTime = makeZipDateTime(new Date());
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const zipPath = normalizeZipPath(file.path);
      const nameBytes = encoder.encode(zipPath);
      const dataBuffer = await file.blob.arrayBuffer();
      const dataBytes = new Uint8Array(dataBuffer);
      const dataSize = dataBytes.byteLength;
      const crc = crc32(dataBytes);
      assertZipUint32(dataSize, zipPath + " 文件过大");
      assertZipUint32(offset, zipPath + " ZIP 偏移过大");

      const localHeader = makeZipLocalHeader(nameBytes, crc, dataSize, dateTime);
      const centralHeader = makeZipCentralHeader(nameBytes, crc, dataSize, offset, dateTime);
      localParts.push(localHeader, nameBytes, dataBuffer);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.byteLength + nameBytes.byteLength + dataSize;
    }

    const centralSize = centralParts.reduce(function (size, part) {
      return size + part.byteLength;
    }, 0);
    assertZipUint32(centralSize, "ZIP 中央目录过大");
    assertZipUint32(offset, "ZIP 内容过大");

    const endRecord = makeZipEndRecord(files.length, centralSize, offset);
    return new Blob(localParts.concat(centralParts, [endRecord]), { type: "application/zip" });
  }

  /**
   * 创建 ZIP 本地文件头。
   */
  function makeZipLocalHeader(nameBytes, crc, size, dateTime) {
    const header = new ArrayBuffer(30);
    const view = new DataView(header);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, ZIP_VERSION_NEEDED, true);
    view.setUint16(6, ZIP_UTF8_FLAG, true);
    view.setUint16(8, ZIP_STORE_METHOD, true);
    view.setUint16(10, dateTime.time, true);
    view.setUint16(12, dateTime.date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.byteLength, true);
    view.setUint16(28, 0, true);
    return new Uint8Array(header);
  }

  /**
   * 创建 ZIP 中央目录文件头。
   */
  function makeZipCentralHeader(nameBytes, crc, size, offset, dateTime) {
    const header = new ArrayBuffer(46);
    const view = new DataView(header);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, ZIP_VERSION_NEEDED, true);
    view.setUint16(6, ZIP_VERSION_NEEDED, true);
    view.setUint16(8, ZIP_UTF8_FLAG, true);
    view.setUint16(10, ZIP_STORE_METHOD, true);
    view.setUint16(12, dateTime.time, true);
    view.setUint16(14, dateTime.date, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.byteLength, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    return new Uint8Array(header);
  }

  /**
   * 创建 ZIP 结束记录。
   */
  function makeZipEndRecord(entryCount, centralSize, centralOffset) {
    const record = new ArrayBuffer(22);
    const view = new DataView(record);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, entryCount, true);
    view.setUint16(10, entryCount, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
    return new Uint8Array(record);
  }

  /**
   * 转成 ZIP 使用的 DOS 日期时间。
   */
  function makeZipDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
  }

  /**
   * 校验 ZIP32 数值范围。
   */
  function assertZipUint32(value, message) {
    if (value > ZIP_MAX_UINT32) {
      throw new Error(message);
    }
  }

  /**
   * 标准化 ZIP 内部路径。
   */
  function normalizeZipPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized) {
      throw new Error("导出文件路径为空。");
    }
    return normalized;
  }

  /**
   * 计算 CRC32 校验值。
   */
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[index]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /**
   * 创建 CRC32 查询表。
   */
  function createCrc32Table() {
    const table = new Uint32Array(256);
    for (let index = 0; index < table.length; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      table[index] = value >>> 0;
    }
    return table;
  }

  /**
   * 触发浏览器下载 Blob。
   */
  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  /**
   * 获取当前选中的物品。
   */
  function getSelectedItem() {
    return state.items.find(function (item) {
      return item.id === state.selectedId;
    }) || null;
  }

  /**
   * 获取当前选中的组件贴图记录。
   */
  function getSelectedComponentTextureItem() {
    return state.componentTextureItems.find(function (item) {
      return item.texturePath === state.selectedComponentTexturePath;
    }) || null;
  }

  /**
   * 判断阅览器 NeigeItems 示例是否可复制。
   */
  function isBrowserNeigeCopyable(item) {
    return Boolean(item.identifier && item.javaIdentifier && item.material);
  }

  /**
   * 获取 java_identifier 映射表。
   */
  function getMaterialMap() {
    return window.JAVA_IDENTIFIER_MAP || { paper: 339, ghast_tear: 370, wooden_sword: 268 };
  }

  /**
   * 获取 java_identifier 对应的本地贴图路径表。
   */
  function getTextureMap() {
    return window.JAVA_IDENTIFIER_TEXTURES || {};
  }

  /**
   * 获取过滤后的 java_identifier 列表。
   */
  function getFilteredMaterials() {
    const materialMap = getMaterialMap();
    const textureMap = getTextureMap();
    const entries = Object.keys(materialMap).filter(function (name) {
      return hasMaterialTexture(name, textureMap);
    }).map(function (name) {
      return { name: name, material: materialMap[name] };
    });
    entries.sort(function (left, right) {
      const leftCommon = COMMON_MATERIALS.indexOf(left.name);
      const rightCommon = COMMON_MATERIALS.indexOf(right.name);
      const leftRank = leftCommon === -1 ? 999 : leftCommon;
      const rightRank = rightCommon === -1 ? 999 : rightCommon;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.name.localeCompare(right.name);
    });
    return entries;
  }

  /**
   * 判断 java_identifier 是否有可渲染的材质贴图。
   */
  function hasMaterialTexture(name, textureMap) {
    return typeof textureMap[name] === "string" && textureMap[name] !== "";
  }

  /**
   * 创建 java_identifier 的材质图标。
   */
  function createMaterialIcon(entry) {
    const texturePath = getTextureMap()[entry.name];
    if (texturePath) {
      const icon = document.createElement("span");
      icon.className = "material-icon material-icon-image";
      icon.title = entry.name + " / material " + entry.material;

      const image = document.createElement("img");
      image.className = "material-image";
      image.src = texturePath;
      image.alt = "";
      image.addEventListener("error", function () {
        icon.replaceWith(createFallbackMaterialIcon(entry));
      });
      icon.appendChild(image);
      return icon;
    }
    return createFallbackMaterialIcon(entry);
  }

  /**
   * 创建没有 PNG 贴图时的兜底材质图标。
   */
  function createFallbackMaterialIcon(entry) {
    const icon = document.createElement("span");
    const iconType = getMaterialIconType(entry.name);
    const tone = getMaterialIconTone(entry.name);
    icon.className = "material-icon material-icon-" + iconType + " material-tone-" + tone;
    icon.title = entry.name + " / material " + entry.material;

    const mark = document.createElement("span");
    mark.className = "material-mark";
    mark.textContent = getMaterialIconLabel(entry.name);
    icon.appendChild(mark);
    return icon;
  }

  /**
   * 判断材质图标类型。
   */
  function getMaterialIconType(name) {
    const value = normalizeJavaIdentifier(name).replace(/_/g, "");
    if (value === "paper") {
      return "paper";
    }
    if (value.indexOf("ghasttear") !== -1 || value.indexOf("tear") !== -1) {
      return "tear";
    }
    if (value.indexOf("sword") !== -1) {
      return "sword";
    }
    if (value.indexOf("pickaxe") !== -1) {
      return "pickaxe";
    }
    if (value.indexOf("axe") !== -1) {
      return "axe";
    }
    if (value.indexOf("shovel") !== -1 || value.indexOf("spade") !== -1) {
      return "shovel";
    }
    if (value.indexOf("hoe") !== -1) {
      return "hoe";
    }
    if (value.indexOf("stick") !== -1) {
      return "stick";
    }
    if (value.indexOf("diamond") !== -1 || value.indexOf("emerald") !== -1 || value.indexOf("lapis") !== -1) {
      return "gem";
    }
    if (value.indexOf("helmet") !== -1 || value.indexOf("chestplate") !== -1 || value.indexOf("leggings") !== -1 || value.indexOf("boots") !== -1 || value.indexOf("armor") !== -1 || value.indexOf("barding") !== -1) {
      return "armor";
    }
    if (value.indexOf("ingot") !== -1 || value.indexOf("nugget") !== -1 || value.indexOf("brick") !== -1) {
      return "ingot";
    }
    if (value.indexOf("disc") !== -1 || value.indexOf("record") !== -1) {
      return "disc";
    }
    if (value.indexOf("door") !== -1 || value.indexOf("trapdoor") !== -1) {
      return "door";
    }
    if (value.indexOf("egg") !== -1) {
      return "egg";
    }
    if (value.indexOf("apple") !== -1 || value.indexOf("bread") !== -1 || value.indexOf("beef") !== -1 || value.indexOf("chicken") !== -1 || value.indexOf("fish") !== -1 || value.indexOf("pork") !== -1 || value.indexOf("carrot") !== -1 || value.indexOf("potato") !== -1) {
      return "food";
    }
    if (value.indexOf("potion") !== -1 || value.indexOf("bottle") !== -1 || value.indexOf("bucket") !== -1) {
      return "bottle";
    }
    return "block";
  }

  /**
   * 判断材质图标的颜色倾向。
   */
  function getMaterialIconTone(name) {
    const value = normalizeJavaIdentifier(name).replace(/_/g, "");
    if (value.indexOf("diamond") !== -1) {
      return "diamond";
    }
    if (value.indexOf("emerald") !== -1) {
      return "emerald";
    }
    if (value.indexOf("gold") !== -1) {
      return "gold";
    }
    if (value.indexOf("iron") !== -1) {
      return "iron";
    }
    if (value.indexOf("wood") !== -1 || value.indexOf("stick") !== -1 || value.indexOf("acacia") !== -1 || value.indexOf("birch") !== -1 || value.indexOf("spruce") !== -1 || value.indexOf("jungle") !== -1 || value.indexOf("oak") !== -1) {
      return "wood";
    }
    if (value.indexOf("red") !== -1) {
      return "red";
    }
    if (value.indexOf("blue") !== -1 || value.indexOf("lapis") !== -1) {
      return "blue";
    }
    if (value.indexOf("green") !== -1 || value.indexOf("lime") !== -1) {
      return "green";
    }
    return "neutral";
  }

  /**
   * 获取未知材质图标的缩写。
   */
  function getMaterialIconLabel(name) {
    const normalized = normalizeJavaIdentifier(name).replace(/_/g, "");
    if (normalized.length <= 2) {
      return normalized.toUpperCase();
    }
    return normalized.slice(0, 2).toUpperCase();
  }

  /**
   * 校验 identifier 格式。
   */
  function isValidIdentifier(identifier) {
    return /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(identifier);
  }

  /**
   * 标准化 identifier。
   */
  function normalizeIdentifier(value) {
    return String(value || "").trim().toLowerCase().replace(/\\/g, "/");
  }

  /**
   * 标准化 java_identifier。
   */
  function normalizeJavaIdentifier(value) {
    return String(value || "").trim().toLowerCase();
  }

  /**
   * 标准化贴图文件夹名。
   */
  function sanitizeFolderName(value) {
    const parts = String(value || "").replace(/\\/g, "/").split("/").map(function (part) {
      return part.replace(/[^A-Za-z0-9_-]/g, "");
    }).filter(function (part) {
      return part !== "";
    });
    return parts.join("/") || DEFAULT_FOLDER;
  }

  /**
   * 获取贴图文件夹路径片段。
   */
  function getFolderPathParts(value) {
    return sanitizeFolderName(value).split("/").filter(function (part) {
      return part !== "";
    });
  }

  /**
   * 标准化贴图文件名。
   */
  function sanitizeTextureFileName(value) {
    const base = sanitizeTextureBaseName(String(value || "").replace(/\.png$/i, ""));
    return (base || "1") + ".png";
  }

  /**
   * 标准化贴图基础文件名。
   */
  function sanitizeTextureBaseName(value) {
    return String(value || "").replace(/[^A-Za-z0-9_-]/g, "");
  }

  /**
   * 把 identifier 转成文件名。
   */
  function identifierToFileBase(identifier) {
    return identifier.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "item";
  }

  /**
   * 生成 YAML 键名。
   */
  function yamlKey(value) {
    return String(value || "未命名物品").replace(/\r?\n/g, " ").trim() || "未命名物品";
  }

  /**
   * 克隆已有 item_texture 的 texture_data。
   */
  function cloneTextureData(itemTexture) {
    if (itemTexture == null || typeof itemTexture !== "object") {
      return {};
    }
    const source = itemTexture.texture_data;
    if (source == null || typeof source !== "object") {
      return {};
    }
    return JSON.parse(JSON.stringify(source));
  }

  /**
   * 设置顶部状态信息。
   */
  function setStatus(message, type) {
    const cls = type || "ok";
    elements.validationBox.innerHTML = '<div class="' + cls + '">' + escapeHtml(message) + "</div>";
  }

  /**
   * HTML 转义。
   */
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  /**
   * 获取异常消息。
   */
  function getErrorMessage(error) {
    if (error == null) {
      return "未知错误";
    }
    return error.message || String(error);
  }

  /**
   * 释放物品预览 URL。
   */
  function revokeItemUrl(item) {
    if (item.objectUrl) {
      URL.revokeObjectURL(item.objectUrl);
      item.objectUrl = "";
    }
  }

  /**
   * 释放组件贴图阅览器预览 URL。
   */
  function revokeComponentTextureUrls() {
    state.componentTextureItems.forEach(function (item) {
      if (item.objectUrl) {
        URL.revokeObjectURL(item.objectUrl);
        item.objectUrl = "";
      }
    });
    state.componentTextureItems = [];
    state.componentTextureGridDirty = true;
    state.componentTextureTileMap = new Map();
    state.selectedComponentTexturePath = "";
  }

  /**
   * 释放下载链接 URL。
   */
  function revokeDownloadUrls() {
    state.downloadUrls.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    state.downloadUrls = [];
  }

  /**
   * 暴露浏览器验收用的测试入口。
   */
  function exposeTestHooks() {
    window.__ITEM_EDITOR_TEST__ = {
      state: state,
      addMockItem: addMockItem,
      buildExportPlan: buildExportPlan,
      importLegacyDirectory: importLegacyDirectory,
      importLegacySources: importLegacySourcesForTest,
      renderAll: renderAll,
      setComponentTextureIndex: setComponentTextureIndexForTest,
      loadComponentTextureIndex: loadComponentTextureIndex,
      loadComponentTextureBundle: loadComponentTextureBundle,
      getNextItemNumber: getNextItemNumber,
      getComponentMaxItemNumberFromDirectory: getComponentMaxItemNumberFromDirectory,
      calculateTextureHash: calculateTextureHash,
      createSamplePngFile: createSamplePngFile
    };
  }

  /**
   * 设置组件贴图索引供浏览器验收使用。
   */
  function setComponentTextureIndexForTest(records) {
    const hashMap = new Map();
    let fileCount = 0;
    records.forEach(function (record) {
      const textureHash = String(record.textureHash || "");
      const texturePath = normalizeLegacyTexturePath(record.texturePath || "");
      if (!textureHash || !texturePath) {
        return;
      }
      addComponentTextureRecord(hashMap, makeComponentTextureRecordForTest(textureHash, texturePath, record.identifier || ""));
      fileCount += 1;
    });
    state.componentTextureHashes = hashMap;
    state.componentTextureFileCount = fileCount;
    renderAll();
  }

  /**
   * 创建浏览器验收用的组件贴图索引记录。
   */
  function makeComponentTextureRecordForTest(textureHash, texturePath, identifier) {
    const textureInfo = getTextureInfoFromPath(texturePath);
    const normalizedIdentifier = normalizeIdentifier(identifier);
    return {
      source: "component",
      textureHash: textureHash,
      texturePath: texturePath,
      identifier: normalizedIdentifier,
      folderName: textureInfo.folderName,
      folderPathParts: getFolderPathParts(textureInfo.folderName),
      textureFileName: textureInfo.textureName,
      fileBase: normalizedIdentifier ? identifierToFileBase(normalizedIdentifier) : identifierToFileBase(textureInfo.textureName.replace(/\.png$/i, "")),
      usesExistingComponentTexture: true
    };
  }

  /**
   * 用内存数据导入旧配置供浏览器验收。
   */
  async function importLegacySourcesForTest(sources) {
    const result = await importLegacySources(sources);
    replaceItems(result.items);
    renderAll();
    return result;
  }

  /**
   * 添加浏览器验收用的模拟 PNG 物品。
   */
  async function addMockItem() {
    const selected = getSelectedItem();
    if (selected == null) {
      await addFiles([createSamplePngFile()]);
    } else {
      await applyTextureFiles([createSamplePngFile()]);
    }
    return buildExportPlan(null);
  }

  /**
   * 创建一个内置的 1x1 PNG 文件。
   */
  function createSamplePngFile() {
    const pngBytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
      0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240,
      31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69,
      78, 68, 174, 66, 96, 130
    ]);
    return new File([pngBytes], "test_item.png", { type: "image/png" });
  }

  initApp();
})();
