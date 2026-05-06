/* DŌJŌ JAPAN — multilingual chatbot widget
   ────────────────────────────────────────────
   Flow tree:

     stepLanguage (ja / en / ko / zh)
       → stepWelcome → stepIntent
            ├── Trial    → stepTrialFrequency
            │                ├── First time   → stepResident
            │                │                    ├── Local   (free trial 45min)
            │                │                    └── Tourist (auto-switched to Visitor ¥3,000)
            │                │                  → stepRental → … visitor info … → stepBeforeBook
            │                └── Returning    → (auto-switched to Visitor ¥3,000)
            │                                   → stepRental → … visitor info … → stepBeforeBook
            └── Membership → stepMembershipInfo → stepName → stepBeforeBook (name only)

     Visitor info collection: stepName → stepPeople → stepDate → stepTime
       - People: 1〜10
       - Date:   next 30 business days, Sundays excluded
       - Time:   7:00〜17:30, 30-min slots

     stepBeforeBook:
       - For trial/visitor flow: shows order summary (per-person × people = total)
       - Always shows availability disclaimer (directs to DM for finalisation)
       - bookQ + showBookingOptions

     showBookingOptions:
       - All locales:  Instagram DM only (smoothest — text + media + history)

     stepInstagramCopy:
       - Bilingual copy box (own locale + Japanese for staff)
       - Open Instagram DM button → stepThanks

     stepThanks → restart button → stepLanguage

   Reset button (header): restarts flow at any point via stepLanguage.
*/
(() => {
  'use strict';

  const root    = document.getElementById('chatbot');
  if (!root) return;
  const toggle  = document.getElementById('chatbotToggle');
  const panel   = document.getElementById('chatbotPanel');
  const msgList = document.getElementById('chatbotMessages');
  const actions = document.getElementById('chatbotActions');
  const statusEl = document.getElementById('chatbotStatus');

  // Resolve relative base for in-site links
  const base = (() => /\/trainer\//.test(location.pathname) ? '../' : './')();

  // ------- Contact endpoints --------------------------------------------
  const CONTACT = {
    tel:       'tel:0927533029',
    telLabel:  '092-753-3029',
    instagram: 'https://www.instagram.com/dojo_japan/',
  };

  // ------- Pricing (rental + plans) — client confirmed ------------------
  const PRICE = {
    trial:   0,
    visitor: 3000,
    member:  10000,    // 準会員 entry tier (monthly)
    prime:   33000,    // 正会員 (monthly, unlimited)
    dogi:    2000,  // レンタル道着（柔道・剣術用）
    wear:    0,        // レンタルスポーツウェア（無料）
  };
  const fmtJPY = (n) => '¥' + n.toLocaleString('ja-JP');

  // ------- Localization ------------------------------------------------
  const T = {
    ja: {
      online: 'オンライン',
      langTitle: '言語を選択してください',
      welcome: 'DŌJŌ JAPAN へようこそ。',
      intentQ: 'ご利用方法をお選びください。',
      wantTrial: '体験を希望',
      wantJoin:  '入会を希望',
      frequencyQ: '体験のご利用は今回が初めてでしょうか？\n（2回目以降はビジター料金 ¥3,000／60 分でのご案内となります）',
      firstTime: '初めて利用',
      repeatVisit: '2回目以降',
      residentQ: 'お客様について教えてください。\n（無料体験は福岡在住の方限定です）',
      residentLocal:   '福岡にお住まい',
      residentTourist: '観光で来訪',
      residentNoteLocal:   '在住の方として承りました。無料体験 45 分のご案内をいたします。',
      residentNoteTourist: '恐れ入ります。無料体験は福岡在住の方限定でございます。\n観光のお客様にはビジタープラン（¥3,000 / 60 分）をご案内しております。',
      planQ: 'ご希望のプランをお選びください。',
      planVisitor: 'ビジター（1回利用）',
      planMember:  '準会員（月会員）',
      planPrime:   '正会員（無制限）',
      planSubVisitor: '¥3,000 / 60 分',
      planSubMember:  '¥10,000〜 / 月',
      planSubPrime:   '¥33,000 / 月',
      rentalQ: 'レンタルはご希望ですか？\n（スポーツウェア・グローブ・レガース・タオル全て無料 / 道着のみ ¥2,000）',
      rentalDogi: '道着レンタル（¥2,000）',
      rentalWear: 'スポーツウェアのみ（無料）',
      rentalNone: '不要',
      summary: 'ご選択内容',
      lineTrial:   '無料体験 45 分',
      lineVisitor: 'ビジター 利用',
      lineMember:  '準会員 月額',
      linePrime:   '正会員 月額',
      lineDogi:    '道着レンタル',
      lineWear:    'スポーツウェアレンタル',
      total: '合計',
      payNotice: 'お支払いは当日、施設にて現金でお願いいたします。',
      bookQ: 'ご連絡は Instagram DM がスムーズです。下記よりお進みくださいませ。',
      memberInfo: 'ありがとうございます。\nDŌJŌ JAPAN では、ビジター・準会員・正会員の 3 プランをご用意しております。\nスタッフより詳細をご案内し、ご来館の日程もあわせて調整いたします。',
      memberBookQ: 'ご連絡は Instagram DM がスムーズです。下記よりお進みください。スタッフが日程を個別にご相談いたします。',
      phone: 'お電話',
      instagram: 'Instagram DM',
      copyInstruction: '以下のテキストをコピーして、Instagram DM に貼り付けて送信してください。スタッフよりご返信いたします。',
      copyBtn: 'テキストをコピー',
      copiedBtn: 'コピーしました',
      openIG: 'Instagram DM を開く',
      copyHeaderTrial: 'DŌJŌ JAPAN ご予約のご相談',
      copyHeaderMember: 'DŌJŌ JAPAN ご入会のご相談',
      copyLabelPlan: 'プラン',
      copyLabelRental: 'レンタル',
      copyLabelTotal: '合計',
      copyLabelStatus: '在住状況',
      copyLabelName: 'お名前',
      copyLabelPeople: 'ご来所人数',
      copyLabelDate: 'ご希望日',
      copyLabelTime: 'ご希望時間',
      copyLabelPerPerson: 'お一人あたり',
      copyMemberBody: 'DŌJŌ JAPAN への入会を検討しております。プランの詳細とご来館の日程についてご案内をお願いいたします。',
      copyPaymentNote: '※ お支払いは当日、施設にて現金でお願いいたします。',
      copyDisclaimer: '※ ご予約状況によりご希望に添えない場合がございます。詳細は Instagram DM にてご相談くださいませ。',
      perPerson: '／人',
      nameQ: 'ご予約者様のお名前をお聞かせください。',
      namePlaceholder: '例: 山田 太郎',
      peopleQ: 'ご来所人数をお選びください。',
      choosePeople: '人数を選択',
      peopleSuffix: '名',
      dateQ: 'ご来所希望日をお選びください。\n（営業日: 月〜土）',
      chooseDate: '日付を選択',
      timeQ: 'ご来所希望時間をお選びください。\n（営業時間: 7:00〜21:00／日曜完全予約制）',
      chooseTime: '時間を選択',
      submit: '送信',
      disclaimerNotice: '※ ご予約状況によりご希望に添えない場合がございます。詳しくは Instagram DM にてやりとりさせていただきます。',
      thanks: 'ありがとうございます。スタッフよりご対応させていただきます。',
      restart: '最初に戻る',
    },
    en: {
      online: 'Online',
      langTitle: 'Please select your language',
      welcome: 'Welcome to DŌJŌ JAPAN.',
      intentQ: 'How would you like to use the dojo?',
      wantTrial: 'Try a session',
      wantJoin:  'Become a member',
      frequencyQ: 'Is this your first visit?\n(Returning guests pay the standard Visitor rate ¥3,000 / 60 min.)',
      firstTime: 'First time',
      repeatVisit: 'Returning visitor',
      residentQ: 'Could you tell us a bit about yourself?\n(Free trial is for Fukuoka residents only.)',
      residentLocal:   'I live in Fukuoka',
      residentTourist: 'Visiting / on a trip',
      residentNoteLocal:   'Noted — local resident. We will set up your free 45-minute trial.',
      residentNoteTourist: 'We\'re sorry — the free trial is for Fukuoka residents only.\nFor visitors, we recommend the Visitor plan (¥3,000 / 60 min).',
      planQ: 'Which plan would you like?',
      planVisitor: 'Visitor (single visit)',
      planMember:  'Member (monthly)',
      planPrime:   'Prime (unlimited)',
      planSubVisitor: '¥3,000 / 60 min',
      planSubMember:  'from ¥10,000 / mo',
      planSubPrime:   '¥33,000 / mo',
      rentalQ: 'Would you like to rent any items?\n(Sportswear, gloves, shin pads, towel — all free / Gi only ¥2,000)',
      rentalDogi: 'Gi rental (¥2,000)',
      rentalWear: 'Sportswear only (free)',
      rentalNone: 'No rental',
      summary: 'Your selection',
      lineTrial:   'Free trial — 45 min',
      lineVisitor: 'Visitor session',
      lineMember:  'Member monthly',
      linePrime:   'Prime monthly',
      lineDogi:    'Gi rental',
      lineWear:    'Sportswear rental',
      total: 'Total',
      payNotice: 'Payment in cash at the facility on the day of your visit.',
      bookQ: 'Instagram DM is the smoothest way to reach us. Please proceed below.',
      memberInfo: 'Thank you.\nDŌJŌ JAPAN offers three plans — Visitor, Member, and Prime. Our staff will walk you through the details and arrange a visit date with you.',
      memberBookQ: 'Please reach out via one of the channels below. We\'ll set the date together.',
      phone: 'Phone',
      instagram: 'Instagram DM',
      copyInstruction: 'Please copy the text below and paste it into our Instagram DM. Our staff will reply shortly.',
      copyBtn: 'Copy text',
      copiedBtn: 'Copied!',
      openIG: 'Open Instagram DM',
      copyHeaderTrial: 'DŌJŌ JAPAN — Booking inquiry',
      copyHeaderMember: 'DŌJŌ JAPAN — Membership inquiry',
      copyLabelPlan: 'Plan',
      copyLabelRental: 'Rental',
      copyLabelTotal: 'Total',
      copyLabelStatus: 'Status',
      copyLabelName: 'Name',
      copyLabelPeople: 'Number of people',
      copyLabelDate: 'Preferred date',
      copyLabelTime: 'Preferred time',
      copyLabelPerPerson: 'Per person',
      copyMemberBody: 'I would like to inquire about membership at DŌJŌ JAPAN. Please share details about plans and arrange a visit date.',
      copyPaymentNote: '* Payment in cash at the facility on the day of your visit.',
      copyDisclaimer: '* We may not be able to accommodate your preferred date/time depending on availability. Please discuss details via Instagram DM.',
      perPerson: '/ person',
      nameQ: 'May I have your name?',
      namePlaceholder: 'e.g. John Smith',
      peopleQ: 'How many people will be visiting?',
      choosePeople: 'Choose',
      peopleSuffix: ' person(s)',
      dateQ: 'Please choose your preferred visit date.\n(Business days: Mon–Sat)',
      chooseDate: 'Choose a date',
      timeQ: 'Please choose your preferred visit time.\n(Hours: 7:00–21:00 / Sun by appointment)',
      chooseTime: 'Choose a time',
      submit: 'Send',
      disclaimerNotice: '* We may not be able to accommodate your preferred date/time depending on availability. Please continue the conversation via Instagram DM.',
      thanks: 'Thank you. Our team will follow up shortly.',
      restart: 'Start over',
    },
    ko: {
      online: '온라인',
      langTitle: '언어를 선택해 주세요',
      welcome: 'DŌJŌ JAPAN 에 오신 것을 환영합니다.',
      intentQ: '이용 방법을 선택해 주세요.',
      wantTrial: '체험 희망',
      wantJoin:  '입회 희망',
      frequencyQ: '이번이 처음 방문이신가요?\n(재방문은 일반 비지터 요금 ¥3,000 / 60분이 적용됩니다.)',
      firstTime: '처음 방문',
      repeatVisit: '재방문',
      residentQ: '간단히 알려주세요.\n(무료 체험은 후쿠오카 거주자 한정입니다.)',
      residentLocal:   '후쿠오카 거주',
      residentTourist: '관광 / 여행 중',
      residentNoteLocal:   '거주자분으로 확인했습니다. 45분 무료 체험을 안내해 드리겠습니다.',
      residentNoteTourist: '죄송합니다. 무료 체험은 후쿠오카 거주자 한정입니다.\n방문객 분들께는 비지터 플랜 (¥3,000 / 60 분)을 안내드립니다.',
      planQ: '원하시는 플랜을 선택해 주세요.',
      planVisitor: '비지터 (1회)',
      planMember:  '준회원 (월 회원)',
      planPrime:   '정회원 (무제한)',
      planSubVisitor: '¥3,000 / 60 분',
      planSubMember:  '¥10,000〜 / 월',
      planSubPrime:   '¥33,000 / 월',
      rentalQ: '대여를 원하십니까?\n(스포츠웨어・글러브・레가스・타올 모두 무료 / 도복만 ¥2,000)',
      rentalDogi: '도복 대여 (¥2,000)',
      rentalWear: '스포츠웨어만 (무료)',
      rentalNone: '필요 없음',
      summary: '선택 내용',
      lineTrial:   '무료 체험 45 분',
      lineVisitor: '비지터 이용',
      lineMember:  '준회원 월액',
      linePrime:   '정회원 월액',
      lineDogi:    '도복 대여',
      lineWear:    '스포츠웨어 대여',
      total: '합계',
      payNotice: '결제는 당일 시설에서 현금으로 부탁드립니다.',
      bookQ: 'Instagram DM이 가장 원활합니다. 아래에서 진행해 주세요.',
      memberInfo: '감사합니다.\nDŌJŌ JAPAN 에서는 비지터·준회원·정회원 3 가지 플랜을 제공하고 있습니다. 자세한 내용과 방문 일정은 담당자가 안내해 드립니다.',
      memberBookQ: '아래에서 편하신 방법으로 연락 주세요. 일정은 담당자가 안내해 드립니다.',
      phone: '전화',
      instagram: 'Instagram DM',
      copyInstruction: '아래 텍스트를 복사하여 Instagram DM에 붙여넣어 보내주세요. 담당자가 안내해 드리겠습니다.',
      copyBtn: '텍스트 복사',
      copiedBtn: '복사했습니다',
      openIG: 'Instagram DM 열기',
      copyHeaderTrial: 'DŌJŌ JAPAN 예약 문의',
      copyHeaderMember: 'DŌJŌ JAPAN 입회 문의',
      copyLabelPlan: '플랜',
      copyLabelRental: '대여',
      copyLabelTotal: '합계',
      copyLabelStatus: '거주',
      copyLabelName: '성함',
      copyLabelPeople: '방문 인원',
      copyLabelDate: '희망일',
      copyLabelTime: '희망 시간',
      copyLabelPerPerson: '1인당',
      copyMemberBody: 'DŌJŌ JAPAN 입회를 검토하고 있습니다. 플랜의 세부 정보와 방문 일정 안내를 부탁드립니다.',
      copyPaymentNote: '※ 결제는 당일 시설에서 현금으로 부탁드립니다.',
      copyDisclaimer: '※ 예약 상황에 따라 희망 일시에 맞춰드리지 못할 수 있습니다. 자세한 내용은 Instagram DM으로 상담 부탁드립니다.',
      perPerson: '/명',
      nameQ: '예약자분의 성함을 알려주세요.',
      namePlaceholder: '예: 홍길동',
      peopleQ: '방문 인원을 선택해 주세요.',
      choosePeople: '인원 선택',
      peopleSuffix: '명',
      dateQ: '방문 희망일을 선택해 주세요.\n(영업일: 월~토)',
      chooseDate: '날짜 선택',
      timeQ: '방문 희망 시간을 선택해 주세요.\n(영업시간: 7:00~21:00 / 일요일은 예약제)',
      chooseTime: '시간 선택',
      submit: '전송',
      disclaimerNotice: '※ 예약 상황에 따라 희망 일시에 맞춰드리지 못할 수 있습니다. 자세한 내용은 Instagram DM으로 안내해 드립니다.',
      thanks: '감사합니다. 곧 담당자가 안내해 드리겠습니다.',
      restart: '처음으로',
    },
    zh: {
      online: '在线',
      langTitle: '请选择语言',
      welcome: '欢迎来到 DŌJŌ JAPAN。',
      intentQ: '请选择您希望的服务方式。',
      wantTrial: '体验',
      wantJoin:  '加入会员',
      frequencyQ: '这是您第一次到访吗？\n（再次到访按照普通访客方案 ¥3,000 / 60 分钟收费）',
      firstTime: '首次到访',
      repeatVisit: '再次到访',
      residentQ: '请简单告诉我们您的情况。\n（免费体验仅限福冈居民）',
      residentLocal:   '居住于福冈',
      residentTourist: '观光 / 旅行中',
      residentNoteLocal:   '已确认为本地居民。将为您安排 45 分钟免费体验。',
      residentNoteTourist: '抱歉，免费体验仅限福冈居民。\n观光访问的客户，我们推荐访客方案（¥3,000 / 60 分钟）。',
      planQ: '请选择您希望的方案。',
      planVisitor: '访客 (单次)',
      planMember:  '准会员 (月度)',
      planPrime:   '正式会员 (不限次数)',
      planSubVisitor: '¥3,000 / 60 分钟',
      planSubMember:  '¥10,000〜 / 月',
      planSubPrime:   '¥33,000 / 月',
      rentalQ: '是否需要租借？\n（运动服・拳套・护胫・毛巾 全部免费 / 仅道服 ¥2,000）',
      rentalDogi: '道服租借（¥2,000）',
      rentalWear: '仅运动服（免费）',
      rentalNone: '不需要',
      summary: '您的选择',
      lineTrial:   '免费体验 45 分钟',
      lineVisitor: '访客单次',
      lineMember:  '准会员月费',
      linePrime:   '正式会员月费',
      lineDogi:    '道服租借',
      lineWear:    '运动服租借',
      total: '合计',
      payNotice: '请于当日在场馆现金支付。',
      bookQ: 'Instagram DM 是最方便的联系方式。请从下方进行。',
      memberInfo: '感谢您的咨询。\nDŌJŌ JAPAN 提供访客、准会员、正式会员三种方案。详细内容和到访日期，由工作人员为您逐一安排。',
      memberBookQ: '请通过以下任一方式与我们联系。具体日期由工作人员协助安排。',
      phone: '电话',
      instagram: 'Instagram DM',
      copyInstruction: '请复制以下文本并粘贴到我们的 Instagram DM。工作人员会尽快回复您。',
      copyBtn: '复制文本',
      copiedBtn: '已复制',
      openIG: '打开 Instagram DM',
      copyHeaderTrial: 'DŌJŌ JAPAN 预约咨询',
      copyHeaderMember: 'DŌJŌ JAPAN 入会咨询',
      copyLabelPlan: '方案',
      copyLabelRental: '租借',
      copyLabelTotal: '合计',
      copyLabelStatus: '居住情况',
      copyLabelName: '姓名',
      copyLabelPeople: '到访人数',
      copyLabelDate: '希望日',
      copyLabelTime: '希望时间',
      copyLabelPerPerson: '每人',
      copyMemberBody: '我希望咨询 DŌJŌ JAPAN 的入会事宜。请告知方案详情并协助安排到访日期。',
      copyPaymentNote: '※ 请于当日在场馆现金支付。',
      copyDisclaimer: '※ 视预约情况，我们可能无法配合您希望的日期与时间。详情请通过 Instagram DM 咨询。',
      perPerson: '/人',
      nameQ: '请告知预约人姓名。',
      namePlaceholder: '例: 张三',
      peopleQ: '请选择到访人数。',
      choosePeople: '选择人数',
      peopleSuffix: '人',
      dateQ: '请选择希望到访日期。\n（营业日：周一〜周六）',
      chooseDate: '选择日期',
      timeQ: '请选择希望到访时间。\n（营业时间：7:00〜21:00／周日仅预约）',
      chooseTime: '选择时间',
      submit: '发送',
      disclaimerNotice: '※ 视预约情况，我们可能无法配合您希望的日期与时间。详情请通过 Instagram DM 联系。',
      thanks: '感谢您的咨询。我们会尽快与您联系。',
      restart: '重新开始',
    },
  };

  let lang = 'ja';
  const $t = (k) => T[lang][k] ?? T.ja[k] ?? k;

  // ------- State (resets on restart) -----------------------------------
  const state = {
    intent:   null,    // 'trial' | 'member'
    plan:     null,    // 'visitor' | 'member' | 'prime'  (only for intent='member')
    resident: null,    // 'local' | 'tourist'              (only for intent='trial')
    dogi:     false,
    wear:     false,
    name:     '',
    people:   1,
    date:     '',
    time:     '',
  };
  const resetState = () => Object.assign(state, {
    intent: null, plan: null, resident: null,
    dogi: false, wear: false,
    name: '', people: 1, date: '', time: '',
  });

  // ------- Date / time / people option generators ----------------------
  const formatDateLabel = (d, locale) => {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = d.getDay();
    const dowJa = ['日','月','火','水','木','金','土'][dow];
    const dowEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow];
    const dowKo = ['일','월','화','수','목','금','토'][dow];
    const dowZh = ['日','一','二','三','四','五','六'][dow];
    if (locale === 'ja') return `${y}年${m}月${day}日（${dowJa}）`;
    if (locale === 'ko') return `${y}년 ${m}월 ${day}일 (${dowKo})`;
    if (locale === 'zh') return `${y}年${m}月${day}日（周${dowZh}）`;
    const monNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${monNames[d.getMonth()]} ${day}, ${y} (${dowEn})`;
  };

  // Next 30 days, excluding Sundays (closed). Returns ISO YYYY-MM-DD.
  const generateDateOptions = (locale) => {
    const opts = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    for (let i = 1; i <= 45 && opts.length < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (d.getDay() === 0) continue; // closed Sunday
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      opts.push({ value: iso, label: formatDateLabel(d, locale) });
    }
    return opts;
  };

  // 7:00 → 17:30 in 30-min slots
  const generateTimeOptions = () => {
    const opts = [];
    for (let mins = 7*60; mins <= 20*60 + 30; mins += 30) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const t = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      opts.push({ value: t, label: t });
    }
    return opts;
  };

  // 1〜10名
  const generatePeopleOptions = (suffix) => {
    const opts = [];
    for (let i = 1; i <= 10; i++) {
      opts.push({ value: String(i), label: `${i}${suffix}` });
    }
    return opts;
  };

  // ------- DOM helpers -------------------------------------------------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const addMessage = async (text, who = 'bot') => {
    const li = document.createElement('li');
    li.className = `cm cm--${who}`;
    if (who === 'bot') {
      const typing = document.createElement('span');
      typing.className = 'cm__typing';
      typing.innerHTML = '<i></i><i></i><i></i>';
      li.appendChild(typing);
      msgList.appendChild(li);
      msgList.scrollTop = msgList.scrollHeight;
      await sleep(420);
      li.textContent = text;
    } else {
      li.textContent = text;
      msgList.appendChild(li);
    }
    msgList.scrollTop = msgList.scrollHeight;
  };

  const setActions = (buttons) => {
    actions.innerHTML = '';
    buttons.forEach(b => {
      const el = b.href
        ? document.createElement('a')
        : document.createElement('button');
      el.className = 'cm-btn' + (b.primary ? ' cm-btn--primary' : '');
      el.textContent = b.label;
      if (b.subLabel) {
        const sub = document.createElement('small');
        sub.className = 'cm-btn__sub';
        sub.textContent = b.subLabel;
        el.appendChild(sub);
      }
      if (b.href) {
        el.href = b.href;
        if (b.target) el.target = b.target;
        if (b.target === '_blank') el.rel = 'noopener';
        el.addEventListener('click', () => {
          addMessage(b.label, 'me');
          if (b.then) setTimeout(b.then, 100);
        });
      } else {
        el.type = 'button';
        el.addEventListener('click', async () => {
          await addMessage(b.label, 'me');
          if (b.then) b.then();
        });
      }
      actions.appendChild(el);
    });
  };

  const clearAll = () => {
    msgList.innerHTML = '';
    actions.innerHTML = '';
  };

  // ------- Form input UI ----------------------------------------------
  // Render a text input or a <select> in the actions area, with a Send button.
  const showFormInput = ({ type, placeholder, options, displayValue, next }) => {
    actions.innerHTML = '';
    const form = document.createElement('form');
    form.className = 'cm-form';

    let inputEl;
    if (type === 'select') {
      inputEl = document.createElement('select');
      inputEl.className = 'cm-form__input';
      inputEl.required = true;
      const ph = document.createElement('option');
      ph.value = '';
      ph.disabled = true;
      ph.selected = true;
      ph.textContent = placeholder || '';
      inputEl.appendChild(ph);
      (options || []).forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        inputEl.appendChild(opt);
      });
    } else {
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'cm-form__input';
      inputEl.required = true;
      inputEl.maxLength = 60;
      inputEl.autocomplete = 'off';
      if (placeholder) inputEl.placeholder = placeholder;
    }
    form.appendChild(inputEl);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'cm-form__btn';
    submitBtn.textContent = $t('submit');
    form.appendChild(submitBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = inputEl.value.trim();
      if (!value) return;
      const echo = displayValue ? displayValue(value) : value;
      submitBtn.disabled = true;
      await addMessage(echo, 'me');
      next(value);
    });

    actions.appendChild(form);
    setTimeout(() => { try { inputEl.focus(); } catch (_) {} }, 120);
  };

  // ------- Copy-text helpers ------------------------------------------
  const parseISO = (iso) => {
    const [y, m, d] = (iso || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  // Build a single-locale summary text for the current state.
  const buildCopyText = (locale) => {
    const t = T[locale] || T.ja;
    const lines = [];
    const people = Math.max(1, parseInt(state.people, 10) || 1);

    // Generic membership inquiry — no plan/rental selected, name only
    if (state.intent === 'member' && !state.plan) {
      lines.push(t.copyHeaderMember);
      lines.push('');
      if (state.name) lines.push(`${t.copyLabelName}: ${state.name}`);
      lines.push('');
      lines.push(t.copyMemberBody);
      lines.push('');
      lines.push(t.copyDisclaimer);
      return lines.join('\n');
    }

    // Booking with details (free trial OR plan selected)
    lines.push(t.copyHeaderTrial);
    lines.push('');
    if (state.name) lines.push(`${t.copyLabelName}: ${state.name}`);
                    lines.push(`${t.copyLabelPeople}: ${people}${t.peopleSuffix}`);
    if (state.date) {
      const d = parseISO(state.date);
      lines.push(`${t.copyLabelDate}: ${d ? formatDateLabel(d, locale) : state.date}`);
    }
    if (state.time) lines.push(`${t.copyLabelTime}: ${state.time}`);
    lines.push('');

    let baseLabel = t.lineTrial;
    let basePrice = PRICE.trial;
    if (state.intent === 'trial')             { baseLabel = t.lineTrial;   basePrice = PRICE.trial; }
    else if (state.plan === 'visitor')        { baseLabel = t.planVisitor; basePrice = PRICE.visitor; }
    else if (state.plan === 'member')         { baseLabel = t.planMember;  basePrice = PRICE.member; }
    else if (state.plan === 'prime')          { baseLabel = t.planPrime;   basePrice = PRICE.prime; }
    lines.push(`${t.copyLabelPlan}: ${baseLabel}${basePrice ? ' (' + fmtJPY(basePrice) + t.perPerson + ')' : ''}`);

    let rentalLabel = t.rentalNone;
    let rentalPrice = 0;
    if (state.dogi)      { rentalLabel = t.rentalDogi; rentalPrice = PRICE.dogi; }
    else if (state.wear) { rentalLabel = t.rentalWear; rentalPrice = PRICE.wear; }
    lines.push(`${t.copyLabelRental}: ${rentalLabel}${rentalPrice ? ' (' + fmtJPY(rentalPrice) + t.perPerson + ')' : ''}`);

    if (state.resident) {
      const statusLabel = state.resident === 'tourist' ? t.residentTourist : t.residentLocal;
      lines.push(`${t.copyLabelStatus}: ${statusLabel}`);
    }

    const perPersonTotal = basePrice + rentalPrice;
    const grandTotal = perPersonTotal * people;
    lines.push('');
    lines.push(`${t.copyLabelPerPerson}: ${fmtJPY(perPersonTotal)}`);
    lines.push(`${t.copyLabelTotal}: ${fmtJPY(perPersonTotal)} × ${people}${t.peopleSuffix} = ${fmtJPY(grandTotal)}`);
    lines.push('');
    lines.push(t.copyPaymentNote);
    lines.push(t.copyDisclaimer);

    return lines.join('\n');
  };

  // For non-Japanese users, append the Japanese version below so staff can read it.
  const buildBilingualText = () => {
    const own = buildCopyText(lang);
    if (lang === 'ja') return own;
    return `${own}\n\n──────────────\n\n${buildCopyText('ja')}`;
  };

  const showCopyBox = (text) => {
    const li = document.createElement('li');
    li.className = 'cm cm--copybox';

    const pre = document.createElement('pre');
    pre.className = 'cm-copybox__text';
    pre.textContent = text;
    li.appendChild(pre);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-copybox__btn';
    btn.textContent = $t('copyBtn');
    const copy = async () => {
      try { fire('chatbot:copy', { intent: state.intent, plan: state.plan, lang, people: state.people }); } catch(e){}
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        // Fallback for older browsers / non-secure contexts: select the text
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      btn.textContent = $t('copiedBtn');
      btn.classList.add('cm-copybox__btn--copied');
      setTimeout(() => {
        btn.textContent = $t('copyBtn');
        btn.classList.remove('cm-copybox__btn--copied');
      }, 1800);
    };
    btn.addEventListener('click', copy);
    li.appendChild(btn);

    msgList.appendChild(li);
    msgList.scrollTop = msgList.scrollHeight;
  };

  // ------- Steps -------------------------------------------------------
  const stepLanguage = async () => {
    clearAll();
    resetState();
    statusEl.textContent = T.ja.online;
    await addMessage(
      `${T.ja.langTitle}\n${T.en.langTitle}\n${T.ko.langTitle}\n${T.zh.langTitle}`
    );
    setActions([
      { label: '日本語',  primary: true, then: () => { lang = 'ja'; fire('chatbot:language', 'ja'); stepWelcome(); } },
      { label: 'English', primary: true, then: () => { lang = 'en'; fire('chatbot:language', 'en'); stepWelcome(); } },
      { label: '한국어',  primary: true, then: () => { lang = 'ko'; fire('chatbot:language', 'ko'); stepWelcome(); } },
      { label: '中文',    primary: true, then: () => { lang = 'zh'; fire('chatbot:language', 'zh'); stepWelcome(); } },
    ]);
  };

  const stepWelcome = async () => {
    actions.innerHTML = '';
    statusEl.textContent = $t('online');
    await addMessage($t('welcome'));
    await sleep(220);
    stepIntent();
  };

  const stepIntent = async () => {
    await addMessage($t('intentQ'));
    setActions([
      { label: $t('wantTrial'), primary: true, then: () => { state.intent = 'trial';  fire('chatbot:intent', 'trial');  stepTrialFrequency(); } },
      { label: $t('wantJoin'),                 then: () => { state.intent = 'member'; fire('chatbot:intent', 'member'); stepMembershipInfo(); } },
    ]);
  };

  // ---- Trial branch: first-time check (free trial) vs returning (paid Visitor)
  const stepTrialFrequency = async () => {
    await addMessage($t('frequencyQ'));
    setActions([
      { label: $t('firstTime'),   primary: true, then: () => { fire('chatbot:frequency', 'first');  stepResident(); } },
      { label: $t('repeatVisit'),                then: () => {
          // 2nd+ visit pays the standard Visitor rate
          state.intent = 'member';
          state.plan   = 'visitor';
          state.resident = null;
          fire('chatbot:frequency', 'returning');
          stepRental();
        }
      },
    ]);
  };

  const stepResident = async () => {
    await addMessage($t('residentQ'));
    setActions([
      { label: $t('residentLocal'),   primary: true, then: () => { state.resident = 'local';   fire('chatbot:resident', 'local');   stepResidentAck(); } },
      { label: $t('residentTourist'),                then: () => { state.resident = 'tourist'; fire('chatbot:resident', 'tourist'); stepResidentAck(); } },
    ]);
  };

  const stepResidentAck = async () => {
    const note = state.resident === 'tourist' ? $t('residentNoteTourist') : $t('residentNoteLocal');
    await addMessage(note);
    await sleep(280);
    if (state.resident === 'tourist') {
      // Free trial unavailable for tourists — switch to Visitor paid plan
      state.intent = 'member';
      state.plan   = 'visitor';
    }
    stepRental();
  };

  const stepRental = async () => {
    state.dogi = false;
    state.wear = false;
    await addMessage($t('rentalQ'));
    setActions([
      { label: $t('rentalDogi'), primary: true, then: () => { state.dogi = true;  state.wear = false; stepName(); } },
      { label: $t('rentalWear'),                then: () => { state.dogi = false; state.wear = true;  stepName(); } },
      { label: $t('rentalNone'),                then: () => { state.dogi = false; state.wear = false; stepName(); } },
    ]);
  };

  // ---- Membership branch: simple — confirm name then go straight to DM copy
  const stepMembershipInfo = async () => {
    await addMessage($t('memberInfo'));
    await sleep(320);
    stepName();
  };

  // ---- Visitor info collection (shared between trial/visitor paths)
  // For pure membership inquiries, only name is collected.
  const stepName = async () => {
    await addMessage($t('nameQ'));
    showFormInput({
      type: 'text',
      placeholder: $t('namePlaceholder'),
      next: (v) => {
        state.name = v;
        // Member-only inquiry (no plan/rental): skip schedule/people, jump to DM step
        if (state.intent === 'member' && !state.plan) {
          stepBeforeBook();
        } else {
          stepPeople();
        }
      },
    });
  };

  const stepPeople = async () => {
    await addMessage($t('peopleQ'));
    const t = T[lang] || T.ja;
    showFormInput({
      type: 'select',
      placeholder: $t('choosePeople'),
      options: generatePeopleOptions(t.peopleSuffix),
      displayValue: (v) => `${v}${t.peopleSuffix}`,
      next: (v) => { state.people = parseInt(v, 10) || 1; stepDate(); },
    });
  };

  const stepDate = async () => {
    await addMessage($t('dateQ'));
    showFormInput({
      type: 'select',
      placeholder: $t('chooseDate'),
      options: generateDateOptions(lang),
      displayValue: (v) => {
        const d = parseISO(v);
        return d ? formatDateLabel(d, lang) : v;
      },
      next: (v) => { state.date = v; stepTime(); },
    });
  };

  const stepTime = async () => {
    await addMessage($t('timeQ'));
    showFormInput({
      type: 'select',
      placeholder: $t('chooseTime'),
      options: generateTimeOptions(),
      next: (v) => { state.time = v; stepBeforeBook(); },
    });
  };

  const stepBeforeBook = async () => {
    if (state.intent === 'trial' || state.plan) {
      await showOrderSummary();
    }
    await addMessage($t('disclaimerNotice'));
    await sleep(280);
    await addMessage($t('bookQ'));
    showBookingOptions();
  };

  const baseLineForState = () => {
    if (state.intent === 'trial')           return { label: $t('lineTrial'),   price: PRICE.trial };
    if (state.plan   === 'visitor')         return { label: $t('lineVisitor'), price: PRICE.visitor };
    if (state.plan   === 'member')          return { label: $t('lineMember'),  price: PRICE.member };
    if (state.plan   === 'prime')           return { label: $t('linePrime'),   price: PRICE.prime };
    return { label: $t('lineTrial'), price: 0 };
  };

  // Summary block — does not auto-advance.
  const showOrderSummary = async () => {
    const baseLine = baseLineForState();
    const t = T[lang] || T.ja;
    const people = Math.max(1, state.people || 1);
    const rows = [];
    rows.push(`${baseLine.label}  ${fmtJPY(baseLine.price)}${t.perPerson}`);
    if (state.dogi) rows.push(`+ ${$t('lineDogi')}  ${fmtJPY(PRICE.dogi)}${t.perPerson}`);
    if (state.wear) rows.push(`+ ${$t('lineWear')}  ${fmtJPY(PRICE.wear)}${t.perPerson}`);
    if (state.resident) {
      const tag = state.resident === 'tourist' ? $t('residentTourist') : $t('residentLocal');
      rows.push(`(${tag})`);
    }
    const perPersonTotal = baseLine.price + (state.dogi ? PRICE.dogi : 0) + (state.wear ? PRICE.wear : 0);
    const grandTotal = perPersonTotal * people;
    rows.push('────────────');
    rows.push(`${t.copyLabelPeople}: ${people}${t.peopleSuffix}`);
    rows.push(`${$t('total')}: ${fmtJPY(perPersonTotal)} × ${people}${t.peopleSuffix} = ${fmtJPY(grandTotal)}`);
    await addMessage(`${$t('summary')}\n\n${rows.join('\n')}`);
    await sleep(250);
    await addMessage($t('payNotice'));
    await sleep(220);
  };

  // Instagram DM is the only contact channel for everyone — JP and overseas alike.
  // Phone has been removed because IG flow is smoother (text + media + history).
  const showBookingOptions = () => {
    setActions([
      { label: $t('instagram'), primary: true, then: stepInstagramCopy },
    ]);
  };

  const stepInstagramCopy = async () => {
    await addMessage($t('copyInstruction'));
    await sleep(180);
    showCopyBox(buildBilingualText());
    await sleep(120);
    setActions([
      { label: $t('openIG'), primary: true, href: CONTACT.instagram, target: '_blank',
        then: () => { try { fire('chatbot:complete', { intent: state.intent, plan: state.plan, lang, people: state.people }); } catch(e){} stepThanks(); } },
    ]);
  };

  const stepThanks = async () => {
    await sleep(200);
    await addMessage($t('thanks'));
    setActions([
      { label: $t('restart'), then: stepLanguage },
    ]);
  };

  // ------- GA4 / Analytics integration ---------------------------------
  // dispatch CustomEvents on key milestones; analytics.js listens & sends to GA4.
  const fire = (name, detail) => {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) {}
  };

  // ------- Toggle ------------------------------------------------------
  // CSS handles visibility / pointer-events via `.chatbot.is-open` — we only flip the class.
  const open = () => {
    root.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    fire('chatbot:open');
    if (!msgList.children.length) stepLanguage();
  };
  const close = () => {
    root.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener('click', () => {
    root.classList.contains('is-open') ? close() : open();
  });

  // ------- Reset button (always available in header) ------------------
  const resetBtn = document.getElementById('chatbotReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => stepLanguage());
  }
})();
