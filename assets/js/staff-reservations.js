(function () {
  "use strict";

  var STORAGE_KEY = "dojoStaffReservations.v1";
  var SESSION_MEMO_KEY = "dojoStaffSessionMemos.v1";
  var MEMBERS_KEY = "dojoStaffMembers.v1";
  var BUSINESS_CLOSURES_KEY = "dojoStaffBusinessClosures.v1";
  var TRAINER_OVERRIDES_KEY = "dojoStaffTrainerOverrides.v1";
  var ADMIN_CREDENTIALS_KEY = "dojoReservationAdminCredentials";
  var CAPACITY = 6;
  var START_HOUR = 7;
  var END_HOUR = 18;
  var memoSaveTimer = 0;
  var memoSaveSequence = 0;
  var dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  var defaultMembers = [
    { memberCode: "DJ-001", displayName: "山田 太郎", memberType: "semi8", monthlyQuota: 8, active: true, memberStatus: "active" },
    { memberCode: "DJ-002", displayName: "佐藤 花子", memberType: "prime", monthlyQuota: null, active: true, memberStatus: "active" },
    { memberCode: "DJ-003", displayName: "鈴木 一郎", memberType: "prime", monthlyQuota: null, active: true, memberStatus: "active" },
    { memberCode: "DJ-004", displayName: "高橋 健太", memberType: "semi4", monthlyQuota: 4, active: true, memberStatus: "active" },
    { memberCode: "DJ-005", displayName: "田中 美咲", memberType: "semi2", monthlyQuota: 2, active: true, memberStatus: "active" },
    { memberCode: "DJ-006", displayName: "中村 翔", memberType: "prime", monthlyQuota: null, active: true, memberStatus: "active" },
    { memberCode: "DJ-007", displayName: "伊藤 亮", memberType: "semi8", monthlyQuota: 8, active: true, memberStatus: "active" },
    { memberCode: "DJ-008", displayName: "渡辺 葵", memberType: "prime", monthlyQuota: null, active: true, memberStatus: "active" },
    { memberCode: "DJ-009", displayName: "小林 大輔", memberType: "semi4", monthlyQuota: 4, active: true, memberStatus: "active" },
    { memberCode: "DJ-010", displayName: "加藤 真央", memberType: "semi2", monthlyQuota: 2, active: true, memberStatus: "active" }
  ];

  var state = {
    weekStart: startOfWeek(new Date()),
    monthDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    viewMode: "week",
    selectedSessionId: "",
    members: loadJson(MEMBERS_KEY, defaultMembers),
    reservations: loadJson(STORAGE_KEY, []),
    lineBookingRequests: [],
    sessionMemos: loadJson(SESSION_MEMO_KEY, {}),
    businessClosures: loadJson(BUSINESS_CLOSURES_KEY, []),
    trainerOverrides: loadJson(TRAINER_OVERRIDES_KEY, []),
    remote: false,
    adminCredentials: loadSessionJson(ADMIN_CREDENTIALS_KEY, null),
    pendingAction: null,
    memberGradeFilter: "all",
    manageGradeFilter: "all",
    lineBookingExpanded: false
  };

  var els = {
    authGate: document.getElementById("authGate"),
    authForm: document.getElementById("authForm"),
    authError: document.getElementById("authError"),
    adminUserInput: document.getElementById("adminUserInput"),
    adminPasswordInput: document.getElementById("adminPasswordInput"),
    authSubmit: document.getElementById("authSubmit"),
    todayLabel: document.getElementById("todayLabel"),
    saveState: document.getElementById("saveState"),
    weekLabel: document.getElementById("weekLabel"),
    timetable: document.getElementById("timetable"),
    monthView: document.getElementById("monthView"),
    monthCalendar: document.getElementById("monthCalendar"),
    monthDayTitle: document.getElementById("monthDayTitle"),
    monthDayMeta: document.getElementById("monthDayMeta"),
    monthDaySlots: document.getElementById("monthDaySlots"),
    selectedTitle: document.getElementById("selectedTitle"),
    selectedMeta: document.getElementById("selectedMeta"),
    capacityFill: document.getElementById("capacityFill"),
    capacityText: document.getElementById("capacityText"),
    selectedCount: document.getElementById("selectedCount"),
    memberSearch: document.getElementById("memberSearch"),
    memberGradeFilters: document.getElementById("memberGradeFilters"),
    memberList: document.getElementById("memberList"),
    manualNameInput: document.getElementById("manualNameInput"),
    manualAddButton: document.getElementById("manualAddButton"),
    personalAddButton: document.getElementById("personalAddButton"),
    reservationList: document.getElementById("reservationList"),
    sessionMemo: document.getElementById("sessionMemo"),
    trainerEditButton: document.getElementById("trainerEditButton"),
    prevWeek: document.getElementById("prevWeek"),
    nextWeek: document.getElementById("nextWeek"),
    thisWeek: document.getElementById("thisWeek"),
    weekViewButton: document.getElementById("weekViewButton"),
    monthViewButton: document.getElementById("monthViewButton"),
    ngCheckButton: document.getElementById("ngCheckButton"),
    openMemberRegister: document.getElementById("openMemberRegister"),
    openBusinessManage: document.getElementById("openBusinessManage"),
    openMemberManage: document.getElementById("openMemberManage"),
    reloadButton: document.getElementById("reloadButton"),
    logoutButton: document.getElementById("logoutButton")
  };

  els.reservationModal = document.getElementById("reservationModal");
  els.reservationBackdrop = document.getElementById("reservationBackdrop");
  els.closeReservationModal = document.getElementById("closeReservationModal");
  els.confirmModal = document.getElementById("confirmModal");
  els.confirmBackdrop = document.getElementById("confirmBackdrop");
  els.confirmTitle = document.getElementById("confirmTitle");
  els.confirmMessage = document.getElementById("confirmMessage");
  els.confirmExtra = document.getElementById("confirmExtra");
  els.cancelConfirm = document.getElementById("cancelConfirm");
  els.runConfirm = document.getElementById("runConfirm");
  els.businessManageModal = document.getElementById("businessManageModal");
  els.businessManageBackdrop = document.getElementById("businessManageBackdrop");
  els.closeBusinessManage = document.getElementById("closeBusinessManage");
  els.businessForm = document.getElementById("businessForm");
  els.businessDateInput = document.getElementById("businessDateInput");
  els.businessPeriodInput = document.getElementById("businessPeriodInput");
  els.businessReasonInput = document.getElementById("businessReasonInput");
  els.businessClosureList = document.getElementById("businessClosureList");
  els.businessClosureCount = document.getElementById("businessClosureCount");
  els.memberRegisterModal = document.getElementById("memberRegisterModal");
  els.memberRegisterBackdrop = document.getElementById("memberRegisterBackdrop");
  els.closeMemberRegister = document.getElementById("closeMemberRegister");
  els.memberRegisterForm = document.getElementById("memberRegisterForm");
  els.registerMemberCodeInput = document.getElementById("registerMemberCodeInput");
  els.registerDisplayNameInput = document.getElementById("registerDisplayNameInput");
  els.registerMemberKanaInput = document.getElementById("registerMemberKanaInput");
  els.registerMemberTypeInput = document.getElementById("registerMemberTypeInput");
  els.registerPhoneLast4Input = document.getElementById("registerPhoneLast4Input");
  els.registerBirthMmddInput = document.getElementById("registerBirthMmddInput");
  els.memberRegisterSubmit = document.getElementById("memberRegisterSubmit");
  els.memberRegisterComplete = document.getElementById("memberRegisterComplete");
  els.memberRegisterGuideText = document.getElementById("memberRegisterGuideText");
  els.copyMemberRegisterGuide = document.getElementById("copyMemberRegisterGuide");
  els.registerAnotherMember = document.getElementById("registerAnotherMember");
  els.memberManageModal = document.getElementById("memberManageModal");
  els.memberManageBackdrop = document.getElementById("memberManageBackdrop");
  els.closeMemberManage = document.getElementById("closeMemberManage");
  els.lineBookingPanel = document.getElementById("lineBookingPanel");
  els.lineBookingHeadline = document.getElementById("lineBookingHeadline");
  els.lineBookingList = document.getElementById("lineBookingList");
  els.lineBookingCount = document.getElementById("lineBookingCount");
  els.memberForm = document.getElementById("memberForm");
  els.memberFormTitle = document.getElementById("memberFormTitle");
  els.editingMemberCode = document.getElementById("editingMemberCode");
  els.memberCodeInput = document.getElementById("memberCodeInput");
  els.displayNameInput = document.getElementById("displayNameInput");
  els.memberKanaInput = document.getElementById("memberKanaInput");
  els.memberTypeInput = document.getElementById("memberTypeInput");
  els.memberStatusInput = document.getElementById("memberStatusInput");
  els.quotaExtraInput = document.getElementById("quotaExtraInput");
  els.pauseOnInput = document.getElementById("pauseOnInput");
  els.phoneLast4Input = document.getElementById("phoneLast4Input");
  els.birthMmddInput = document.getElementById("birthMmddInput");
  els.ngMembersInput = document.getElementById("ngMembersInput");
  els.memberAuthState = document.getElementById("memberAuthState");
  els.memberEditActions = document.getElementById("memberEditActions");
  els.memberLoginInfoAction = document.getElementById("memberLoginInfoAction");
  els.memberStatusAction = document.getElementById("memberStatusAction");
  els.memberDeleteAction = document.getElementById("memberDeleteAction");
  els.manageMemberList = document.getElementById("manageMemberList");
  els.memberManageCount = document.getElementById("memberManageCount");
  els.manageGradeFilters = document.getElementById("manageGradeFilters");

  init();

  function init() {
    state.members = state.members.map(normalizeMember);
    els.todayLabel.textContent = formatDateJa(new Date());
    state.selectedSessionId = makeSessionId(state.weekStart, 0, START_HOUR);

    els.authForm.addEventListener("submit", submitAuthForm);

    els.prevWeek.addEventListener("click", function () {
      if (state.viewMode === "month") {
        state.monthDate = addMonths(state.monthDate, -1);
        selectFirstVisibleMonthDay();
      } else {
        state.weekStart = addDays(state.weekStart, -7);
        state.selectedSessionId = makeSessionId(state.weekStart, 0, START_HOUR);
      }
      render();
    });

    els.nextWeek.addEventListener("click", function () {
      if (state.viewMode === "month") {
        state.monthDate = addMonths(state.monthDate, 1);
        selectFirstVisibleMonthDay();
      } else {
        state.weekStart = addDays(state.weekStart, 7);
        state.selectedSessionId = makeSessionId(state.weekStart, 0, START_HOUR);
      }
      render();
    });

    els.thisWeek.addEventListener("click", function () {
      state.weekStart = startOfWeek(new Date());
      state.monthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      state.selectedSessionId = makeSessionId(state.weekStart, 0, START_HOUR);
      render();
    });

    els.weekViewButton.addEventListener("click", function () {
      state.viewMode = "week";
      state.weekStart = startOfWeek(parseSessionId(state.selectedSessionId).date);
      render();
    });

    els.monthViewButton.addEventListener("click", function () {
      state.viewMode = "month";
      var selected = parseSessionId(state.selectedSessionId);
      state.monthDate = new Date(selected.date.getFullYear(), selected.date.getMonth(), 1);
      render();
    });

    els.logoutButton.addEventListener("click", logout);
    els.reloadButton.addEventListener("click", loadRemoteData);
    els.ngCheckButton.addEventListener("click", runNgCheck);
    els.openMemberRegister.addEventListener("click", openMemberRegister);
    els.openBusinessManage.addEventListener("click", openBusinessManage);
    els.openMemberManage.addEventListener("click", openMemberManage);
    els.reservationBackdrop.addEventListener("click", closeReservationModal);
    els.closeReservationModal.addEventListener("click", closeReservationModal);
    els.confirmBackdrop.addEventListener("click", closeConfirm);
    els.cancelConfirm.addEventListener("click", closeConfirm);
    els.runConfirm.addEventListener("click", runPendingAction);
    els.confirmExtra.addEventListener("click", function (event) {
      var copyButton = event.target.closest("[data-copy-line-reply]");
      if (!copyButton) return;

      var textarea = els.confirmExtra.querySelector(".line-reply-copy");
      if (!textarea) return;

      copyText(textarea.value);
      copyButton.textContent = "コピーしました";
      copyButton.classList.add("is-copied");
      setTimeout(function () {
        copyButton.textContent = "文章をコピー";
        copyButton.classList.remove("is-copied");
      }, 1800);
    });
    els.businessManageBackdrop.addEventListener("click", closeBusinessManage);
    els.closeBusinessManage.addEventListener("click", closeBusinessManage);
    els.businessForm.addEventListener("submit", submitBusinessForm);
    els.memberRegisterBackdrop.addEventListener("click", closeMemberRegister);
    els.closeMemberRegister.addEventListener("click", closeMemberRegister);
    els.memberRegisterForm.addEventListener("submit", submitMemberRegisterForm);
    els.copyMemberRegisterGuide.addEventListener("click", function () {
      copyText(els.memberRegisterGuideText.value);
      openConfirm({ title: "案内文をコピーしました", message: "LINE / Instagram / メールなどで会員さんへ送ってください。", notice: true });
    });
    els.registerAnotherMember.addEventListener("click", resetMemberRegisterForm);
    els.memberManageBackdrop.addEventListener("click", closeMemberManage);
    els.closeMemberManage.addEventListener("click", closeMemberManage);
    els.memberForm.addEventListener("submit", submitMemberForm);
    els.memberLoginInfoAction.addEventListener("click", function () {
      if (els.editingMemberCode.value) requestResetAndIssueMemberLineGuide(els.editingMemberCode.value);
    });
    els.memberStatusAction.addEventListener("click", function () {
      if (els.editingMemberCode.value) requestToggleMemberStatus(els.editingMemberCode.value);
    });
    els.memberDeleteAction.addEventListener("click", function () {
      if (els.editingMemberCode.value) requestDeleteMember(els.editingMemberCode.value);
    });
    els.memberSearch.addEventListener("input", renderMemberList);
    if (els.lineBookingPanel) {
      els.lineBookingPanel.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        toggleLineBookingPanel();
      });
      els.lineBookingPanel.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("button")) return;
        event.preventDefault();
        toggleLineBookingPanel();
      });
    }
    els.manualAddButton.addEventListener("click", requestAddManualReservation);
    if (els.personalAddButton) els.personalAddButton.addEventListener("click", requestAddPersonalReservation);
    els.trainerEditButton.addEventListener("click", requestEditSessionTrainer);
    bindGradeFilters(els.memberGradeFilters, "memberGradeFilter", renderMemberList);
    bindGradeFilters(els.manageGradeFilters, "manageGradeFilter", renderManageMemberList);

    els.sessionMemo.addEventListener("input", function () {
      if (!state.selectedSessionId) return;
      state.sessionMemos[state.selectedSessionId] = els.sessionMemo.value;
      saveMemos();
    });

    if (!hasAdminCredentials()) {
      showAuthGate("");
      return;
    }

    loadRemoteData();
  }

  function render() {
    renderWeekLabel();
    renderViewMode();
    renderLineBookingRequests();
    if (state.viewMode === "month") renderMonthView();
    else renderTimetable();
    renderSelectedPanel();
  }

  function renderLineBookingRequests() {
    var requests = state.lineBookingRequests || [];
    if (!els.lineBookingPanel || !els.lineBookingList) return;
    els.lineBookingPanel.hidden = !requests.length;
    els.lineBookingPanel.classList.toggle("is-expanded", state.lineBookingExpanded);
    els.lineBookingPanel.setAttribute("aria-expanded", state.lineBookingExpanded ? "true" : "false");
    els.lineBookingCount.textContent = requests.length + "件";
    if (els.lineBookingHeadline) {
      els.lineBookingHeadline.textContent = requests.length + "件の予約が入っております";
    }
    var notice = els.lineBookingPanel.querySelector(".line-booking-panel__notice");
    if (notice) notice.hidden = !state.lineBookingExpanded;
    els.lineBookingList.hidden = !state.lineBookingExpanded;
    if (!requests.length) {
      els.lineBookingList.innerHTML = "";
      return;
    }

    els.lineBookingList.innerHTML = requests.map(function (request) {
      var session = request.sessionId ? parseSessionId(request.sessionId) : null;
      var dateTime = session
        ? formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00"
        : escapeHtml(request.preferredDate + " " + request.preferredTime);
      var plan = lineBookingPlanLabel(request);
      var capacityNote = request.sessionId ? lineBookingCapacityNote(request.sessionId, request.people) : "手動確認";
      var lineName = request.lineDisplayName ? request.lineDisplayName : "未取得";
      return '<article class="line-booking-card">' +
        '<div class="line-booking-card__main">' +
          '<b>' + escapeHtml(request.displayName) + '</b>' +
          '<span>' + escapeHtml(plan) + ' / ' + escapeHtml(String(request.people || 1)) + '名 / ' + dateTime + '</span>' +
          '<small>受付: ' + escapeHtml(formatCreatedAt(request.createdAt)) + ' / LINE: ' + escapeHtml(lineName) + ' / ' + escapeHtml(capacityNote) + '</small>' +
        '</div>' +
        '<div class="line-booking-card__actions">' +
          '<button class="text-btn text-btn--small line-booking-approve" type="button" data-line-booking-id="' + escapeHtml(request.id) + '"' + (request.sessionId ? "" : " disabled") + '>承認</button>' +
          '<button class="text-btn text-btn--small text-btn--danger line-booking-cancel" type="button" data-line-booking-id="' + escapeHtml(request.id) + '">キャンセル</button>' +
        '</div>' +
      '</article>';
    }).join("");

    Array.prototype.forEach.call(els.lineBookingList.querySelectorAll(".line-booking-approve"), function (button) {
      button.addEventListener("click", function () {
        requestApproveLineBooking(button.getAttribute("data-line-booking-id"));
      });
    });
    Array.prototype.forEach.call(els.lineBookingList.querySelectorAll(".line-booking-cancel"), function (button) {
      button.addEventListener("click", function () {
        requestCancelLineBooking(button.getAttribute("data-line-booking-id"));
      });
    });
  }

  function toggleLineBookingPanel() {
    if (!state.lineBookingRequests.length) return;
    state.lineBookingExpanded = !state.lineBookingExpanded;
    renderLineBookingRequests();
  }

  function renderWeekLabel() {
    if (state.viewMode === "month") {
      els.weekLabel.textContent = state.monthDate.getFullYear() + "年" + (state.monthDate.getMonth() + 1) + "月";
      els.thisWeek.textContent = "今月";
      return;
    }
    var end = addDays(state.weekStart, 6);
    els.weekLabel.textContent = formatMonthDay(state.weekStart) + " - " + formatMonthDay(end);
    els.thisWeek.textContent = "今週";
  }

  function renderViewMode() {
    var month = state.viewMode === "month";
    var timetableWrap = document.querySelector(".timetable-wrap");
    if (timetableWrap) timetableWrap.hidden = month;
    els.monthView.hidden = !month;
    els.weekViewButton.classList.toggle("is-active", !month);
    els.monthViewButton.classList.toggle("is-active", month);
  }

  function renderTimetable() {
    var html = '<div class="time-head"></div>';

    for (var dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      var date = addDays(state.weekStart, dayIndex);
      var todayClass = toDateKey(date) === toDateKey(new Date()) ? " is-today" : "";
      html += '<div class="day-head day-' + date.getDay() + todayClass + '"><b>' + formatMonthDay(date) + '</b><span>' + dayNames[date.getDay()] + '曜日</span></div>';
    }

    for (var hour = START_HOUR; hour < END_HOUR; hour += 1) {
      html += '<div class="time-label">' + pad(hour) + ':00</div>';

      for (var col = 0; col < 7; col += 1) {
        var session = makeSession(addDays(state.weekStart, col), hour);
        html += renderSlot(session);
      }
    }

    els.timetable.innerHTML = html;

    Array.prototype.forEach.call(els.timetable.querySelectorAll(".slot"), function (slot) {
      slot.addEventListener("click", function () {
        state.selectedSessionId = slot.getAttribute("data-session-id");
        render();
        openReservationModal();
      });
    });
  }

  function renderSlot(session) {
    var reservations = getReservationsForSession(session.id);
    var units = sessionUnits(reservations);
    var personal = hasPersonalReservation(reservations);
    var closure = getClosureForSession(session);
    var isSelected = session.id === state.selectedSessionId ? " is-selected" : "";
    var isPrime = session.accessRule === "prime_only" ? " is-prime" : "";
    var isFull = units >= session.capacity ? " is-full" : "";
    var isClosed = closure ? " is-closed" : "";
    var isToday = toDateKey(session.date) === toDateKey(new Date()) ? " is-today" : "";
    var hasReservation = units > 0 ? " has-reservation" : "";
    var trainer = trainerForSession(session);
    var periodClass = timePeriodForHour(session.hour) === "morning" ? " is-morning" : " is-afternoon";
    var countLabel = closure ? "予約不可" : units >= session.capacity ? "満席" : units + "/" + session.capacity;

    return '<button class="slot day-' + session.date.getDay() + periodClass + hasReservation + isSelected + isPrime + isFull + isClosed + isToday + '" type="button" data-session-id="' + session.id + '">' +
      '<span class="slot__top">' +
      '<span class="slot__trainer">' + escapeHtml(trainer.label) + (trainer.custom ? ' *' : '') + '</span>' +
      '<span class="slot__count">' + countLabel + '</span>' +
      '</span>' +
      '</button>';
  }

  function renderMonthView() {
    renderMonthCalendar();
    renderMonthDaySlots();
  }

  function renderMonthCalendar() {
    var first = new Date(state.monthDate.getFullYear(), state.monthDate.getMonth(), 1);
    var gridStart = addDays(first, -first.getDay());
    var selectedDate = parseSessionId(state.selectedSessionId).date;
    var html = "";

    dayNames.forEach(function (name) {
      html += '<div class="month-weekday">' + name + '</div>';
    });

    for (var index = 0; index < 42; index += 1) {
      var date = addDays(gridStart, index);
      var summary = summarizeDay(date);
      var dateKey = toDateKey(date);
      var selected = isSameDate(selectedDate, date) ? " is-selected" : "";
      var today = dateKey === toDateKey(new Date()) ? " is-today" : "";
      var outside = date.getMonth() !== state.monthDate.getMonth() ? " is-outside" : "";
      var closed = summary.closedSlots >= summary.totalSlots ? " is-closed" : "";
      var hasReservations = summary.units > 0 ? " has-reservation" : "";
      var label = summary.closedSlots >= summary.totalSlots ? "予約不可" : summary.units + "/" + summary.capacityUnits + "人";
      html += '<button class="month-day day-' + date.getDay() + selected + today + outside + closed + hasReservations + '" type="button" data-date="' + dateKey + '">' +
        '<span class="month-day__num">' + date.getDate() + '</span>' +
        '<span class="month-day__label">' + label + '</span>' +
        '<span class="month-day__meta">' + summary.bookedSessions + '/' + summary.totalSlots + '</span>' +
        (summary.personalSlots ? '<span class="month-day__pt">PT ' + summary.personalSlots + '</span>' : '') +
        '</button>';
    }

    els.monthCalendar.innerHTML = html;
    Array.prototype.forEach.call(els.monthCalendar.querySelectorAll(".month-day"), function (button) {
      button.addEventListener("click", function () {
        var date = parseDateKey(button.getAttribute("data-date"));
        state.selectedSessionId = toDateKey(date) + "-" + pad(START_HOUR);
        render();
      });
    });
  }

  function renderMonthDaySlots() {
    var selected = parseSessionId(state.selectedSessionId);
    var summary = summarizeDay(selected.date);
    var html = "";

    els.monthDayTitle.textContent = formatMonthDay(selected.date) + "（" + dayNames[selected.date.getDay()] + "）";
    els.monthDayMeta.textContent = summary.closedSlots >= summary.totalSlots ? "この日は予約不可です" : summary.units + "/" + summary.capacityUnits + "人";

    for (var hour = START_HOUR; hour < END_HOUR; hour += 1) {
      html += renderMonthSlot(makeSession(selected.date, hour));
    }

    els.monthDaySlots.innerHTML = html;
    Array.prototype.forEach.call(els.monthDaySlots.querySelectorAll(".month-slot"), function (slot) {
      slot.addEventListener("click", function () {
        state.selectedSessionId = slot.getAttribute("data-session-id");
        render();
        openReservationModal();
      });
    });
  }

  function renderMonthSlot(session) {
    var reservations = getReservationsForSession(session.id);
    var units = sessionUnits(reservations);
    var closure = getClosureForSession(session);
    var trainer = trainerForSession(session);
    var selected = session.id === state.selectedSessionId ? " is-selected" : "";
    var full = units >= session.capacity ? " is-full" : "";
    var closed = closure ? " is-closed" : "";
    var hasReservation = units > 0 ? " has-reservation" : "";
    var periodClass = timePeriodForHour(session.hour) === "morning" ? " is-morning" : " is-afternoon";
    var countLabel = closure ? "予約不可" : units >= session.capacity ? "満席" : units + "/" + session.capacity + "枠";
    return '<button class="month-slot' + periodClass + selected + full + closed + hasReservation + '" type="button" data-session-id="' + session.id + '">' +
      '<span><b>' + pad(session.hour) + ':00-' + pad(session.hour + 1) + ':00</b><small>' + escapeHtml(trainer.label) + (trainer.custom ? ' *' : '') + '</small></span>' +
      '<strong>' + countLabel + '</strong>' +
      '</button>';
  }

  function renderSelectedPanel() {
    var session = parseSessionId(state.selectedSessionId);
    var reservations = getReservationsForSession(state.selectedSessionId);
    var units = sessionUnits(reservations);
    var closure = getClosureForSession(session);
    var percent = Math.min(100, Math.round((units / CAPACITY) * 100));
    var fillColor = units >= CAPACITY ? "var(--red)" : "var(--green)";

    els.selectedTitle.textContent = formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00";
    els.selectedMeta.textContent = (closure ? "予約不可 / " + closure.reason : (session.accessRule === "prime_only" ? "正会員のみ" : "通常・準会員可") + " / 定員" + CAPACITY + "名") + " / " + trainerForSession(session).label;
    els.capacityFill.style.width = percent + "%";
    els.capacityFill.style.background = fillColor;
    els.capacityText.textContent = units + " / " + CAPACITY;
    els.selectedCount.textContent = units + "枠";
    els.sessionMemo.value = state.sessionMemos[state.selectedSessionId] || "";
    if (els.personalAddButton) els.personalAddButton.disabled = Boolean(closure) || units !== 0;

    renderReservationList(reservations);
    renderMemberList();
  }

  function renderMemberList() {
    var query = els.memberSearch.value;
    var session = parseSessionId(state.selectedSessionId);
    var reservations = getReservationsForSession(state.selectedSessionId);
    var closure = getClosureForSession(session);
    var units = sessionUnits(reservations);
    var full = units >= CAPACITY;
    var personalAvailable = !closure && units === 0;
    var html = "";

    state.members.filter(function (member) {
      if (!isReservableMember(member)) return false;
      if (state.memberGradeFilter !== "all" && member.memberType !== state.memberGradeFilter) return false;
      if (!query) return true;
      return memberMatchesQuery(member, query);
    }).slice(0, 10).forEach(function (member) {
      var alreadyBooked = reservations.some(function (reservation) {
        return reservation.memberCode === member.memberCode;
      });
      var primeBlocked = session.accessRule === "prime_only" && member.memberType !== "prime";
      var quota = getMonthlyUsage(member.memberCode, session.date);
      var quotaLimit = effectiveMonthlyQuota(member, monthKeyFromDate(session.date));
      var quotaBlocked = quotaLimit !== null && quota.used >= quotaLimit;
      var disabled = Boolean(closure) || alreadyBooked || full || primeBlocked || quotaBlocked;
      var ptDisabled = !personalAvailable || alreadyBooked || primeBlocked || quotaBlocked;
      var note = closure ? "予約不可" : alreadyBooked ? "予約済み" : primeBlocked ? "対象外" : quotaBlocked ? "上限" : full ? "満席" : "追加";
      var primeClass = member.memberType === "prime" ? " member-type--prime" : "";
      var quotaLabel = quotaLimit === null ? "予約無制限" : "今月 " + quota.used + " / " + quotaLimit;

      html += '<div class="member-row">' +
        '<button class="member-btn" type="button" data-member-code="' + member.memberCode + '"' + (disabled ? " disabled" : "") + '>' +
          '<span><b>' + escapeHtml(member.displayName) + '</b><small>' + escapeHtml(member.memberCode) + ' / ' + memberTypeLabel(member.memberType) + ' / ' + quotaLabel + '</small></span>' +
          '<span class="member-type' + primeClass + '">' + note + '</span>' +
        '</button>' +
        '<button class="member-pt-btn" type="button" data-member-code="' + member.memberCode + '"' + (ptDisabled ? " disabled" : "") + '>PT</button>' +
      '</div>';
    });

    if (!html) {
      html = '<p class="empty-note">該当なし</p>';
    }

    els.memberList.innerHTML = html;

    Array.prototype.forEach.call(els.memberList.querySelectorAll(".member-btn"), function (button) {
      button.addEventListener("click", function () {
        requestAddReservation(button.getAttribute("data-member-code"));
      });
    });
    Array.prototype.forEach.call(els.memberList.querySelectorAll(".member-pt-btn"), function (button) {
      button.addEventListener("click", function () {
        requestAddReservation(button.getAttribute("data-member-code"), "personal");
      });
    });
  }

  function renderReservationList(reservations) {
    if (!reservations.length) {
      els.reservationList.innerHTML = '<li class="empty-note">予約なし</li>';
      return;
    }

    els.reservationList.innerHTML = reservations.map(function (reservation) {
      var detail = reservationDetailLabel(reservation);
      var itemClass = reservation.reservationKind === "referral" ? " reservation-item--referral" : "";
      return '<li class="reservation-item' + itemClass + '">' +
        '<span><b>' + escapeHtml(reservation.displayName) + '</b><small>' + escapeHtml(reservation.memberCode) + ' / ' + memberTypeLabel(reservation.memberType) + detail + '</small></span>' +
        '<button class="remove-btn" type="button" data-reservation-id="' + reservation.id + '" aria-label="予約を削除">×</button>' +
        '</li>';
    }).join("");

    Array.prototype.forEach.call(els.reservationList.querySelectorAll(".remove-btn"), function (button) {
      button.addEventListener("click", function () {
        requestCancelReservation(button.getAttribute("data-reservation-id"));
      });
    });
  }

  function requestAddReservation(memberCode, reservationKind) {
    reservationKind = reservationKind === "personal" ? "personal" : "regular";
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    var session = parseSessionId(state.selectedSessionId);
    if (!member) return;
    var kindLabel = reservationKind === "personal" ? "パーソナル予約" : "予約";
    var feeText = reservationKind === "personal" ? "\n別途料金3000円がかかります。またこの枠は満席となります。" : "";

    openConfirm({
      title: kindLabel + "を追加しますか",
      message: formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00 に " + member.displayName + "（" + memberTypeLabel(member.memberType) + "）を追加します。" + feeText,
      run: function () {
        addReservation(memberCode, reservationKind);
      }
    });
  }

  function requestCancelReservation(reservationId) {
    var reservation = state.reservations.find(function (item) {
      return item.id === reservationId;
    });
    var session = parseSessionId(state.selectedSessionId);
    if (!reservation) return;

    openConfirm({
      title: "予約を削除しますか",
      message: formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00 の " + reservation.displayName + " を削除します。",
      run: function () {
        cancelReservation(reservationId);
      }
    });
  }

  function requestApproveLineBooking(requestId) {
    var request = findLineBookingRequest(requestId);
    if (!request) return;
    var session = request.sessionId ? parseSessionId(request.sessionId) : null;
    var message = session
      ? formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00 に " + request.displayName + "（" + lineBookingPlanLabel(request) + "）を確定予約として追加します。"
      : request.displayName + " の仮予約は日時が未確定のため承認できません。";
    openConfirm({
      title: "LINE仮予約を承認しますか",
      message: message,
      run: function () {
        approveLineBooking(requestId);
      }
    });
  }

  function requestCancelLineBooking(requestId) {
    var request = findLineBookingRequest(requestId);
    if (!request) return;
    openConfirm({
      title: "LINE仮予約をキャンセルしますか",
      message: request.displayName + "（" + lineBookingPlanLabel(request) + "）へキャンセル通知を送ります。",
      run: function () {
        cancelLineBooking(requestId);
      }
    });
  }

  function requestAddManualReservation() {
    var displayName = els.manualNameInput.value.trim();
    var session = parseSessionId(state.selectedSessionId);
    var reservations = getReservationsForSession(state.selectedSessionId);
    if (!displayName || sessionUnits(reservations) >= CAPACITY) return;

    openConfirm({
      title: "名前だけで予約を追加しますか",
      message: formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00 に " + displayName + " を追加します。会員登録は行いません。",
      run: function () {
        addManualReservation(displayName);
      }
    });
  }

  function requestAddPersonalReservation() {
    var query = els.memberSearch.value;
    var candidates = state.members.filter(function (member) {
      if (!isReservableMember(member)) return false;
      if (!query) return false;
      return memberMatchesQuery(member, query);
    });
    if (candidates.length !== 1) {
      openConfirm({
        title: "会員を1名に絞ってください",
        message: "会員リスト右側のPTボタンを押すか、会員検索で対象が1名になる状態でパーソナル予約を押してください。",
        notice: true
      });
      return;
    }
    var reservations = getReservationsForSession(state.selectedSessionId);
    if (getClosureForSession(parseSessionId(state.selectedSessionId)) || sessionUnits(reservations) !== 0) {
      openConfirm({
        title: "パーソナル予約できません",
        message: "パーソナル予約は空き6/6枠の時のみ追加できます。",
        notice: true
      });
      return;
    }
    requestAddReservation(candidates[0].memberCode, "personal");
  }

  function requestEditSessionTrainer() {
    var session = parseSessionId(state.selectedSessionId);
    var current = trainerForSession(session);
    var value = window.prompt("この枠の担当名を入力してください。空欄で標準担当に戻します。", current.custom ? current.label.replace(/^担当: /, "") : "");
    if (value === null) return;
    var label = value.trim();
    if (!label) {
      deleteTrainerOverride(state.selectedSessionId);
      return;
    }
    saveTrainerOverride({
      sessionId: state.selectedSessionId,
      trainerId: slugTrainerLabel(label),
      trainerLabel: label.indexOf("担当:") === 0 ? label : "担当: " + label
    });
  }

  function saveTrainerOverride(override) {
    var apply = function (saved) {
      var next = saved || override;
      state.trainerOverrides = state.trainerOverrides.filter(function (item) {
        return item.sessionId !== next.sessionId;
      }).concat([next]);
      saveTrainerOverrides();
      render();
    };
    if (!state.remote) {
      apply(override);
      return;
    }
    apiPost("trainer-override", override).then(function (data) {
      apply(data.override || override);
    }).catch(showApiError);
  }

  function deleteTrainerOverride(sessionId) {
    var apply = function () {
      state.trainerOverrides = state.trainerOverrides.filter(function (item) {
        return item.sessionId !== sessionId;
      });
      saveTrainerOverrides();
      render();
    };
    if (!state.remote) {
      apply();
      return;
    }
    apiPost("trainer-override-delete", { sessionId: sessionId }).then(apply).catch(showApiError);
  }

  function addReservation(memberCode, reservationKind) {
    reservationKind = reservationKind === "personal" ? "personal" : "regular";
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    var session = parseSessionId(state.selectedSessionId);
    var reservations = getReservationsForSession(state.selectedSessionId);
    var capacityUnits = reservationKind === "personal" ? CAPACITY : 1;

    if (getClosureForSession(session)) return showApiError(new Error("この枠は予約不可です。"));
    if (!member) return showApiError(new Error("会員が見つかりません。"));
    if (reservationKind === "personal" && sessionUnits(reservations) !== 0) return showApiError(new Error("パーソナル予約は空き6/6枠の時のみ追加できます。"));
    if (sessionUnits(reservations) + capacityUnits > CAPACITY) return showApiError(new Error("この枠は満席です。"));
    if (!isReservableMember(member)) return showApiError(new Error("休会中または削除済みの会員は予約できません。"));
    if (session.accessRule === "prime_only" && member.memberType !== "prime") return showApiError(new Error("この時間は正会員のみ予約できます。"));
    if (reservations.some(function (reservation) { return reservation.memberCode === member.memberCode; })) return showApiError(new Error("この会員はすでに予約済みです。"));
    var quotaLimit = effectiveMonthlyQuota(member, monthKeyFromDate(session.date));
    if (quotaLimit !== null && getMonthlyUsage(member.memberCode, session.date).used >= quotaLimit) return showApiError(new Error("月間予約上限に達しています。"));

    if (state.remote) {
      apiPost("book", { sessionId: state.selectedSessionId, memberCode: member.memberCode, reservationKind: reservationKind }).then(function (data) {
        state.reservations.push(normalizeReservation(data.reservation));
        saveReservations();
        render();
      }).catch(showApiError);
      return;
    }

    state.reservations.push({
      id: "rsv-" + Date.now() + "-" + Math.round(Math.random() * 10000),
      sessionId: state.selectedSessionId,
      memberCode: member.memberCode,
      displayName: member.displayName,
      memberType: member.memberType,
      monthlyQuota: member.monthlyQuota,
      status: "confirmed",
      createdBy: "staff",
      createdAt: new Date().toISOString(),
      cancelledAt: "",
      reservationKind: reservationKind,
      capacityUnits: capacityUnits,
      priceYen: reservationKind === "personal" ? 3000 : null
    });

    saveReservations();
    render();
  }

  function addManualReservation(displayName) {
    var reservations = getReservationsForSession(state.selectedSessionId);
    if (!displayName || getClosureForSession(parseSessionId(state.selectedSessionId)) || sessionUnits(reservations) >= CAPACITY) return;

    if (state.remote) {
      apiPost("book", { sessionId: state.selectedSessionId, displayName: displayName }).then(function (data) {
        state.reservations.push(normalizeReservation(data.reservation));
        els.manualNameInput.value = "";
        saveReservations();
        render();
      }).catch(showApiError);
      return;
    }

    state.reservations.push({
      id: "rsv-manual-" + Date.now() + "-" + Math.round(Math.random() * 10000),
      sessionId: state.selectedSessionId,
      memberCode: "MANUAL",
      displayName: displayName,
      memberType: "manual",
      monthlyQuota: null,
      status: "confirmed",
      createdBy: "staff",
      createdAt: new Date().toISOString(),
      cancelledAt: "",
      reservationKind: "regular",
      capacityUnits: 1,
      priceYen: null
    });

    els.manualNameInput.value = "";
    saveReservations();
    render();
  }

  function cancelReservation(reservationId) {
    if (state.remote) {
      apiPost("cancel", { id: reservationId }).then(function () {
        removeReservation(reservationId);
        saveReservations();
        render();
      }).catch(showApiError);
      return;
    }

    removeReservation(reservationId);
    saveReservations();
    render();
  }

  function approveLineBooking(requestId) {
    if (!state.remote) return;
    setSaveState("保存中", "pending");
    apiPost("line-booking-approve", { id: requestId }).then(function (data) {
      state.lineBookingRequests = state.lineBookingRequests.filter(function (request) {
        return request.id !== requestId;
      });
      if (data.reservation) {
        state.reservations.push(normalizeReservation(data.reservation));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.reservations));
      }
      setSaveState("D1保存済み", "saved");
      render();
      showLineBookingReplyGuide(data.lineMessage, "承認しました");
    }).catch(showApiError);
  }

  function cancelLineBooking(requestId) {
    if (!state.remote) return;
    setSaveState("保存中", "pending");
    apiPost("line-booking-cancel", { id: requestId }).then(function (data) {
      state.lineBookingRequests = state.lineBookingRequests.filter(function (request) {
        return request.id !== requestId;
      });
      setSaveState("D1保存済み", "saved");
      render();
      showLineBookingReplyGuide(data.lineMessage, "キャンセルしました");
    }).catch(showApiError);
  }

  function showLineBookingReplyGuide(text, title) {
    if (!text) return;
    openConfirm({
      title: title,
      message: "申込者へのLINE通知は自動送信していません。\n下記メッセージをコピーして、公式LINEのチャット画面でご返答ください。",
      extra:
        '<div class="line-reply-copybox">' +
        '<textarea class="line-reply-copy" readonly rows="8">' + escapeHtml(text) + '</textarea>' +
        '<button class="text-btn line-reply-copy-button" type="button" data-copy-line-reply>文章をコピー</button>' +
        '</div>',
      notice: true
    });
  }

  function removeReservation(reservationId) {
    state.reservations = state.reservations.filter(function (reservation) {
      return reservation.id !== reservationId;
    });
  }

  function normalizeReservation(reservation) {
    return Object.assign({
      status: "confirmed",
      createdBy: "staff",
      createdAt: new Date().toISOString(),
      cancelledAt: "",
      reservationKind: "regular",
      capacityUnits: 1,
      priceYen: null,
      quotaExempt: false,
      quotaExemptReason: "",
      guestName: "",
      guestResident: "",
      guestCount: 0
    }, reservation);
  }

  function openReservationModal() {
    els.reservationModal.classList.add("is-open");
    els.reservationBackdrop.classList.add("is-open");
    els.reservationModal.style.transform = "translateY(0)";
    els.reservationModal.style.visibility = "visible";
    els.reservationModal.setAttribute("aria-hidden", "false");
  }

  function openMemberManage() {
    resetMemberForm();
    renderManageMemberList();
    els.memberManageModal.classList.add("is-open");
    els.memberManageBackdrop.classList.add("is-open");
    els.memberManageModal.querySelector(".member-manage-panel").style.transform = "translateY(0)";
    els.memberManageModal.querySelector(".member-manage-panel").style.visibility = "visible";
    els.memberManageModal.setAttribute("aria-hidden", "false");
  }

  function closeMemberManage() {
    els.memberManageModal.classList.remove("is-open");
    els.memberManageBackdrop.classList.remove("is-open");
    els.memberManageModal.querySelector(".member-manage-panel").style.transform = "";
    els.memberManageModal.querySelector(".member-manage-panel").style.visibility = "";
    els.memberManageModal.setAttribute("aria-hidden", "true");
  }

  function openBusinessManage() {
    els.businessDateInput.value = currentDateKey();
    els.businessPeriodInput.value = "morning";
    els.businessReasonInput.value = "";
    renderBusinessClosureList();
    els.businessManageModal.classList.add("is-open");
    els.businessManageBackdrop.classList.add("is-open");
    els.businessManageModal.querySelector(".business-manage-panel").style.transform = "translateY(0)";
    els.businessManageModal.querySelector(".business-manage-panel").style.visibility = "visible";
    els.businessManageModal.setAttribute("aria-hidden", "false");
  }

  function closeBusinessManage() {
    els.businessManageModal.classList.remove("is-open");
    els.businessManageBackdrop.classList.remove("is-open");
    els.businessManageModal.querySelector(".business-manage-panel").style.transform = "";
    els.businessManageModal.querySelector(".business-manage-panel").style.visibility = "";
    els.businessManageModal.setAttribute("aria-hidden", "true");
  }

  function submitBusinessForm(event) {
    event.preventDefault();
    var dateKey = normalizeDateKey(els.businessDateInput.value);
    var period = els.businessPeriodInput.value;
    var reason = els.businessReasonInput.value.trim();
    if (!dateKey || !isClosurePeriod(period)) return;
    saveBusinessClosure({
      id: dateKey + "-" + period,
      dateKey: dateKey,
      period: period,
      reason: reason
    });
  }

  function saveBusinessClosure(closure) {
    var apply = function (saved) {
      var next = saved || closure;
      state.businessClosures = state.businessClosures.filter(function (item) {
        return item.id !== next.id;
      }).concat([next]);
      saveBusinessClosures();
      els.businessReasonInput.value = "";
      renderBusinessClosureList();
      render();
    };
    if (!state.remote) {
      apply(closure);
      return;
    }
    apiPost("business-closure", closure).then(function (data) {
      apply(data.closure || closure);
    }).catch(showApiError);
  }

  function requestDeleteBusinessClosure(id) {
    var closure = state.businessClosures.find(function (item) { return item.id === id; });
    if (!closure) return;
    openConfirm({
      title: "予約不可を解除しますか",
      message: formatDateKeyJa(closure.dateKey) + " / " + closurePeriodLabel(closure.period),
      run: function () {
        deleteBusinessClosure(id);
      }
    });
  }

  function deleteBusinessClosure(id) {
    var apply = function () {
      state.businessClosures = state.businessClosures.filter(function (item) {
        return item.id !== id;
      });
      saveBusinessClosures();
      renderBusinessClosureList();
      render();
    };
    if (!state.remote) {
      apply();
      return;
    }
    apiPost("business-closure-delete", { id: id }).then(apply).catch(showApiError);
  }

  function renderBusinessClosureList() {
    var customClosures = state.businessClosures.slice().sort(function (a, b) {
      return String(b.dateKey).localeCompare(String(a.dateKey));
    });
    els.businessClosureCount.textContent = "固定2件 / 追加" + customClosures.length + "件";
    var html = '<div class="business-closure-item is-fixed">' +
      '<span><b>毎週 日曜</b><small>全日（7:00-18:00） / 固定ルール</small></span>' +
      '<em>固定</em>' +
      '</div>' +
      '<div class="business-closure-item is-fixed">' +
      '<span><b>毎月 第一土曜</b><small>午前（7:00-12:00） / 固定ルール</small></span>' +
      '<em>固定</em>' +
      '</div>';
    html += customClosures.map(function (closure) {
      return '<div class="business-closure-item">' +
        '<span><b>' + escapeHtml(formatDateKeyJa(closure.dateKey)) + '</b><small>' + escapeHtml(closurePeriodLabel(closure.period)) + (closure.reason ? ' / ' + escapeHtml(closure.reason) : '') + '</small></span>' +
        '<button class="edit-member-btn" type="button" data-closure-id="' + escapeHtml(closure.id) + '">解除</button>' +
        '</div>';
    }).join("");
    els.businessClosureList.innerHTML = html;
    Array.prototype.forEach.call(els.businessClosureList.querySelectorAll("button[data-closure-id]"), function (button) {
      button.addEventListener("click", function () {
        requestDeleteBusinessClosure(button.getAttribute("data-closure-id"));
      });
    });
  }

  function openMemberRegister() {
    resetMemberRegisterForm();
    els.memberRegisterModal.classList.add("is-open");
    els.memberRegisterBackdrop.classList.add("is-open");
    els.memberRegisterModal.querySelector(".member-register-panel").style.transform = "translateY(0)";
    els.memberRegisterModal.querySelector(".member-register-panel").style.visibility = "visible";
    els.memberRegisterModal.setAttribute("aria-hidden", "false");
    window.setTimeout(function () {
      els.registerDisplayNameInput.focus();
    }, 0);
  }

  function closeMemberRegister() {
    els.memberRegisterModal.classList.remove("is-open");
    els.memberRegisterBackdrop.classList.remove("is-open");
    els.memberRegisterModal.querySelector(".member-register-panel").style.transform = "";
    els.memberRegisterModal.querySelector(".member-register-panel").style.visibility = "";
    els.memberRegisterModal.setAttribute("aria-hidden", "true");
  }

  function resetMemberRegisterForm() {
    els.memberRegisterForm.hidden = false;
    els.memberRegisterComplete.hidden = true;
    els.registerMemberCodeInput.value = nextMemberCode();
    els.registerDisplayNameInput.value = "";
    els.registerMemberKanaInput.value = "";
    els.registerMemberTypeInput.value = "semi4";
    if (els.registerPhoneLast4Input) els.registerPhoneLast4Input.value = "";
    if (els.registerBirthMmddInput) els.registerBirthMmddInput.value = "";
    els.memberRegisterGuideText.value = "";
    els.memberRegisterSubmit.disabled = false;
    els.memberRegisterSubmit.textContent = "登録して案内文を作成";
  }

  function submitMemberRegisterForm(event) {
    event.preventDefault();
    var memberCode = normalizeMemberCode(els.registerMemberCodeInput.value);
    var displayName = els.registerDisplayNameInput.value.trim();
    var memberKana = normalizeKanaInput(els.registerMemberKanaInput.value);
    var memberType = els.registerMemberTypeInput.value;
    var memberData = {
      memberCode: memberCode,
      displayName: displayName,
      memberKana: memberKana,
      memberType: memberType,
      monthlyQuota: quotaForMemberType(memberType),
      quotaExtra: 0,
      quotaExtraMonth: "",
      memberStatus: "active",
      pauseOn: "",
      phoneLast4: "",
      birthMmdd: "",
      ngMemberCodes: [],
      active: true
    };

    if (!memberCode || !displayName) return;
    if (state.members.some(function (member) { return member.memberCode === memberCode && memberStatusOf(member) !== "deleted"; })) {
      openConfirm({
        title: "登録できません",
        message: memberCode + " はすでに登録済みです。",
        notice: true
      });
      return;
    }

    els.memberRegisterSubmit.disabled = true;
    els.memberRegisterSubmit.textContent = "登録中";
    registerMemberAndIssueGuide(memberData);
  }

  function registerMemberAndIssueGuide(memberData) {
    saveNewMemberForRegister(memberData).then(function () {
      if (!state.remote) {
        showMemberRegisterComplete(memberData, memberData.bookingToken || "", "初回PIN");
        return;
      }
      return issueInitialMemberPin(memberData.memberCode).then(function (data) {
        var currentMember = state.members.find(function (item) { return item.memberCode === memberData.memberCode; }) || memberData;
        showMemberRegisterComplete(currentMember, data.bookingToken, data.pin);
      });
    }).catch(function (error) {
      els.memberRegisterSubmit.disabled = false;
      els.memberRegisterSubmit.textContent = "登録して案内文を作成";
      showApiError(error);
    });
  }

  function saveNewMemberForRegister(memberData) {
    var apply = function () {
      state.members.push(normalizeMember(memberData));
      saveMembers();
      renderManageMemberList();
      render();
    };
    if (!state.remote) {
      apply();
      return Promise.resolve();
    }
    return apiPost("member", memberData).then(apply);
  }

  function issueInitialMemberPin(memberCode) {
    var pin = String(Math.floor(1000 + Math.random() * 9000));
    return apiPost("member-pin-reset", {
      memberCode: memberCode,
      pin: pin
    }).then(function (data) {
      updateMemberAccessState(memberCode, data);
      return {
        bookingToken: data.bookingToken,
        pin: pin
      };
    });
  }

  function showMemberRegisterComplete(member, token, pin) {
    var text = buildMemberLineGuideText(member, token, pin);
    els.memberRegisterForm.hidden = true;
    els.memberRegisterComplete.hidden = false;
    els.memberRegisterGuideText.value = text;
    copyText(text);
    els.memberRegisterSubmit.disabled = false;
    els.memberRegisterSubmit.textContent = "登録して案内文を作成";
  }

  function resetMemberForm() {
    els.memberFormTitle.textContent = "会員管理";
    els.memberForm.hidden = true;
    els.editingMemberCode.value = "";
    els.memberCodeInput.value = nextMemberCode();
    els.memberCodeInput.disabled = false;
    els.displayNameInput.value = "";
    els.memberKanaInput.value = "";
    els.memberTypeInput.value = "semi4";
    els.memberStatusInput.value = "active";
    els.quotaExtraInput.value = "";
    els.pauseOnInput.value = "";
    els.phoneLast4Input.value = "";
    els.birthMmddInput.value = "";
    els.ngMembersInput.value = "";
    renderMemberAuthState(null);
    els.memberEditActions.hidden = true;
    els.memberStatusAction.textContent = "休会";
  }

  function submitMemberForm(event) {
    event.preventDefault();
    var editingCode = els.editingMemberCode.value;
    var memberCode = normalizeMemberCode(els.memberCodeInput.value);
    var displayName = els.displayNameInput.value.trim();
    var memberKana = normalizeKanaInput(els.memberKanaInput.value);
    var memberType = els.memberTypeInput.value;
    var memberStatus = els.memberStatusInput.value === "paused" ? "paused" : "active";
    var quotaExtra = normalizeInteger(els.quotaExtraInput.value, 0, 99);
    var memberData = {
      memberCode: memberCode,
      displayName: displayName,
      memberKana: memberKana,
      memberType: memberType,
      monthlyQuota: quotaForMemberType(memberType),
      quotaExtra: quotaExtra,
      quotaExtraMonth: quotaExtra > 0 ? currentMonthKey() : "",
      memberStatus: memberStatus,
      pauseOn: normalizeDateKey(els.pauseOnInput.value),
      phoneLast4: normalizeDigits(els.phoneLast4Input.value, 4),
      birthMmdd: normalizeDigits(els.birthMmddInput.value, 4),
      ngMemberCodes: normalizeMemberCodeList(els.ngMembersInput.value).filter(function (code) {
        return code !== memberCode;
      }),
      active: true
    };

    if (!memberCode || !displayName) return;

    if (!editingCode && state.members.some(function (member) { return member.memberCode === memberCode; })) {
      openConfirm({
        title: "登録できません",
        message: memberCode + " はすでに登録済みです。",
        notice: true
      });
      return;
    }

    openConfirm({
      title: editingCode ? "会員情報を更新しますか" : "会員を登録しますか",
      message: memberCode + " / " + displayName + " / " + memberTypeLabel(memberType),
      run: function () {
        saveMember(memberData, editingCode);
      }
    });
  }

  function renderManageMemberList() {
    var activeMembers = state.members.filter(function (member) {
      if (memberStatusOf(member) === "deleted") return false;
      return state.manageGradeFilter === "all" || member.memberType === state.manageGradeFilter;
    });

    els.memberManageCount.textContent = activeMembers.length + "名";
    els.manageMemberList.innerHTML = activeMembers.map(function (member) {
      var quota = manageQuotaLabel(member);
      var accessState = member.bookingToken ? "URL発行済み" : "URL未発行";
      var status = memberStatusOf(member);
      var displayStatus = manageMemberStatusOf(member);
      var paused = status === "paused";
      var kana = member.memberKana ? escapeHtml(member.memberKana) + ' / ' : "";
      return '<div class="manage-member-item' + (paused ? ' is-paused' : '') + '">' +
        '<span><b>' + escapeHtml(member.displayName) + '<em class="member-status member-status--' + displayStatus + '">' + memberStatusLabel(displayStatus) + '</em></b><small>' + kana + escapeHtml(member.memberCode) + ' / ' + memberTypeLabel(member.memberType) + ' / ' + quota + ' / ' + accessState + '</small></span>' +
        '<div class="manage-member-actions">' +
        '<button class="edit-member-btn" type="button" data-action="edit" data-member-code="' + escapeHtml(member.memberCode) + '">編集</button>' +
        '<button class="edit-member-btn" type="button" data-action="reservations" data-member-code="' + escapeHtml(member.memberCode) + '">予約一覧</button>' +
        '</div>' +
        '</div>';
    }).join("");

    Array.prototype.forEach.call(els.manageMemberList.querySelectorAll(".edit-member-btn"), function (button) {
      button.addEventListener("click", function () {
        var memberCode = button.getAttribute("data-member-code");
        var action = button.getAttribute("data-action");
        if (action === "edit") editMember(memberCode);
        if (action === "reservations") showMemberReservations(memberCode);
      });
    });
  }

  function editMember(memberCode) {
    var member = state.members.find(function (item) {
      return item.memberCode === memberCode;
    });
    if (!member) return;

    els.memberFormTitle.textContent = "会員編集";
    els.memberForm.hidden = false;
    els.editingMemberCode.value = member.memberCode;
    els.memberCodeInput.value = member.memberCode;
    els.memberCodeInput.disabled = true;
    els.displayNameInput.value = member.displayName;
    els.memberKanaInput.value = member.memberKana || "";
    els.memberTypeInput.value = member.memberType;
    els.memberStatusInput.value = memberStatusOf(member) === "paused" ? "paused" : "active";
    els.quotaExtraInput.value = normalizeMonthKey(member.quotaExtraMonth) === currentMonthKey() && member.quotaExtra ? String(member.quotaExtra) : "";
    els.pauseOnInput.value = normalizeDateKey(member.pauseOn);
    els.phoneLast4Input.value = member.phoneLast4 || "";
    els.birthMmddInput.value = member.birthMmdd || "";
    els.ngMembersInput.value = (member.ngMemberCodes || []).join(" ");
    renderMemberAuthState(member);
    els.memberEditActions.hidden = false;
    els.memberStatusAction.textContent = memberStatusOf(member) === "paused" ? "再開" : "休会";
    els.displayNameInput.focus();
  }

  function renderMemberAuthState(member) {
    if (!els.memberAuthState) return;
    if (!member) {
      els.memberAuthState.hidden = true;
      els.memberAuthState.innerHTML = "";
      return;
    }
    var hasAccess = Boolean(member.bookingToken && member.pinUpdatedAt);
    var activeSessions = Number(member.activeSessionCount || 0);
    var authenticated = activeSessions > 0;
    var statusClass = authenticated ? " is-ok" : hasAccess ? " is-waiting" : " is-missing";
    var statusText = authenticated ? "本人認証済み" : hasAccess ? "未ログイン" : "未発行";
    var pinText = member.pinUpdatedAt ? formatDateTime(member.pinUpdatedAt) : "未発行";
    var loginText = member.lastAuthenticatedAt ? formatDateTime(member.lastAuthenticatedAt) : "記録なし";
    els.memberAuthState.hidden = false;
    els.memberAuthState.innerHTML =
      '<div class="member-auth-state__head">' +
        '<span class="member-auth-badge' + statusClass + '">' + statusText + '</span>' +
        '<b>本人認証</b>' +
      '</div>' +
      '<dl>' +
        '<div><dt>PIN発行</dt><dd>' + escapeHtml(pinText) + '</dd></div>' +
        '<div><dt>最終ログイン</dt><dd>' + escapeHtml(loginText) + '</dd></div>' +
        '<div><dt>ログイン中端末</dt><dd>' + activeSessions + '件</dd></div>' +
      '</dl>';
  }

  function showMemberReservations(memberCode) {
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    if (!member) return;
    var todayStart = currentDateKey() + "-00";
    var reservations = state.reservations.filter(function (reservation) {
      return reservation.memberCode === memberCode && reservation.status === "confirmed" && reservation.sessionId >= todayStart;
    }).sort(function (a, b) {
      return a.sessionId.localeCompare(b.sessionId);
    });
    var message = reservations.length ? reservations.slice(0, 12).map(function (reservation) {
      var session = parseSessionId(reservation.sessionId);
      if (!session) return reservation.sessionId;
      return formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00";
    }).join("\n") + (reservations.length > 12 ? "\n\nほか " + (reservations.length - 12) + "件" : "") : "今後の予約はありません。";
    openConfirm({
      title: member.displayName + " の今後の予約",
      message: message,
      notice: true,
      extra:
        '<div class="history-actions">' +
          '<button type="button" data-history-months="1" data-member-code="' + escapeHtml(memberCode) + '">今月</button>' +
          '<button type="button" data-history-months="3" data-member-code="' + escapeHtml(memberCode) + '">過去3ヶ月</button>' +
        '</div>'
    });
    bindHistoryButtons();
  }

  function showMemberUsageHistory(memberCode, months) {
    var monthKey = currentMonthKey();
    months = months === 3 ? 3 : 1;
    apiGet("member-history?memberCode=" + encodeURIComponent(memberCode) + "&month=" + encodeURIComponent(monthKey) + "&months=" + months).then(function (data) {
      var member = data.member || state.members.find(function (item) { return item.memberCode === memberCode; }) || {};
      var reservations = data.reservations || [];
      var quotaLimit = data.summary && data.summary.quotaLimit;
      var quotaText = quotaLimit === null || quotaLimit === undefined ? "無制限" : String(quotaLimit) + "回";
      var message = reservations.length ? reservations.map(function (reservation) {
        var session = parseSessionId(reservation.sessionId);
        if (!session) return reservation.sessionId;
        var kind = reservation.reservationKind === "personal" ? " / PT" : "";
        return formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00" + kind;
      }).join("\n") : (months === 3 ? "過去3ヶ月の利用履歴はありません。" : "今月の過去利用履歴はありません。");
      var rangeLabel = months === 3 ? formatMonthKey(data.fromMonthKey || monthKey) + " - " + formatMonthKey(data.monthKey || monthKey) : formatMonthKey(data.monthKey || monthKey);
      openConfirm({
        title: (member.displayName || memberCode) + (months === 3 ? " の3ヶ月履歴" : " の今月利用履歴"),
        message: rangeLabel + "\n" + "利用済み " + Number(data.summary && data.summary.used || 0) + "回" + (months === 1 ? " / 上限 " + quotaText : "") + "\n\n" + message,
        notice: true,
        extra:
          '<div class="history-actions">' +
            '<button type="button" data-history-months="1" data-member-code="' + escapeHtml(memberCode) + '">今月</button>' +
            '<button type="button" data-history-months="3" data-member-code="' + escapeHtml(memberCode) + '">過去3ヶ月</button>' +
          '</div>'
      });
      bindHistoryButtons();
    }).catch(showApiError);
  }

  function bindHistoryButtons() {
    Array.prototype.forEach.call(els.confirmExtra.querySelectorAll("[data-history-months]"), function (button) {
      button.addEventListener("click", function () {
        showMemberUsageHistory(button.getAttribute("data-member-code"), Number(button.getAttribute("data-history-months") || 1));
      });
    });
  }

  function runNgCheck() {
    var conflicts = findNgConflicts();
    if (!conflicts.length) {
      openConfirm({
        title: "NGチェック完了",
        message: "現在の予約にNG同士の同枠予約はありません。",
        notice: true
      });
      return;
    }
    openConfirm({
      title: "NG同枠があります",
      message: conflicts.slice(0, 20).map(function (conflict) {
        return conflict.sessionLabel + "\n" + conflict.memberA.displayName + "（" + conflict.memberA.memberCode + "） / " + conflict.memberB.displayName + "（" + conflict.memberB.memberCode + "）";
      }).join("\n\n") + (conflicts.length > 20 ? "\n\nほか " + (conflicts.length - 20) + "件" : ""),
      notice: true
    });
  }

  function findNgConflicts() {
    var ngSet = buildNgPairSet();
    if (!ngSet.size) return [];
    var memberByCode = Object.fromEntries(state.members.map(function (member) {
      return [member.memberCode, member];
    }));
    var sessions = {};
    state.reservations.forEach(function (reservation) {
      if (reservation.status !== "confirmed") return;
      if (!reservation.memberCode || reservation.memberCode === "MANUAL") return;
      if (!sessions[reservation.sessionId]) sessions[reservation.sessionId] = [];
      sessions[reservation.sessionId].push(reservation);
    });
    var conflicts = [];
    Object.keys(sessions).sort().forEach(function (sessionId) {
      var reservations = sessions[sessionId];
      for (var i = 0; i < reservations.length; i += 1) {
        for (var j = i + 1; j < reservations.length; j += 1) {
          var codeA = reservations[i].memberCode;
          var codeB = reservations[j].memberCode;
          if (!ngSet.has(ngPairKey(codeA, codeB))) continue;
          var session = parseSessionId(sessionId);
          conflicts.push({
            sessionLabel: formatMonthDay(session.date) + " " + pad(session.hour) + ":00-" + pad(session.hour + 1) + ":00",
            memberA: memberByCode[codeA] || reservations[i],
            memberB: memberByCode[codeB] || reservations[j]
          });
        }
      }
    });
    return conflicts;
  }

  function buildNgPairSet() {
    var set = new Set();
    state.members.forEach(function (member) {
      (member.ngMemberCodes || []).forEach(function (ngCode) {
        if (!ngCode || ngCode === member.memberCode) return;
        set.add(ngPairKey(member.memberCode, ngCode));
      });
    });
    return set;
  }

  function ngPairKey(codeA, codeB) {
    return [codeA, codeB].sort().join("|");
  }

  function issueMemberAccess(memberCode) {
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    if (!member || !isReservableMember(member)) return;
    apiPost("member-access", {
      memberCode: memberCode,
      phoneLast4: member.phoneLast4 || "",
      birthMmdd: member.birthMmdd || "",
      regenerateToken: !member.bookingToken
    }).then(function (data) {
      updateMemberAccessState(memberCode, data);
      var url = memberReserveUrl(data.bookingToken);
      copyText(url);
      openConfirm({
        title: "予約URLをコピーしました",
        message: url,
        notice: true
      });
      renderManageMemberList();
    }).catch(showApiError);
  }

  function resetMemberPin(memberCode) {
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    if (!member || !isReservableMember(member)) return;
    var pin = String(Math.floor(1000 + Math.random() * 9000));
    apiPost("member-pin-reset", {
      memberCode: memberCode,
      pin: pin
    }).then(function (data) {
      updateMemberAccessState(memberCode, data);
      var url = memberReserveUrl(data.bookingToken);
      copyText("予約URL: " + url + "\nPIN: " + pin);
      openConfirm({
        title: "PINを再発行しました",
        message: "PIN: " + pin + " / 予約URLもコピーしました。",
        notice: true
      });
      renderManageMemberList();
    }).catch(showApiError);
  }

  function requestResetAndIssueMemberLineGuide(memberCode) {
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    if (!member || !isReservableMember(member)) return;
    openConfirm({
      title: "ログイン情報を再案内しますか",
      message: "新しいPINを発行します。以前のPINとログイン状態は使えなくなります。\n\nリセットされるので、利用者様に必ずコピーしたメッセージをお送りください。",
      run: function () {
        resetAndIssueMemberLineGuide(memberCode);
      }
    });
  }

  function resetAndIssueMemberLineGuide(memberCode) {
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    if (!member || !isReservableMember(member)) return;
    var pin = String(Math.floor(1000 + Math.random() * 9000));
    apiPost("member-pin-reset", {
      memberCode: memberCode,
      pin: pin
    }).then(function (data) {
      updateMemberAccessState(memberCode, data);
      var currentMember = state.members.find(function (item) { return item.memberCode === memberCode; }) || member;
      var text = buildMemberLineGuideText(currentMember, data.bookingToken, pin);
      copyText(text);
      openConfirm({
        title: "ログイン情報をコピーしました",
        message: "PINを再発行し、利用者様へ送るメッセージをコピーしました。必ずこのメッセージをお送りください。",
        notice: true
      });
      renderManageMemberList();
    }).catch(showApiError);
  }

  function updateMemberAccessState(memberCode, data) {
    state.members = state.members.map(function (member) {
      if (member.memberCode !== memberCode) return member;
      return Object.assign({}, member, {
        bookingToken: data.bookingToken || member.bookingToken,
        phoneLast4: data.phoneLast4 !== undefined ? data.phoneLast4 : member.phoneLast4,
        birthMmdd: data.birthMmdd !== undefined ? data.birthMmdd : member.birthMmdd,
        pinUpdatedAt: data.bookingToken ? new Date().toISOString() : member.pinUpdatedAt
      });
    });
    saveMembers();
  }

  function requestToggleMemberStatus(memberCode) {
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    if (!member || memberStatusOf(member) === "deleted") return;
    var nextStatus = memberStatusOf(member) === "paused" ? "active" : "paused";
    openConfirm({
      title: nextStatus === "paused" ? "休会中にしますか" : "入会中に戻しますか",
      message: member.memberCode + " / " + member.displayName + " を " + memberStatusLabel(nextStatus) + " に変更します。",
      run: function () {
        updateMemberStatus(memberCode, nextStatus);
      }
    });
  }

  function requestDeleteMember(memberCode) {
    var member = state.members.find(function (item) { return item.memberCode === memberCode; });
    if (!member || memberStatusOf(member) === "deleted") return;
    openConfirm({
      title: "会員を削除しますか",
      message: member.memberCode + " / " + member.displayName + " を会員一覧から削除します。過去の予約履歴は残ります。",
      run: function () {
        deleteMember(memberCode);
      }
    });
  }

  function updateMemberStatus(memberCode, nextStatus) {
    var apply = function () {
      state.members = state.members.map(function (member) {
        return member.memberCode === memberCode ? Object.assign({}, member, {
          active: true,
          memberStatus: nextStatus,
          pauseOn: nextStatus === "active" ? "" : member.pauseOn
        }) : member;
      });
      saveMembers();
      resetMemberForm();
      renderManageMemberList();
      render();
    };

    if (!state.remote) {
      apply();
      return;
    }

    apiPost("member-status", { memberCode: memberCode, memberStatus: nextStatus }).then(apply).catch(showApiError);
  }

  function deleteMember(memberCode) {
    var apply = function () {
      state.members = state.members.map(function (member) {
        return member.memberCode === memberCode ? Object.assign({}, member, { active: false, memberStatus: "deleted", bookingToken: "" }) : member;
      });
      saveMembers();
      resetMemberForm();
      renderManageMemberList();
      render();
    };

    if (!state.remote) {
      apply();
      return;
    }

    apiPost("member-delete", { memberCode: memberCode }).then(apply).catch(showApiError);
  }

  function memberReserveUrl(token) {
    return "https://dojo-japan.jp/dj-member-rsv-8f3k2q/?token=" + encodeURIComponent(token);
  }

  function memberReserveGenericUrl() {
    return "https://dojo-japan.jp/dj-member-rsv-8f3k2q/";
  }

  function buildMemberLineGuideText(member, token, pin) {
    var url = memberReserveUrl(token);
    var pinText = pin || "以前ご案内したPIN";
    return [
      member.displayName + "様",
      "",
      "DOJO JAPAN 会員予約のご案内です。",
      "",
      "--------------------",
      "STEP 1：本人確認ログイン",
      "下記URLをタップして、本人確認を行ってください。",
      "URLを入力する必要はありません。",
      "",
      "本人確認URL:",
      url,
      "",
      "STEP 2：公式LINEでログイン",
      "本人確認後、公式LINEを開いてください。",
      "公式LINEメニューの「予約」から、会員コードとPINでログインできます。",
      "",
      "公式LINEアカウント:",
      "https://lin.ee/SvyvVVP",
      "",
      "会員コード: " + member.memberCode,
      "PIN: " + pinText,
      "",
      "STEP 3：登録情報の確認",
      "ログイン後、画面右上の「登録情報」を開いてください。",
      "電話番号の下4桁と誕生日（MMDD）を設定してください。",
      "",
      "STEP 4：次回以降の予約",
      "ログイン時に「この端末で次回から入力を省略」にチェックすると、次回から公式LINEの予約ボタンでスムーズに開けます。",
      "--------------------",
      "",
      "LINEを利用されていない方は、Safari または Google Chrome で下記URLを開き、会員コードとPINでログインしてください。",
      memberReserveGenericUrl(),
      "",
      "万が一ログアウトされた場合は、本人確認URLをもう一度タップするか、会員コードとPINで再ログインしてください。",
      url,
    ].join("\n");
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
      return;
    }

    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (error) {
      console.warn("Copy failed", error);
    }
    document.body.removeChild(textarea);
  }

  function bindGradeFilters(container, stateKey, renderFn) {
    Array.prototype.forEach.call(container.querySelectorAll(".filter-tag"), function (button) {
      button.addEventListener("click", function () {
        state[stateKey] = button.getAttribute("data-grade");
        Array.prototype.forEach.call(container.querySelectorAll(".filter-tag"), function (item) {
          item.classList.toggle("is-active", item === button);
        });
        renderFn();
      });
    });
  }

  function syncReservationsForMember(memberData) {
    state.reservations = state.reservations.map(function (reservation) {
      if (reservation.memberCode !== memberData.memberCode) return reservation;
      return Object.assign({}, reservation, {
        displayName: memberData.displayName,
        memberType: memberData.memberType,
        monthlyQuota: memberData.monthlyQuota
      });
    });
  }

  function normalizeMember(member) {
    var status = member.active === false ? "deleted" : member.memberStatus || "active";
    return Object.assign({}, member, {
      active: status !== "deleted" && member.active !== false,
      memberStatus: status,
      memberKana: normalizeKanaInput(member.memberKana),
      quotaExtra: normalizeInteger(member.quotaExtra, 0, 99),
      quotaExtraMonth: normalizeMonthKey(member.quotaExtraMonth),
      pauseOn: normalizeDateKey(member.pauseOn),
      ngMemberCodes: normalizeMemberCodeList(member.ngMemberCodes || [])
    });
  }

  function memberStatusOf(member) {
    if (!member) return "deleted";
    if (member.active === false) return "deleted";
    if (normalizeDateKey(member.pauseOn) && normalizeDateKey(member.pauseOn) <= currentDateKey()) return "paused";
    if (member.memberStatus) return member.memberStatus;
    return "active";
  }

  function isReservableMember(member) {
    return Boolean(member && member.active !== false && memberStatusOf(member) === "active");
  }

  function memberStatusLabel(status) {
    if (status === "unauthenticated") return "未認証";
    if (status === "paused") return "休会中";
    if (status === "deleted") return "削除済み";
    return "入会中";
  }

  function manageMemberStatusOf(member) {
    var status = memberStatusOf(member);
    if (status !== "active") return status;
    return member.lastAuthenticatedAt ? status : "unauthenticated";
  }

  function closeReservationModal() {
    els.reservationModal.classList.remove("is-open");
    els.reservationBackdrop.classList.remove("is-open");
    els.reservationModal.style.transform = "";
    els.reservationModal.style.visibility = "";
    els.reservationModal.setAttribute("aria-hidden", "true");
  }

  function openConfirm(options) {
    var notice = Boolean(options.notice);
    state.pendingAction = notice ? null : options.run;
    els.confirmTitle.textContent = options.title;
    els.confirmMessage.textContent = options.message;
    els.confirmExtra.innerHTML = options.extra || "";
    els.confirmExtra.hidden = !options.extra;
    els.cancelConfirm.textContent = notice ? "閉じる" : "戻る";
    els.runConfirm.hidden = notice;
    els.confirmModal.classList.toggle("is-notice", notice);
    els.confirmModal.classList.add("is-open");
    els.confirmModal.setAttribute("aria-hidden", "false");
  }

  function closeConfirm() {
    state.pendingAction = null;
    els.confirmModal.classList.remove("is-open");
    els.confirmModal.classList.remove("is-notice");
    els.cancelConfirm.textContent = "戻る";
    els.runConfirm.hidden = false;
    els.confirmExtra.innerHTML = "";
    els.confirmExtra.hidden = true;
    els.confirmModal.setAttribute("aria-hidden", "true");
  }

  function runPendingAction() {
    var action = state.pendingAction;
    closeConfirm();
    if (typeof action === "function") action();
  }

  function getReservationsForSession(sessionId) {
    return state.reservations.filter(function (reservation) {
      return reservation.sessionId === sessionId && reservation.status === "confirmed";
    });
  }

  function reservationUnits(reservation) {
    var units = Number(reservation && reservation.capacityUnits);
    return isFinite(units) && units > 0 ? units : 1;
  }

  function sessionUnits(reservations) {
    return reservations.reduce(function (total, reservation) {
      return total + reservationUnits(reservation);
    }, 0);
  }

  function hasPersonalReservation(reservations) {
    return reservations.some(function (reservation) {
      return reservation.reservationKind === "personal";
    });
  }

  function summarizeDay(date) {
    var summary = {
      totalSlots: END_HOUR - START_HOUR,
      capacityUnits: (END_HOUR - START_HOUR) * CAPACITY,
      bookedSessions: 0,
      units: 0,
      fullSlots: 0,
      closedSlots: 0,
      personalSlots: 0
    };
    for (var hour = START_HOUR; hour < END_HOUR; hour += 1) {
      var session = makeSession(date, hour);
      var reservations = getReservationsForSession(session.id);
      var units = sessionUnits(reservations);
      if (getClosureForSession(session)) summary.closedSlots += 1;
      if (units > 0) summary.bookedSessions += 1;
      if (units >= session.capacity) summary.fullSlots += 1;
      if (hasPersonalReservation(reservations)) summary.personalSlots += 1;
      summary.units += units;
    }
    return summary;
  }

  function reservationDetailLabel(reservation) {
    if (reservation.reservationKind === "referral") {
      return ' / <strong class="reservation-detail-kind">紹介同伴</strong><span class="reservation-guest-name">体験者: ' + escapeHtml(reservation.guestName || "未入力") + '</span><span class="reservation-quota-note">回数消費なし</span>';
    }
    if (reservation.reservationKind !== "personal") return "";
    return " / パーソナル予約 / 別途3000円 / 満席枠";
  }

  function findLineBookingRequest(requestId) {
    return (state.lineBookingRequests || []).find(function (request) {
      return request.id === requestId;
    });
  }

  function lineBookingPlanLabel(request) {
    if (request.plan === "trial") return "初回無料体験";
    if (request.visitorVisit === "repeat") return "ビジター2回目以降";
    return "ビジター1回目";
  }

  function lineBookingCapacityNote(sessionId, people) {
    var reservations = getReservationsForSession(sessionId);
    var used = sessionUnits(reservations);
    var requested = Math.max(1, Number(people || 1));
    var remaining = Math.max(0, CAPACITY - used);
    return requested <= remaining ? "空き" + remaining + "枠" : "満席または不足";
  }

  function formatCreatedAt(value) {
    if (!value) return "";
    var normalized = String(value).replace(" ", "T") + (String(value).indexOf("Z") === -1 ? "Z" : "");
    var date = new Date(normalized);
    if (isNaN(date.getTime())) return String(value);
    return formatMonthDay(date) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function formatDateTime(value) {
    if (!value) return "";
    var text = String(value);
    var normalized = text.replace(" ", "T") + (text.indexOf("Z") === -1 ? "Z" : "");
    var date = new Date(normalized);
    if (isNaN(date.getTime())) return text;
    return formatMonthDay(date) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function makeSession(date, hour) {
    var accessRule = hour >= 18 ? "prime_only" : "all_members";
    return {
      id: toDateKey(date) + "-" + pad(hour),
      date: date,
      hour: hour,
      capacity: CAPACITY,
      accessRule: accessRule
    };
  }

  function getClosureForSession(session) {
    if (session.date.getDay() === 0) {
      return { id: "fixed-sunday-full", reason: "毎週日曜は予約不可", fixed: true };
    }
    if (isFirstSaturdayMorning(session.date, session.hour)) {
      return { id: "fixed-first-saturday-morning", reason: "第一土曜午前は予約不可", fixed: true };
    }
    var period = timePeriodForHour(session.hour);
    var dateKey = toDateKey(session.date);
    return state.businessClosures.find(function (closure) {
      return closure.dateKey === dateKey && (closure.period === "full" || closure.period === period);
    }) || null;
  }

  function trainerForSession(session) {
    var override = state.trainerOverrides.find(function (item) {
      return item.sessionId === session.id;
    });
    if (override && override.trainerLabel) {
      return { id: override.trainerId || "custom", label: override.trainerLabel, custom: true };
    }
    if (timePeriodForHour(session.hour) === "morning") {
      return { id: "nariai-satoru", label: "担当: SATORU成合" };
    }
    return { id: "matsushima-izaya", label: "担当: 松島勲也" };
  }

  function timePeriodForHour(hour) {
    return Number(hour) < 12 ? "morning" : "afternoon";
  }

  function isFirstSaturdayMorning(date, hour) {
    return Number(hour) < 12 && date.getDay() === 6 && date.getDate() <= 7;
  }

  function getMonthlyUsage(memberCode, date) {
    var monthKey = String(date.getFullYear()) + "-" + pad(date.getMonth() + 1);
    var used = state.reservations.filter(function (reservation) {
      if (reservation.memberCode !== memberCode || reservation.status !== "confirmed") return false;
      if (reservation.quotaExempt || reservation.reservationKind === "referral") return false;
      return reservation.sessionId.indexOf(monthKey + "-") === 0;
    }).length;

    return { used: used };
  }

  function makeSessionId(weekStart, dayIndex, hour) {
    return toDateKey(addDays(weekStart, dayIndex)) + "-" + pad(hour);
  }

  function selectFirstVisibleMonthDay() {
    state.selectedSessionId = toDateKey(state.monthDate) + "-" + pad(START_HOUR);
  }

  function parseSessionId(sessionId) {
    var parts = sessionId.split("-");
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var hour = Number(parts[3]);
    return makeSession(date, hour);
  }

  function saveReservations() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.reservations));
    flashSaved();
  }

  function saveMembers() {
    localStorage.setItem(MEMBERS_KEY, JSON.stringify(state.members));
    flashSaved();
  }

  function saveMemos() {
    localStorage.setItem(SESSION_MEMO_KEY, JSON.stringify(state.sessionMemos));
    if (state.remote && state.selectedSessionId) {
      scheduleMemoSave(state.selectedSessionId, state.sessionMemos[state.selectedSessionId] || "");
      return;
    }
    flashSaved();
  }

  function saveBusinessClosures() {
    localStorage.setItem(BUSINESS_CLOSURES_KEY, JSON.stringify(state.businessClosures));
    flashSaved();
  }

  function saveTrainerOverrides() {
    localStorage.setItem(TRAINER_OVERRIDES_KEY, JSON.stringify(state.trainerOverrides));
    flashSaved();
  }

  function scheduleMemoSave(sessionId, memo) {
    memoSaveSequence += 1;
    var sequence = memoSaveSequence;
    window.clearTimeout(memoSaveTimer);
    setSaveState("保存中", "pending");
    memoSaveTimer = window.setTimeout(function () {
      apiPost("memo", {
        sessionId: sessionId,
        memo: memo
      }).then(function () {
        if (sequence === memoSaveSequence) setSaveState("D1保存済み", "saved");
      }).catch(showApiError);
    }, 450);
  }

  function saveMember(memberData, editingCode) {
    var afterSave = function () {
      if (editingCode) {
        state.members = state.members.map(function (member) {
          return member.memberCode === editingCode ? Object.assign({}, member, memberData) : member;
        });
        syncReservationsForMember(memberData);
      } else {
        state.members.push(memberData);
      }

      saveMembers();
      saveReservations();
      resetMemberForm();
      renderManageMemberList();
      render();
    };

    if (!state.remote) {
      afterSave();
      return;
    }

    apiPost("member", memberData).then(afterSave).catch(showApiError);
  }

  function submitAuthForm(event) {
    event.preventDefault();
    state.adminCredentials = {
      username: els.adminUserInput.value.trim(),
      password: els.adminPasswordInput.value
    };

    if (!state.adminCredentials.username || !state.adminCredentials.password) {
      showAuthGate("管理IDとパスワードを入力してください。");
      return;
    }

    els.authSubmit.disabled = true;
    els.authSubmit.textContent = "確認中";
    sessionStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify(state.adminCredentials));
    localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
    loadRemoteData();
  }

  function hasAdminCredentials() {
    return Boolean(state.adminCredentials && state.adminCredentials.username && state.adminCredentials.password);
  }

  function showAuthGate(message) {
    document.body.classList.add("auth-locked");
    els.authError.textContent = message || "";
    els.authSubmit.disabled = false;
    els.authSubmit.textContent = "ログイン";
    if (state.adminCredentials) {
      els.adminUserInput.value = state.adminCredentials.username || "";
    }
    window.setTimeout(function () {
      if (els.adminUserInput.value) {
        els.adminPasswordInput.focus();
      } else {
        els.adminUserInput.focus();
      }
    }, 0);
  }

  function hideAuthGate() {
    document.body.classList.remove("auth-locked");
    els.authError.textContent = "";
    els.authSubmit.disabled = false;
    els.authSubmit.textContent = "ログイン";
  }

  function loadRemoteData() {
    fetchBootstrap(false).then(function (response) {
      if (!response.ok) throw new Error(response.status === 401 ? "UNAUTHORIZED" : "REMOTE_ERROR");
      return response.json();
    }).then(function (data) {
      if (!data.ok) throw new Error(data.error || "REMOTE_ERROR");
      state.remote = true;
      state.members = data.members.length ? data.members.map(normalizeMember) : state.members.map(normalizeMember);
      state.reservations = data.reservations || [];
      state.lineBookingRequests = data.lineBookingRequests || [];
      state.sessionMemos = data.sessionMemos || {};
      state.businessClosures = data.businessClosures || [];
      state.trainerOverrides = data.trainerOverrides || [];
      localStorage.setItem(MEMBERS_KEY, JSON.stringify(state.members));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.reservations));
      localStorage.setItem(SESSION_MEMO_KEY, JSON.stringify(state.sessionMemos));
      localStorage.setItem(BUSINESS_CLOSURES_KEY, JSON.stringify(state.businessClosures));
      localStorage.setItem(TRAINER_OVERRIDES_KEY, JSON.stringify(state.trainerOverrides));
      setSaveState("D1保存", "saved");
      hideAuthGate();
      render();
      refreshOpenPanels();
    }).catch(function (error) {
      state.remote = false;
      clearAdminCredentials();
      setSaveState("未接続", "error");
      showAuthGate(error.message === "UNAUTHORIZED" ? "管理IDまたはパスワードが違います。" : "接続できませんでした。時間をおいて再度お試しください。");
    });
  }

  function fetchBootstrap(retried) {
    return fetch("/api/reservations/bootstrap?ts=" + Date.now(), {
      headers: apiHeaders(),
      cache: "no-store"
    }).then(function (response) {
      if (response.status !== 401) return response;
      clearAdminCredentials();
      if (retried) throw new Error("UNAUTHORIZED");
      return fetchBootstrap(true);
    });
  }

  function refreshOpenPanels() {
    if (els.memberManageModal && els.memberManageModal.classList.contains("is-open")) {
      renderManageMemberList();
      refreshEditingMemberForm();
    }
    if (els.businessManageModal && els.businessManageModal.classList.contains("is-open")) {
      renderBusinessClosureList();
    }
  }

  function refreshEditingMemberForm() {
    var editingCode = els.editingMemberCode.value;
    if (!editingCode) return;
    var member = state.members.find(function (item) {
      return item.memberCode === editingCode;
    });
    if (!member) {
      resetMemberForm();
      return;
    }
    els.displayNameInput.value = member.displayName;
    els.memberKanaInput.value = member.memberKana || "";
    els.memberTypeInput.value = member.memberType;
    els.memberStatusInput.value = memberStatusOf(member) === "paused" ? "paused" : "active";
    els.quotaExtraInput.value = normalizeMonthKey(member.quotaExtraMonth) === currentMonthKey() && member.quotaExtra ? String(member.quotaExtra) : "";
    els.pauseOnInput.value = normalizeDateKey(member.pauseOn);
    els.phoneLast4Input.value = member.phoneLast4 || "";
    els.birthMmddInput.value = member.birthMmdd || "";
    els.ngMembersInput.value = (member.ngMemberCodes || []).join(" ");
    renderMemberAuthState(member);
    els.memberStatusAction.textContent = memberStatusOf(member) === "paused" ? "再開" : "休会";
  }

  function apiPost(path, payload) {
    return fetch("/api/reservations/" + path, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (response.status === 401) {
        clearAdminCredentials();
        showAuthGate("ログインし直してください。");
        throw new Error("UNAUTHORIZED");
      }
      return response.json().then(function (data) {
        if (!response.ok || !data.ok) throw new Error(data.error || "API_ERROR");
        return data;
      });
    });
  }

  function apiGet(path) {
    return fetch("/api/reservations/" + path, {
      headers: apiHeaders(),
      cache: "no-store"
    }).then(function (response) {
      if (response.status === 401) {
        clearAdminCredentials();
        showAuthGate("ログインし直してください。");
        throw new Error("UNAUTHORIZED");
      }
      return response.json().then(function (data) {
        if (!response.ok || !data.ok) throw new Error(data.error || "API_ERROR");
        return data;
      });
    });
  }

  function apiHeaders() {
    var headers = {
      "content-type": "application/json",
      "accept": "application/json"
    };
    if (hasAdminCredentials()) {
      headers["x-admin-user"] = state.adminCredentials.username;
      headers["x-admin-password"] = state.adminCredentials.password;
    }
    return headers;
  }

  function clearAdminCredentials() {
    state.adminCredentials = null;
    sessionStorage.removeItem(ADMIN_CREDENTIALS_KEY);
    localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
  }

  function logout() {
    clearAdminCredentials();
    state.remote = false;
    setSaveState("未接続", "error");
    showAuthGate("");
  }

  function showApiError(error) {
    openConfirm({
      title: "保存できませんでした",
      message: error.message || "通信エラーが発生しました。",
      notice: true
    });
  }

  function flashSaved() {
    setSaveState("保存中", "pending");
    window.setTimeout(function () {
      setSaveState(state.remote ? "D1保存済み" : "保存済み", "saved");
    }, 250);
  }

  function setSaveState(label, status) {
    els.saveState.textContent = label;
    els.saveState.setAttribute("data-status", status || "");
  }

  function loadJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function loadSessionJson(key, fallback) {
    try {
      var raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function startOfWeek(date) {
    var copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = copy.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    return addDays(copy, diff);
  }

  function addDays(date, days) {
    var copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  function parseDateKey(value) {
    var parts = String(value || "").split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function isSameDate(a, b) {
    return toDateKey(a) === toDateKey(b);
  }

  function toDateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function monthKeyFromDate(date) {
    return toDateKey(date).slice(0, 7);
  }

  function currentDateKey() {
    return toDateKey(new Date());
  }

  function currentMonthKey() {
    return currentDateKey().slice(0, 7);
  }

  function formatDateJa(date) {
    return date.getFullYear() + "/" + pad(date.getMonth() + 1) + "/" + pad(date.getDate()) + " " + dayNames[date.getDay()] + "曜";
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

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "");
  }

  function normalizeSearchText(value) {
    return toHiragana(String(value || "").toLowerCase()).replace(/\s+/g, "");
  }

  function normalizeKanaInput(value) {
    return toHiragana(String(value || "").trim().replace(/\s+/g, " ")).slice(0, 80);
  }

  function normalizeNameInput(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  }

  function toHiragana(value) {
    return String(value || "").replace(/[\u30a1-\u30f6]/g, function (char) {
      return String.fromCharCode(char.charCodeAt(0) - 0x60);
    });
  }

  function memberMatchesQuery(member, query) {
    if (!query) return true;
    var normalizedQuery = normalizeSearchText(query);
    return normalizeSearchText(member.displayName).indexOf(normalizedQuery) !== -1 ||
      normalizeSearchText(member.memberKana).indexOf(normalizedQuery) !== -1 ||
      normalizeSearchText(member.memberCode).indexOf(normalizedQuery) !== -1;
  }

  function normalizeDigits(value, maxLength) {
    return String(value || "").replace(/[^\d]/g, "").slice(0, maxLength);
  }

  function normalizeDateKey(value) {
    var text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  }

  function normalizeMonthKey(value) {
    var text = String(value || "").trim();
    return /^\d{4}-\d{2}$/.test(text) ? text : "";
  }

  function normalizeMemberCodeList(value) {
    var raw = Array.isArray(value) ? value : String(value || "").split(/[\s,、，]+/);
    var seen = {};
    return raw.map(normalizeMemberCode).filter(function (code) {
      if (!code || seen[code]) return false;
      seen[code] = true;
      return true;
    }).slice(0, 50);
  }

  function normalizeInteger(value, min, max) {
    var parsed = parseInt(String(value || ""), 10);
    if (!isFinite(parsed)) return min;
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeMemberCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function isClosurePeriod(value) {
    return value === "morning" || value === "afternoon" || value === "full";
  }

  function closurePeriodLabel(period) {
    if (period === "morning") return "午前（7:00-12:00）";
    if (period === "afternoon") return "午後（12:00-18:00）";
    return "全日（7:00-18:00）";
  }

  function formatDateKeyJa(dateKey) {
    var parts = String(dateKey || "").split("-");
    if (parts.length !== 3) return dateKey || "";
    return parts[0] + "/" + parts[1] + "/" + parts[2];
  }

  function slugTrainerLabel(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9一-龠ぁ-んァ-ヶー]+/g, "-").replace(/^-+|-+$/g, "") || "custom";
  }

  function effectiveMonthlyQuota(member, monthKey) {
    if (member.monthlyQuota === null || member.monthlyQuota === undefined) return null;
    var extra = normalizeMonthKey(member.quotaExtraMonth) === monthKey ? normalizeInteger(member.quotaExtra, 0, 99) : 0;
    return Number(member.monthlyQuota || 0) + extra;
  }

  function manageQuotaLabel(member) {
    var quotaLimit = effectiveMonthlyQuota(member, currentMonthKey());
    if (quotaLimit === null) return "無制限";
    var extra = normalizeInteger(member.quotaExtra, 0, 99);
    var activeExtra = normalizeMonthKey(member.quotaExtraMonth) === currentMonthKey() ? extra : 0;
    return "月" + quotaLimit + "回" + (activeExtra ? "（今月+" + activeExtra + "）" : "");
  }

  function quotaForMemberType(memberType) {
    if (memberType === "prime") return null;
    if (memberType === "semi8") return 8;
    if (memberType === "semi4") return 4;
    if (memberType === "semi2") return 2;
    return 4;
  }

  function nextMemberCode() {
    var used = {};
    state.members.forEach(function (member) {
      used[normalizeMemberCode(member.memberCode)] = true;
    });
    for (var attempt = 0; attempt < 200; attempt += 1) {
      var code = String(Math.floor(10000 + Math.random() * 90000));
      if (!used[code]) return code;
    }
    var fallback = 10000;
    while (used[String(fallback)] && fallback <= 99999) fallback += 1;
    return String(Math.min(fallback, 99999));
  }

  function memberTypeLabel(memberType) {
    if (memberType === "prime") return "正会員";
    if (memberType === "semi8") return "準会員 月8";
    if (memberType === "semi4") return "準会員 月4";
    if (memberType === "semi2") return "準会員 月2";
    if (memberType === "manual") return "未登録";
    return "準会員";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }
})();
