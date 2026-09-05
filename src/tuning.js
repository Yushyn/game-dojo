// ═════════════════════════════════════════════════════════════=
//  НАЛАШТУВАННЯ ГРИ
//  Тут лежить усе, що можна крутити без знання програмування.
//  Міняй числа й тексти, зберігай файл, онови вкладку.
// ═════════════════════════════════════════════════════════════=

export const TUNING = {

  // ── ПРАВИЛА РАУНДУ ───────────────────────────────────────────
  round: {
    // Показ чобота переїхав у блок intro нижче, тому тут 0.
    // Постав більше нуля, якщо хочеш, щоб чобіт ще й лежав на стопі
    // перші секунди робочого часу.
    previewSeconds: 0,
    totalSeconds:   20,  // скільки триває робочий час раунду.
                         // Відлік починається ПІСЛЯ вступу.

    // false — таймер раунду й показ чобота стартують РАЗОМ.
    //         Тобто чобіт видно перші секунди раунду, решту часу — по памʼяті.
    // true  — спершу просто дивимось, і лише потім починається час на роботу.
    timerStartsAfterPreview: false,

    passPercent:      80,  // з якого відсотка збігу раунд зараховується
    pointsPerPercent: 10,  // очки за пройдений раунд = відсоток × це число

    // Кнопки «Почати» більше немає: раунди йдуть самі, один за одним.
    resultSeconds: 3.5,  // скільки видно результат раунду, перш ніж піде далі

    // Перескладати той самий чобіт не можна: не влучив — втратив
    // життя і йдеш до наступного чобота. Скільки всього помилок
    // можна зробити, задає блок `lives` нижче.
  },

  // ── ЖИТТЯ ────────────────────────────────────────────────────
  // Гравець починає з двох життів. Не влучив у чобіт — 0 очок,
  // мінус життя, і на пʼєдестал стає ІНША нога. Життя скінчились —
  // вікно програшу. Пройшов усі чоботи — вікно з лідербордом.
  lives: {
    count: 2,     // скільки життів на початку гри

    // Значки праворуч від смужки часу. Скільки життів лишилось,
    // стільки значків і видно. Зникають зліва направо.
    // Значків має бути щонайменше стільки ж, скільки життів.
    icons: ['assets/life-1.png', 'assets/life-2.png'],

    // ── ЩО ВІДБУВАЄТЬСЯ ПРИ ВТРАТІ ЖИТТЯ ──────────────────────
    // Спершу нога на пʼєдесталі блідне й червоніє, потім на весь
    // екран іде анімація, і аж тоді стає наступна нога.

    // Параметри для позначення втрати на стопі
    tintFoot:    false,    // старе поле: чи блідне/червоніє нога
    footAlpha:   0.5,      // до якої непрозорості блідне нога, 0..1
    footRed:     0.3,      // наскільки заливається червоним, 0..1
    footFadeSeconds: 0.6,  // за скільки вона доходить до цього стану.
    holdSeconds: 1.2,      // скільки триває ця пауза.

    // Значок втраченого життя (їхні параметри)
    iconRed:         '#c02020', // колір, яким заливається значок
    iconRedAlpha:    0.9,       // наскільки щільно, 0..1
    iconDim:         0.45,      // до якої непрозорості притухає сама картинка під червоним, 0..1
    iconFadeSeconds: 0.5,       // за скільки все це проступає

    // Повноекранна анімація. Тепер це ролик із гільйотиною —
    // гра розпізнає відео за розширенням .webm або .mp4.
    anim: [
      'assets/auch.mp4',      // перша нога
      'assets/auch_2.mp4',    // друга нога
    ],

    // Скільки ролик тримається на екрані. Одне число на всі:
    animSeconds: 7.1,

    // Скільки триває затемнення на вході в ролик і на виході з нього.
    // Keep Vlad's slightly longer default for better reliability.
    fadeSeconds: 0.45,

    // Звук до роликів, у тому ж порядку.
    animSound: [
      'assets/auch_.mp3',
      'assets/auch2_audio.mp3',
    ],
    animSoundVolume: 0.9,   // 0..1
  },

  // ── ЧОБОТИ ───────────────────────────────────────────────────
  // Порядок у списку = порядок раундів.
  boots: [
    { src: 'assets/boot1.png', outline: 'assets/boot1-outline.png',
      name: 'Leather Ankle Boot', passPercent: 78 },
    { src: 'assets/boot2.png', outline: 'assets/boot2-outline.png',
      name: 'Rubber Duck',        passPercent: 73, cutOffset: 0.12 },
    { src: 'assets/boot3.png', outline: 'assets/boot3-outline.png',
      name: 'Trojan Horse',       passPercent: 35, cutOffset: 0.10 },
    { src: 'assets/boot4.png', outline: 'assets/boot4-outline.png',
      name: 'Trail Sneaker',      passPercent: 79 },
    { src: 'assets/boot5.png', outline: 'assets/boot5-outline.png',
      name: 'Nightshade Heel',    passPercent: 64, cutOffset: 0.17 },
    { src: 'assets/boot6.png', outline: 'assets/boot6-outline.png',
      name: 'Jester Slipper',     passPercent: 79 },

    // ── Нові чоботи ──────────────────────────────────────────
    { src: 'assets/boot7.png', outline: 'assets/boot7-outline.png',
      name: 'Winged Boot',        passPercent: 45 },
    { src: 'assets/boot8.png', outline: 'assets/boot8-outline.png',
      name: 'Flamingo Royale',    passPercent: 49 },
    { src: 'assets/boot9.png', outline: 'assets/boot9-outline.png',
      name: 'Melting Pump',       passPercent: 68 },
    { src: 'assets/boot10.png', outline: 'assets/boot10-outline.png',
      name: 'Ducky Sock',         passPercent: 98 },
    { src: 'assets/boot11.png', outline: 'assets/boot11-outline.png',
      name: 'Crimson Lace',       passPercent: 32 },
  ],

  // ── ДЕ МОЖЕ СТОЯТИ ЧОБІТ ─────────────────────────────────----
  bootArea: {
    on:    true,
    top:   0.17,
    left:  0.06,
    right: 0.74,
  },

  // ── ПОРЯДОК ЧОБІТ ────────────────────────────────────────────
  bootOrder: [],

  // ── ВСТУП РАУНДУ ─────────────────────────────────────────────
  intro: {
    bootSeconds:     2,
    outlineSeconds:  3,
    footDropSeconds: 1.0,
    footDropFrom:    0.85,

    bootAlpha:    1.0,
    outlineAlpha: 1.0,
    fadeSeconds:  0.35,

    countdown: {
      on:    true,
      size:  180,
      color: '#f4eee2',
      dim:   'rgba(0, 0, 0, 0.85)',
    },

    dropShadow: {
      on:       true,
      alpha:    0.55,
      width:    0.62,
      height:   0.055,
      spread:   2.4,
    },
  },

  // ── ЯК ПОКАЗУВАТИ ЧОБІТ ──────────────────────────────────────
  preview: {
    alpha:          0.55,
    fadeInSeconds:  0.8,
    fadeOutSeconds: 2.0,
    resultAlpha:    0.75,
  },

  // ── ЩО ПОКАЗУЄМО В КІНЦІ РАУНДУ ──────────────────────────────
  reveal: {
    outlineSeconds: 1.3,
    blurSeconds:    0.7,
    blurMax:        28,
    bootAlpha:      0.85,
  },

  // ── ФОН ──────────────────────────────────────────────────────
  background: {
    src:  'assets/background.png',
    wide: 'assets/background-wide.png',
    show: true,
  },

  // ── ДІВЧИНКА ─────────────────────────────────────────────────
  girl: {
    show: true,

    clips: [
      { on: true,  video: 'assets/girl.webm',
        heightPercent: 1.133,  centerX: 0.8705, bottomY: 1.267 },
      { on: false, video: 'assets/girl2.webm',
        heightPercent: 1.1409, centerX: 0.8744, bottomY: 1.2687 },
    ],

    speed: 1,
    crossSeconds: 0.5,
    sheet:  'assets/girl-sheet.webp',
    frames: 72,
    cols:   9,
    fps:    10,

    heightPercent: 1.133,
    centerX:       0.8705,
    bottomY:       1.267,
  },

  pedestal: {
    src:  'assets/pedestal.png',
    show: true,
  },

  image: {
    sources: ['assets/foot.png', 'assets/foot2.png'],
    src:            'assets/foot.png',

    heightPercent: 0.79,
    standX:        0.517,
    standY:        0.7375,

    // Use Vlad's safer defaults for shadow off in this render
    shadow:        false,
    shadowWidth:   0.62,
    shadowHeight:  0.05,

    workResolution: 820,
  },

  brush: {
    tools: [
      { size: 140, icon: 'assets/brush-1.png', name: 'Пінцет' },
      { size: 240, icon: 'assets/brush-2.png', name: 'Плоскогубці' },
      { size: 380, icon: 'assets/brush-3.png', name: 'Розвідний ключ' },
    ],

    startIndex: 1,
    iconScale: 0.4,
    buttonIconScale: 0.86,
    buttonSizeMix: 0,

    strength: 0.55,
    hardness: 0.45,
  },

  leaderboard: {
    limit: 10,
    resetBefore: '',
  },

  compare: {
    gridSize: 128,
    cutAboveBoot: true,
    cutOffset:    0,
    showCutLine:  false,
    cutLineColor: 'rgba(255, 90, 90, 0.45)',
  },

  screens: {
    btnPressStart: 'PRESS TO START',
    loadingText:       'Готуємо сцену',
    loadingMinSeconds: 2.6,
    loadingMaxSeconds: 15,
    loadingArt: {
      src:    ['assets/RedFeet.png', 'assets/loading-feet.png'],
      width:  101,
      height: 440,
      count:  8,
      printHeight: 80,
      stepY:       45,
      firstY:       0,
      leftX:  [0, 42],
      rightX: [57, 101],
      topIsRight: true,
      cycleSeconds: 2.6,
    },

    menuVideo: {
      sources: ['assets/menu-bg.webm', 'assets/menu-bg.mp4'],
      poster:  'assets/menu-poster.jpg',
      play:    true,
    },

    music: {
      menu:        'assets/The_Macabre_Waltz.mp3',
      game:        'assets/fit.mp3',
      volume:      0.5,
      duckVolume:  0.25,
      fadeSeconds: 1.5,
      showMute:    true,
    },

    thunder: {
      src:    'assets/sound.mp3',
      volume: 0.7,
      offset: 0,
    },

    fullscreenOn:   'Fullscreen',
    fullscreenOff:  'Windowed',
    homescreenHint: 'Add to Home Screen for fullscreen',

    rotateHint: 'Rotate your device',

    btnNewGame:     'New Game',
    btnLeaderboard: 'Leaderboards',
    btnCredits:     'Credits',
    btnBack:        'Назад',

    logo: { webp: 'assets/logo.webp', png: 'assets/logo.png' },

    muteOn:  'Sound: turn on',
    muteOff: 'Sound: turn off',

    leaderboardTitle: 'Leaderboard',
    creditsTitle:     'Credits',

    team: [
      { name: 'Yan Yushyn',          x: 21.6 },
      { name: 'Anastasiia Boiarska', x: 34.1 },
      { name: 'Vladyslav Hyryk',     x: 51.2 },
      { name: 'Anna Khamietova',     x: 69.0 },
      { name: 'Rodion Baskakov',     x: 82.6 },
    ],

    teamPhoto: { webp: 'assets/Credits_team.webp', png: 'assets/Credits_team.png' },
  },

  texts: {
    title: 'Cinderhella',

    hudRound: '{name}',
    hudGoal:  'To win, make a {pass}% match',
    hudTimer: 'Timer: {sec}s',

    introBoot:    'Watch closely',
    introOutline: 'Remember the shape',

    passed: 'APPROVED!',
    failed: 'REJECTED!',
    need:   '{pass}% required.',
    points: '+{n} points',
    retry:  'One more leg',

    askLeave: 'Return to the main menu?',
    askNote:  'This round won’t count, and you’ll lose all points earned in this game.',
    askYes:   'Yes',
    askNo:    'No',

    lostTitle: 'Out of Legs',
    lostNote:  'No legs left to fit. Better luck next time.',
    lostAgain: 'Try Again',
    lostMenu:  'Main Menu',

    resultTitle:     'Legs Over. Game Over',
    resultScore:     'Your Score',
    namePlaceholder: 'Your Name',
    saveButton:      'Save Score',
    saving:          'Saving…',
    saved:           'Score Saved!',
    needName:        'Enter your name.',
    boardTitle:      'Top-10',
    emptyBoard:      'No scores yet. Be the first!',
  },

  colors: {
    stage:       '#12111a',
    brushRing:   'rgba(255, 255, 255, 0.85)',
    brushShadow: 'rgba(0, 0, 0, 0.55)',
    bootFrame:   '#2b2840',
    overlay:     '#b02a2a',
    good:        '#7ee787',
    bad:         '#ff7a7a',
    dying:       '#c02020',
    ink:         '#e8e6f0',
    dim:         '#8b869e',
  },

  undoSteps: 12,
};
