(function () {
  "use strict";

  var CREDENTIALS_KEY = "dojoLineMenuAdminCredentials";
  var state = {
    adminCredentials: loadSessionJson(CREDENTIALS_KEY, null),
    pendingAction: null,
    menuKey: "member",
    menus: {}
  };

  var els = {
    authForm: document.getElementById("authForm"),
    authError: document.getElementById("authError"),
    adminUserInput: document.getElementById("adminUserInput"),
    adminPasswordInput: document.getElementById("adminPasswordInput"),
    authSubmit: document.getElementById("authSubmit"),
    logoutButton: document.getElementById("logoutButton"),
    statusLabel: document.getElementById("statusLabel"),
    linkForm: document.getElementById("linkForm"),
    richMenuMeta: document.getElementById("richMenuMeta"),
    primaryUrlLabel: document.getElementById("primaryUrlLabel"),
    secondaryUrlLabel: document.getElementById("secondaryUrlLabel"),
    primaryUrlInput: document.getElementById("primaryUrlInput"),
    secondaryUrlInput: document.getElementById("secondaryUrlInput"),
    instagramUrlInput: document.getElementById("instagramUrlInput"),
    officialUrlInput: document.getElementById("officialUrlInput"),
    imagePathInput: document.getElementById("imagePathInput"),
    imageMeta: document.getElementById("imageMeta"),
    menuImagePreview: document.getElementById("menuImagePreview"),
    richMenuPreview: document.getElementById("richMenuPreview"),
    primaryPreviewButton: document.getElementById("primaryPreviewButton"),
    secondaryPreviewButton: document.getElementById("secondaryPreviewButton"),
    reloadButton: document.getElementById("reloadButton"),
    syncButton: document.getElementById("syncButton"),
    confirmModal: document.getElementById("confirmModal"),
    confirmBackdrop: document.getElementById("confirmBackdrop"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmMessage: document.getElementById("confirmMessage"),
    cancelConfirm: document.getElementById("cancelConfirm"),
    runConfirm: document.getElementById("runConfirm")
  };

  init();

  function init() {
    els.authForm.addEventListener("submit", submitAuth);
    els.logoutButton.addEventListener("click", logout);
    els.reloadButton.addEventListener("click", loadStatus);
    els.linkForm.addEventListener("submit", requestSync);
    els.confirmBackdrop.addEventListener("click", closeConfirm);
    els.cancelConfirm.addEventListener("click", closeConfirm);
    els.runConfirm.addEventListener("click", runPendingAction);
    Array.prototype.forEach.call(document.querySelectorAll(".rich-preview button[data-field]"), function (button) {
      button.addEventListener("click", function () {
        var input = document.getElementById(button.getAttribute("data-field"));
        if (input && input.value) window.open(input.value, "_blank", "noopener");
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".segmented button[data-menu-key], .rich-preview button[data-menu-key]"), function (button) {
      button.addEventListener("click", function () {
        saveCurrentMenuDraft();
        state.menuKey = button.getAttribute("data-menu-key");
        renderMenu();
      });
    });
    els.imagePathInput.addEventListener("input", updateImagePreview);

    if (!hasCredentials()) {
      showAuth("");
      return;
    }
    loadStatus();
  }

  function submitAuth(event) {
    event.preventDefault();
    state.adminCredentials = {
      username: els.adminUserInput.value.trim(),
      password: els.adminPasswordInput.value
    };
    if (!hasCredentials()) {
      showAuth("管理IDとパスワードを入力してください。");
      return;
    }
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(state.adminCredentials));
    loadStatus();
  }

  function loadStatus() {
    setStatus("読み込み中");
    apiGet().then(function (data) {
      state.menus = data.menus || {};
      if (!state.menus[state.menuKey]) state.menuKey = "member";
      renderMenu();
      hideAuth();
      setStatus("LINE設定取得済み");
    }).catch(function (error) {
      clearCredentials();
      showAuth(error.message === "UNAUTHORIZED" ? "管理IDまたはパスワードが違います。" : "LINE設定を取得できませんでした。");
      setStatus("未接続");
    });
  }

  function requestSync(event) {
    event.preventDefault();
    saveCurrentMenuDraft();
    var menu = state.menus[state.menuKey] || {};
    var links = currentLinks();
    openConfirm({
      title: "LINEへ反映しますか",
      message: menuLabel(state.menuKey) + "のリッチメニューを新しく作成し、" + (menu.alias || "") + " に紐づけます。\n\n" + labelText(menu, "primary") + ":\n" + links.primaryUrl + "\n\n" + labelText(menu, "secondary") + ":\n" + links.secondaryUrl + "\n\n画像:\n" + currentImagePath(),
      run: function () {
        syncLinks(state.menuKey, links, currentImagePath());
      }
    });
  }

  function syncLinks(menuKey, links, imagePath) {
    setStatus("LINEへ反映中");
    els.syncButton.disabled = true;
    apiPost({ menuKey: menuKey, links: links, imagePath: imagePath }).then(function (data) {
      if (!state.menus[menuKey]) state.menus[menuKey] = {};
      state.menus[menuKey].richMenuId = data.richMenuId;
      state.menus[menuKey].links = data.links;
      state.menus[menuKey].imagePath = data.imagePath;
      els.richMenuMeta.textContent = "現在のID: " + data.richMenuId;
      setStatus("LINE反映済み");
      openNotice("反映しました", menuLabel(menuKey) + "のLINEリッチメニューを更新しました。");
    }).catch(function (error) {
      setStatus("反映失敗");
      openNotice("反映できませんでした", error.message || "通信エラーが発生しました。");
    }).finally(function () {
      els.syncButton.disabled = false;
    });
  }

  function currentLinks() {
    return {
      primaryUrl: els.primaryUrlInput.value.trim(),
      secondaryUrl: els.secondaryUrlInput.value.trim(),
      instagramUrl: els.instagramUrlInput.value.trim(),
      officialUrl: els.officialUrlInput.value.trim()
    };
  }

  function currentImagePath() {
    return els.imagePathInput.value.trim() || "/assets/line/dojo-member-richmenu.jpg";
  }

  function renderMenu() {
    var menu = state.menus[state.menuKey] || {};
    var labels = menu.labels || fallbackLabels(state.menuKey);
    var links = menu.links || {};
    Array.prototype.forEach.call(document.querySelectorAll(".segmented button[data-menu-key]"), function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-menu-key") === state.menuKey);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".rich-preview button[data-menu-key]"), function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-menu-key") === state.menuKey);
    });
    els.primaryUrlLabel.firstChild.nodeValue = labels.primary || "リンク1";
    els.secondaryUrlLabel.firstChild.nodeValue = labels.secondary || "リンク2";
    els.primaryPreviewButton.textContent = labels.primary || "リンク1";
    els.secondaryPreviewButton.textContent = labels.secondary || "リンク2";
    els.primaryUrlInput.value = links.primaryUrl || "";
    els.secondaryUrlInput.value = links.secondaryUrl || "";
    els.instagramUrlInput.value = links.instagramUrl || "";
    els.officialUrlInput.value = links.officialUrl || "";
    els.imagePathInput.value = menu.imagePath || (menu.image && menu.image.path) || "/assets/line/dojo-member-richmenu.jpg";
    updateImagePreview();
    els.imageMeta.textContent = imageMetaText(menu.image);
    els.richMenuMeta.textContent = (menu.alias || "") + (menu.richMenuId ? " / 現在のID: " + menu.richMenuId : " / 現在のメニュー未取得");
  }

  function updateImagePreview() {
    var path = currentImagePath();
    els.menuImagePreview.src = path;
    els.richMenuPreview.style.backgroundImage = 'url("' + path.replace(/"/g, "%22") + '")';
  }

  function saveCurrentMenuDraft() {
    if (!state.menus[state.menuKey]) return;
    state.menus[state.menuKey].links = currentLinks();
    state.menus[state.menuKey].imagePath = currentImagePath();
  }

  function fallbackLabels(menuKey) {
    if (menuKey === "guest") {
      return { primary: "初回体験", secondary: "ビジター利用", instagram: "公式Instagram", official: "DOJO公式サイト" };
    }
    return { primary: "予約", secondary: "予約キャンセル・確認", instagram: "公式Instagram", official: "DOJO公式サイト" };
  }

  function labelText(menu, key) {
    var labels = menu.labels || fallbackLabels(state.menuKey);
    return labels[key] || key;
  }

  function menuLabel(menuKey) {
    return menuKey === "guest" ? "非会員タブ" : "会員タブ";
  }

  function imageMetaText(image) {
    if (!image) return "2500 x 1686 / JPEG";
    return [image.width + " x " + image.height, image.contentType || "image/jpeg"].filter(Boolean).join(" / ");
  }

  function apiGet() {
    return fetch("/api/line/rich-menu-sync", { headers: apiHeaders() }).then(readResponse);
  }

  function apiPost(payload) {
    return fetch("/api/line/rich-menu-sync", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    }).then(readResponse);
  }

  function readResponse(response) {
    if (response.status === 401) throw new Error("UNAUTHORIZED");
    return response.json().then(function (data) {
      if (!response.ok || !data.ok) throw new Error(data.error || "API_ERROR");
      return data;
    });
  }

  function apiHeaders() {
    return {
      "content-type": "application/json",
      "accept": "application/json",
      "x-admin-user": state.adminCredentials.username,
      "x-admin-password": state.adminCredentials.password
    };
  }

  function showAuth(message) {
    document.body.classList.add("auth-locked");
    els.authError.textContent = message || "";
    if (state.adminCredentials) els.adminUserInput.value = state.adminCredentials.username || "";
    window.setTimeout(function () {
      if (els.adminUserInput.value) els.adminPasswordInput.focus();
      else els.adminUserInput.focus();
    }, 0);
  }

  function hideAuth() {
    document.body.classList.remove("auth-locked");
    els.authError.textContent = "";
  }

  function hasCredentials() {
    return Boolean(state.adminCredentials && state.adminCredentials.username && state.adminCredentials.password);
  }

  function clearCredentials() {
    state.adminCredentials = null;
    sessionStorage.removeItem(CREDENTIALS_KEY);
  }

  function logout() {
    clearCredentials();
    setStatus("未接続");
    showAuth("");
  }

  function setStatus(label) {
    els.statusLabel.textContent = label;
  }

  function openNotice(title, message) {
    openConfirm({ title: title, message: message, notice: true });
  }

  function openConfirm(options) {
    var notice = Boolean(options.notice);
    state.pendingAction = notice ? null : options.run;
    els.confirmTitle.textContent = options.title;
    els.confirmMessage.textContent = options.message;
    els.runConfirm.hidden = notice;
    els.cancelConfirm.textContent = notice ? "閉じる" : "戻る";
    els.confirmModal.classList.add("is-open");
    els.confirmModal.setAttribute("aria-hidden", "false");
  }

  function closeConfirm() {
    state.pendingAction = null;
    els.confirmModal.classList.remove("is-open");
    els.confirmModal.setAttribute("aria-hidden", "true");
    els.runConfirm.hidden = false;
    els.cancelConfirm.textContent = "戻る";
  }

  function runPendingAction() {
    var action = state.pendingAction;
    closeConfirm();
    if (typeof action === "function") action();
  }

  function loadSessionJson(key, fallback) {
    try {
      var raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }
})();
