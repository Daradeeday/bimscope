// Internationalization system for IFC Data Inspector
export const translations = {
  en: {
    // Header
    title: "BIMSCOPE IFC",
    subtitle: "Load an IFC file and inspect entities, properties, and relationships",

    // Section 1 - Load IFC
    section1_title: "1) Load IFC",
    load_button: "Load",
    close_button: "Close",
    load_hint: "Select an .ifc file to start.",
    metadata_hint: "Optional: Load metadata JSON from pyRevit for accurate room coordinates",

    // Section 2 - Quick Queries
    section2_title: "2) Quick Queries",
    list_types_button: "List Types",
    list_spaces_button: "List IfcSpace",

    // Section 3 - Inspect by ExpressID
    section3_title: "3) Inspect by ExpressID",
    expressid_placeholder: "ExpressID (e.g. 123)",
    inspect_button: "Inspect",
    property_sets_button: "Property Sets",
    type_properties_button: "Type Properties",

    // Section 4 - Rooms + Section Box
    section4_title: "4) Rooms + Section Box",
    room_select_placeholder: "Load a model to list rooms...",
    highlight_option: "Highlight (Transparent)",
    sectionbox_option: "Section Box (Clip)",
    go_to_room_button: "Go to Room",
    clear_button: "Clear",

    // Section 5 - Export Data
    section5_title: "6) Export Data",
    export_json_button: "Export JSON",
    export_csv_button: "Export CSV",
    export_hint: "Export room data with coordinates",

    // Section 6 - Level Views
    section6_title: "5) Level Views",
    level_select_placeholder: "Load a model to list levels...",
    top_offset_label: "Top Offset (m):",
    show_all_levels_button: "Show All Levels",

    // Viewer
    output_title: "Output",
    no_model_loaded: "No model loaded",
    isometric_button: "Isometric",
    reset_view_button: "Reset View",
    waiting_for_ifc: "Waiting for IFC file...",

    // Language
    language_button: "EN",

    // Auth
    logout: "Sign Out",

    // Section 7 - Category Filter
    section7_title: "7) Category Filter",
    show_all_categories: "Show All",
    hide_all_categories: "Hide All",
    category_filter_hint: "Load a model to see categories."
  },
  th: {
    // Header
    title: "BIMSCOPE IFC",
    subtitle: "โหลดไฟล์ IFC เพื่อตรวจสอบเอนทิตี คุณสมบัติ และความสัมพันธ์",

    // Section 1 - Load IFC
    section1_title: "1) โหลด IFC",
    load_button: "โหลด",
    close_button: "ปิด",
    load_hint: "เลือกไฟล์ .ifc เพื่อเริ่มต้น",
    metadata_hint: "ไม่จำเป็น: โหลดข้อมูลเมตาดาต้า JSON จาก pyRevit สำหรับพิกัดห้องที่แม่นยำ",

    // Section 2 - Quick Queries
    section2_title: "2) คำถามเร่งด่วน",
    list_types_button: "แสดงประเภท",
    list_spaces_button: "แสดง IfcSpace",

    // Section 3 - Inspect by ExpressID
    section3_title: "3) ตรวจสอบตาม ExpressID",
    expressid_placeholder: "ExpressID (เช่น 123)",
    inspect_button: "ตรวจสอบ",
    property_sets_button: "ชุดคุณสมบัติ",
    type_properties_button: "คุณสมบัติประเภท",

    // Section 4 - Rooms + Section Box
    section4_title: "4) ห้อง + กล่องหัวข้อ",
    room_select_placeholder: "โหลดโมเดลเพื่อแสดงรายการห้อง...",
    highlight_option: "เน้น (โปร่งแสง)",
    sectionbox_option: "กล่องหัวข้อ (ครอป)",
    go_to_room_button: "ไปที่ห้อง",
    clear_button: "ล้าง",

    // Section 5 - Export Data
    section5_title: "6) ส่งออกข้อมูล",
    export_json_button: "ส่งออก JSON",
    export_csv_button: "ส่งออก CSV",
    export_hint: "ส่งออกข้อมูลห้องพร้อมพิกัด",

    // Section 6 - Level Views
    section6_title: "5) มุมมองระดับ",
    level_select_placeholder: "โหลดโมเดลเพื่อแสดงรายการระดับ...",
    top_offset_label: "ออฟเซ็ตด้านบน (ม.):",
    show_all_levels_button: "แสดงทุกระดับ",

    // Viewer
    output_title: "ผลลัพธ์",
    no_model_loaded: "ไม่มีโมเดลที่โหลด",
    isometric_button: "ไอโซเมตริก",
    reset_view_button: "รีเซ็ตมุมมอง",
    waiting_for_ifc: "รอการโหลดไฟล์ IFC...",

    // Language
    language_button: "TH",

    // Auth
    logout: "ออกจากระบบ",

    // Section 7 - Category Filter
    section7_title: "7) ตัวกรองหมวดหมู่",
    show_all_categories: "แสดงทั้งหมด",
    hide_all_categories: "ซ่อนทั้งหมด",
    category_filter_hint: "โหลดโมเดลเพื่อดูหมวดหมู่"
  }
};

export let currentLanguage = 'en';

// Function to set language
export function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    localStorage.setItem('ifc-inspector-language', lang);
    updatePageLanguage();
    updateLanguageButton();
  }
}

// Function to get current language
export function getCurrentLanguage() {
  return currentLanguage;
}

// Function to translate text
export function t(key) {
  return translations[currentLanguage][key] || translations.en[key] || key;
}

// Function to update page language
function updatePageLanguage() {
  // Update HTML lang attribute
  document.documentElement.lang = currentLanguage;

  // Update all elements with data-i18n attribute
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = t(key);

    if (element.tagName === 'INPUT' && (element.type === 'text' || element.type === 'number')) {
      element.placeholder = translation;
    } else if (element.tagName === 'OPTION') {
      element.textContent = translation;
    } else {
      element.textContent = translation;
    }
  });

  // Update elements with data-i18n-placeholder attribute
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderElements.forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    element.placeholder = t(key);
  });

  // Update elements with data-i18n-title attribute
  const titleElements = document.querySelectorAll('[data-i18n-title]');
  titleElements.forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    element.title = t(key);
  });
}

// Function to update language button
function updateLanguageButton() {
  const langButton = document.getElementById('languageButton');
  if (!langButton) return;
  const label = langButton.querySelector('[data-i18n="language_button"]');
  if (label) {
    label.textContent = t('language_button');
  } else {
    langButton.textContent = t('language_button');
  }
}

// Initialize language from localStorage or browser language
export function initializeLanguage() {
  const savedLanguage = localStorage.getItem('ifc-inspector-language');

  if (savedLanguage && translations[savedLanguage]) {
    currentLanguage = savedLanguage;
  } else {
    // Detect browser language
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('th')) {
      currentLanguage = 'th';
    } else {
      currentLanguage = 'en';
    }
  }

  updatePageLanguage();
  updateLanguageButton();
}
