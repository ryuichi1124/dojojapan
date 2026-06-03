(function () {
  "use strict";

  var CREDENTIALS_KEY = "dojoMemberReservationCredentials";
  var REMEMBER_KEY = "dojoMemberReservationRemember";
  var START_HOUR = 7;
  var END_HOUR = 18;
  var dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  var state = {
    token: new URLSearchParams(window.location.search).get("token") || "",
    sessionToken: "",
    memberCode: "",
    pin: "",
    member: null,
    reservations: [],
    monthlyReservations: [],
    monthlySummary: null,
    historyReservations: [],
    historyMonths: 1,
    historyFromMonthKey: "",
    historyMonthKey: "",
    slots: [],
    weekStart: startOfWeek(new Date()),
    selectedDateKey: toDateKey(new Date()),
    openPanel: "status",
    changeReservationId: "",
    changeReservationKind: "",
    referralMode: false,
    referralSessionId: "",
    pendingAction: null
  };

  var els = {
    loginForm: document.getElementById("loginForm"),
    loginError: document.getElementById("loginError"),
    memberCodeField: document.getElementById("memberCodeField"),
    memberCodeInput: document.getElementById("memberCodeInput"),
    pinInput: document.getElementById("pinInput"),
    rememberInput: document.getElementById("rememberInput"),
    loginButton: document.getElementById("loginButton"),
    profileButton: document.getElementById("profileButton"),
    logoutButton: document.getElementById("logoutButton"),
    reloadButton: document.getElementById("reloadButton"),
    newReservationPanel: document.getElementById("newReservationPanel"),
    newReservationToggle: document.getElementById("newReservationToggle"),
    newReservationContent: document.getElementById("newReservationContent"),
    reservationStatusPanel: document.getElementById("reservationStatusPanel"),
    reservationStatusToggle: document.getElementById("reservationStatusToggle"),
    reservationStatusContent: document.getElementById("reservationStatusContent"),
    memberName: document.getElementById("memberName"),
    memberMeta: document.getElementById("memberMeta"),
    monthlySummary: document.getElementById("monthlySummary"),
    monthlyHistory: document.getElementById("monthlyHistory"),
    reservationList: document.getElementById("reservationList"),
    slotList: document.getElementById("slotList"),
    dayTabs: document.getElementById("dayTabs"),
    weekLabel: document.getElementById("weekLabel"),
    modeNote: document.getElementById("modeNote"),
    referralModeButton: document.getElementById("referralModeButton"),
    referralInfoButton: document.getElementById("referralInfoButton"),
    prevWeek: document.getElementById("prevWeek"),
    nextWeek: document.getElementById("nextWeek"),
    confirmModal: document.getElementById("confirmModal"),
    confirmBackdrop: document.getElementById("confirmBackdrop"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmMessage: document.getElementById("confirmMessage"),
    cancelConfirm: document.getElementById("cancelConfirm"),
    runConfirm: document.getElementById("runConfirm")
  };

  els.profileModal = document.getElementById("profileModal");
  els.profileBackdrop = document.getElementById("profileBackdrop");
  els.closeProfile = document.getElementById("closeProfile");
  els.profileForm = document.getElementById("profileForm");
  els.profileMemberCode = document.getElementById("profileMemberCode");
  els.profileMemberType = document.getElementById("profileMemberType");
  els.profileDisplayNameInput = document.getElementById("profileDisplayNameInput");
  els.profileMemberKanaInput = document.getElementById("profileMemberKanaInput");
  els.profilePhoneLast4Input = document.getElementById("profilePhoneLast4Input");
  els.profileBirthMmddInput = document.getElementById("profileBirthMmddInput");
  els.profileNote = document.getElementById("profileNote");
  els.profileSaveButton = document.getElementById("profileSaveButton");
  els.referralModal = document.getElementById("referralModal");
  els.referralBackdrop = document.getElementById("referralBackdrop");
  els.closeReferral = document.getElementById("closeReferral");
  els.referralForm = document.getElementById("referralForm");
  els.referralSessionLabel = document.getElementById("referralSessionLabel");
  els.referralGuestCountInput = document.getElementById("referralGuestCountInput");
  els.referralGuestNameInput = document.getElementById("referralGuestNameInput");
  els.referralGuestName2Label = document.getElementById("referralGuestName2Label");
  els.referralGuestName2Input = document.getElementById("referralGuestName2Input");
  els.referralResidentInput = document.getElementById("referralResidentInput");
  els.referralNote = document.getElementById("referralNote");
  els.referralSubmitButton = document.getElementById("referralSubmitButton");
  els.referralInfoModal = document.getElementById("referralInfoModal");
  els.referralInfoBackdrop = document.getElementById("referralInfoBackdrop");
  els.closeReferralInfo = document.getElementById("closeReferralInfo");

  init();

  function init() {
    var saved = loadSession();
    var lineMode = isLineBrowser();
    if (saved && (!state.token || saved.token === state.token || lineMode)) {
      state.token = state.token || saved.token || "";
      state.pin = saved.pin || "";
      state.memberCode = saved.memberCode || "";
      els.rememberInput.checked = Boolean(saved.remember);
    }
    if (state.token || lineMode) {
      els.rememberInput.checked = true;
    }

    els.loginForm.addEventListener("submit", submitLogin);
    els.profileButton.addEventListener("click", openProfile);
    els.profileBackdrop.addEventListener("click", closeProfile);
    els.closeProfile.addEventListener("click", closeProfile);
    els.profileForm.addEventListener("submit", submitProfile);
    els.referralBackdrop.addEventListener("click", closeReferral);
    els.closeReferral.addEventListener("click", closeReferral);
    els.referralGuestCountInput.addEventListener("change", updateReferralGuestCount);
    els.referralForm.addEventListener("submit", submitReferralBooking);
    els.referralModeButton.addEventListener("click", toggleReferralMode);
    els.referralInfoButton.addEventListener("click", openReferralInfo);
    els.referralInfoBackdrop.addEventListener("click", closeReferralInfo);
    els.closeReferralInfo.addEventListener("click", closeReferralInfo);
    els.logoutButton.addEventListener("click", logout);
    els.reloadButton.addEventListener("click", loadAll);
    els.newReservationToggle.addEventListener("click", function () {
      setOpenPanel("new");
      scrollSelectedDayTab("smooth");
    });
    els.reservationStatusToggle.addEventListener("click", function () {
      setOpenPanel("status");
    });
    els.prevWeek.addEventListener("click", function () {
      state.weekStart = addDays(state.weekStart, -7);
      state.selectedDateKey = toDateKey(state.weekStart);
      loadAvailability();
    });
    els.nextWeek.addEventListener("click", function () {
      state.weekStart = addDays(state.weekStart, 7);
      state.selectedDateKey = toDateKey(state.weekStart);
      loadAvailability();
    });
    els.confirmBackdrop.addEventListener("click", closeConfirm);
    els.cancelConfirm.addEventListener("click", closeConfirm);
    els.runConfirm.addEventListener("click", runPendingAction);

    if (state.sessionToken || state.pin || state.token || lineMode) {
      showCheckingAuth();
      loadAll().catch(function () {
        clearSession();
        state.sessionToken = "";
        showLogin("");
      });
    } else {
      showLogin("");
    }
  }

  function submitLogin(event) {
    event.preventDefault();
    state.memberCode = normalizeMemberCode(els.memberCodeInput.value);
    state.pin = els.pinInput.value.trim();
    if (!state.token && !state.memberCode) {
      showLogin("会員コードを入力してください。");
      return;
    }
    if (!state.pin) return;
    els.loginButton.disabled = true;
    els.loginButton.textContent = "確認中";
    apiPost("auth/login", { token: state.token, memberCode: state.memberCode, pin: state.pin }, false).then(function (data) {
      state.member = data.member;
      if (data.bookingToken) state.token = data.bookingToken;
      if (data.member && data.member.memberCode) state.memberCode = data.member.memberCode;
      state.pin = "";
      saveSession(shouldPersistSession());
      hideLogin();
      return loadAll();
    }).catch(function () {
      clearSession();
      state.pin = "";
      showLogin("PINが違います。");
    });
  }

  function loadAll() {
    return Promise.all([loadMe(), loadReservations(), loadAvailability()]).then(render);
  }

  function loadMe() {
    return apiGet("me").then(function (data) {
      state.member = data.member;
    });
  }

  function loadReservations() {
    return apiGet("reservations").then(function (data) {
      state.reservations = data.reservations || [];
      state.monthlyReservations = data.monthlyReservations || [];
      state.historyReservations = state.monthlyReservations;
      state.historyMonths = 1;
      state.historyFromMonthKey = "";
      state.historyMonthKey = data.monthlySummary ? data.monthlySummary.monthKey : "";
      state.monthlySummary = data.monthlySummary || null;
    });
  }

  function loadAvailability() {
    return apiGet("availability?weekStart=" + toDateKey(state.weekStart)).then(function (data) {
      state.slots = data.slots || [];
      render();
    });
  }

  function render() {
    if (!state.member) return;
    hideLogin();
    els.memberName.textContent = state.member.displayName;
    els.memberMeta.textContent = state.member.memberCode + " / " + memberTypeLabel(state.member.memberType) + " / " + quotaLabel(state.member);
    renderPanels();
    renderMonthlySummary();
    renderReservations();
    renderMonthlyHistory();
    renderSlots();
  }

  function openProfile() {
    if (!state.member) return;
    els.profileMemberCode.textContent = state.member.memberCode || "";
    els.profileMemberType.textContent = memberTypeLabel(state.member.memberType) + " / " + quotaLabel(state.member);
    els.profileDisplayNameInput.value = state.member.displayName || "";
    els.profileMemberKanaInput.value = state.member.memberKana || "";
    els.profilePhoneLast4Input.value = state.member.phoneLast4 || "";
    els.profileBirthMmddInput.value = state.member.birthMmdd || "";
    els.profileNote.textContent = "";
    els.profileNote.classList.remove("is-error");
    els.profileSaveButton.disabled = false;
    els.profileSaveButton.textContent = "保存";
    els.profileModal.classList.add("is-open");
    els.profileModal.setAttribute("aria-hidden", "false");
  }

  function closeProfile() {
    els.profileModal.classList.remove("is-open");
    els.profileModal.setAttribute("aria-hidden", "true");
  }

  function submitProfile(event) {
    event.preventDefault();
    var displayName = els.profileDisplayNameInput.value.trim();
    var memberKana = els.profileMemberKanaInput.value.trim().replace(/\s+/g, " ");
    var phoneLast4 = normalizeDigits(els.profilePhoneLast4Input.value, 4);
    var birthMmdd = normalizeDigits(els.profileBirthMmddInput.value, 4);
    if (!displayName) return showProfileMessage("お名前を入力してください。", true);
    if (phoneLast4 && phoneLast4.length !== 4) return showProfileMessage("電話番号下4桁は4桁で入力してください。", true);
    if (birthMmdd && birthMmdd.length !== 4) return showProfileMessage("誕生日はMMDDの4桁で入力してください。", true);
    els.profileSaveButton.disabled = true;
    els.profileSaveButton.textContent = "保存中";
    apiPost("profile", { displayName: displayName, memberKana: memberKana, phoneLast4: phoneLast4, birthMmdd: birthMmdd }).then(function (data) {
      state.member = data.member || Object.assign({}, state.member, {
        displayName: displayName,
        memberKana: memberKana,
        phoneLast4: phoneLast4,
        birthMmdd: birthMmdd
      });
      showProfileMessage("保存しました。", false);
      render();
    }).catch(function (error) {
      showProfileMessage(errorMessage(error), true);
    }).finally(function () {
      els.profileSaveButton.disabled = false;
      els.profileSaveButton.textContent = "保存";
    });
  }

  function showProfileMessage(message, error) {
    els.profileNote.textContent = message;
    els.profileNote.classList.toggle("is-error", Boolean(error));
  }

  function setOpenPanel(panel) {
    state.openPanel = panel === "status" ? "status" : "new";
    renderPanels();
  }

  function renderPanels() {
    var status = state.openPanel === "status";
    els.newReservationPanel.classList.toggle("is-open", !status);
    els.reservationStatusPanel.classList.toggle("is-open", status);
    els.newReservationPanel.hidden = status;
    els.reservationStatusPanel.hidden = !status;
    els.newReservationToggle.classList.toggle("is-active", !status);
    els.reservationStatusToggle.classList.toggle("is-active", status);
    els.newReservationToggle.setAttribute("aria-selected", String(!status));
    els.reservationStatusToggle.setAttribute("aria-selected", String(status));
  }

  function renderReservations() {
    var active = state.reservations.filter(function (reservation) {
      return reservation.status === "confirmed";
    });
    if (!active.length) {
      els.reservationList.innerHTML = '<p class="empty-note">現在の予約はありません。</p>';
      return;
    }
    els.reservationList.innerHTML = active.map(function (reservation) {
      var changeable = isBeforeDeadline(reservation.sessionId);
      var cancelable = isBeforeCancelDeadline(reservation);
      var kindLabel = reservation.reservationKind === "personal"
        ? "パーソナル予約 / 別途3000円"
        : reservation.reservationKind === "referral" ? "紹介同伴 / 回数消費なし" : "予約済み";
      var trainer = trainerForReservation(reservation);
      var canChange = changeable && reservation.reservationKind !== "referral";
      var actions = '<div class="reservation-actions">' +
        (canChange ? '<button type="button" data-action="change" data-id="' + escapeHtml(reservation.id) + '">変更</button>' : '') +
        '<button type="button" data-action="cancel" data-id="' + escapeHtml(reservation.id) + '">キャンセル</button>' +
        '</div>';
      return '<article class="reservation-card">' +
        '<div class="reservation-card__top"><span><b>' + sessionLabel(reservation.sessionId) + '</b><small>' + kindLabel + reservationDeadlineLabel(reservation, changeable, cancelable) + '</small><em>' + escapeHtml(trainer.label) + '</em></span></div>' +
        actions +
        reservationDeadlineNote(reservation, changeable, cancelable) +
        '</article>';
    }).join("");
    Array.prototype.forEach.call(els.reservationList.querySelectorAll("button"), function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-id");
        if (button.getAttribute("data-action") === "cancel") requestCancel(id);
        if (button.getAttribute("data-action") === "change") startChange(id);
      });
    });
  }

  function reservationDeadlineLabel(reservation, changeable, cancelable) {
    var labels = [];
    if (!changeable && reservation.reservationKind !== "referral") labels.push("変更締切後");
    if (!cancelable) labels.push(reservation.reservationKind === "personal" ? "キャンセル前日締切後" : "キャンセル締切後");
    return labels.length ? " / " + labels.join(" / ") : "";
  }

  function reservationDeadlineNote(reservation, changeable, cancelable) {
    if (changeable || cancelable) return "";
    if (reservation.reservationKind === "personal") {
      return '<p class="reservation-note">パーソナル予約のキャンセルは前日までです。変更・キャンセルが必要な場合は公式LINEでご連絡ください。</p>';
    }
    return '<p class="reservation-note">開始3時間前を過ぎているため、変更・キャンセルは公式LINEでご連絡ください。</p>';
  }

  function renderMonthlySummary() {
    var summary = state.monthlySummary;
    if (!summary || summary.quotaLimit === null) {
      els.monthlySummary.innerHTML = "";
      return;
    }
    var quotaText = String(summary.quotaLimit) + "回";
    var remainingText = String(summary.remaining) + "回";
    els.monthlySummary.innerHTML =
      '<div class="monthly-summary__head">' +
        '<span>' + escapeHtml(formatMonthKey(summary.monthKey)) + '</span>' +
        '<b>残り ' + escapeHtml(remainingText) + '</b>' +
      '</div>' +
      '<div class="monthly-summary__grid">' +
        '<span><small>月間上限</small><b>' + escapeHtml(quotaText) + '</b></span>' +
        '<span><small>今月予約</small><b>' + Number(summary.used || 0) + '回</b></span>' +
        '<span><small>実施済み</small><b>' + Number(summary.past || 0) + '回</b></span>' +
        '<span><small>予約中</small><b>' + Number(summary.upcoming || 0) + '回</b></span>' +
      '</div>';
  }

  function renderMonthlyHistory() {
    var monthly = state.historyReservations || [];
    var isThreeMonths = state.historyMonths === 3;
    var title = isThreeMonths ? "過去3ヶ月の利用履歴" : "今月の予約履歴";
    var emptyText = isThreeMonths ? "過去3ヶ月の利用履歴はありません。" : "今月の予約はありません。";
    var rangeText = isThreeMonths && state.historyFromMonthKey ? formatMonthKey(state.historyFromMonthKey) + " - " + formatMonthKey(state.historyMonthKey) : "";
    var actions =
      '<div class="history-range-actions">' +
        '<button type="button" data-history-months="1"' + (!isThreeMonths ? ' class="is-active"' : '') + '>今月</button>' +
        '<button type="button" data-history-months="3"' + (isThreeMonths ? ' class="is-active"' : '') + '>過去3ヶ月</button>' +
      '</div>';
    if (!monthly.length) {
      els.monthlyHistory.innerHTML =
        '<section class="monthly-history__section">' +
          '<div class="monthly-history__head"><span><h3>' + title + '</h3>' + (rangeText ? '<small>' + escapeHtml(rangeText) + '</small>' : '') + '</span>' + actions + '</div>' +
          '<p class="empty-note">' + emptyText + '</p>' +
        '</section>';
      bindHistoryRangeButtons();
      return;
    }
    els.monthlyHistory.innerHTML =
      '<section class="monthly-history__section">' +
        '<div class="monthly-history__head"><span><h3>' + title + '</h3>' + (rangeText ? '<small>' + escapeHtml(rangeText) + '</small>' : '') + '</span>' + actions + '</div>' +
        '<div class="monthly-history__list">' +
          monthly.map(function (reservation) {
            var session = parseSessionId(reservation.sessionId);
            var started = session ? sessionStartTime(session).getTime() <= Date.now() : false;
            var status = started ? "実施済み" : "予約中";
            var kindLabel = reservation.reservationKind === "personal"
              ? "パーソナル"
              : reservation.reservationKind === "referral" ? "紹介同伴" : "通常";
            return '<article class="history-row">' +
              '<span><b>' + escapeHtml(sessionLabel(reservation.sessionId)) + '</b><small>' + escapeHtml(kindLabel) + ' / ' + escapeHtml(trainerForReservation(reservation).label) + '</small></span>' +
              '<em class="' + (started ? 'is-past' : 'is-upcoming') + '">' + status + '</em>' +
            '</article>';
          }).join("") +
        '</div>' +
      '</section>';
    bindHistoryRangeButtons();
  }

  function bindHistoryRangeButtons() {
    Array.prototype.forEach.call(els.monthlyHistory.querySelectorAll("[data-history-months]"), function (button) {
      button.addEventListener("click", function () {
        var months = Number(button.getAttribute("data-history-months") || 1);
        if (months === 1) {
          state.historyReservations = state.monthlyReservations || [];
          state.historyMonths = 1;
          state.historyFromMonthKey = "";
          state.historyMonthKey = state.monthlySummary ? state.monthlySummary.monthKey : "";
          renderMonthlyHistory();
          return;
        }
        loadHistoryRange(3);
      });
    });
  }

  function loadHistoryRange(months) {
    apiGet("reservations/history?months=" + months).then(function (data) {
      state.historyReservations = data.reservations || [];
      state.historyMonths = data.months === 3 ? 3 : 1;
      state.historyFromMonthKey = data.fromMonthKey || "";
      state.historyMonthKey = data.monthKey || "";
      renderMonthlyHistory();
    }).catch(showError);
  }

  function renderSlots() {
    var end = addDays(state.weekStart, 6);
    els.weekLabel.textContent = formatMonthDay(state.weekStart) + " - " + formatMonthDay(end);
    if (state.changeReservationId) {
      els.modeNote.textContent = "変更先の枠を選んでください。";
    } else if (state.referralMode) {
      els.modeNote.textContent = "初回体験の方をご紹介いただける会員様向けのキャンペーンです。会員様の月の回数は消費されません。";
    } else {
      els.modeNote.textContent = "";
    }
    els.referralModeButton.classList.toggle("is-active", state.referralMode);
    els.referralModeButton.innerHTML = state.referralMode
      ? '<span>通常予約に戻る</span>'
      : '<small>キャンペーン中</small><span>紹介同伴予約</span>';
    els.referralModeButton.disabled = Boolean(state.changeReservationId);
    els.referralInfoButton.hidden = !state.referralMode || Boolean(state.changeReservationId);
    ensureSelectedDateInWeek();
    renderDayTabs();
    if (!state.slots.length) {
      els.slotList.innerHTML = '<p class="empty-note">枠を読み込めませんでした。</p>';
      return;
    }
    var daySlots = state.slots.filter(function (slot) {
      return slot.date === state.selectedDateKey;
    });
    if (!daySlots.length) {
      els.slotList.innerHTML = '<p class="empty-note">この日の枠を読み込めませんでした。</p>';
      return;
    }
    els.slotList.innerHTML = daySlots.map(function (slot) {
      var remaining = Math.max(0, Number(slot.remaining || 0));
      var changeKind = state.changeReservationKind === "personal" ? "personal" : "regular";
      var disabled = state.changeReservationId ? !canReserveKind(slot, changeKind) : !slot.available;
      var trainer = trainerForSlot(slot);
      var periodClass = slot.hour < 12 ? " is-morning" : " is-afternoon";
      var ended = isSlotEnded(slot);
      var availabilityLabel = ended ? "終了しました" : slot.closed ? "予約不可" : slot.ownReservation ? "予約済み" : remaining <= 0 ? "満席" : "残り" + remaining;
      var actions = "";
      if (ended) {
        actions = '<button type="button" disabled>終了しました</button>';
      } else if (slot.ownReservation) {
        actions = '<button type="button" disabled>予約済み</button>';
      } else if (slot.closed) {
        actions = '<button type="button" disabled>予約不可</button>';
      } else if (state.changeReservationId) {
        var changeLabel = changeKind === "personal" ? "パーソナルへ変更" : "変更する";
        actions = '<button type="button" data-session-id="' + escapeHtml(slot.sessionId) + '" data-kind="' + changeKind + '"' + (disabled ? " disabled" : "") + '>' + changeLabel + '</button>';
      } else if (state.referralMode) {
        var referralAvailable = remaining >= 2;
        actions = '<button class="slot-card__referral" type="button" data-session-id="' + escapeHtml(slot.sessionId) + '" data-kind="referral"' + (referralAvailable ? "" : " disabled") + '>紹介同伴で予約</button>';
      } else {
        actions =
          '<button type="button" data-session-id="' + escapeHtml(slot.sessionId) + '" data-kind="regular"' + (!slot.available ? " disabled" : "") + '>通常レッスン予約する</button>' +
          '<button class="slot-card__personal" type="button" data-session-id="' + escapeHtml(slot.sessionId) + '" data-kind="personal"' + (slot.personalAvailable ? "" : " disabled") + '>パーソナル予約</button>';
      }
      return '<article class="slot-card' + periodClass + (ended || slot.closed ? ' is-closed' : '') + (disabled || ended ? ' is-disabled' : '') + '">' +
        '<div class="slot-card__top"><span><b>' + timeLabel(slot.hour) + '</b><small>' + availabilityLabel + '</small><em>' + escapeHtml(trainer.label) + '</em></span></div>' +
        '<div class="slot-card__actions">' + actions + '</div>' +
        '</article>';
    }).join("");
    Array.prototype.forEach.call(els.slotList.querySelectorAll("button"), function (button) {
      button.addEventListener("click", function () {
        var sessionId = button.getAttribute("data-session-id");
        var reservationKind = button.getAttribute("data-kind") || "regular";
        if (state.changeReservationId) requestChange(state.changeReservationId, sessionId);
        else if (reservationKind === "referral") openReferralBooking(sessionId);
        else requestBook(sessionId, reservationKind);
      });
    });
  }

  function toggleReferralMode() {
    if (state.changeReservationId) return;
    state.referralMode = !state.referralMode;
    renderSlots();
  }

  function openReferralInfo() {
    els.referralInfoModal.classList.add("is-open");
    els.referralInfoModal.setAttribute("aria-hidden", "false");
  }

  function closeReferralInfo() {
    els.referralInfoModal.classList.remove("is-open");
    els.referralInfoModal.setAttribute("aria-hidden", "true");
  }

  function openReferralBooking(sessionId) {
    var slot = state.slots.find(function (item) { return item.sessionId === sessionId; });
    var remaining = slot ? Math.max(0, Number(slot.remaining || 0)) : 0;
    if (!slot || slot.closed || remaining < 2) return showError(new Error("REFERRAL_SLOT_FULL"));
    state.referralSessionId = sessionId;
    els.referralSessionLabel.textContent = sessionLabel(sessionId);
    els.referralGuestCountInput.value = "1";
    els.referralGuestNameInput.value = "";
    els.referralGuestName2Input.value = "";
    els.referralResidentInput.checked = false;
    updateReferralGuestCount();
    els.referralModal.classList.add("is-open");
    els.referralModal.setAttribute("aria-hidden", "false");
  }

  function closeReferral() {
    state.referralSessionId = "";
    els.referralModal.classList.remove("is-open");
    els.referralModal.setAttribute("aria-hidden", "true");
  }

  function referralGuestCount() {
    return els.referralGuestCountInput.value === "2" ? 2 : 1;
  }

  function updateReferralGuestCount() {
    var count = referralGuestCount();
    els.referralGuestName2Label.hidden = count !== 2;
    els.referralNote.textContent = "初回体験の方をご紹介いただける会員様向けのキャンペーンです。会員様の月の回数は消費されません。";
  }

  function submitReferralBooking(event) {
    event.preventDefault();
    var count = referralGuestCount();
    var names = [normalizeName(els.referralGuestNameInput.value)];
    if (count === 2) names.push(normalizeName(els.referralGuestName2Input.value));
    names = names.filter(Boolean);
    var slot = state.slots.find(function (item) { return item.sessionId === state.referralSessionId; });
    var remaining = slot ? Math.max(0, Number(slot.remaining || 0)) : 0;
    if (names.length !== count) return showError(new Error("REFERRAL_GUEST_NAME_REQUIRED"));
    if (!els.referralResidentInput.checked) return showError(new Error("REFERRAL_GUEST_MUST_BE_LOCAL"));
    if (!slot || remaining < 1 + count) return showError(new Error("REFERRAL_SLOT_FULL"));
    var sessionId = state.referralSessionId;
    openConfirm({
      title: "紹介同伴予約しますか",
      message: sessionLabel(sessionId) + " に、体験者 " + names.join("、") + " さんと一緒に予約します。\n\n初回体験の方をご紹介いただける会員様向けのキャンペーンです。会員様の月の回数は消費されません。",
      run: function () {
        apiPost("reservations/book", {
          sessionId: sessionId,
          reservationKind: "referral",
          guestNames: names,
          guestResident: "local"
        }).then(function () {
          closeReferral();
          return loadAll();
        }).catch(showError);
      }
    });
  }

  function requestBook(sessionId, reservationKind) {
    reservationKind = reservationKind === "personal" ? "personal" : "regular";
    var personalText = reservationKind === "personal" ? "\n\nパーソナル予約です。別途料金3000円がかかります。またこの枠は満席となります。" : "";
    var caution = bookingCancelCaution(reservationKind) + postBookingDeadlineNote(sessionId, reservationKind);
    if (reservationKind === "personal" && !isBeforeBookDeadline(sessionId, 6)) {
      showError(new Error("PERSONAL_BOOK_DEADLINE_PASSED"));
      return;
    }
    openConfirm({
      title: reservationKind === "personal" ? "パーソナル予約しますか" : "予約しますか",
      message: sessionLabel(sessionId) + " を予約します。" + personalText + caution,
      variant: reservationKind === "personal" ? "personal" : "",
      run: function () {
        apiPost("reservations/book", { sessionId: sessionId, reservationKind: reservationKind }).then(loadAll).catch(function (error) {
          recoverAfterPossiblyCompletedBooking(sessionId, error);
        });
      }
    });
  }

  function recoverAfterPossiblyCompletedBooking(sessionId, originalError) {
    loadAll().then(function () {
      var booked = state.reservations.some(function (reservation) {
        return reservation.status === "confirmed" && reservation.sessionId === sessionId;
      });
      if (!booked) showError(originalError);
    }).catch(function () {
      showError(originalError);
    });
  }

  function renderDayTabs() {
    var buttons = [];
    for (var index = 0; index < 7; index += 1) {
      var date = addDays(state.weekStart, index);
      var key = toDateKey(date);
      var selected = key === state.selectedDateKey;
      buttons.push(
        '<button type="button" class="' + (selected ? 'is-active' : '') + '" data-date="' + key + '" aria-pressed="' + selected + '">' +
          '<span>' + dayNames[date.getDay()] + '</span>' +
          '<b>' + formatMonthDay(date) + '</b>' +
        '</button>'
      );
    }
    els.dayTabs.innerHTML = buttons.join("");
    Array.prototype.forEach.call(els.dayTabs.querySelectorAll("button"), function (button) {
      button.addEventListener("click", function () {
        state.selectedDateKey = button.getAttribute("data-date");
        renderSlots();
      });
    });
    if (state.openPanel === "new") scrollSelectedDayTab("auto");
  }

  function scrollSelectedDayTab(behavior) {
    window.requestAnimationFrame(function () {
      if (els.newReservationPanel.hidden) return;
      var active = els.dayTabs.querySelector("button.is-active");
      if (!active) return;
      active.scrollIntoView({
        behavior: behavior || "auto",
        block: "nearest",
        inline: "center"
      });
    });
  }

  function ensureSelectedDateInWeek() {
    var startKey = toDateKey(state.weekStart);
    var endKey = toDateKey(addDays(state.weekStart, 6));
    if (state.selectedDateKey < startKey || state.selectedDateKey > endKey) {
      state.selectedDateKey = startKey;
    }
  }

  function startChange(id) {
    state.changeReservationId = id;
    state.referralMode = false;
    var reservation = state.reservations.find(function (item) {
      return item.id === id;
    });
    state.changeReservationKind = reservation && reservation.reservationKind === "personal" ? "personal" : "regular";
    setOpenPanel("new");
    renderSlots();
    document.getElementById("slotList").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function requestChange(id, toSessionId) {
    var reservationKind = state.changeReservationKind === "personal" ? "personal" : "regular";
    var caution = bookingCancelCaution(reservationKind) + postBookingDeadlineNote(toSessionId, reservationKind);
    openConfirm({
      title: "予約を変更しますか",
      message: sessionLabel(toSessionId) + " に変更します。" + caution,
      run: function () {
        apiPost("reservations/change", { id: id, toSessionId: toSessionId }).then(function () {
          state.changeReservationId = "";
          state.changeReservationKind = "";
          return loadAll();
        }).catch(showError);
      }
    });
  }

  function requestCancel(id) {
    var reservation = state.reservations.find(function (item) {
      return item.id === id;
    });
    if (!isBeforeCancelDeadline(reservation)) {
      showCancelDeadlinePassed();
      return;
    }
    openConfirm({
      title: "キャンセルしますか",
      message: "この予約をキャンセルします。",
      run: function () {
        apiPost("reservations/cancel", { id: id }).then(loadAll).catch(showError);
      }
    });
  }

  function showCancelDeadlinePassed() {
    openConfirm({
      title: "キャンセルできません",
      message: "キャンセル可能時間を過ぎています。緊急の場合はスタッフへご連絡くださいませ。",
      run: function () {}
    });
  }

  function apiGet(path) {
    return fetch("/api/member/" + path, { headers: apiHeaders(), credentials: "same-origin", cache: "no-store" }).then(readApiResponse);
  }

  function apiPost(path, payload, authed) {
    var options = {
      method: "POST",
      headers: authed === false ? { "content-type": "application/json", "accept": "application/json" } : apiHeaders(),
      body: JSON.stringify(payload),
      credentials: "same-origin",
      cache: "no-store"
    };
    return fetch("/api/member/" + path, options).then(readApiResponse);
  }

  function readApiResponse(response) {
    if (response.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    return response.json().then(function (data) {
      if (!response.ok || !data.ok) throw new Error(data.error || "API_ERROR");
      return data;
    });
  }

  function apiHeaders() {
    return {
      "content-type": "application/json",
      "accept": "application/json",
      "x-member-token": state.token,
      "x-member-pin": state.pin
    };
  }

  function openConfirm(options) {
    state.pendingAction = options.run;
    els.confirmTitle.textContent = options.title;
    els.confirmMessage.textContent = options.message;
    els.confirmModal.classList.toggle("is-personal", options.variant === "personal");
    els.confirmModal.classList.add("is-open");
    els.confirmModal.setAttribute("aria-hidden", "false");
  }

  function closeConfirm() {
    state.pendingAction = null;
    els.confirmModal.classList.remove("is-open");
    els.confirmModal.classList.remove("is-personal");
    els.confirmModal.setAttribute("aria-hidden", "true");
  }

  function runPendingAction() {
    var action = state.pendingAction;
    closeConfirm();
    if (typeof action === "function") action();
  }

  function showError(error) {
    openConfirm({
      title: "操作できませんでした",
      message: errorMessage(error),
      run: function () {}
    });
  }

  function errorMessage(error) {
    var message = error && error.message ? error.message : "";
    if (message === "DEADLINE_PASSED") return "開始3時間前を過ぎているため、変更は公式LINEでご連絡ください。";
    if (message === "CANCEL_DEADLINE_PASSED") return "キャンセルは開始3時間前まで可能です。公式LINEでご連絡ください。";
    if (message === "PERSONAL_CANCEL_DEADLINE_PASSED") return "パーソナル予約のキャンセルは前日まで可能です。公式LINEでご連絡ください。";
    if (message === "SAME_DAY_CANCEL_NOT_ALLOWED") return "当日のキャンセルは会員画面からはできません。公式LINEでご連絡ください。";
    if (message === "PERSONAL_BOOK_DEADLINE_PASSED") return "パーソナル予約は開始6時間前まで可能です。別の枠を選んでください。";
    if (message === "BOOK_DEADLINE_PASSED") return "予約は開始1時間前まで可能です。別の枠を選んでください。";
    if (message === "RESERVATION_NOT_FOUND") return "対象の予約が見つかりません。画面を更新して確認してください。";
    if (message === "SESSION_FULL") return "この枠は満席になりました。別の枠を選んでください。";
    if (message === "SESSION_CLOSED") return "この枠は予約不可です。別の枠を選んでください。";
    if (message === "QUOTA_EXCEEDED") return "月間予約上限に達しています。";
    if (message === "REFERRAL_GUEST_NAME_REQUIRED") return "体験者全員のお名前を入力してください。";
    if (message === "REFERRAL_GUEST_MUST_BE_LOCAL") return "福岡在住の体験者のみ紹介同伴予約できます。";
    if (message === "REFERRAL_SLOT_FULL") return "紹介同伴予約には人数分の空き枠が必要です。別の枠を選んでください。";
    if (message === "UNAUTHORIZED") return "ログインし直してください。";
    return message || "通信エラーが発生しました。";
  }

  function canReserveKind(slot, reservationKind) {
    if (!slot || slot.ownReservation || slot.closed) return false;
    var remaining = Math.max(0, Number(slot.remaining || 0));
    if (reservationKind === "personal") return remaining === 6;
    return Boolean(slot.available);
  }

  function trainerForSlot(slot) {
    if (slot && slot.trainerLabel) {
      return {
        id: slot.trainerId || slugTrainerLabel(slot.trainerLabel),
        label: slot.trainerLabel
      };
    }
    return trainerForHour(slot ? slot.hour : 0);
  }

  function trainerForReservation(reservation) {
    if (reservation && reservation.trainerLabel) {
      return {
        id: reservation.trainerId || slugTrainerLabel(reservation.trainerLabel),
        label: reservation.trainerLabel
      };
    }
    var session = parseSessionId(reservation ? reservation.sessionId : "");
    return trainerForHour(session ? session.hour : 0);
  }

  function trainerForHour(hour) {
    if (Number(hour) < 12) return { id: "nariai-satoru", label: "担当: SATORU成合" };
    return { id: "matsushima-izaya", label: "担当: 松島勲也" };
  }

  function slugTrainerLabel(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^担当[:：]\s*/, "")
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "custom";
  }

  function showLogin(message) {
    document.body.classList.remove("is-checking-auth");
    document.body.classList.add("is-locked");
    els.memberCodeField.hidden = Boolean(state.token);
    if (!state.token) els.memberCodeInput.value = state.memberCode || "";
    els.pinInput.value = state.pin || "";
    els.loginError.textContent = message || "";
    els.loginButton.disabled = false;
    els.loginButton.textContent = "ログイン";
    window.setTimeout(function () { els.pinInput.focus(); }, 0);
  }

  function hideLogin() {
    document.body.classList.remove("is-checking-auth");
    document.body.classList.remove("is-locked");
    els.loginError.textContent = "";
    els.loginButton.disabled = false;
    els.loginButton.textContent = "ログイン";
  }

  function showCheckingAuth() {
    document.body.classList.add("is-locked");
    document.body.classList.add("is-checking-auth");
    els.loginError.textContent = "";
  }

  function logout() {
    apiPost("auth/logout", {}).catch(function () {});
    clearSession();
    state.pin = "";
    state.sessionToken = "";
    state.memberCode = "";
    state.member = null;
    state.reservations = [];
    state.monthlyReservations = [];
    state.monthlySummary = null;
    state.historyReservations = [];
    state.historyMonths = 1;
    state.historyFromMonthKey = "";
    state.historyMonthKey = "";
    showLogin("");
  }

  function saveSession(remember) {
    var persist = Boolean(remember || isLineBrowser() || state.token);
    var data = {
      token: state.token,
      memberCode: state.memberCode,
      pin: "",
      remember: persist
    };
    sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(data));
    if (persist) localStorage.setItem(REMEMBER_KEY, JSON.stringify(data));
    else localStorage.removeItem(REMEMBER_KEY);
  }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(CREDENTIALS_KEY) || localStorage.getItem(REMEMBER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem(CREDENTIALS_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  }

  function shouldPersistSession() {
    return Boolean(els.rememberInput.checked || isLineBrowser() || state.token);
  }

  function sessionLabel(sessionId) {
    var session = parseSessionId(sessionId);
    if (!session) return sessionId;
    return formatMonthDay(session.date) + "（" + dayNames[session.date.getDay()] + "） " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00";
  }

  function isBeforeDeadline(sessionId) {
    var session = parseSessionId(sessionId);
    if (!session) return false;
    return sessionStartTime(session).getTime() - Date.now() >= 3 * 60 * 60 * 1000;
  }

  function isSlotEnded(slot) {
    var session = parseSessionId(slot ? slot.sessionId : "");
    if (!session) return false;
    return sessionStartTime(session).getTime() + 60 * 60 * 1000 <= Date.now();
  }

  function isBeforeCancelDeadline(reservation) {
    var session = parseSessionId(reservation ? reservation.sessionId : "");
    if (!session) return false;
    var hours = reservation && reservation.reservationKind === "personal" ? 24 : 3;
    return sessionStartTime(session).getTime() - Date.now() >= hours * 60 * 60 * 1000;
  }

  function postBookingDeadlineNote(sessionId, reservationKind) {
    var canChange = isBeforeDeadline(sessionId);
    var canCancel = isBeforeCancelDeadline({
      sessionId: sessionId,
      reservationKind: reservationKind
    });
    if (canChange && canCancel) return "";
    if (reservationKind === "personal" && !canCancel) {
      return "\n\nパーソナル予約のキャンセル締切（前日）を過ぎているため、予約後のキャンセルは公式LINEでご連絡ください。";
    }
    return "\n\n開始3時間前を過ぎているため、この予約はあとから変更・キャンセルできません。必要な場合は公式LINEでご連絡ください。";
  }

  function bookingCancelCaution(reservationKind) {
    return reservationKind === "personal"
      ? "\n\n※前日を超えるとキャンセルが出来ませんのでご注意ください。"
      : "\n\n※開始3時間前を超えるとキャンセルが出来ませんのでご注意ください。";
  }

  function isBeforeBookDeadline(sessionId, hours) {
    var session = parseSessionId(sessionId);
    if (!session) return false;
    return sessionStartTime(session).getTime() - Date.now() >= hours * 60 * 60 * 1000;
  }

  function timeLabel(hour) {
    return pad(hour) + ":00-" + pad(hour + 1) + ":00";
  }

  function parseSessionId(sessionId) {
    var parts = String(sessionId || "").split("-");
    if (parts.length !== 4) return null;
    return {
      date: new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])),
      hour: Number(parts[3])
    };
  }

  function sessionStartTime(session) {
    return new Date(session.date.getFullYear(), session.date.getMonth(), session.date.getDate(), session.hour);
  }

  function startOfWeek(date) {
    var copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = copy.getDay();
    copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
    return copy;
  }

  function addDays(date, days) {
    var copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function toDateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function formatMonthDay(date) {
    return pad(date.getMonth() + 1) + "/" + pad(date.getDate());
  }

  function formatMonthKey(monthKey) {
    var parts = String(monthKey || "").split("-");
    if (parts.length !== 2) return "今月";
    return Number(parts[0]) + "年" + Number(parts[1]) + "月";
  }

  function pad(number) {
    return String(number).padStart(2, "0");
  }

  function memberTypeLabel(memberType) {
    if (memberType === "prime") return "正会員";
    if (memberType === "semi8") return "準会員 月8";
    if (memberType === "semi4") return "準会員 月4";
    if (memberType === "semi2") return "準会員 月2";
    return "会員";
  }

  function quotaLabel(member) {
    if (member.monthlyQuota === null || member.monthlyQuota === undefined) return "予約無制限";
    var extra = parseInt(String(member.quotaExtra || 0), 10);
    var activeExtra = member.quotaExtraMonth === toDateKey(new Date()).slice(0, 7) && isFinite(extra) ? Math.max(0, extra) : 0;
    var limit = Number(member.monthlyQuota || 0) + activeExtra;
    return "月" + limit + "回";
  }

  function normalizeMemberCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 24);
  }

  function normalizeDigits(value, maxLength) {
    return String(value || "").replace(/[^\d]/g, "").slice(0, maxLength);
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  }

  function isLineBrowser() {
    return /Line\//i.test(navigator.userAgent || "");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }
})();
