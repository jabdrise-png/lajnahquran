/**
 * Master Data & Coordinate Engine Mushaf Standar Madinah (604 Halaman, 15 Baris)
 * 114 Surat, 6.236 Ayat, 30 Juz
 *
 * Digunakan untuk:
 * 1. Menentukan posisi presisi (Halaman, Juz, Baris Awal, Baris Akhir) setiap ayat
 * 2. Menghitung akumulasi hafalan rute mundur (An-Nas s.d Target Surat & Ayat) dengan akurasi 100%
 * 3. Menghitung akumulasi hafalan rute maju (Al-Fatihah s.d Target Surat & Ayat)
 * 4. Rincian ketercapaian per juz (misal: Juz 30-23 FULL, Juz 22 70%, Juz 21 0.5 halaman)
 * 5. Menghitung setoran Ziyadah Bersih vs Pengulangan/Remidi/Murojaah tanpa duplikasi
 */

export interface QuranAyahCoordinate {
  surah: number;        // Nomor surat (1 - 114)
  ayah: number;         // Nomor ayat
  page: number;         // Nomor halaman mushaf (1 - 604)
  juz: number;          // Nomor Juz (1 - 30)
  startLine: number;    // Baris awal ayat pada halaman tersebut (1 - 15)
  endLine: number;      // Baris akhir ayat pada halaman tersebut (1 - 15)
  line: number;         // Alias posisi baris penanda ayat selesai (endLine)
}

export interface QuranSurahInfo {
  id: number;           // 1 - 114
  name: string;         // Nama latin (misal 'Al-Ahzab')
  arabic: string;       // Nama Arab (misal 'الأحزاب')
  totalAyah: number;    // Jumlah ayat
  startPage: number;    // Halaman awal surat
  endPage: number;      // Halaman akhir surat
  startJuz: number;     // Juz awal surat
  endJuz: number;       // Juz akhir surat
  startLine: number;    // Baris awal surat di halaman pertama (1 - 15)
  endLine: number;      // Baris akhir surat di halaman terakhir (1 - 15)
}

export interface QuranJuzInfo {
  juz: number;          // 1 - 30
  name: string;         // Nama Juz (misal 'Juz 21', 'Juz 30 (Amma)')
  startSurah: number;
  startAyah: number;
  startPage: number;
  endSurah: number;
  endAyah: number;
  endPage: number;
  totalPages: number;   // Total halaman fisik juz ini
}

export interface JuzBreakdownItem {
  juz: number;
  name: string;
  status: 'FULL' | 'PARTIAL' | 'EMPTY';
  pagesMemorized: number;
  totalPages: number;
  percentage: number;
  ayahRangeDescription: string;
}

export interface HafalanCalculationResult {
  direction: 'backward' | 'forward';
  targetSurah: number;
  targetSurahName: string;
  targetAyah: number;
  targetPage: number;
  targetLine: number;
  targetJuz: number;
  totalHalaman: number;        // Total halaman desimal presisi
  totalJuzDecimal: number;     // Total juz desimal presisi
  totalAyat: number;           // Jumlah ayat yang dihafal
  juzBreakdown: JuzBreakdownItem[];
  surahRangeDesc: string;
}

export interface HafalanRangeResult {
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  startPage: number;
  startLine: number;
  endPage: number;
  endLine: number;
  totalHalaman: number;
  totalJuzDecimal: number;
  totalAyat: number;
}

// Master Data Surat (114 Surat)
export const SURAHS_DATA: QuranSurahInfo[] = [
  {
    "id": 1,
    "name": "Al-Fatihah",
    "arabic": "الفاتحة",
    "totalAyah": 7,
    "startPage": 1,
    "endPage": 1,
    "startJuz": 1,
    "endJuz": 1,
    "startLine": 2,
    "endLine": 8
  },
  {
    "id": 2,
    "name": "Al-Baqarah",
    "arabic": "البقرة",
    "totalAyah": 286,
    "startPage": 2,
    "endPage": 49,
    "startJuz": 1,
    "endJuz": 3,
    "startLine": 3,
    "endLine": 15
  },
  {
    "id": 3,
    "name": "Ali 'Imran",
    "arabic": "آل عمران",
    "totalAyah": 200,
    "startPage": 50,
    "endPage": 76,
    "startJuz": 3,
    "endJuz": 4,
    "startLine": 3,
    "endLine": 14
  },
  {
    "id": 4,
    "name": "An-Nisa'",
    "arabic": "النساء",
    "totalAyah": 176,
    "startPage": 77,
    "endPage": 106,
    "startJuz": 4,
    "endJuz": 6,
    "startLine": 2,
    "endLine": 5
  },
  {
    "id": 5,
    "name": "Al-Ma'idah",
    "arabic": "المائدة",
    "totalAyah": 120,
    "startPage": 106,
    "endPage": 127,
    "startJuz": 6,
    "endJuz": 7,
    "startLine": 8,
    "endLine": 15
  },
  {
    "id": 6,
    "name": "Al-An'am",
    "arabic": "الأنعام",
    "totalAyah": 165,
    "startPage": 128,
    "endPage": 150,
    "startJuz": 7,
    "endJuz": 8,
    "startLine": 3,
    "endLine": 15
  },
  {
    "id": 7,
    "name": "Al-A'raf",
    "arabic": "الأعراف",
    "totalAyah": 206,
    "startPage": 151,
    "endPage": 176,
    "startJuz": 8,
    "endJuz": 9,
    "startLine": 3,
    "endLine": 15
  },
  {
    "id": 8,
    "name": "Al-Anfal",
    "arabic": "الأنفال",
    "totalAyah": 75,
    "startPage": 177,
    "endPage": 186,
    "startJuz": 9,
    "endJuz": 10,
    "startLine": 3,
    "endLine": 15
  },
  {
    "id": 9,
    "name": "At-Taubah",
    "arabic": "التوبة",
    "totalAyah": 129,
    "startPage": 187,
    "endPage": 207,
    "startJuz": 10,
    "endJuz": 11,
    "startLine": 2,
    "endLine": 15
  },
  {
    "id": 10,
    "name": "Yunus",
    "arabic": "يونس",
    "totalAyah": 109,
    "startPage": 208,
    "endPage": 221,
    "startJuz": 11,
    "endJuz": 11,
    "startLine": 2,
    "endLine": 6
  },
  {
    "id": 11,
    "name": "Hud",
    "arabic": "هود",
    "totalAyah": 123,
    "startPage": 221,
    "endPage": 235,
    "startJuz": 11,
    "endJuz": 12,
    "startLine": 9,
    "endLine": 8
  },
  {
    "id": 12,
    "name": "Yusuf",
    "arabic": "يوسف",
    "totalAyah": 111,
    "startPage": 235,
    "endPage": 248,
    "startJuz": 12,
    "endJuz": 13,
    "startLine": 11,
    "endLine": 15
  },
  {
    "id": 13,
    "name": "Ar-Ra'd",
    "arabic": "الرعد",
    "totalAyah": 43,
    "startPage": 249,
    "endPage": 255,
    "startJuz": 13,
    "endJuz": 13,
    "startLine": 3,
    "endLine": 2
  },
  {
    "id": 14,
    "name": "Ibrahim",
    "arabic": "إبراهيم",
    "totalAyah": 52,
    "startPage": 255,
    "endPage": 261,
    "startJuz": 13,
    "endJuz": 13,
    "startLine": 5,
    "endLine": 15
  },
  {
    "id": 15,
    "name": "Al-Hijr",
    "arabic": "الحجر",
    "totalAyah": 99,
    "startPage": 262,
    "endPage": 267,
    "startJuz": 14,
    "endJuz": 14,
    "startLine": 3,
    "endLine": 6
  },
  {
    "id": 16,
    "name": "An-Nahl",
    "arabic": "النحل",
    "totalAyah": 128,
    "startPage": 267,
    "endPage": 281,
    "startJuz": 14,
    "endJuz": 14,
    "startLine": 9,
    "endLine": 15
  },
  {
    "id": 17,
    "name": "Al-Isra'",
    "arabic": "الإسراء",
    "totalAyah": 111,
    "startPage": 282,
    "endPage": 293,
    "startJuz": 15,
    "endJuz": 15,
    "startLine": 3,
    "endLine": 9
  },
  {
    "id": 18,
    "name": "Al-Kahf",
    "arabic": "الكهف",
    "totalAyah": 110,
    "startPage": 293,
    "endPage": 304,
    "startJuz": 15,
    "endJuz": 16,
    "startLine": 12,
    "endLine": 15
  },
  {
    "id": 19,
    "name": "Maryam",
    "arabic": "مريم",
    "totalAyah": 98,
    "startPage": 305,
    "endPage": 312,
    "startJuz": 16,
    "endJuz": 16,
    "startLine": 3,
    "endLine": 4
  },
  {
    "id": 20,
    "name": "Ta Ha",
    "arabic": "طه",
    "totalAyah": 135,
    "startPage": 312,
    "endPage": 321,
    "startJuz": 16,
    "endJuz": 16,
    "startLine": 7,
    "endLine": 15
  },
  {
    "id": 21,
    "name": "Al-Anbiya'",
    "arabic": "الأنبياء",
    "totalAyah": 112,
    "startPage": 322,
    "endPage": 331,
    "startJuz": 17,
    "endJuz": 17,
    "startLine": 3,
    "endLine": 14
  },
  {
    "id": 22,
    "name": "Al-Hajj",
    "arabic": "الحج",
    "totalAyah": 78,
    "startPage": 332,
    "endPage": 341,
    "startJuz": 17,
    "endJuz": 17,
    "startLine": 2,
    "endLine": 14
  },
  {
    "id": 23,
    "name": "Al-Mu'minun",
    "arabic": "المؤمنون",
    "totalAyah": 118,
    "startPage": 342,
    "endPage": 349,
    "startJuz": 18,
    "endJuz": 18,
    "startLine": 2,
    "endLine": 14
  },
  {
    "id": 24,
    "name": "An-Nur",
    "arabic": "النور",
    "totalAyah": 64,
    "startPage": 350,
    "endPage": 359,
    "startJuz": 18,
    "endJuz": 18,
    "startLine": 2,
    "endLine": 10
  },
  {
    "id": 25,
    "name": "Al-Furqan",
    "arabic": "الفرقان",
    "totalAyah": 77,
    "startPage": 359,
    "endPage": 366,
    "startJuz": 18,
    "endJuz": 19,
    "startLine": 13,
    "endLine": 14
  },
  {
    "id": 26,
    "name": "Asy-Syu'ara'",
    "arabic": "الشعراء",
    "totalAyah": 227,
    "startPage": 367,
    "endPage": 376,
    "startJuz": 19,
    "endJuz": 19,
    "startLine": 2,
    "endLine": 14
  },
  {
    "id": 27,
    "name": "An-Naml",
    "arabic": "النمل",
    "totalAyah": 93,
    "startPage": 377,
    "endPage": 385,
    "startJuz": 19,
    "endJuz": 20,
    "startLine": 2,
    "endLine": 7
  },
  {
    "id": 28,
    "name": "Al-Qasas",
    "arabic": "القصص",
    "totalAyah": 88,
    "startPage": 385,
    "endPage": 396,
    "startJuz": 20,
    "endJuz": 20,
    "startLine": 10,
    "endLine": 7
  },
  {
    "id": 29,
    "name": "Al-'Ankabut",
    "arabic": "العنكبوت",
    "totalAyah": 69,
    "startPage": 396,
    "endPage": 404,
    "startJuz": 20,
    "endJuz": 21,
    "startLine": 10,
    "endLine": 9
  },
  {
    "id": 30,
    "name": "Ar-Rum",
    "arabic": "الروم",
    "totalAyah": 60,
    "startPage": 404,
    "endPage": 410,
    "startJuz": 21,
    "endJuz": 21,
    "startLine": 12,
    "endLine": 15
  },
  {
    "id": 31,
    "name": "Luqman",
    "arabic": "لقمان",
    "totalAyah": 34,
    "startPage": 411,
    "endPage": 414,
    "startJuz": 21,
    "endJuz": 21,
    "startLine": 3,
    "endLine": 14
  },
  {
    "id": 32,
    "name": "As-Sajdah",
    "arabic": "السجدة",
    "totalAyah": 30,
    "startPage": 415,
    "endPage": 417,
    "startJuz": 21,
    "endJuz": 21,
    "startLine": 2,
    "endLine": 14
  },
  {
    "id": 33,
    "name": "Al-Ahzab",
    "arabic": "الأحزاب",
    "totalAyah": 73,
    "startPage": 418,
    "endPage": 427,
    "startJuz": 21,
    "endJuz": 22,
    "startLine": 2,
    "endLine": 15
  },
  {
    "id": 34,
    "name": "Saba'",
    "arabic": "سبإ",
    "totalAyah": 54,
    "startPage": 428,
    "endPage": 434,
    "startJuz": 22,
    "endJuz": 22,
    "startLine": 3,
    "endLine": 7
  },
  {
    "id": 35,
    "name": "Fatir",
    "arabic": "فاطر",
    "totalAyah": 45,
    "startPage": 434,
    "endPage": 440,
    "startJuz": 22,
    "endJuz": 22,
    "startLine": 10,
    "endLine": 3
  },
  {
    "id": 36,
    "name": "Ya Sin",
    "arabic": "يس",
    "totalAyah": 83,
    "startPage": 440,
    "endPage": 445,
    "startJuz": 22,
    "endJuz": 23,
    "startLine": 6,
    "endLine": 14
  },
  {
    "id": 37,
    "name": "As-Saffat",
    "arabic": "الصافات",
    "totalAyah": 182,
    "startPage": 446,
    "endPage": 452,
    "startJuz": 23,
    "endJuz": 23,
    "startLine": 2,
    "endLine": 14
  },
  {
    "id": 38,
    "name": "Sad",
    "arabic": "ص",
    "totalAyah": 88,
    "startPage": 453,
    "endPage": 458,
    "startJuz": 23,
    "endJuz": 23,
    "startLine": 2,
    "endLine": 3
  },
  {
    "id": 39,
    "name": "Az-Zumar",
    "arabic": "الزمر",
    "totalAyah": 75,
    "startPage": 458,
    "endPage": 467,
    "startJuz": 23,
    "endJuz": 24,
    "startLine": 6,
    "endLine": 2
  },
  {
    "id": 40,
    "name": "Ghafir",
    "arabic": "غافر",
    "totalAyah": 85,
    "startPage": 467,
    "endPage": 476,
    "startJuz": 24,
    "endJuz": 24,
    "startLine": 5,
    "endLine": 15
  },
  {
    "id": 41,
    "name": "Fussilat",
    "arabic": "فصلت",
    "totalAyah": 54,
    "startPage": 477,
    "endPage": 482,
    "startJuz": 24,
    "endJuz": 25,
    "startLine": 3,
    "endLine": 15
  },
  {
    "id": 42,
    "name": "Asy-Syura",
    "arabic": "الشورى",
    "totalAyah": 53,
    "startPage": 483,
    "endPage": 489,
    "startJuz": 25,
    "endJuz": 25,
    "startLine": 3,
    "endLine": 4
  },
  {
    "id": 43,
    "name": "Az-Zukhruf",
    "arabic": "الزخرف",
    "totalAyah": 89,
    "startPage": 489,
    "endPage": 495,
    "startJuz": 25,
    "endJuz": 25,
    "startLine": 7,
    "endLine": 15
  },
  {
    "id": 44,
    "name": "Ad-Dukhan",
    "arabic": "الدخان",
    "totalAyah": 59,
    "startPage": 496,
    "endPage": 498,
    "startJuz": 25,
    "endJuz": 25,
    "startLine": 3,
    "endLine": 14
  },
  {
    "id": 45,
    "name": "Al-Jasiyah",
    "arabic": "الجاثية",
    "totalAyah": 37,
    "startPage": 499,
    "endPage": 502,
    "startJuz": 25,
    "endJuz": 25,
    "startLine": 2,
    "endLine": 6
  },
  {
    "id": 46,
    "name": "Al-Ahqaf",
    "arabic": "الأحقاف",
    "totalAyah": 35,
    "startPage": 502,
    "endPage": 506,
    "startJuz": 26,
    "endJuz": 26,
    "startLine": 9,
    "endLine": 14
  },
  {
    "id": 47,
    "name": "Muhammad",
    "arabic": "محمد",
    "totalAyah": 38,
    "startPage": 507,
    "endPage": 510,
    "startJuz": 26,
    "endJuz": 26,
    "startLine": 2,
    "endLine": 15
  },
  {
    "id": 48,
    "name": "Al-Fath",
    "arabic": "الفتح",
    "totalAyah": 29,
    "startPage": 511,
    "endPage": 515,
    "startJuz": 26,
    "endJuz": 26,
    "startLine": 3,
    "endLine": 6
  },
  {
    "id": 49,
    "name": "Al-Hujurat",
    "arabic": "الحجرات",
    "totalAyah": 18,
    "startPage": 515,
    "endPage": 517,
    "startJuz": 26,
    "endJuz": 26,
    "startLine": 9,
    "endLine": 15
  },
  {
    "id": 50,
    "name": "Qaf",
    "arabic": "ق",
    "totalAyah": 45,
    "startPage": 518,
    "endPage": 520,
    "startJuz": 26,
    "endJuz": 26,
    "startLine": 3,
    "endLine": 11
  },
  {
    "id": 51,
    "name": "Az-Zariyat",
    "arabic": "الذاريات",
    "totalAyah": 60,
    "startPage": 520,
    "endPage": 523,
    "startJuz": 26,
    "endJuz": 27,
    "startLine": 14,
    "endLine": 7
  },
  {
    "id": 52,
    "name": "At-Tur",
    "arabic": "الطور",
    "totalAyah": 49,
    "startPage": 523,
    "endPage": 525,
    "startJuz": 27,
    "endJuz": 27,
    "startLine": 10,
    "endLine": 14
  },
  {
    "id": 53,
    "name": "An-Najm",
    "arabic": "النجم",
    "totalAyah": 62,
    "startPage": 526,
    "endPage": 528,
    "startJuz": 27,
    "endJuz": 27,
    "startLine": 2,
    "endLine": 8
  },
  {
    "id": 54,
    "name": "Al-Qamar",
    "arabic": "القمر",
    "totalAyah": 55,
    "startPage": 528,
    "endPage": 531,
    "startJuz": 27,
    "endJuz": 27,
    "startLine": 11,
    "endLine": 4
  },
  {
    "id": 55,
    "name": "Ar-Rahman",
    "arabic": "الرحمن",
    "totalAyah": 78,
    "startPage": 531,
    "endPage": 534,
    "startJuz": 27,
    "endJuz": 27,
    "startLine": 7,
    "endLine": 6
  },
  {
    "id": 56,
    "name": "Al-Waqi'ah",
    "arabic": "الواقعة",
    "totalAyah": 96,
    "startPage": 534,
    "endPage": 537,
    "startJuz": 27,
    "endJuz": 27,
    "startLine": 9,
    "endLine": 10
  },
  {
    "id": 57,
    "name": "Al-Hadid",
    "arabic": "الحديد",
    "totalAyah": 29,
    "startPage": 537,
    "endPage": 541,
    "startJuz": 27,
    "endJuz": 27,
    "startLine": 13,
    "endLine": 15
  },
  {
    "id": 58,
    "name": "Al-Mujadilah",
    "arabic": "المجادلة",
    "totalAyah": 22,
    "startPage": 542,
    "endPage": 545,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 3,
    "endLine": 6
  },
  {
    "id": 59,
    "name": "Al-Hasyr",
    "arabic": "الحشر",
    "totalAyah": 24,
    "startPage": 545,
    "endPage": 548,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 9,
    "endLine": 14
  },
  {
    "id": 60,
    "name": "Al-Mumtahanah",
    "arabic": "الممتحنة",
    "totalAyah": 13,
    "startPage": 549,
    "endPage": 551,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 2,
    "endLine": 6
  },
  {
    "id": 61,
    "name": "As-Saff",
    "arabic": "الصف",
    "totalAyah": 14,
    "startPage": 551,
    "endPage": 552,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 9,
    "endLine": 15
  },
  {
    "id": 62,
    "name": "Al-Jumu'ah",
    "arabic": "الجمعة",
    "totalAyah": 11,
    "startPage": 553,
    "endPage": 554,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 3,
    "endLine": 6
  },
  {
    "id": 63,
    "name": "Al-Munafiqun",
    "arabic": "المنافقون",
    "totalAyah": 11,
    "startPage": 554,
    "endPage": 555,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 9,
    "endLine": 14
  },
  {
    "id": 64,
    "name": "At-Tagabun",
    "arabic": "التغابن",
    "totalAyah": 18,
    "startPage": 556,
    "endPage": 557,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 2,
    "endLine": 14
  },
  {
    "id": 65,
    "name": "At-Talaq",
    "arabic": "الطلاق",
    "totalAyah": 12,
    "startPage": 558,
    "endPage": 559,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 2,
    "endLine": 15
  },
  {
    "id": 66,
    "name": "At-Tahrim",
    "arabic": "التحريم",
    "totalAyah": 12,
    "startPage": 560,
    "endPage": 561,
    "startJuz": 28,
    "endJuz": 28,
    "startLine": 3,
    "endLine": 15
  },
  {
    "id": 67,
    "name": "Al-Mulk",
    "arabic": "الملك",
    "totalAyah": 30,
    "startPage": 562,
    "endPage": 564,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 3,
    "endLine": 5
  },
  {
    "id": 68,
    "name": "Al-Qalam",
    "arabic": "القلم",
    "totalAyah": 52,
    "startPage": 564,
    "endPage": 566,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 8,
    "endLine": 8
  },
  {
    "id": 69,
    "name": "Al-Haqqah",
    "arabic": "الحاقة",
    "totalAyah": 52,
    "startPage": 566,
    "endPage": 568,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 11,
    "endLine": 8
  },
  {
    "id": 70,
    "name": "Al-Ma'arij",
    "arabic": "المعارج",
    "totalAyah": 44,
    "startPage": 568,
    "endPage": 570,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 11,
    "endLine": 4
  },
  {
    "id": 71,
    "name": "Nuh",
    "arabic": "نوح",
    "totalAyah": 28,
    "startPage": 570,
    "endPage": 571,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 7,
    "endLine": 15
  },
  {
    "id": 72,
    "name": "Al-Jinn",
    "arabic": "الجن",
    "totalAyah": 28,
    "startPage": 572,
    "endPage": 573,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 3,
    "endLine": 15
  },
  {
    "id": 73,
    "name": "Al-Muzzammil",
    "arabic": "المزمل",
    "totalAyah": 20,
    "startPage": 574,
    "endPage": 575,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 3,
    "endLine": 7
  },
  {
    "id": 74,
    "name": "Al-Muddassir",
    "arabic": "المدثر",
    "totalAyah": 56,
    "startPage": 575,
    "endPage": 577,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 10,
    "endLine": 5
  },
  {
    "id": 75,
    "name": "Al-Qiyamah",
    "arabic": "القيامة",
    "totalAyah": 40,
    "startPage": 577,
    "endPage": 578,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 8,
    "endLine": 8
  },
  {
    "id": 76,
    "name": "Al-Insan",
    "arabic": "الإنسان",
    "totalAyah": 31,
    "startPage": 578,
    "endPage": 580,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 11,
    "endLine": 6
  },
  {
    "id": 77,
    "name": "Al-Mursalat",
    "arabic": "المرسلات",
    "totalAyah": 50,
    "startPage": 580,
    "endPage": 581,
    "startJuz": 29,
    "endJuz": 29,
    "startLine": 9,
    "endLine": 15
  },
  {
    "id": 78,
    "name": "An-Naba'",
    "arabic": "النبإ",
    "totalAyah": 40,
    "startPage": 582,
    "endPage": 583,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 3,
    "endLine": 7
  },
  {
    "id": 79,
    "name": "An-Nazi'at",
    "arabic": "النازعات",
    "totalAyah": 46,
    "startPage": 583,
    "endPage": 584,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 10,
    "endLine": 14
  },
  {
    "id": 80,
    "name": "'Abasa",
    "arabic": "عبس",
    "totalAyah": 42,
    "startPage": 585,
    "endPage": 585,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 2,
    "endLine": 15
  },
  {
    "id": 81,
    "name": "At-Takwir",
    "arabic": "التكوير",
    "totalAyah": 29,
    "startPage": 586,
    "endPage": 586,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 1,
    "endLine": 12
  },
  {
    "id": 82,
    "name": "Al-Infitar",
    "arabic": "الانفطار",
    "totalAyah": 19,
    "startPage": 587,
    "endPage": 587,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 2,
    "endLine": 10
  },
  {
    "id": 83,
    "name": "Al-Mutaffifin",
    "arabic": "المطففين",
    "totalAyah": 36,
    "startPage": 587,
    "endPage": 589,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 13,
    "endLine": 1
  },
  {
    "id": 84,
    "name": "Al-Insyiqaq",
    "arabic": "الانشقاق",
    "totalAyah": 25,
    "startPage": 589,
    "endPage": 589,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 4,
    "endLine": 15
  },
  {
    "id": 85,
    "name": "Al-Buruj",
    "arabic": "البروج",
    "totalAyah": 22,
    "startPage": 590,
    "endPage": 590,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 1,
    "endLine": 12
  },
  {
    "id": 86,
    "name": "At-Tariq",
    "arabic": "الطارق",
    "totalAyah": 17,
    "startPage": 591,
    "endPage": 591,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 2,
    "endLine": 7
  },
  {
    "id": 87,
    "name": "Al-A'la",
    "arabic": "الأعلى",
    "totalAyah": 19,
    "startPage": 591,
    "endPage": 592,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 10,
    "endLine": 2
  },
  {
    "id": 88,
    "name": "Al-Gasyiyah",
    "arabic": "الغاشية",
    "totalAyah": 26,
    "startPage": 592,
    "endPage": 592,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 5,
    "endLine": 15
  },
  {
    "id": 89,
    "name": "Al-Fajr",
    "arabic": "الفجر",
    "totalAyah": 30,
    "startPage": 593,
    "endPage": 594,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 3,
    "endLine": 3
  },
  {
    "id": 90,
    "name": "Al-Balad",
    "arabic": "البلد",
    "totalAyah": 20,
    "startPage": 594,
    "endPage": 594,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 6,
    "endLine": 14
  },
  {
    "id": 91,
    "name": "Asy-Syams",
    "arabic": "الشمس",
    "totalAyah": 15,
    "startPage": 595,
    "endPage": 595,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 2,
    "endLine": 8
  },
  {
    "id": 92,
    "name": "Al-Lail",
    "arabic": "الليل",
    "totalAyah": 21,
    "startPage": 595,
    "endPage": 596,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 11,
    "endLine": 3
  },
  {
    "id": 93,
    "name": "Ad-Duha",
    "arabic": "الضحى",
    "totalAyah": 11,
    "startPage": 596,
    "endPage": 596,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 6,
    "endLine": 10
  },
  {
    "id": 94,
    "name": "Asy-Syarh",
    "arabic": "الشرح",
    "totalAyah": 8,
    "startPage": 596,
    "endPage": 596,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 13,
    "endLine": 15
  },
  {
    "id": 95,
    "name": "At-Tin",
    "arabic": "التين",
    "totalAyah": 8,
    "startPage": 597,
    "endPage": 597,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 3,
    "endLine": 6
  },
  {
    "id": 96,
    "name": "Al-'Alaq",
    "arabic": "العلق",
    "totalAyah": 19,
    "startPage": 597,
    "endPage": 597,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 9,
    "endLine": 15
  },
  {
    "id": 97,
    "name": "Al-Qadr",
    "arabic": "القدر",
    "totalAyah": 5,
    "startPage": 598,
    "endPage": 598,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 3,
    "endLine": 5
  },
  {
    "id": 98,
    "name": "Al-Bayyinah",
    "arabic": "البينة",
    "totalAyah": 8,
    "startPage": 598,
    "endPage": 599,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 8,
    "endLine": 2
  },
  {
    "id": 99,
    "name": "Az-Zalzalah",
    "arabic": "الزلزلة",
    "totalAyah": 8,
    "startPage": 599,
    "endPage": 599,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 5,
    "endLine": 9
  },
  {
    "id": 100,
    "name": "Al-'Adiyat",
    "arabic": "العاديات",
    "totalAyah": 11,
    "startPage": 599,
    "endPage": 600,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 12,
    "endLine": 1
  },
  {
    "id": 101,
    "name": "Al-Qari'ah",
    "arabic": "القارعة",
    "totalAyah": 11,
    "startPage": 600,
    "endPage": 600,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 4,
    "endLine": 9
  },
  {
    "id": 102,
    "name": "At-Takasur",
    "arabic": "التكاثر",
    "totalAyah": 8,
    "startPage": 600,
    "endPage": 600,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 12,
    "endLine": 15
  },
  {
    "id": 103,
    "name": "Al-'Asr",
    "arabic": "العصر",
    "totalAyah": 3,
    "startPage": 601,
    "endPage": 601,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 3,
    "endLine": 4
  },
  {
    "id": 104,
    "name": "Al-Humazah",
    "arabic": "الهمزة",
    "totalAyah": 9,
    "startPage": 601,
    "endPage": 601,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 7,
    "endLine": 10
  },
  {
    "id": 105,
    "name": "Al-Fil",
    "arabic": "الفيل",
    "totalAyah": 5,
    "startPage": 601,
    "endPage": 601,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 13,
    "endLine": 15
  },
  {
    "id": 106,
    "name": "Quraisy",
    "arabic": "قريش",
    "totalAyah": 4,
    "startPage": 602,
    "endPage": 602,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 3,
    "endLine": 5
  },
  {
    "id": 107,
    "name": "Al-Ma'un",
    "arabic": "الماعون",
    "totalAyah": 7,
    "startPage": 602,
    "endPage": 602,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 8,
    "endLine": 11
  },
  {
    "id": 108,
    "name": "Al-Kausar",
    "arabic": "الكوثر",
    "totalAyah": 3,
    "startPage": 602,
    "endPage": 602,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 14,
    "endLine": 15
  },
  {
    "id": 109,
    "name": "Al-Kafirun",
    "arabic": "الكافرون",
    "totalAyah": 6,
    "startPage": 603,
    "endPage": 603,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 3,
    "endLine": 5
  },
  {
    "id": 110,
    "name": "An-Nasr",
    "arabic": "النصر",
    "totalAyah": 3,
    "startPage": 603,
    "endPage": 603,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 8,
    "endLine": 10
  },
  {
    "id": 111,
    "name": "Al-Lahab",
    "arabic": "اللهب",
    "totalAyah": 5,
    "startPage": 603,
    "endPage": 603,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 13,
    "endLine": 15
  },
  {
    "id": 112,
    "name": "Al-Ikhlas",
    "arabic": "الإخلاص",
    "totalAyah": 4,
    "startPage": 604,
    "endPage": 604,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 3,
    "endLine": 4
  },
  {
    "id": 113,
    "name": "Al-Falaq",
    "arabic": "الفلق",
    "totalAyah": 5,
    "startPage": 604,
    "endPage": 604,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 7,
    "endLine": 9
  },
  {
    "id": 114,
    "name": "An-Nas",
    "arabic": "الناس",
    "totalAyah": 6,
    "startPage": 604,
    "endPage": 604,
    "startJuz": 30,
    "endJuz": 30,
    "startLine": 12,
    "endLine": 15
  }
];

// Master Data Juz (30 Juz)
export const JUZ_DATA: QuranJuzInfo[] = [
  {
    "juz": 1,
    "name": "Juz 1",
    "startSurah": 1,
    "startAyah": 1,
    "startPage": 1,
    "endSurah": 2,
    "endAyah": 141,
    "endPage": 21,
    "totalPages": 21
  },
  {
    "juz": 2,
    "name": "Juz 2",
    "startSurah": 2,
    "startAyah": 142,
    "startPage": 22,
    "endSurah": 2,
    "endAyah": 252,
    "endPage": 41,
    "totalPages": 20
  },
  {
    "juz": 3,
    "name": "Juz 3",
    "startSurah": 2,
    "startAyah": 253,
    "startPage": 42,
    "endSurah": 3,
    "endAyah": 92,
    "endPage": 62,
    "totalPages": 21
  },
  {
    "juz": 4,
    "name": "Juz 4",
    "startSurah": 3,
    "startAyah": 93,
    "startPage": 62,
    "endSurah": 4,
    "endAyah": 23,
    "endPage": 81,
    "totalPages": 20
  },
  {
    "juz": 5,
    "name": "Juz 5",
    "startSurah": 4,
    "startAyah": 24,
    "startPage": 82,
    "endSurah": 4,
    "endAyah": 147,
    "endPage": 101,
    "totalPages": 20
  },
  {
    "juz": 6,
    "name": "Juz 6",
    "startSurah": 4,
    "startAyah": 148,
    "startPage": 102,
    "endSurah": 5,
    "endAyah": 81,
    "endPage": 121,
    "totalPages": 20
  },
  {
    "juz": 7,
    "name": "Juz 7",
    "startSurah": 5,
    "startAyah": 82,
    "startPage": 121,
    "endSurah": 6,
    "endAyah": 110,
    "endPage": 141,
    "totalPages": 21
  },
  {
    "juz": 8,
    "name": "Juz 8",
    "startSurah": 6,
    "startAyah": 111,
    "startPage": 142,
    "endSurah": 7,
    "endAyah": 87,
    "endPage": 161,
    "totalPages": 20
  },
  {
    "juz": 9,
    "name": "Juz 9",
    "startSurah": 7,
    "startAyah": 88,
    "startPage": 162,
    "endSurah": 8,
    "endAyah": 40,
    "endPage": 181,
    "totalPages": 20
  },
  {
    "juz": 10,
    "name": "Juz 10",
    "startSurah": 8,
    "startAyah": 41,
    "startPage": 182,
    "endSurah": 9,
    "endAyah": 92,
    "endPage": 201,
    "totalPages": 20
  },
  {
    "juz": 11,
    "name": "Juz 11",
    "startSurah": 9,
    "startAyah": 93,
    "startPage": 201,
    "endSurah": 11,
    "endAyah": 5,
    "endPage": 221,
    "totalPages": 21
  },
  {
    "juz": 12,
    "name": "Juz 12",
    "startSurah": 11,
    "startAyah": 6,
    "startPage": 222,
    "endSurah": 12,
    "endAyah": 52,
    "endPage": 241,
    "totalPages": 20
  },
  {
    "juz": 13,
    "name": "Juz 13",
    "startSurah": 12,
    "startAyah": 53,
    "startPage": 242,
    "endSurah": 14,
    "endAyah": 52,
    "endPage": 261,
    "totalPages": 20
  },
  {
    "juz": 14,
    "name": "Juz 14",
    "startSurah": 15,
    "startAyah": 1,
    "startPage": 262,
    "endSurah": 16,
    "endAyah": 128,
    "endPage": 281,
    "totalPages": 20
  },
  {
    "juz": 15,
    "name": "Juz 15",
    "startSurah": 17,
    "startAyah": 1,
    "startPage": 282,
    "endSurah": 18,
    "endAyah": 74,
    "endPage": 301,
    "totalPages": 20
  },
  {
    "juz": 16,
    "name": "Juz 16",
    "startSurah": 18,
    "startAyah": 75,
    "startPage": 302,
    "endSurah": 20,
    "endAyah": 135,
    "endPage": 321,
    "totalPages": 20
  },
  {
    "juz": 17,
    "name": "Juz 17",
    "startSurah": 21,
    "startAyah": 1,
    "startPage": 322,
    "endSurah": 22,
    "endAyah": 78,
    "endPage": 341,
    "totalPages": 20
  },
  {
    "juz": 18,
    "name": "Juz 18",
    "startSurah": 23,
    "startAyah": 1,
    "startPage": 342,
    "endSurah": 25,
    "endAyah": 20,
    "endPage": 361,
    "totalPages": 20
  },
  {
    "juz": 19,
    "name": "Juz 19",
    "startSurah": 25,
    "startAyah": 21,
    "startPage": 362,
    "endSurah": 27,
    "endAyah": 55,
    "endPage": 381,
    "totalPages": 20
  },
  {
    "juz": 20,
    "name": "Juz 20",
    "startSurah": 27,
    "startAyah": 56,
    "startPage": 382,
    "endSurah": 29,
    "endAyah": 45,
    "endPage": 401,
    "totalPages": 20
  },
  {
    "juz": 21,
    "name": "Juz 21",
    "startSurah": 29,
    "startAyah": 46,
    "startPage": 402,
    "endSurah": 33,
    "endAyah": 30,
    "endPage": 421,
    "totalPages": 20
  },
  {
    "juz": 22,
    "name": "Juz 22",
    "startSurah": 33,
    "startAyah": 31,
    "startPage": 422,
    "endSurah": 36,
    "endAyah": 27,
    "endPage": 441,
    "totalPages": 20
  },
  {
    "juz": 23,
    "name": "Juz 23",
    "startSurah": 36,
    "startAyah": 28,
    "startPage": 442,
    "endSurah": 39,
    "endAyah": 31,
    "endPage": 461,
    "totalPages": 20
  },
  {
    "juz": 24,
    "name": "Juz 24",
    "startSurah": 39,
    "startAyah": 32,
    "startPage": 462,
    "endSurah": 41,
    "endAyah": 46,
    "endPage": 481,
    "totalPages": 20
  },
  {
    "juz": 25,
    "name": "Juz 25",
    "startSurah": 41,
    "startAyah": 47,
    "startPage": 482,
    "endSurah": 45,
    "endAyah": 37,
    "endPage": 502,
    "totalPages": 21
  },
  {
    "juz": 26,
    "name": "Juz 26",
    "startSurah": 46,
    "startAyah": 1,
    "startPage": 502,
    "endSurah": 51,
    "endAyah": 30,
    "endPage": 521,
    "totalPages": 20
  },
  {
    "juz": 27,
    "name": "Juz 27",
    "startSurah": 51,
    "startAyah": 31,
    "startPage": 522,
    "endSurah": 57,
    "endAyah": 29,
    "endPage": 541,
    "totalPages": 20
  },
  {
    "juz": 28,
    "name": "Juz 28",
    "startSurah": 58,
    "startAyah": 1,
    "startPage": 542,
    "endSurah": 66,
    "endAyah": 12,
    "endPage": 561,
    "totalPages": 20
  },
  {
    "juz": 29,
    "name": "Juz 29 (Tabarak)",
    "startSurah": 67,
    "startAyah": 1,
    "startPage": 562,
    "endSurah": 77,
    "endAyah": 50,
    "endPage": 581,
    "totalPages": 20
  },
  {
    "juz": 30,
    "name": "Juz 30 ('Amma)",
    "startSurah": 78,
    "startAyah": 1,
    "startPage": 582,
    "endSurah": 114,
    "endAyah": 6,
    "endPage": 604,
    "totalPages": 23
  }
];

// Raw Coordinates: [surah, ayah, page, juz, startLine, endLine] (6.236 Ayat)
export const RAW_QURAN_COORDINATES: [number, number, number, number, number, number][] = [[1,1,1,1,2,2],[1,2,1,1,3,3],[1,3,1,1,4,4],[1,4,1,1,4,4],[1,5,1,1,5,5],[1,6,1,1,5,6],[1,7,1,1,6,8],[2,1,2,1,3,3],[2,2,2,1,3,4],[2,3,2,1,4,5],[2,4,2,1,5,6],[2,5,2,1,7,8],[2,6,3,1,1,2],[2,7,3,1,2,3],[2,8,3,1,3,4],[2,9,3,1,5,6],[2,10,3,1,6,7],[2,11,3,1,7,8],[2,12,3,1,9,9],[2,13,3,1,9,11],[2,14,3,1,11,13],[2,15,3,1,13,14],[2,16,3,1,14,15],[2,17,4,1,1,2],[2,18,4,1,2,3],[2,19,4,1,3,5],[2,20,4,1,5,8],[2,21,4,1,8,9],[2,22,4,1,9,12],[2,23,4,1,12,14],[2,24,4,1,14,15],[2,25,5,1,1,4],[2,26,5,1,5,9],[2,27,5,1,9,11],[2,28,5,1,12,13],[2,29,5,1,13,15],[2,30,6,1,1,3],[2,31,6,1,4,5],[2,32,6,1,5,6],[2,33,6,1,7,9],[2,34,6,1,9,10],[2,35,6,1,11,12],[2,36,6,1,13,14],[2,37,6,1,15,15],[2,38,7,1,1,2],[2,39,7,1,2,3],[2,40,7,1,4,5],[2,41,7,1,5,7],[2,42,7,1,7,8],[2,43,7,1,8,9],[2,44,7,1,9,10],[2,45,7,1,11,11],[2,46,7,1,12,12],[2,47,7,1,13,14],[2,48,7,1,14,15],[2,49,8,1,1,3],[2,50,8,1,3,4],[2,51,8,1,4,5],[2,52,8,1,6,6],[2,53,8,1,7,7],[2,54,8,1,8,10],[2,55,8,1,11,12],[2,56,8,1,12,13],[2,57,8,1,13,15],[2,58,9,1,1,3],[2,59,9,1,3,5],[2,60,9,1,5,8],[2,61,9,1,9,15],[2,62,10,1,1,3],[2,63,10,1,3,5],[2,64,10,1,5,7],[2,65,10,1,7,8],[2,66,10,1,8,9],[2,67,10,1,9,11],[2,68,10,1,11,13],[2,69,10,1,14,15],[2,70,11,1,1,2],[2,71,11,1,2,4],[2,72,11,1,4,5],[2,73,11,1,6,7],[2,74,11,1,7,10],[2,75,11,1,11,13],[2,76,11,1,13,15],[2,77,12,1,1,1],[2,78,12,1,2,3],[2,79,12,1,3,5],[2,80,12,1,6,8],[2,81,12,1,8,10],[2,82,12,1,10,11],[2,83,12,1,11,15],[2,84,13,1,1,2],[2,85,13,1,3,9],[2,86,13,1,9,11],[2,87,13,1,11,14],[2,88,13,1,14,15],[2,89,14,1,1,3],[2,90,14,1,4,6],[2,91,14,1,7,10],[2,92,14,1,10,11],[2,93,14,1,12,15],[2,94,15,1,1,2],[2,95,15,1,3,3],[2,96,15,1,4,6],[2,97,15,1,6,8],[2,98,15,1,9,10],[2,99,15,1,10,11],[2,100,15,1,12,13],[2,101,15,1,13,15],[2,102,16,1,1,9],[2,103,16,1,9,10],[2,104,16,1,11,12],[2,105,16,1,13,15],[2,106,17,1,1,2],[2,107,17,1,2,4],[2,108,17,1,4,6],[2,109,17,1,6,9],[2,110,17,1,10,11],[2,111,17,1,12,14],[2,112,17,1,14,15],[2,113,18,1,1,4],[2,114,18,1,4,7],[2,115,18,1,7,8],[2,116,18,1,9,10],[2,117,18,1,10,11],[2,118,18,1,11,14],[2,119,18,1,14,15],[2,120,19,1,1,3],[2,121,19,1,3,5],[2,122,19,1,5,6],[2,123,19,1,6,8],[2,124,19,1,8,10],[2,125,19,1,10,13],[2,126,19,1,13,15],[2,127,20,1,1,2],[2,128,20,1,2,4],[2,129,20,1,4,6],[2,130,20,1,6,8],[2,131,20,1,8,9],[2,132,20,1,9,11],[2,133,20,1,11,14],[2,134,20,1,14,15],[2,135,21,1,1,2],[2,136,21,1,2,5],[2,137,21,1,6,7],[2,138,21,1,8,9],[2,139,21,1,9,10],[2,140,21,1,10,14],[2,141,21,1,14,15],[2,142,22,2,1,3],[2,143,22,2,3,8],[2,144,22,2,8,12],[2,145,22,2,12,15],[2,146,23,2,1,2],[2,147,23,2,2,3],[2,148,23,2,3,5],[2,149,23,2,5,7],[2,150,23,2,7,11],[2,151,23,2,11,13],[2,152,23,2,13,14],[2,153,23,2,14,15],[2,154,24,2,1,2],[2,155,24,2,2,3],[2,156,24,2,4,4],[2,157,24,2,5,6],[2,158,24,2,6,8],[2,159,24,2,8,10],[2,160,24,2,11,12],[2,161,24,2,12,13],[2,162,24,2,14,14],[2,163,24,2,15,15],[2,164,25,2,1,5],[2,165,25,2,5,8],[2,166,25,2,9,10],[2,167,25,2,10,12],[2,168,25,2,13,14],[2,169,25,2,14,15],[2,170,26,2,1,3],[2,171,26,2,3,4],[2,172,26,2,5,6],[2,173,26,2,6,9],[2,174,26,2,9,12],[2,175,26,2,12,14],[2,176,26,2,14,15],[2,177,27,2,1,7],[2,178,27,2,7,11],[2,179,27,2,11,12],[2,180,27,2,12,14],[2,181,27,2,14,15],[2,182,28,2,1,2],[2,183,28,2,2,4],[2,184,28,2,4,7],[2,185,28,2,7,13],[2,186,28,2,13,15],[2,187,29,2,1,8],[2,188,29,2,8,10],[2,189,29,2,10,14],[2,190,29,2,14,15],[2,191,30,2,1,3],[2,192,30,2,3,4],[2,193,30,2,4,5],[2,194,30,2,5,8],[2,195,30,2,8,9],[2,196,30,2,9,15],[2,197,31,2,1,4],[2,198,31,2,4,8],[2,199,31,2,8,9],[2,200,31,2,10,13],[2,201,31,2,13,14],[2,202,31,2,15,15],[2,203,32,2,1,3],[2,204,32,2,3,5],[2,205,32,2,5,7],[2,206,32,2,7,8],[2,207,32,2,8,10],[2,208,32,2,10,12],[2,209,32,2,12,13],[2,210,32,2,14,15],[2,211,33,2,1,2],[2,212,33,2,2,4],[2,213,33,2,5,10],[2,214,33,2,10,13],[2,215,33,2,13,15],[2,216,34,2,1,3],[2,217,34,2,3,10],[2,218,34,2,10,12],[2,219,34,2,12,15],[2,220,35,2,1,3],[2,221,35,2,4,8],[2,222,35,2,8,11],[2,223,35,2,12,13],[2,224,35,2,14,15],[2,225,36,2,1,2],[2,226,36,2,2,3],[2,227,36,2,3,4],[2,228,36,2,4,8],[2,229,36,2,8,13],[2,230,36,2,13,15],[2,231,37,2,1,5],[2,232,37,2,6,9],[2,233,37,2,9,15],[2,234,38,2,1,3],[2,235,38,2,4,9],[2,236,38,2,9,11],[2,237,38,2,12,15],[2,238,39,2,1,2],[2,239,39,2,2,3],[2,240,39,2,4,7],[2,241,39,2,7,8],[2,242,39,2,8,9],[2,243,39,2,9,12],[2,244,39,2,13,13],[2,245,39,2,14,15],[2,246,40,2,1,6],[2,247,40,2,6,11],[2,248,40,2,12,15],[2,249,41,2,1,7],[2,250,41,2,8,10],[2,251,41,2,10,14],[2,252,41,2,14,15],[2,253,42,3,1,6],[2,254,42,3,6,8],[2,255,42,3,8,13],[2,256,42,3,13,15],[2,257,43,3,1,4],[2,258,43,3,4,8],[2,259,43,3,8,15],[2,260,44,3,1,4],[2,261,44,3,5,7],[2,262,44,3,7,9],[2,263,44,3,10,11],[2,264,44,3,11,15],[2,265,45,3,1,4],[2,266,45,3,4,8],[2,267,45,3,8,11],[2,268,45,3,12,13],[2,269,45,3,14,15],[2,270,46,3,1,2],[2,271,46,3,2,5],[2,272,46,3,5,8],[2,273,46,3,9,13],[2,274,46,3,13,15],[2,275,47,3,1,5],[2,276,47,3,5,6],[2,277,47,3,7,9],[2,278,47,3,9,10],[2,279,47,3,10,12],[2,280,47,3,12,14],[2,281,47,3,14,15],[2,282,48,3,1,15],[2,283,49,3,1,4],[2,284,49,3,4,7],[2,285,49,3,7,10],[2,286,49,3,10,15],[3,1,50,3,3,3],[3,2,50,3,3,3],[3,3,50,3,3,4],[3,4,50,3,4,6],[3,5,50,3,6,7],[3,6,50,3,7,8],[3,7,50,3,8,13],[3,8,50,3,13,14],[3,9,50,3,14,15],[3,10,51,3,1,2],[3,11,51,3,2,4],[3,12,51,3,4,5],[3,13,51,3,5,9],[3,14,51,3,9,12],[3,15,51,3,12,15],[3,16,52,3,1,2],[3,17,52,3,2,3],[3,18,52,3,3,5],[3,19,52,3,5,8],[3,20,52,3,8,11],[3,21,52,3,11,14],[3,22,52,3,14,15],[3,23,53,3,1,2],[3,24,53,3,3,4],[3,25,53,3,4,6],[3,26,53,3,6,8],[3,27,53,3,8,10],[3,28,53,3,11,13],[3,29,53,3,13,15],[3,30,54,3,1,3],[3,31,54,3,3,4],[3,32,54,3,5,6],[3,33,54,3,6,7],[3,34,54,3,7,8],[3,35,54,3,8,9],[3,36,54,3,9,12],[3,37,54,3,12,15],[3,38,55,3,1,2],[3,39,55,3,2,4],[3,40,55,3,4,6],[3,41,55,3,6,8],[3,42,55,3,8,10],[3,43,55,3,10,11],[3,44,55,3,11,13],[3,45,55,3,13,15],[3,46,56,3,1,1],[3,47,56,3,2,3],[3,48,56,3,4,4],[3,49,56,3,5,9],[3,50,56,3,10,12],[3,51,56,3,12,13],[3,52,56,3,13,15],[3,53,57,3,1,2],[3,54,57,3,2,3],[3,55,57,3,3,6],[3,56,57,3,6,8],[3,57,57,3,8,9],[3,58,57,3,10,10],[3,59,57,3,10,12],[3,60,57,3,12,12],[3,61,57,3,13,15],[3,62,58,3,1,2],[3,63,58,3,2,2],[3,64,58,3,3,6],[3,65,58,3,6,8],[3,66,58,3,8,10],[3,67,58,3,10,11],[3,68,58,3,11,13],[3,69,58,3,13,14],[3,70,58,3,14,15],[3,71,59,3,1,2],[3,72,59,3,2,4],[3,73,59,3,4,7],[3,74,59,3,7,8],[3,75,59,3,8,11],[3,76,59,3,12,12],[3,77,59,3,12,15],[3,78,60,3,1,4],[3,79,60,3,4,7],[3,80,60,3,7,8],[3,81,60,3,9,12],[3,82,60,3,13,13],[3,83,60,3,14,15],[3,84,61,3,1,4],[3,85,61,3,4,5],[3,86,61,3,6,8],[3,87,61,3,8,9],[3,88,61,3,9,10],[3,89,61,3,10,11],[3,90,61,3,11,13],[3,91,61,3,13,15],[3,92,62,3,1,2],[3,93,62,4,2,4],[3,94,62,4,5,6],[3,95,62,4,6,7],[3,96,62,4,7,8],[3,97,62,4,8,10],[3,98,62,4,11,12],[3,99,62,4,12,14],[3,100,62,4,14,15],[3,101,63,4,1,2],[3,102,63,4,3,4],[3,103,63,4,4,7],[3,104,63,4,8,9],[3,105,63,4,9,11],[3,106,63,4,11,13],[3,107,63,4,13,14],[3,108,63,4,14,15],[3,109,64,4,1,1],[3,110,64,4,2,5],[3,111,64,4,5,6],[3,112,64,4,6,10],[3,113,64,4,10,12],[3,114,64,4,12,14],[3,115,64,4,14,15],[3,116,65,4,1,2],[3,117,65,4,3,5],[3,118,65,4,5,8],[3,119,65,4,9,11],[3,120,65,4,12,14],[3,121,65,4,14,15],[3,122,66,4,1,2],[3,123,66,4,2,3],[3,124,66,4,3,5],[3,125,66,4,5,6],[3,126,66,4,7,8],[3,127,66,4,8,9],[3,128,66,4,9,10],[3,129,66,4,11,12],[3,130,66,4,12,14],[3,131,66,4,14,14],[3,132,66,4,15,15],[3,133,67,4,1,2],[3,134,67,4,2,4],[3,135,67,4,4,7],[3,136,67,4,7,9],[3,137,67,4,9,10],[3,138,67,4,11,11],[3,139,67,4,12,12],[3,140,67,4,13,15],[3,141,68,4,1,1],[3,142,68,4,1,3],[3,143,68,4,3,4],[3,144,68,4,4,7],[3,145,68,4,7,10],[3,146,68,4,10,12],[3,147,68,4,12,14],[3,148,68,4,14,15],[3,149,69,4,1,2],[3,150,69,4,3,3],[3,151,69,4,3,6],[3,152,69,4,6,11],[3,153,69,4,12,15],[3,154,70,4,1,8],[3,155,70,4,8,10],[3,156,70,4,10,14],[3,157,70,4,14,15],[3,158,71,4,1,1],[3,159,71,4,1,4],[3,160,71,4,4,6],[3,161,71,4,6,8],[3,162,71,4,8,9],[3,163,71,4,10,10],[3,164,71,4,11,13],[3,165,71,4,14,15],[3,166,72,4,1,1],[3,167,72,4,2,5],[3,168,72,4,5,7],[3,169,72,4,7,8],[3,170,72,4,8,10],[3,171,72,4,11,12],[3,172,72,4,12,13],[3,173,72,4,14,15],[3,174,73,4,1,2],[3,175,73,4,2,3],[3,176,73,4,4,6],[3,177,73,4,6,7],[3,178,73,4,7,9],[3,179,73,4,9,12],[3,180,73,4,12,15],[3,181,74,4,1,3],[3,182,74,4,3,4],[3,183,74,4,4,7],[3,184,74,4,8,9],[3,185,74,4,9,12],[3,186,74,4,12,15],[3,187,75,4,1,3],[3,188,75,4,3,5],[3,189,75,4,5,6],[3,190,75,4,6,8],[3,191,75,4,8,10],[3,192,75,4,11,12],[3,193,75,4,12,14],[3,194,75,4,14,15],[3,195,76,4,1,5],[3,196,76,4,6,6],[3,197,76,4,6,7],[3,198,76,4,7,9],[3,199,76,4,9,13],[3,200,76,4,13,14],[4,1,77,4,2,4],[4,2,77,4,4,6],[4,3,77,4,6,8],[4,4,77,4,8,10],[4,5,77,4,10,11],[4,6,77,4,11,15],[4,7,78,4,1,3],[4,8,78,4,3,4],[4,9,78,4,5,6],[4,10,78,4,7,8],[4,11,78,4,8,15],[4,12,79,4,1,10],[4,13,79,4,11,13],[4,14,79,4,14,15],[4,15,80,4,1,3],[4,16,80,4,4,5],[4,17,80,4,6,8],[4,18,80,4,8,11],[4,19,80,4,11,15],[4,20,81,4,1,3],[4,21,81,4,3,5],[4,22,81,4,5,7],[4,23,81,4,7,15],[4,24,82,5,1,6],[4,25,82,5,6,13],[4,26,82,5,14,15],[4,27,83,5,1,2],[4,28,83,5,2,3],[4,29,83,5,3,6],[4,30,83,5,6,8],[4,31,83,5,8,9],[4,32,83,5,10,13],[4,33,83,5,13,15],[4,34,84,5,1,6],[4,35,84,5,6,8],[4,36,84,5,9,13],[4,37,84,5,13,15],[4,38,85,5,1,3],[4,39,85,5,3,4],[4,40,85,5,4,6],[4,41,85,5,6,7],[4,42,85,5,7,9],[4,43,85,5,9,14],[4,44,85,5,14,15],[4,45,86,5,1,1],[4,46,86,5,2,6],[4,47,86,5,6,9],[4,48,86,5,9,10],[4,49,86,5,11,12],[4,50,86,5,12,13],[4,51,86,5,13,15],[4,52,87,5,1,1],[4,53,87,5,2,2],[4,54,87,5,2,4],[4,55,87,5,5,5],[4,56,87,5,6,8],[4,57,87,5,8,10],[4,58,87,5,10,13],[4,59,87,5,13,15],[4,60,88,5,1,4],[4,61,88,5,4,6],[4,62,88,5,6,8],[4,63,88,5,8,10],[4,64,88,5,10,13],[4,65,88,5,13,15],[4,66,89,5,1,3],[4,67,89,5,3,4],[4,68,89,5,4,4],[4,69,89,5,5,7],[4,70,89,5,7,8],[4,71,89,5,8,9],[4,72,89,5,9,11],[4,73,89,5,11,13],[4,74,89,5,13,15],[4,75,90,5,1,4],[4,76,90,5,4,6],[4,77,90,5,6,10],[4,78,90,5,10,14],[4,79,90,5,14,15],[4,80,91,5,1,2],[4,81,91,5,2,4],[4,82,91,5,5,6],[4,83,91,5,6,9],[4,84,91,5,10,12],[4,85,91,5,12,14],[4,86,91,5,14,15],[4,87,92,5,1,2],[4,88,92,5,2,4],[4,89,92,5,4,7],[4,90,92,5,8,11],[4,91,92,5,12,15],[4,92,93,5,1,8],[4,93,93,5,8,10],[4,94,93,5,10,15],[4,95,94,5,1,4],[4,96,94,5,4,5],[4,97,94,5,5,8],[4,98,94,5,8,9],[4,99,94,5,10,10],[4,100,94,5,11,13],[4,101,94,5,13,15],[4,102,95,5,1,8],[4,103,95,5,9,11],[4,104,95,5,11,14],[4,105,95,5,14,15],[4,106,96,5,1,1],[4,107,96,5,1,3],[4,108,96,5,3,5],[4,109,96,5,5,7],[4,110,96,5,7,9],[4,111,96,5,9,10],[4,112,96,5,10,11],[4,113,96,5,11,15],[4,114,97,5,1,3],[4,115,97,5,3,6],[4,116,97,5,6,7],[4,117,97,5,8,9],[4,118,97,5,9,10],[4,119,97,5,10,13],[4,120,97,5,14,14],[4,121,97,5,15,15],[4,122,98,5,1,3],[4,123,98,5,3,5],[4,124,98,5,5,7],[4,125,98,5,7,9],[4,126,98,5,9,11],[4,127,98,5,11,15],[4,128,99,5,1,4],[4,129,99,5,4,7],[4,130,99,5,7,8],[4,131,99,5,8,11],[4,132,99,5,12,12],[4,133,99,5,13,14],[4,134,99,5,14,15],[4,135,100,5,1,4],[4,136,100,5,4,8],[4,137,100,5,8,10],[4,138,100,5,10,10],[4,139,100,5,10,12],[4,140,100,5,12,15],[4,141,101,5,1,4],[4,142,101,5,5,7],[4,143,101,5,7,8],[4,144,101,5,8,10],[4,145,101,5,10,11],[4,146,101,5,12,14],[4,147,101,5,14,15],[4,148,102,6,1,2],[4,149,102,6,2,3],[4,150,102,6,3,6],[4,151,102,6,6,7],[4,152,102,6,7,9],[4,153,102,6,9,13],[4,154,102,6,14,15],[4,155,103,6,1,3],[4,156,103,6,3,4],[4,157,103,6,4,7],[4,158,103,6,7,7],[4,159,103,6,8,9],[4,160,103,6,9,11],[4,161,103,6,11,12],[4,162,103,6,12,15],[4,163,104,6,1,4],[4,164,104,6,4,6],[4,165,104,6,6,7],[4,166,104,6,8,9],[4,167,104,6,9,10],[4,168,104,6,11,12],[4,169,104,6,12,13],[4,170,104,6,13,15],[4,171,105,6,1,6],[4,172,105,6,6,9],[4,173,105,6,9,12],[4,174,105,6,12,13],[4,175,105,6,14,15],[4,176,106,6,1,5],[5,1,106,6,8,10],[5,2,106,6,10,15],[5,3,107,6,1,7],[5,4,107,6,8,10],[5,5,107,6,11,15],[5,6,108,6,1,8],[5,7,108,6,9,11],[5,8,108,6,11,14],[5,9,108,6,14,15],[5,10,109,6,1,2],[5,11,109,6,2,5],[5,12,109,6,5,11],[5,13,109,6,11,15],[5,14,110,6,1,4],[5,15,110,6,4,8],[5,16,110,6,8,10],[5,17,110,6,11,15],[5,18,111,6,1,4],[5,19,111,6,4,7],[5,20,111,6,7,9],[5,21,111,6,9,11],[5,22,111,6,11,13],[5,23,111,6,13,15],[5,24,112,6,1,2],[5,25,112,6,2,4],[5,26,112,6,4,5],[5,27,112,6,6,8],[5,28,112,6,8,10],[5,29,112,6,10,11],[5,30,112,6,11,12],[5,31,112,6,13,15],[5,32,113,6,1,5],[5,33,113,6,5,9],[5,34,113,6,10,11],[5,35,113,6,11,13],[5,36,113,6,13,15],[5,37,114,6,1,2],[5,38,114,6,2,3],[5,39,114,6,4,5],[5,40,114,6,5,7],[5,41,114,6,7,15],[5,42,115,6,1,4],[5,43,115,6,4,6],[5,44,115,6,6,11],[5,45,115,6,11,15],[5,46,116,6,1,3],[5,47,116,6,3,5],[5,48,116,6,5,11],[5,49,116,6,11,14],[5,50,116,6,14,15],[5,51,117,6,1,3],[5,52,117,6,3,5],[5,53,117,6,6,7],[5,54,117,6,7,11],[5,55,117,6,11,12],[5,56,117,6,12,13],[5,57,117,6,13,15],[5,58,118,6,1,2],[5,59,118,6,2,3],[5,60,118,6,3,6],[5,61,118,6,6,7],[5,62,118,6,8,9],[5,63,118,6,9,11],[5,64,118,6,11,15],[5,65,119,6,1,2],[5,66,119,6,2,5],[5,67,119,6,5,7],[5,68,119,6,7,10],[5,69,119,6,11,13],[5,70,119,6,13,15],[5,71,120,6,1,3],[5,72,120,6,3,6],[5,73,120,6,7,9],[5,74,120,6,9,10],[5,75,120,6,11,14],[5,76,120,6,14,15],[5,77,121,6,1,3],[5,78,121,6,3,5],[5,79,121,6,6,7],[5,80,121,6,7,9],[5,81,121,6,10,11],[5,82,121,7,12,15],[5,83,122,7,1,3],[5,84,122,7,3,4],[5,85,122,7,4,6],[5,86,122,7,6,7],[5,87,122,7,7,9],[5,88,122,7,9,10],[5,89,122,7,10,15],[5,90,123,7,1,2],[5,91,123,7,2,4],[5,92,123,7,4,6],[5,93,123,7,6,8],[5,94,123,7,9,11],[5,95,123,7,11,15],[5,96,124,7,1,3],[5,97,124,7,3,6],[5,98,124,7,6,7],[5,99,124,7,7,8],[5,100,124,7,8,10],[5,101,124,7,10,12],[5,102,124,7,12,13],[5,103,124,7,14,15],[5,104,125,7,1,3],[5,105,125,7,3,5],[5,106,125,7,5,10],[5,107,125,7,10,13],[5,108,125,7,13,15],[5,109,126,7,1,2],[5,110,126,7,2,10],[5,111,126,7,10,11],[5,112,126,7,11,14],[5,113,126,7,14,15],[5,114,127,7,1,3],[5,115,127,7,3,4],[5,116,127,7,5,8],[5,117,127,7,8,11],[5,118,127,7,11,12],[5,119,127,7,12,14],[5,120,127,7,15,15],[6,1,128,7,3,4],[6,2,128,7,4,6],[6,3,128,7,6,7],[6,4,128,7,7,8],[6,5,128,7,8,9],[6,6,128,7,9,13],[6,7,128,7,13,14],[6,8,128,7,14,15],[6,9,129,7,1,2],[6,10,129,7,2,3],[6,11,129,7,4,5],[6,12,129,7,5,7],[6,13,129,7,8,8],[6,14,129,7,9,11],[6,15,129,7,11,12],[6,16,129,7,12,13],[6,17,129,7,13,15],[6,18,129,7,15,15],[6,19,130,7,1,4],[6,20,130,7,4,5],[6,21,130,7,5,6],[6,22,130,7,7,8],[6,23,130,7,8,9],[6,24,130,7,9,10],[6,25,130,7,10,13],[6,26,130,7,13,14],[6,27,130,7,14,15],[6,28,131,7,1,2],[6,29,131,7,2,3],[6,30,131,7,3,4],[6,31,131,7,5,7],[6,32,131,7,7,8],[6,33,131,7,9,10],[6,34,131,7,10,12],[6,35,131,7,13,15],[6,36,132,7,1,2],[6,37,132,7,2,3],[6,38,132,7,3,5],[6,39,132,7,6,7],[6,40,132,7,7,9],[6,41,132,7,9,10],[6,42,132,7,10,11],[6,43,132,7,12,13],[6,44,132,7,13,15],[6,45,133,7,1,1],[6,46,133,7,2,4],[6,47,133,7,4,5],[6,48,133,7,5,7],[6,49,133,7,7,8],[6,50,133,7,8,11],[6,51,133,7,11,12],[6,52,133,7,13,15],[6,53,134,7,1,2],[6,54,134,7,2,5],[6,55,134,7,6,6],[6,56,134,7,7,8],[6,57,134,7,9,11],[6,58,134,7,11,12],[6,59,134,7,13,15],[6,60,135,7,1,3],[6,61,135,7,3,5],[6,62,135,7,5,6],[6,63,135,7,6,8],[6,64,135,7,8,9],[6,65,135,7,9,11],[6,66,135,7,12,12],[6,67,135,7,12,13],[6,68,135,7,13,15],[6,69,136,7,1,2],[6,70,136,7,2,7],[6,71,136,7,7,11],[6,72,136,7,11,12],[6,73,136,7,12,15],[6,74,137,7,1,2],[6,75,137,7,2,3],[6,76,137,7,4,5],[6,77,137,7,5,7],[6,78,137,7,7,8],[6,79,137,7,9,10],[6,80,137,7,10,13],[6,81,137,7,13,15],[6,82,138,7,1,2],[6,83,138,7,2,3],[6,84,138,7,4,6],[6,85,138,7,7,7],[6,86,138,7,8,9],[6,87,138,7,9,10],[6,88,138,7,10,12],[6,89,138,7,12,13],[6,90,138,7,14,15],[6,91,139,7,1,4],[6,92,139,7,5,7],[6,93,139,7,7,12],[6,94,139,7,12,15],[6,95,140,7,1,2],[6,96,140,7,2,4],[6,97,140,7,4,5],[6,98,140,7,6,7],[6,99,140,7,7,12],[6,100,140,7,12,14],[6,101,140,7,14,15],[6,102,141,7,1,2],[6,103,141,7,2,3],[6,104,141,7,4,5],[6,105,141,7,5,6],[6,106,141,7,7,8],[6,107,141,7,8,9],[6,108,141,7,9,12],[6,109,141,7,12,14],[6,110,141,7,14,15],[6,111,142,8,1,3],[6,112,142,8,3,5],[6,113,142,8,6,7],[6,114,142,8,7,10],[6,115,142,8,10,11],[6,116,142,8,11,13],[6,117,142,8,13,14],[6,118,142,8,15,15],[6,119,143,8,1,3],[6,120,143,8,4,5],[6,121,143,8,5,7],[6,122,143,8,8,10],[6,123,143,8,10,12],[6,124,143,8,12,15],[6,125,144,8,1,4],[6,126,144,8,4,5],[6,127,144,8,5,6],[6,128,144,8,6,10],[6,129,144,8,10,11],[6,130,144,8,11,14],[6,131,144,8,14,15],[6,132,145,8,1,2],[6,133,145,8,2,4],[6,134,145,8,4,5],[6,135,145,8,5,7],[6,136,145,8,8,12],[6,137,145,8,12,15],[6,138,146,8,1,4],[6,139,146,8,4,7],[6,140,146,8,7,9],[6,141,146,8,9,13],[6,142,146,8,14,15],[6,143,147,8,1,3],[6,144,147,8,4,8],[6,145,147,8,8,12],[6,146,147,8,12,15],[6,147,148,8,1,2],[6,148,148,8,2,6],[6,149,148,8,6,7],[6,150,148,8,7,10],[6,151,148,8,10,15],[6,152,149,8,1,4],[6,153,149,8,5,7],[6,154,149,8,7,9],[6,155,149,8,9,10],[6,156,149,8,10,11],[6,157,149,8,12,15],[6,158,150,8,1,4],[6,159,150,8,4,5],[6,160,150,8,6,7],[6,161,150,8,7,9],[6,162,150,8,9,10],[6,163,150,8,10,10],[6,164,150,8,11,13],[6,165,150,8,13,15],[7,1,151,8,3,3],[7,2,151,8,3,4],[7,3,151,8,4,5],[7,4,151,8,6,6],[7,5,151,8,7,8],[7,6,151,8,8,9],[7,7,151,8,9,9],[7,8,151,8,10,11],[7,9,151,8,11,12],[7,10,151,8,12,13],[7,11,151,8,14,15],[7,12,152,8,1,2],[7,13,152,8,2,3],[7,14,152,8,3,3],[7,15,152,8,4,4],[7,16,152,8,4,5],[7,17,152,8,5,6],[7,18,152,8,6,8],[7,19,152,8,8,9],[7,20,152,8,9,12],[7,21,152,8,12,12],[7,22,152,8,13,15],[7,23,153,8,1,2],[7,24,153,8,2,3],[7,25,153,8,3,4],[7,26,153,8,4,6],[7,27,153,8,6,9],[7,28,153,8,9,11],[7,29,153,8,11,13],[7,30,153,8,13,15],[7,31,154,8,1,2],[7,32,154,8,2,5],[7,33,154,8,5,7],[7,34,154,8,7,8],[7,35,154,8,9,10],[7,36,154,8,10,12],[7,37,154,8,12,15],[7,38,155,8,1,4],[7,39,155,8,5,6],[7,40,155,8,6,9],[7,41,155,8,9,10],[7,42,155,8,10,12],[7,43,155,8,12,15],[7,44,156,8,1,3],[7,45,156,8,3,4],[7,46,156,8,4,6],[7,47,156,8,6,7],[7,48,156,8,7,9],[7,49,156,8,9,10],[7,50,156,8,11,13],[7,51,156,8,13,15],[7,52,157,8,1,2],[7,53,157,8,2,5],[7,54,157,8,6,9],[7,55,157,8,9,10],[7,56,157,8,10,12],[7,57,157,8,12,15],[7,58,158,8,1,2],[7,59,158,8,3,4],[7,60,158,8,5,5],[7,61,158,8,5,6],[7,62,158,8,7,8],[7,63,158,8,8,9],[7,64,158,8,9,11],[7,65,158,8,11,12],[7,66,158,8,13,14],[7,67,158,8,14,15],[7,68,159,8,1,1],[7,69,159,8,1,4],[7,70,159,8,5,6],[7,71,159,8,7,10],[7,72,159,8,10,11],[7,73,159,8,12,15],[7,74,160,8,1,4],[7,75,160,8,4,7],[7,76,160,8,7,8],[7,77,160,8,8,10],[7,78,160,8,10,11],[7,79,160,8,11,12],[7,80,160,8,13,14],[7,81,160,8,14,15],[7,82,161,8,1,2],[7,83,161,8,2,3],[7,84,161,8,3,4],[7,85,161,8,5,9],[7,86,161,8,10,13],[7,87,161,8,13,15],[7,88,162,9,1,3],[7,89,162,9,3,6],[7,90,162,9,6,7],[7,91,162,9,8,8],[7,92,162,9,9,10],[7,93,162,9,10,12],[7,94,162,9,12,13],[7,95,162,9,13,15],[7,96,163,9,1,3],[7,97,163,9,3,4],[7,98,163,9,4,5],[7,99,163,9,5,6],[7,100,163,9,6,8],[7,101,163,9,9,11],[7,102,163,9,11,12],[7,103,163,9,13,14],[7,104,163,9,15,15],[7,105,164,9,1,2],[7,106,164,9,2,3],[7,107,164,9,3,4],[7,108,164,9,4,5],[7,109,164,9,5,6],[7,110,164,9,6,6],[7,111,164,9,7,7],[7,112,164,9,7,8],[7,113,164,9,8,9],[7,114,164,9,9,10],[7,115,164,9,10,11],[7,116,164,9,11,12],[7,117,164,9,13,14],[7,118,164,9,14,14],[7,119,164,9,14,15],[7,120,164,9,15,15],[7,121,165,9,1,1],[7,122,165,9,1,1],[7,123,165,9,1,3],[7,124,165,9,3,4],[7,125,165,9,5,5],[7,126,165,9,5,6],[7,127,165,9,7,9],[7,128,165,9,9,11],[7,129,165,9,11,14],[7,130,165,9,14,15],[7,131,166,9,1,3],[7,132,166,9,3,4],[7,133,166,9,4,6],[7,134,166,9,6,9],[7,135,166,9,9,10],[7,136,166,9,10,11],[7,137,166,9,12,15],[7,138,167,9,1,3],[7,139,167,9,3,4],[7,140,167,9,4,5],[7,141,167,9,5,8],[7,142,167,9,8,11],[7,143,167,9,11,15],[7,144,168,9,1,2],[7,145,168,9,2,5],[7,146,168,9,5,9],[7,147,168,9,9,11],[7,148,168,9,11,13],[7,149,168,9,13,15],[7,150,169,9,1,5],[7,151,169,9,5,6],[7,152,169,9,6,8],[7,153,169,9,8,9],[7,154,169,9,10,11],[7,155,169,9,11,15],[7,156,170,9,1,4],[7,157,170,9,4,10],[7,158,170,9,10,14],[7,159,170,9,15,15],[7,160,171,9,1,6],[7,161,171,9,6,9],[7,162,171,9,10,12],[7,163,171,9,12,15],[7,164,172,9,1,2],[7,165,172,9,3,4],[7,166,172,9,5,5],[7,167,172,9,6,8],[7,168,172,9,8,10],[7,169,172,9,10,14],[7,170,172,9,14,15],[7,171,173,9,1,2],[7,172,173,9,3,5],[7,173,173,9,5,7],[7,174,173,9,7,7],[7,175,173,9,8,9],[7,176,173,9,9,13],[7,177,173,9,13,14],[7,178,173,9,14,15],[7,179,174,9,1,3],[7,180,174,9,4,5],[7,181,174,9,5,6],[7,182,174,9,6,7],[7,183,174,9,7,8],[7,184,174,9,8,9],[7,185,174,9,9,11],[7,186,174,9,11,12],[7,187,174,9,12,15],[7,188,175,9,1,3],[7,189,175,9,3,6],[7,190,175,9,7,8],[7,191,175,9,8,8],[7,192,175,9,9,9],[7,193,175,9,10,11],[7,194,175,9,11,13],[7,195,175,9,13,15],[7,196,176,9,1,1],[7,197,176,9,2,3],[7,198,176,9,3,4],[7,199,176,9,4,5],[7,200,176,9,5,6],[7,201,176,9,6,8],[7,202,176,9,8,9],[7,203,176,9,9,11],[7,204,176,9,11,12],[7,205,176,9,12,14],[7,206,176,9,14,15],[8,1,177,9,3,5],[8,2,177,9,5,7],[8,3,177,9,7,8],[8,4,177,9,8,9],[8,5,177,9,9,10],[8,6,177,9,11,12],[8,7,177,9,12,14],[8,8,177,9,15,15],[8,9,178,9,1,2],[8,10,178,9,2,4],[8,11,178,9,4,6],[8,12,178,9,7,9],[8,13,178,9,9,11],[8,14,178,9,11,12],[8,15,178,9,12,13],[8,16,178,9,13,15],[8,17,179,9,1,3],[8,18,179,9,3,4],[8,19,179,9,4,6],[8,20,179,9,6,8],[8,21,179,9,8,9],[8,22,179,9,9,10],[8,23,179,9,10,11],[8,24,179,9,11,14],[8,25,179,9,14,15],[8,26,180,9,1,3],[8,27,180,9,3,4],[8,28,180,9,5,6],[8,29,180,9,6,8],[8,30,180,9,8,10],[8,31,180,9,10,12],[8,32,180,9,12,14],[8,33,180,9,14,15],[8,34,181,9,1,3],[8,35,181,9,3,5],[8,36,181,9,5,8],[8,37,181,9,8,10],[8,38,181,9,10,12],[8,39,181,9,12,14],[8,40,181,9,14,15],[8,41,182,10,1,4],[8,42,182,10,4,9],[8,43,182,10,9,11],[8,44,182,10,11,14],[8,45,182,10,14,15],[8,46,183,10,1,2],[8,47,183,10,2,4],[8,48,183,10,4,8],[8,49,183,10,8,10],[8,50,183,10,11,12],[8,51,183,10,12,13],[8,52,183,10,14,15],[8,53,184,10,1,2],[8,54,184,10,2,4],[8,55,184,10,5,5],[8,56,184,10,6,7],[8,57,184,10,7,8],[8,58,184,10,8,9],[8,59,184,10,10,10],[8,60,184,10,11,14],[8,61,184,10,14,15],[8,62,185,10,1,2],[8,63,185,10,2,4],[8,64,185,10,4,5],[8,65,185,10,5,8],[8,66,185,10,8,11],[8,67,185,10,11,13],[8,68,185,10,13,14],[8,69,185,10,14,15],[8,70,186,10,1,3],[8,71,186,10,3,4],[8,72,186,10,4,9],[8,73,186,10,9,11],[8,74,186,10,11,13],[8,75,186,10,13,15],[9,1,187,10,2,2],[9,2,187,10,3,4],[9,3,187,10,4,7],[9,4,187,10,8,10],[9,5,187,10,10,13],[9,6,187,10,14,15],[9,7,188,10,1,3],[9,8,188,10,4,6],[9,9,188,10,6,7],[9,10,188,10,7,8],[9,11,188,10,9,10],[9,12,188,10,10,12],[9,13,188,10,13,15],[9,14,189,10,1,2],[9,15,189,10,2,3],[9,16,189,10,4,6],[9,17,189,10,6,8],[9,18,189,10,9,11],[9,19,189,10,11,14],[9,20,189,10,14,15],[9,21,190,10,1,2],[9,22,190,10,2,3],[9,23,190,10,3,5],[9,24,190,10,5,10],[9,25,190,10,10,13],[9,26,190,10,13,15],[9,27,191,10,1,2],[9,28,191,10,2,5],[9,29,191,10,5,8],[9,30,191,10,9,12],[9,31,191,10,12,15],[9,32,192,10,1,2],[9,33,192,10,2,4],[9,34,192,10,4,8],[9,35,192,10,8,11],[9,36,192,10,11,15],[9,37,193,10,1,4],[9,38,193,10,4,7],[9,39,193,10,8,10],[9,40,193,10,10,15],[9,41,194,10,1,2],[9,42,194,10,3,5],[9,43,194,10,6,7],[9,44,194,10,7,9],[9,45,194,10,9,11],[9,46,194,10,11,13],[9,47,194,10,13,15],[9,48,195,10,1,2],[9,49,195,10,3,4],[9,50,195,10,5,7],[9,51,195,10,7,8],[9,52,195,10,9,11],[9,53,195,10,11,13],[9,54,195,10,13,15],[9,55,196,10,1,2],[9,56,196,10,3,4],[9,57,196,10,4,5],[9,58,196,10,5,7],[9,59,196,10,7,9],[9,60,196,10,9,12],[9,61,196,10,12,15],[9,62,197,10,1,2],[9,63,197,10,2,4],[9,64,197,10,4,6],[9,65,197,10,6,8],[9,66,197,10,8,10],[9,67,197,10,10,13],[9,68,197,10,13,15],[9,69,198,10,1,5],[9,70,198,10,5,9],[9,71,198,10,9,12],[9,72,198,10,13,15],[9,73,199,10,1,2],[9,74,199,10,2,7],[9,75,199,10,7,8],[9,76,199,10,9,9],[9,77,199,10,10,11],[9,78,199,10,11,13],[9,79,199,10,13,15],[9,80,200,10,1,3],[9,81,200,10,3,6],[9,82,200,10,6,7],[9,83,200,10,7,10],[9,84,200,10,10,11],[9,85,200,10,12,13],[9,86,200,10,13,15],[9,87,201,10,1,2],[9,88,201,10,2,4],[9,89,201,10,4,5],[9,90,201,10,5,7],[9,91,201,10,8,10],[9,92,201,10,11,13],[9,93,201,11,13,15],[9,94,202,11,1,4],[9,95,202,11,4,7],[9,96,202,11,7,8],[9,97,202,11,9,10],[9,98,202,11,10,12],[9,99,202,11,12,15],[9,100,203,11,1,4],[9,101,203,11,4,7],[9,102,203,11,7,8],[9,103,203,11,9,10],[9,104,203,11,10,12],[9,105,203,11,12,14],[9,106,203,11,14,15],[9,107,204,11,1,3],[9,108,204,11,4,6],[9,109,204,11,6,9],[9,110,204,11,9,10],[9,111,204,11,11,15],[9,112,205,11,1,4],[9,113,205,11,4,6],[9,114,205,11,6,8],[9,115,205,11,9,10],[9,116,205,11,10,12],[9,117,205,11,12,15],[9,118,206,11,1,4],[9,119,206,11,4,5],[9,120,206,11,5,10],[9,121,206,11,11,13],[9,122,206,11,13,15],[9,123,207,11,2,3],[9,124,207,11,4,5],[9,125,207,11,6,7],[9,126,207,11,7,9],[9,127,207,11,9,11],[9,128,207,11,12,14],[9,129,207,11,14,15],[10,1,208,11,2,2],[10,2,208,11,2,5],[10,3,208,11,5,8],[10,4,208,11,8,11],[10,5,208,11,11,14],[10,6,208,11,14,15],[10,7,209,11,1,2],[10,8,209,11,2,3],[10,9,209,11,3,5],[10,10,209,11,5,7],[10,11,209,11,7,9],[10,12,209,11,9,12],[10,13,209,11,12,14],[10,14,209,11,14,15],[10,15,210,11,1,4],[10,16,210,11,4,6],[10,17,210,11,6,8],[10,18,210,11,8,11],[10,19,210,11,11,13],[10,20,210,11,14,15],[10,21,211,11,1,2],[10,22,211,11,3,7],[10,23,211,11,7,9],[10,24,211,11,10,14],[10,25,211,11,14,15],[10,26,212,11,1,2],[10,27,212,11,2,5],[10,28,212,11,5,7],[10,29,212,11,7,8],[10,30,212,11,9,10],[10,31,212,11,10,13],[10,32,212,11,13,14],[10,33,212,11,14,15],[10,34,213,11,1,2],[10,35,213,11,2,4],[10,36,213,11,5,6],[10,37,213,11,6,8],[10,38,213,11,8,9],[10,39,213,11,10,11],[10,40,213,11,12,13],[10,41,213,11,13,14],[10,42,213,11,14,15],[10,43,214,11,1,2],[10,44,214,11,2,3],[10,45,214,11,3,5],[10,46,214,11,5,6],[10,47,214,11,6,8],[10,48,214,11,8,8],[10,49,214,11,9,10],[10,50,214,11,11,12],[10,51,214,11,12,13],[10,52,214,11,13,14],[10,53,214,11,14,15],[10,54,215,11,1,3],[10,55,215,11,3,4],[10,56,215,11,4,5],[10,57,215,11,5,6],[10,58,215,11,7,8],[10,59,215,11,8,10],[10,60,215,11,10,12],[10,61,215,11,12,15],[10,62,216,11,1,1],[10,63,216,11,2,2],[10,64,216,11,2,4],[10,65,216,11,4,5],[10,66,216,11,5,8],[10,67,216,11,8,10],[10,68,216,11,10,13],[10,69,216,11,13,14],[10,70,216,11,14,15],[10,71,217,11,1,4],[10,72,217,11,4,5],[10,73,217,11,6,7],[10,74,217,11,8,10],[10,75,217,11,10,11],[10,76,217,11,12,12],[10,77,217,11,13,14],[10,78,217,11,14,15],[10,79,218,11,1,1],[10,80,218,11,1,2],[10,81,218,11,2,4],[10,82,218,11,4,5],[10,83,218,11,5,7],[10,84,218,11,7,8],[10,85,218,11,8,9],[10,86,218,11,9,10],[10,87,218,11,10,12],[10,88,218,11,12,15],[10,89,219,11,1,2],[10,90,219,11,2,5],[10,91,219,11,5,6],[10,92,219,11,6,7],[10,93,219,11,8,10],[10,94,219,11,10,12],[10,95,219,11,12,13],[10,96,219,11,14,14],[10,97,219,11,15,15],[10,98,220,11,1,3],[10,99,220,11,3,4],[10,100,220,11,4,6],[10,101,220,11,6,7],[10,102,220,11,8,9],[10,103,220,11,9,10],[10,104,220,11,11,13],[10,105,220,11,13,14],[10,106,220,11,14,15],[10,107,221,11,1,3],[10,108,221,11,3,5],[10,109,221,11,5,6],[11,1,221,11,9,9],[11,2,221,11,10,10],[11,3,221,11,10,13],[11,4,221,11,13,13],[11,5,221,11,13,15],[11,6,222,12,1,2],[11,7,222,12,2,6],[11,8,222,12,6,8],[11,9,222,12,9,10],[11,10,222,12,10,11],[11,11,222,12,12,13],[11,12,222,12,13,15],[11,13,223,12,1,2],[11,14,223,12,3,4],[11,15,223,12,4,5],[11,16,223,12,6,7],[11,17,223,12,7,11],[11,18,223,12,11,14],[11,19,223,12,14,15],[11,20,224,12,1,3],[11,21,224,12,3,4],[11,22,224,12,4,5],[11,23,224,12,5,7],[11,24,224,12,7,8],[11,25,224,12,9,9],[11,26,224,12,10,10],[11,27,224,12,11,13],[11,28,224,12,14,15],[11,29,225,12,1,3],[11,30,225,12,3,4],[11,31,225,12,4,7],[11,32,225,12,7,8],[11,33,225,12,8,9],[11,34,225,12,9,11],[11,35,225,12,11,12],[11,36,225,12,13,14],[11,37,225,12,14,15],[11,38,226,12,1,2],[11,39,226,12,3,4],[11,40,226,12,4,6],[11,41,226,12,6,7],[11,42,226,12,7,9],[11,43,226,12,10,12],[11,44,226,12,12,14],[11,45,226,12,14,15],[11,46,227,12,1,2],[11,47,227,12,3,4],[11,48,227,12,4,6],[11,49,227,12,6,8],[11,50,227,12,8,10],[11,51,227,12,10,11],[11,52,227,12,12,14],[11,53,227,12,14,15],[11,54,228,12,1,2],[11,55,228,12,2,3],[11,56,228,12,3,4],[11,57,228,12,5,6],[11,58,228,12,7,8],[11,59,228,12,8,9],[11,60,228,12,9,11],[11,61,228,12,11,13],[11,62,228,12,14,15],[11,63,229,12,1,3],[11,64,229,12,3,5],[11,65,229,12,5,6],[11,66,229,12,6,8],[11,67,229,12,8,9],[11,68,229,12,10,11],[11,69,229,12,11,12],[11,70,229,12,12,14],[11,71,229,12,14,15],[11,72,230,12,1,2],[11,73,230,12,2,3],[11,74,230,12,3,4],[11,75,230,12,5,5],[11,76,230,12,5,6],[11,77,230,12,6,8],[11,78,230,12,8,10],[11,79,230,12,11,11],[11,80,230,12,12,12],[11,81,230,12,12,15],[11,82,231,12,1,2],[11,83,231,12,2,3],[11,84,231,12,3,6],[11,85,231,12,6,8],[11,86,231,12,9,10],[11,87,231,12,10,12],[11,88,231,12,12,15],[11,89,232,12,1,3],[11,90,232,12,3,4],[11,91,232,12,4,6],[11,92,232,12,6,8],[11,93,232,12,8,10],[11,94,232,12,10,12],[11,95,232,12,13,13],[11,96,232,12,13,14],[11,97,232,12,14,15],[11,98,233,12,1,2],[11,99,233,12,2,3],[11,100,233,12,3,4],[11,101,233,12,4,6],[11,102,233,12,7,8],[11,103,233,12,8,9],[11,104,233,12,9,10],[11,105,233,12,10,11],[11,106,233,12,11,12],[11,107,233,12,12,13],[11,108,233,12,14,15],[11,109,234,12,1,2],[11,110,234,12,3,4],[11,111,234,12,5,6],[11,112,234,12,6,7],[11,113,234,12,7,9],[11,114,234,12,9,10],[11,115,234,12,11,11],[11,116,234,12,11,14],[11,117,234,12,14,15],[11,118,235,12,1,1],[11,119,235,12,2,3],[11,120,235,12,3,5],[11,121,235,12,5,6],[11,122,235,12,6,6],[11,123,235,12,7,8],[12,1,235,12,11,11],[12,2,235,12,11,12],[12,3,235,12,12,14],[12,4,235,12,14,15],[12,5,236,12,1,2],[12,6,236,12,2,5],[12,7,236,12,5,6],[12,8,236,12,6,7],[12,9,236,12,7,9],[12,10,236,12,9,11],[12,11,236,12,11,12],[12,12,236,12,12,13],[12,13,236,12,13,14],[12,14,236,12,14,15],[12,15,237,12,1,2],[12,16,237,12,2,3],[12,17,237,12,3,5],[12,18,237,12,5,7],[12,19,237,12,7,9],[12,20,237,12,9,10],[12,21,237,12,10,14],[12,22,237,12,14,15],[12,23,238,12,1,3],[12,24,238,12,3,5],[12,25,238,12,5,8],[12,26,238,12,8,10],[12,27,238,12,10,11],[12,28,238,12,11,12],[12,29,238,12,12,13],[12,30,238,12,14,15],[12,31,239,12,1,4],[12,32,239,12,4,6],[12,33,239,12,6,7],[12,34,239,12,8,9],[12,35,239,12,9,10],[12,36,239,12,10,13],[12,37,239,12,13,15],[12,38,240,12,1,3],[12,39,240,12,3,4],[12,40,240,12,5,8],[12,41,240,12,8,10],[12,42,240,12,10,12],[12,43,240,12,13,15],[12,44,241,12,1,1],[12,45,241,12,2,3],[12,46,241,12,3,5],[12,47,241,12,5,7],[12,48,241,12,7,8],[12,49,241,12,8,9],[12,50,241,12,9,11],[12,51,241,12,11,14],[12,52,241,12,14,15],[12,53,242,13,1,2],[12,54,242,13,2,3],[12,55,242,13,3,4],[12,56,242,13,4,6],[12,57,242,13,6,7],[12,58,242,13,7,8],[12,59,242,13,8,10],[12,60,242,13,10,11],[12,61,242,13,11,12],[12,62,242,13,12,13],[12,63,242,13,14,15],[12,64,243,13,1,2],[12,65,243,13,2,5],[12,66,243,13,5,7],[12,67,243,13,8,10],[12,68,243,13,10,13],[12,69,243,13,14,15],[12,70,244,13,1,2],[12,71,244,13,2,3],[12,72,244,13,3,4],[12,73,244,13,4,5],[12,74,244,13,6,6],[12,75,244,13,6,7],[12,76,244,13,8,11],[12,77,244,13,11,14],[12,78,244,13,14,15],[12,79,245,13,1,2],[12,80,245,13,2,5],[12,81,245,13,6,7],[12,82,245,13,8,9],[12,83,245,13,9,11],[12,84,245,13,11,12],[12,85,245,13,13,14],[12,86,245,13,14,15],[12,87,246,13,1,2],[12,88,246,13,3,5],[12,89,246,13,5,6],[12,90,246,13,6,9],[12,91,246,13,9,10],[12,92,246,13,10,11],[12,93,246,13,12,13],[12,94,246,13,13,15],[12,95,246,13,15,15],[12,96,247,13,1,2],[12,97,247,13,2,3],[12,98,247,13,3,4],[12,99,247,13,4,6],[12,100,247,13,6,10],[12,101,247,13,10,13],[12,102,247,13,13,14],[12,103,247,13,15,15],[12,104,248,13,1,1],[12,105,248,13,2,3],[12,106,248,13,3,4],[12,107,248,13,4,5],[12,108,248,13,5,7],[12,109,248,13,7,10],[12,110,248,13,10,12],[12,111,248,13,13,15],[13,1,249,13,3,4],[13,2,249,13,4,7],[13,3,249,13,7,9],[13,4,249,13,9,12],[13,5,249,13,13,15],[13,6,250,13,1,3],[13,7,250,13,3,4],[13,8,250,13,5,6],[13,9,250,13,6,7],[13,10,250,13,7,9],[13,11,250,13,9,12],[13,12,250,13,12,13],[13,13,250,13,13,15],[13,14,251,13,1,3],[13,15,251,13,3,4],[13,16,251,13,4,8],[13,17,251,13,8,12],[13,18,251,13,13,15],[13,19,252,13,1,2],[13,20,252,13,2,2],[13,21,252,13,3,4],[13,22,252,13,4,6],[13,23,252,13,6,8],[13,24,252,13,8,8],[13,25,252,13,9,11],[13,26,252,13,11,12],[13,27,252,13,12,14],[13,28,252,13,14,15],[13,29,253,13,1,2],[13,30,253,13,2,4],[13,31,253,13,5,9],[13,32,253,13,9,11],[13,33,253,13,11,14],[13,34,253,13,14,15],[13,35,254,13,1,3],[13,36,254,13,3,5],[13,37,254,13,6,7],[13,38,254,13,7,9],[13,39,254,13,10,10],[13,40,254,13,11,12],[13,41,254,13,12,14],[13,42,254,13,14,15],[13,43,255,13,1,2],[14,1,255,13,5,6],[14,2,255,13,7,8],[14,3,255,13,8,10],[14,4,255,13,10,12],[14,5,255,13,13,15],[14,6,256,13,1,4],[14,7,256,13,4,6],[14,8,256,13,6,7],[14,9,256,13,7,11],[14,10,256,13,11,15],[14,11,257,13,1,3],[14,12,257,13,4,5],[14,13,257,13,6,8],[14,14,257,13,8,9],[14,15,257,13,9,10],[14,16,257,13,10,11],[14,17,257,13,11,13],[14,18,257,13,13,15],[14,19,258,13,1,2],[14,20,258,13,2,2],[14,21,258,13,3,6],[14,22,258,13,6,11],[14,23,258,13,12,14],[14,24,258,13,14,15],[14,25,259,13,1,2],[14,26,259,13,2,3],[14,27,259,13,4,6],[14,28,259,13,6,7],[14,29,259,13,7,8],[14,30,259,13,8,9],[14,31,259,13,9,11],[14,32,259,13,11,14],[14,33,259,13,14,15],[14,34,260,13,1,2],[14,35,260,13,2,4],[14,36,260,13,4,5],[14,37,260,13,6,8],[14,38,260,13,9,10],[14,39,260,13,10,11],[14,40,260,13,12,13],[14,41,260,13,13,14],[14,42,260,13,14,15],[14,43,261,13,1,2],[14,44,261,13,2,5],[14,45,261,13,5,7],[14,46,261,13,7,8],[14,47,261,13,9,10],[14,48,261,13,10,11],[14,49,261,13,11,12],[14,50,261,13,12,13],[14,51,261,13,13,14],[14,52,261,13,14,15],[15,1,262,14,3,3],[15,2,262,14,3,4],[15,3,262,14,4,5],[15,4,262,14,5,6],[15,5,262,14,6,7],[15,6,262,14,7,8],[15,7,262,14,8,9],[15,8,262,14,9,10],[15,9,262,14,10,10],[15,10,262,14,11,11],[15,11,262,14,11,12],[15,12,262,14,12,13],[15,13,262,14,13,13],[15,14,262,14,14,14],[15,15,262,14,15,15],[15,16,263,14,1,1],[15,17,263,14,2,2],[15,18,263,14,2,3],[15,19,263,14,3,4],[15,20,263,14,4,5],[15,21,263,14,5,6],[15,22,263,14,6,8],[15,23,263,14,8,8],[15,24,263,14,9,9],[15,25,263,14,10,10],[15,26,263,14,10,11],[15,27,263,14,11,12],[15,28,263,14,12,13],[15,29,263,14,13,14],[15,30,263,14,14,15],[15,31,263,14,15,15],[15,32,264,14,1,1],[15,33,264,14,1,2],[15,34,264,14,2,3],[15,35,264,14,3,4],[15,36,264,14,4,4],[15,37,264,14,4,5],[15,38,264,14,5,5],[15,39,264,14,5,6],[15,40,264,14,7,7],[15,41,264,14,7,8],[15,42,264,14,8,9],[15,43,264,14,9,9],[15,44,264,14,10,10],[15,45,264,14,10,11],[15,46,264,14,11,11],[15,47,264,14,12,12],[15,48,264,14,13,13],[15,49,264,14,14,14],[15,50,264,14,14,15],[15,51,264,14,15,15],[15,52,265,14,1,1],[15,53,265,14,1,2],[15,54,265,14,2,3],[15,55,265,14,3,4],[15,56,265,14,4,5],[15,57,265,14,5,5],[15,58,265,14,6,6],[15,59,265,14,6,7],[15,60,265,14,7,8],[15,61,265,14,8,8],[15,62,265,14,8,9],[15,63,265,14,9,10],[15,64,265,14,10,10],[15,65,265,14,10,12],[15,66,265,14,12,13],[15,67,265,14,13,14],[15,68,265,14,14,14],[15,69,265,14,14,15],[15,70,265,14,15,15],[15,71,266,14,1,1],[15,72,266,14,1,2],[15,73,266,14,2,2],[15,74,266,14,2,3],[15,75,266,14,3,4],[15,76,266,14,4,4],[15,77,266,14,4,5],[15,78,266,14,5,5],[15,79,266,14,6,6],[15,80,266,14,6,7],[15,81,266,14,7,7],[15,82,266,14,8,8],[15,83,266,14,8,9],[15,84,266,14,9,9],[15,85,266,14,10,11],[15,86,266,14,11,12],[15,87,266,14,12,13],[15,88,266,14,13,14],[15,89,266,14,14,15],[15,90,266,14,15,15],[15,91,267,14,1,1],[15,92,267,14,1,2],[15,93,267,14,2,2],[15,94,267,14,2,3],[15,95,267,14,3,3],[15,96,267,14,3,4],[15,97,267,14,4,5],[15,98,267,14,5,6],[15,99,267,14,6,6],[16,1,267,14,9,9],[16,2,267,14,10,11],[16,3,267,14,11,12],[16,4,267,14,12,13],[16,5,267,14,13,14],[16,6,267,14,15,15],[16,7,268,14,1,2],[16,8,268,14,2,3],[16,9,268,14,4,5],[16,10,268,14,5,6],[16,11,268,14,6,8],[16,12,268,14,9,10],[16,13,268,14,11,12],[16,14,268,14,12,15],[16,15,269,14,1,2],[16,16,269,14,2,2],[16,17,269,14,3,3],[16,18,269,14,3,4],[16,19,269,14,5,5],[16,20,269,14,5,6],[16,21,269,14,6,7],[16,22,269,14,7,8],[16,23,269,14,9,10],[16,24,269,14,10,11],[16,25,269,14,11,13],[16,26,269,14,13,15],[16,27,270,14,1,3],[16,28,270,14,3,5],[16,29,270,14,5,6],[16,30,270,14,6,8],[16,31,270,14,9,10],[16,32,270,14,10,12],[16,33,270,14,12,14],[16,34,270,14,14,15],[16,35,271,14,1,3],[16,36,271,14,4,7],[16,37,271,14,7,8],[16,38,271,14,9,10],[16,39,271,14,11,12],[16,40,271,14,12,13],[16,41,271,14,13,15],[16,42,271,14,15,15],[16,43,272,14,1,2],[16,44,272,14,2,3],[16,45,272,14,4,5],[16,46,272,14,5,6],[16,47,272,14,6,7],[16,48,272,14,7,8],[16,49,272,14,9,10],[16,50,272,14,10,11],[16,51,272,14,11,12],[16,52,272,14,12,13],[16,53,272,14,13,14],[16,54,272,14,14,15],[16,55,273,14,1,1],[16,56,273,14,1,3],[16,57,273,14,3,3],[16,58,273,14,4,4],[16,59,273,14,5,6],[16,60,273,14,6,7],[16,61,273,14,8,10],[16,62,273,14,10,12],[16,63,273,14,12,14],[16,64,273,14,14,15],[16,65,274,14,1,2],[16,66,274,14,2,3],[16,67,274,14,4,5],[16,68,274,14,5,6],[16,69,274,14,6,9],[16,70,274,14,9,10],[16,71,274,14,10,13],[16,72,274,14,13,15],[16,73,275,14,1,2],[16,74,275,14,2,3],[16,75,275,14,3,6],[16,76,275,14,6,9],[16,77,275,14,9,11],[16,78,275,14,11,13],[16,79,275,14,14,15],[16,80,276,14,1,3],[16,81,276,14,4,7],[16,82,276,14,7,8],[16,83,276,14,8,9],[16,84,276,14,9,10],[16,85,276,14,11,12],[16,86,276,14,12,14],[16,87,276,14,14,15],[16,88,277,14,1,2],[16,89,277,14,2,5],[16,90,277,14,5,7],[16,91,277,14,8,10],[16,92,277,14,10,13],[16,93,277,14,14,15],[16,94,278,14,1,3],[16,95,278,14,3,4],[16,96,278,14,4,6],[16,97,278,14,6,8],[16,98,278,14,8,9],[16,99,278,14,9,10],[16,100,278,14,10,11],[16,101,278,14,12,13],[16,102,278,14,14,15],[16,103,279,14,1,3],[16,104,279,14,3,4],[16,105,279,14,4,5],[16,106,279,14,6,8],[16,107,279,14,9,10],[16,108,279,14,10,12],[16,109,279,14,12,13],[16,110,279,14,13,15],[16,111,280,14,1,2],[16,112,280,14,2,5],[16,113,280,14,5,7],[16,114,280,14,7,8],[16,115,280,14,9,11],[16,116,280,14,11,13],[16,117,280,14,13,14],[16,118,280,14,14,15],[16,119,281,14,1,2],[16,120,281,14,3,3],[16,121,281,14,4,4],[16,122,281,14,5,5],[16,123,281,14,6,7],[16,124,281,14,7,9],[16,125,281,14,9,11],[16,126,281,14,12,13],[16,127,281,14,13,14],[16,128,281,14,15,15],[17,1,282,15,3,5],[17,2,282,15,5,6],[17,3,282,15,7,7],[17,4,282,15,8,9],[17,5,282,15,9,11],[17,6,282,15,11,12],[17,7,282,15,13,15],[17,8,283,15,1,2],[17,9,283,15,2,3],[17,10,283,15,4,4],[17,11,283,15,5,5],[17,12,283,15,6,8],[17,13,283,15,8,10],[17,14,283,15,10,10],[17,15,283,15,11,13],[17,16,283,15,13,14],[17,17,283,15,14,15],[17,18,284,15,1,2],[17,19,284,15,2,4],[17,20,284,15,4,5],[17,21,284,15,5,6],[17,22,284,15,7,7],[17,23,284,15,8,10],[17,24,284,15,10,12],[17,25,284,15,12,13],[17,26,284,15,13,14],[17,27,284,15,14,15],[17,28,285,15,1,2],[17,29,285,15,2,3],[17,30,285,15,3,4],[17,31,285,15,4,6],[17,32,285,15,6,7],[17,33,285,15,7,9],[17,34,285,15,9,11],[17,35,285,15,11,12],[17,36,285,15,12,13],[17,37,285,15,14,15],[17,38,285,15,15,15],[17,39,286,15,1,2],[17,40,286,15,2,3],[17,41,286,15,4,4],[17,42,286,15,5,5],[17,43,286,15,6,6],[17,44,286,15,6,8],[17,45,286,15,8,10],[17,46,286,15,10,11],[17,47,286,15,12,13],[17,48,286,15,13,14],[17,49,286,15,15,15],[17,50,287,15,1,1],[17,51,287,15,1,4],[17,52,287,15,4,5],[17,53,287,15,5,7],[17,54,287,15,7,8],[17,55,287,15,8,10],[17,56,287,15,10,11],[17,57,287,15,11,13],[17,58,287,15,14,15],[17,59,288,15,1,3],[17,60,288,15,3,5],[17,61,288,15,6,7],[17,62,288,15,7,9],[17,63,288,15,9,10],[17,64,288,15,10,13],[17,65,288,15,13,14],[17,66,288,15,14,15],[17,67,289,15,1,2],[17,68,289,15,2,4],[17,69,289,15,4,6],[17,70,289,15,6,8],[17,71,289,15,8,10],[17,72,289,15,10,11],[17,73,289,15,11,13],[17,74,289,15,13,14],[17,75,289,15,14,15],[17,76,290,15,1,2],[17,77,290,15,2,3],[17,78,290,15,3,5],[17,79,290,15,5,6],[17,80,290,15,6,8],[17,81,290,15,8,9],[17,82,290,15,9,10],[17,83,290,15,10,11],[17,84,290,15,12,13],[17,85,290,15,13,14],[17,86,290,15,14,15],[17,87,291,15,1,1],[17,88,291,15,1,3],[17,89,291,15,3,5],[17,90,291,15,5,6],[17,91,291,15,6,7],[17,92,291,15,7,8],[17,93,291,15,9,11],[17,94,291,15,11,12],[17,95,291,15,12,14],[17,96,291,15,14,15],[17,97,292,15,1,3],[17,98,292,15,4,5],[17,99,292,15,5,7],[17,100,292,15,8,9],[17,101,292,15,9,11],[17,102,292,15,11,13],[17,103,292,15,13,14],[17,104,292,15,14,15],[17,105,293,15,1,1],[17,106,293,15,2,2],[17,107,293,15,3,4],[17,108,293,15,4,5],[17,109,293,15,5,6],[17,110,293,15,6,8],[17,111,293,15,8,9],[18,1,293,15,12,12],[18,2,293,15,13,14],[18,3,293,15,14,15],[18,4,293,15,15,15],[18,5,294,15,1,2],[18,6,294,15,2,3],[18,7,294,15,3,4],[18,8,294,15,5,5],[18,9,294,15,5,6],[18,10,294,15,7,8],[18,11,294,15,8,9],[18,12,294,15,9,10],[18,13,294,15,10,11],[18,14,294,15,11,13],[18,15,294,15,13,15],[18,16,295,15,1,2],[18,17,295,15,3,6],[18,18,295,15,6,9],[18,19,295,15,9,14],[18,20,295,15,14,15],[18,21,296,15,1,4],[18,22,296,15,4,8],[18,23,296,15,8,9],[18,24,296,15,9,10],[18,25,296,15,11,11],[18,26,296,15,12,14],[18,27,296,15,14,15],[18,28,297,15,1,4],[18,29,297,15,4,7],[18,30,297,15,7,8],[18,31,297,15,8,11],[18,32,297,15,11,13],[18,33,297,15,13,14],[18,34,297,15,14,15],[18,35,298,15,1,2],[18,36,298,15,2,3],[18,37,298,15,3,4],[18,38,298,15,5,5],[18,39,298,15,5,7],[18,40,298,15,7,9],[18,41,298,15,9,9],[18,42,298,15,10,11],[18,43,298,15,11,12],[18,44,298,15,12,13],[18,45,298,15,13,15],[18,46,299,15,1,2],[18,47,299,15,2,3],[18,48,299,15,3,5],[18,49,299,15,5,8],[18,50,299,15,8,11],[18,51,299,15,11,12],[18,52,299,15,13,14],[18,53,299,15,14,15],[18,54,300,15,1,2],[18,55,300,15,2,4],[18,56,300,15,4,6],[18,57,300,15,6,9],[18,58,300,15,9,11],[18,59,300,15,12,13],[18,60,300,15,13,14],[18,61,300,15,14,15],[18,62,301,15,1,2],[18,63,301,15,2,4],[18,64,301,15,4,5],[18,65,301,15,5,6],[18,66,301,15,6,7],[18,67,301,15,7,8],[18,68,301,15,8,8],[18,69,301,15,8,9],[18,70,301,15,9,10],[18,71,301,15,11,12],[18,72,301,15,12,13],[18,73,301,15,13,14],[18,74,301,15,14,15],[18,75,302,16,1,1],[18,76,302,16,1,2],[18,77,302,16,3,5],[18,78,302,16,5,6],[18,79,302,16,6,8],[18,80,302,16,8,9],[18,81,302,16,10,10],[18,82,302,16,11,14],[18,83,302,16,14,15],[18,84,303,16,1,1],[18,85,303,16,1,1],[18,86,303,16,2,4],[18,87,303,16,4,5],[18,88,303,16,5,6],[18,89,303,16,6,6],[18,90,303,16,6,8],[18,91,303,16,8,8],[18,92,303,16,8,9],[18,93,303,16,9,10],[18,94,303,16,10,12],[18,95,303,16,12,13],[18,96,303,16,13,14],[18,97,303,16,15,15],[18,98,304,16,1,2],[18,99,304,16,2,3],[18,100,304,16,3,3],[18,101,304,16,4,5],[18,102,304,16,5,6],[18,103,304,16,6,7],[18,104,304,16,7,8],[18,105,304,16,8,9],[18,106,304,16,9,10],[18,107,304,16,10,11],[18,108,304,16,11,12],[18,109,304,16,12,13],[18,110,304,16,13,15],[19,1,305,16,3,3],[19,2,305,16,3,3],[19,3,305,16,4,4],[19,4,305,16,4,6],[19,5,305,16,6,7],[19,6,305,16,7,8],[19,7,305,16,8,9],[19,8,305,16,10,11],[19,9,305,16,11,13],[19,10,305,16,13,14],[19,11,305,16,14,15],[19,12,306,16,1,1],[19,13,306,16,2,2],[19,14,306,16,2,3],[19,15,306,16,3,4],[19,16,306,16,4,5],[19,17,306,16,5,6],[19,18,306,16,6,7],[19,19,306,16,7,8],[19,20,306,16,8,9],[19,21,306,16,9,11],[19,22,306,16,11,12],[19,23,306,16,12,13],[19,24,306,16,14,14],[19,25,306,16,15,15],[19,26,307,16,1,2],[19,27,307,16,3,4],[19,28,307,16,4,5],[19,29,307,16,5,6],[19,30,307,16,6,7],[19,31,307,16,7,8],[19,32,307,16,8,9],[19,33,307,16,9,10],[19,34,307,16,10,11],[19,35,307,16,11,12],[19,36,307,16,12,13],[19,37,307,16,13,14],[19,38,307,16,14,15],[19,39,308,16,1,1],[19,40,308,16,2,2],[19,41,308,16,2,3],[19,42,308,16,3,4],[19,43,308,16,4,6],[19,44,308,16,6,7],[19,45,308,16,7,8],[19,46,308,16,8,9],[19,47,308,16,9,10],[19,48,308,16,11,12],[19,49,308,16,12,13],[19,50,308,16,14,14],[19,51,308,16,15,15],[19,52,309,16,1,1],[19,53,309,16,1,2],[19,54,309,16,2,3],[19,55,309,16,3,4],[19,56,309,16,4,5],[19,57,309,16,5,5],[19,58,309,16,5,8],[19,59,309,16,8,9],[19,60,309,16,10,11],[19,61,309,16,11,12],[19,62,309,16,12,13],[19,63,309,16,13,14],[19,64,309,16,14,15],[19,65,310,16,1,2],[19,66,310,16,2,3],[19,67,310,16,3,4],[19,68,310,16,4,5],[19,69,310,16,5,6],[19,70,310,16,6,7],[19,71,310,16,7,8],[19,72,310,16,8,9],[19,73,310,16,9,10],[19,74,310,16,10,11],[19,75,310,16,11,14],[19,76,310,16,14,15],[19,77,311,16,1,1],[19,78,311,16,2,2],[19,79,311,16,2,3],[19,80,311,16,3,4],[19,81,311,16,4,5],[19,82,311,16,5,6],[19,83,311,16,6,7],[19,84,311,16,7,7],[19,85,311,16,8,8],[19,86,311,16,8,9],[19,87,311,16,9,10],[19,88,311,16,10,10],[19,89,311,16,10,11],[19,90,311,16,11,12],[19,91,311,16,12,12],[19,92,311,16,13,13],[19,93,311,16,13,14],[19,94,311,16,14,15],[19,95,311,16,15,15],[19,96,312,16,1,2],[19,97,312,16,2,3],[19,98,312,16,3,4],[20,1,312,16,7,7],[20,2,312,16,7,7],[20,3,312,16,7,8],[20,4,312,16,8,8],[20,5,312,16,9,9],[20,6,312,16,9,10],[20,7,312,16,10,11],[20,8,312,16,11,12],[20,9,312,16,12,12],[20,10,312,16,12,14],[20,11,312,16,14,14],[20,12,312,16,15,15],[20,13,313,16,1,1],[20,14,313,16,1,2],[20,15,313,16,2,3],[20,16,313,16,3,4],[20,17,313,16,4,5],[20,18,313,16,5,6],[20,19,313,16,6,7],[20,20,313,16,7,7],[20,21,313,16,7,8],[20,22,313,16,8,9],[20,23,313,16,9,10],[20,24,313,16,10,10],[20,25,313,16,10,11],[20,26,313,16,11,11],[20,27,313,16,11,12],[20,28,313,16,12,12],[20,29,313,16,12,12],[20,30,313,16,12,13],[20,31,313,16,13,13],[20,32,313,16,13,13],[20,33,313,16,13,14],[20,34,313,16,14,14],[20,35,313,16,14,14],[20,36,313,16,14,15],[20,37,313,16,15,15],[20,38,314,16,1,1],[20,39,314,16,1,3],[20,40,314,16,3,6],[20,41,314,16,7,7],[20,42,314,16,7,8],[20,43,314,16,8,8],[20,44,314,16,8,9],[20,45,314,16,9,10],[20,46,314,16,10,10],[20,47,314,16,11,13],[20,48,314,16,13,14],[20,49,314,16,14,14],[20,50,314,16,14,15],[20,51,314,16,15,15],[20,52,315,16,1,1],[20,53,315,16,2,3],[20,54,315,16,3,4],[20,55,315,16,4,5],[20,56,315,16,5,6],[20,57,315,16,6,7],[20,58,315,16,7,9],[20,59,315,16,9,9],[20,60,315,16,10,10],[20,61,315,16,10,12],[20,62,315,16,12,13],[20,63,315,16,13,14],[20,64,315,16,14,15],[20,65,316,16,1,1],[20,66,316,16,1,2],[20,67,316,16,3,3],[20,68,316,16,3,4],[20,69,316,16,4,5],[20,70,316,16,5,6],[20,71,316,16,6,9],[20,72,316,16,9,11],[20,73,316,16,11,12],[20,74,316,16,12,13],[20,75,316,16,13,14],[20,76,316,16,14,15],[20,77,317,16,1,2],[20,78,317,16,2,3],[20,79,317,16,3,4],[20,80,317,16,4,5],[20,81,317,16,5,7],[20,82,317,16,7,8],[20,83,317,16,8,9],[20,84,317,16,9,10],[20,85,317,16,10,11],[20,86,317,16,11,14],[20,87,317,16,14,15],[20,88,318,16,1,2],[20,89,318,16,2,3],[20,90,318,16,3,5],[20,91,318,16,5,5],[20,92,318,16,6,6],[20,93,318,16,6,7],[20,94,318,16,7,9],[20,95,318,16,9,9],[20,96,318,16,9,11],[20,97,318,16,11,14],[20,98,318,16,14,15],[20,99,319,16,1,2],[20,100,319,16,2,2],[20,101,319,16,3,3],[20,102,319,16,3,4],[20,103,319,16,4,5],[20,104,319,16,5,6],[20,105,319,16,6,7],[20,106,319,16,7,7],[20,107,319,16,8,8],[20,108,319,16,8,9],[20,109,319,16,10,11],[20,110,319,16,11,12],[20,111,319,16,12,13],[20,112,319,16,13,14],[20,113,319,16,14,15],[20,114,320,16,1,2],[20,115,320,16,2,3],[20,116,320,16,3,4],[20,117,320,16,5,6],[20,118,320,16,6,6],[20,119,320,16,7,7],[20,120,320,16,7,9],[20,121,320,16,9,10],[20,122,320,16,11,11],[20,123,320,16,11,13],[20,124,320,16,13,15],[20,125,320,16,15,15],[20,126,321,16,1,1],[20,127,321,16,1,3],[20,128,321,16,3,4],[20,129,321,16,4,5],[20,130,321,16,5,7],[20,131,321,16,7,9],[20,132,321,16,9,10],[20,133,321,16,11,12],[20,134,321,16,12,14],[20,135,321,16,14,15],[21,1,322,17,3,3],[21,2,322,17,4,5],[21,3,322,17,5,7],[21,4,322,17,7,8],[21,5,322,17,8,9],[21,6,322,17,10,10],[21,7,322,17,11,12],[21,8,322,17,12,13],[21,9,322,17,13,14],[21,10,322,17,15,15],[21,11,323,17,1,2],[21,12,323,17,2,2],[21,13,323,17,3,4],[21,14,323,17,4,4],[21,15,323,17,4,5],[21,16,323,17,5,6],[21,17,323,17,6,7],[21,18,323,17,7,8],[21,19,323,17,9,10],[21,20,323,17,10,11],[21,21,323,17,11,11],[21,22,323,17,12,13],[21,23,323,17,13,13],[21,24,323,17,13,15],[21,25,324,17,1,2],[21,26,324,17,2,3],[21,27,324,17,3,4],[21,28,324,17,4,5],[21,29,324,17,6,7],[21,30,324,17,7,9],[21,31,324,17,9,11],[21,32,324,17,11,12],[21,33,324,17,12,13],[21,34,324,17,13,14],[21,35,324,17,14,15],[21,36,325,17,1,3],[21,37,325,17,3,4],[21,38,325,17,4,5],[21,39,325,17,5,7],[21,40,325,17,7,8],[21,41,325,17,8,10],[21,42,325,17,10,11],[21,43,325,17,11,13],[21,44,325,17,13,15],[21,45,326,17,1,2],[21,46,326,17,2,3],[21,47,326,17,3,5],[21,48,326,17,6,7],[21,49,326,17,7,8],[21,50,326,17,8,9],[21,51,326,17,9,10],[21,52,326,17,10,11],[21,53,326,17,11,11],[21,54,326,17,12,12],[21,55,326,17,12,13],[21,56,326,17,13,14],[21,57,326,17,15,15],[21,58,327,17,1,1],[21,59,327,17,2,2],[21,60,327,17,3,3],[21,61,327,17,3,4],[21,62,327,17,4,5],[21,63,327,17,5,6],[21,64,327,17,6,7],[21,65,327,17,7,8],[21,66,327,17,8,10],[21,67,327,17,10,11],[21,68,327,17,11,12],[21,69,327,17,12,12],[21,70,327,17,13,13],[21,71,327,17,13,14],[21,72,327,17,14,15],[21,73,328,17,1,3],[21,74,328,17,3,5],[21,75,328,17,5,5],[21,76,328,17,6,7],[21,77,328,17,7,9],[21,78,328,17,9,10],[21,79,328,17,11,12],[21,80,328,17,13,14],[21,81,328,17,14,15],[21,82,329,17,1,2],[21,83,329,17,2,3],[21,84,329,17,4,5],[21,85,329,17,6,6],[21,86,329,17,7,7],[21,87,329,17,8,10],[21,88,329,17,10,11],[21,89,329,17,11,12],[21,90,329,17,13,15],[21,91,330,17,1,2],[21,92,330,17,2,3],[21,93,330,17,4,4],[21,94,330,17,5,6],[21,95,330,17,6,7],[21,96,330,17,7,8],[21,97,330,17,9,11],[21,98,330,17,11,12],[21,99,330,17,12,13],[21,100,330,17,14,14],[21,101,330,17,14,15],[21,102,331,17,1,2],[21,103,331,17,2,3],[21,104,331,17,4,5],[21,105,331,17,6,7],[21,106,331,17,7,8],[21,107,331,17,8,8],[21,108,331,17,9,10],[21,109,331,17,10,11],[21,110,331,17,12,12],[21,111,331,17,13,13],[21,112,331,17,13,14],[22,1,332,17,2,3],[22,2,332,17,3,5],[22,3,332,17,6,7],[22,4,332,17,7,8],[22,5,332,17,8,15],[22,6,333,17,1,1],[22,7,333,17,2,3],[22,8,333,17,3,4],[22,9,333,17,4,5],[22,10,333,17,5,6],[22,11,333,17,6,9],[22,12,333,17,9,10],[22,13,333,17,10,11],[22,14,333,17,12,13],[22,15,333,17,13,15],[22,16,334,17,1,1],[22,17,334,17,2,4],[22,18,334,17,4,8],[22,19,334,17,8,10],[22,20,334,17,10,11],[22,21,334,17,11,11],[22,22,334,17,11,12],[22,23,334,17,13,15],[22,24,335,17,1,1],[22,25,335,17,2,4],[22,26,335,17,5,7],[22,27,335,17,7,8],[22,28,335,17,8,11],[22,29,335,17,11,12],[22,30,335,17,12,15],[22,31,336,17,1,2],[22,32,336,17,3,3],[22,33,336,17,4,5],[22,34,336,17,5,7],[22,35,336,17,7,9],[22,36,336,17,9,12],[22,37,336,17,12,14],[22,38,336,17,14,15],[22,39,337,17,1,2],[22,40,337,17,2,6],[22,41,337,17,6,8],[22,42,337,17,8,9],[22,43,337,17,9,9],[22,44,337,17,10,11],[22,45,337,17,11,13],[22,46,337,17,13,15],[22,47,338,17,1,2],[22,48,338,17,2,3],[22,49,338,17,4,4],[22,50,338,17,4,5],[22,51,338,17,6,6],[22,52,338,17,7,9],[22,53,338,17,9,11],[22,54,338,17,11,14],[22,55,338,17,14,15],[22,56,339,17,1,2],[22,57,339,17,2,3],[22,58,339,17,4,6],[22,59,339,17,6,7],[22,60,339,17,7,9],[22,61,339,17,9,10],[22,62,339,17,11,12],[22,63,339,17,13,14],[22,64,339,17,14,15],[22,65,340,17,1,3],[22,66,340,17,3,4],[22,67,340,17,5,6],[22,68,340,17,7,7],[22,69,340,17,7,8],[22,70,340,17,9,10],[22,71,340,17,10,12],[22,72,340,17,12,15],[22,73,341,17,1,4],[22,74,341,17,4,5],[22,75,341,17,5,6],[22,76,341,17,6,7],[22,77,341,17,8,9],[22,78,341,17,10,14],[23,1,342,18,2,2],[23,2,342,18,2,2],[23,3,342,18,3,3],[23,4,342,18,3,4],[23,5,342,18,4,4],[23,6,342,18,4,5],[23,7,342,18,6,6],[23,8,342,18,6,7],[23,9,342,18,7,8],[23,10,342,18,8,8],[23,11,342,18,8,9],[23,12,342,18,9,10],[23,13,342,18,10,10],[23,14,342,18,10,13],[23,15,342,18,13,14],[23,16,342,18,14,14],[23,17,342,18,14,15],[23,18,343,18,1,2],[23,19,343,18,2,3],[23,20,343,18,3,4],[23,21,343,18,4,6],[23,22,343,18,6,6],[23,23,343,18,6,8],[23,24,343,18,8,10],[23,25,343,18,10,11],[23,26,343,18,11,12],[23,27,343,18,12,15],[23,28,344,18,1,2],[23,29,344,18,2,3],[23,30,344,18,3,3],[23,31,344,18,3,4],[23,32,344,18,4,5],[23,33,344,18,5,8],[23,34,344,18,8,8],[23,35,344,18,9,9],[23,36,344,18,10,10],[23,37,344,18,10,11],[23,38,344,18,11,12],[23,39,344,18,12,13],[23,40,344,18,13,13],[23,41,344,18,14,15],[23,42,344,18,15,15],[23,43,345,18,1,1],[23,44,345,18,1,3],[23,45,345,18,3,4],[23,46,345,18,4,5],[23,47,345,18,5,6],[23,48,345,18,6,6],[23,49,345,18,7,7],[23,50,345,18,7,8],[23,51,345,18,9,10],[23,52,345,18,10,11],[23,53,345,18,11,12],[23,54,345,18,12,12],[23,55,345,18,12,13],[23,56,345,18,13,13],[23,57,345,18,14,14],[23,58,345,18,14,15],[23,59,345,18,15,15],[23,60,346,18,1,1],[23,61,346,18,2,2],[23,62,346,18,2,3],[23,63,346,18,4,5],[23,64,346,18,5,5],[23,65,346,18,6,6],[23,66,346,18,6,7],[23,67,346,18,7,8],[23,68,346,18,8,9],[23,69,346,18,9,9],[23,70,346,18,10,11],[23,71,346,18,11,13],[23,72,346,18,13,14],[23,73,346,18,14,14],[23,74,346,18,15,15],[23,75,347,18,1,2],[23,76,347,18,2,3],[23,77,347,18,3,4],[23,78,347,18,4,5],[23,79,347,18,5,6],[23,80,347,18,6,7],[23,81,347,18,7,8],[23,82,347,18,8,9],[23,83,347,18,9,10],[23,84,347,18,10,11],[23,85,347,18,11,11],[23,86,347,18,12,12],[23,87,347,18,13,13],[23,88,347,18,13,15],[23,89,347,18,15,15],[23,90,348,18,1,1],[23,91,348,18,1,3],[23,92,348,18,3,4],[23,93,348,18,4,5],[23,94,348,18,5,6],[23,95,348,18,6,6],[23,96,348,18,7,7],[23,97,348,18,8,8],[23,98,348,18,8,9],[23,99,348,18,9,10],[23,100,348,18,10,11],[23,101,348,18,11,12],[23,102,348,18,13,13],[23,103,348,18,13,15],[23,104,348,18,15,15],[23,105,349,18,1,1],[23,106,349,18,1,2],[23,107,349,18,2,3],[23,108,349,18,3,4],[23,109,349,18,4,5],[23,110,349,18,5,6],[23,111,349,18,7,7],[23,112,349,18,7,8],[23,113,349,18,8,9],[23,114,349,18,9,10],[23,115,349,18,10,11],[23,116,349,18,11,12],[23,117,349,18,12,14],[23,118,349,18,14,14],[24,1,350,18,2,2],[24,2,350,18,3,5],[24,3,350,18,5,7],[24,4,350,18,7,9],[24,5,350,18,9,10],[24,6,350,18,10,11],[24,7,350,18,12,12],[24,8,350,18,12,13],[24,9,350,18,14,14],[24,10,350,18,15,15],[24,11,351,18,1,3],[24,12,351,18,3,4],[24,13,351,18,4,6],[24,14,351,18,6,7],[24,15,351,18,8,9],[24,16,351,18,9,10],[24,17,351,18,11,11],[24,18,351,18,12,12],[24,19,351,18,12,14],[24,20,351,18,14,15],[24,21,352,18,1,4],[24,22,352,18,4,7],[24,23,352,18,7,8],[24,24,352,18,9,9],[24,25,352,18,10,11],[24,26,352,18,11,13],[24,27,352,18,13,15],[24,28,353,18,1,3],[24,29,353,18,3,4],[24,30,353,18,5,6],[24,31,353,18,6,15],[24,32,354,18,1,2],[24,33,354,18,3,7],[24,34,354,18,8,9],[24,35,354,18,9,14],[24,36,354,18,14,15],[24,37,355,18,1,2],[24,38,355,18,3,4],[24,39,355,18,4,6],[24,40,355,18,7,9],[24,41,355,18,9,11],[24,42,355,18,11,12],[24,43,355,18,12,15],[24,44,356,18,1,1],[24,45,356,18,2,4],[24,46,356,18,4,5],[24,47,356,18,5,7],[24,48,356,18,7,8],[24,49,356,18,8,9],[24,50,356,18,9,10],[24,51,356,18,11,12],[24,52,356,18,12,13],[24,53,356,18,14,15],[24,54,357,18,1,3],[24,55,357,18,3,7],[24,56,357,18,8,9],[24,57,357,18,9,10],[24,58,357,18,10,15],[24,59,358,18,1,3],[24,60,358,18,3,6],[24,61,358,18,6,15],[24,62,359,18,1,5],[24,63,359,18,5,8],[24,64,359,18,8,10],[25,1,359,18,13,13],[25,2,359,18,14,15],[25,3,360,18,1,3],[25,4,360,18,3,4],[25,5,360,18,5,6],[25,6,360,18,6,7],[25,7,360,18,7,9],[25,8,360,18,9,11],[25,9,360,18,11,13],[25,10,360,18,13,14],[25,11,360,18,14,15],[25,12,361,18,1,1],[25,13,361,18,1,2],[25,14,361,18,3,3],[25,15,361,18,3,5],[25,16,361,18,5,6],[25,17,361,18,6,8],[25,18,361,18,8,10],[25,19,361,18,10,12],[25,20,361,18,13,15],[25,21,362,19,1,2],[25,22,362,19,3,4],[25,23,362,19,4,5],[25,24,362,19,5,6],[25,25,362,19,6,7],[25,26,362,19,7,8],[25,27,362,19,8,9],[25,28,362,19,9,10],[25,29,362,19,10,11],[25,30,362,19,11,12],[25,31,362,19,12,14],[25,32,362,19,14,15],[25,33,363,19,1,1],[25,34,363,19,2,3],[25,35,363,19,3,4],[25,36,363,19,4,5],[25,37,363,19,5,7],[25,38,363,19,7,8],[25,39,363,19,8,9],[25,40,363,19,9,11],[25,41,363,19,11,12],[25,42,363,19,12,14],[25,43,363,19,14,15],[25,44,364,19,1,2],[25,45,364,19,2,3],[25,46,364,19,4,4],[25,47,364,19,4,5],[25,48,364,19,6,7],[25,49,364,19,7,8],[25,50,364,19,8,9],[25,51,364,19,9,10],[25,52,364,19,10,11],[25,53,364,19,11,13],[25,54,364,19,13,14],[25,55,364,19,14,15],[25,56,365,19,1,1],[25,57,365,19,1,2],[25,58,365,19,2,4],[25,59,365,19,4,6],[25,60,365,19,6,7],[25,61,365,19,7,8],[25,62,365,19,8,10],[25,63,365,19,10,11],[25,64,365,19,11,12],[25,65,365,19,12,13],[25,66,365,19,14,14],[25,67,365,19,14,15],[25,68,366,19,1,3],[25,69,366,19,3,4],[25,70,366,19,4,6],[25,71,366,19,6,7],[25,72,366,19,7,8],[25,73,366,19,8,9],[25,74,366,19,9,11],[25,75,366,19,11,12],[25,76,366,19,12,13],[25,77,366,19,13,14],[26,1,367,19,2,2],[26,2,367,19,2,2],[26,3,367,19,2,3],[26,4,367,19,3,4],[26,5,367,19,4,5],[26,6,367,19,5,6],[26,7,367,19,6,7],[26,8,367,19,7,7],[26,9,367,19,7,8],[26,10,367,19,8,9],[26,11,367,19,9,9],[26,12,367,19,9,10],[26,13,367,19,10,11],[26,14,367,19,11,11],[26,15,367,19,11,12],[26,16,367,19,12,13],[26,17,367,19,13,13],[26,18,367,19,14,14],[26,19,367,19,15,15],[26,20,368,19,1,1],[26,21,368,19,1,2],[26,22,368,19,2,3],[26,23,368,19,3,3],[26,24,368,19,4,4],[26,25,368,19,5,5],[26,26,368,19,5,6],[26,27,368,19,6,6],[26,28,368,19,7,7],[26,29,368,19,7,8],[26,30,368,19,8,9],[26,31,368,19,9,10],[26,32,368,19,10,10],[26,33,368,19,10,11],[26,34,368,19,11,12],[26,35,368,19,12,13],[26,36,368,19,13,13],[26,37,368,19,14,14],[26,38,368,19,14,15],[26,39,368,19,15,15],[26,40,369,19,1,1],[26,41,369,19,1,2],[26,42,369,19,2,3],[26,43,369,19,3,3],[26,44,369,19,4,5],[26,45,369,19,5,5],[26,46,369,19,6,6],[26,47,369,19,6,6],[26,48,369,19,7,7],[26,49,369,19,7,9],[26,50,369,19,9,10],[26,51,369,19,10,11],[26,52,369,19,11,12],[26,53,369,19,12,12],[26,54,369,19,12,13],[26,55,369,19,13,13],[26,56,369,19,13,13],[26,57,369,19,14,14],[26,58,369,19,14,14],[26,59,369,19,15,15],[26,60,369,19,15,15],[26,61,370,19,1,1],[26,62,370,19,1,2],[26,63,370,19,2,3],[26,64,370,19,4,4],[26,65,370,19,4,4],[26,66,370,19,5,5],[26,67,370,19,5,6],[26,68,370,19,6,6],[26,69,370,19,6,7],[26,70,370,19,7,7],[26,71,370,19,7,8],[26,72,370,19,8,9],[26,73,370,19,9,9],[26,74,370,19,9,10],[26,75,370,19,10,10],[26,76,370,19,10,11],[26,77,370,19,11,11],[26,78,370,19,12,12],[26,79,370,19,12,12],[26,80,370,19,13,13],[26,81,370,19,13,14],[26,82,370,19,14,14],[26,83,370,19,15,15],[26,84,371,19,1,1],[26,85,371,19,1,2],[26,86,371,19,2,2],[26,87,371,19,2,3],[26,88,371,19,3,3],[26,89,371,19,3,4],[26,90,371,19,4,4],[26,91,371,19,4,4],[26,92,371,19,5,5],[26,93,371,19,5,6],[26,94,371,19,6,6],[26,95,371,19,6,7],[26,96,371,19,7,7],[26,97,371,19,7,8],[26,98,371,19,8,8],[26,99,371,19,8,9],[26,100,371,19,9,9],[26,101,371,19,9,9],[26,102,371,19,10,10],[26,103,371,19,10,11],[26,104,371,19,11,11],[26,105,371,19,11,12],[26,106,371,19,12,12],[26,107,371,19,13,13],[26,108,371,19,13,13],[26,109,371,19,13,14],[26,110,371,19,14,15],[26,111,371,19,15,15],[26,112,372,19,1,1],[26,113,372,19,1,2],[26,114,372,19,2,2],[26,115,372,19,2,2],[26,116,372,19,3,3],[26,117,372,19,3,4],[26,118,372,19,4,5],[26,119,372,19,5,5],[26,120,372,19,6,6],[26,121,372,19,6,7],[26,122,372,19,7,7],[26,123,372,19,7,8],[26,124,372,19,8,8],[26,125,372,19,8,9],[26,126,372,19,9,9],[26,127,372,19,9,10],[26,128,372,19,10,11],[26,129,372,19,11,11],[26,130,372,19,12,12],[26,131,372,19,12,12],[26,132,372,19,13,13],[26,133,372,19,13,13],[26,134,372,19,14,14],[26,135,372,19,14,14],[26,136,372,19,15,15],[26,137,373,19,1,1],[26,138,373,19,1,1],[26,139,373,19,1,2],[26,140,373,19,2,3],[26,141,373,19,3,3],[26,142,373,19,3,4],[26,143,373,19,4,4],[26,144,373,19,5,5],[26,145,373,19,5,6],[26,146,373,19,6,6],[26,147,373,19,7,7],[26,148,373,19,7,7],[26,149,373,19,8,8],[26,150,373,19,8,8],[26,151,373,19,9,9],[26,152,373,19,9,10],[26,153,373,19,10,10],[26,154,373,19,10,11],[26,155,373,19,11,12],[26,156,373,19,12,13],[26,157,373,19,13,14],[26,158,373,19,14,15],[26,159,373,19,15,15],[26,160,374,19,1,1],[26,161,374,19,1,1],[26,162,374,19,2,2],[26,163,374,19,2,2],[26,164,374,19,2,3],[26,165,374,19,4,4],[26,166,374,19,4,5],[26,167,374,19,5,6],[26,168,374,19,6,6],[26,169,374,19,7,7],[26,170,374,19,7,7],[26,171,374,19,8,8],[26,172,374,19,8,8],[26,173,374,19,8,9],[26,174,374,19,9,10],[26,175,374,19,10,10],[26,176,374,19,10,11],[26,177,374,19,11,11],[26,178,374,19,11,12],[26,179,374,19,12,12],[26,180,374,19,12,13],[26,181,374,19,13,14],[26,182,374,19,14,14],[26,183,374,19,15,15],[26,184,375,19,1,1],[26,185,375,19,1,2],[26,186,375,19,2,3],[26,187,375,19,3,4],[26,188,375,19,4,4],[26,189,375,19,4,5],[26,190,375,19,6,6],[26,191,375,19,6,7],[26,192,375,19,7,7],[26,193,375,19,7,8],[26,194,375,19,8,8],[26,195,375,19,8,9],[26,196,375,19,9,9],[26,197,375,19,9,10],[26,198,375,19,10,10],[26,199,375,19,11,11],[26,200,375,19,11,12],[26,201,375,19,12,13],[26,202,375,19,13,13],[26,203,375,19,13,14],[26,204,375,19,14,14],[26,205,375,19,14,15],[26,206,375,19,15,15],[26,207,376,19,1,1],[26,208,376,19,1,2],[26,209,376,19,2,2],[26,210,376,19,2,3],[26,211,376,19,3,3],[26,212,376,19,3,4],[26,213,376,19,4,5],[26,214,376,19,5,5],[26,215,376,19,5,6],[26,216,376,19,6,7],[26,217,376,19,7,7],[26,218,376,19,7,8],[26,219,376,19,8,8],[26,220,376,19,8,9],[26,221,376,19,9,9],[26,222,376,19,9,10],[26,223,376,19,10,10],[26,224,376,19,11,11],[26,225,376,19,11,12],[26,226,376,19,12,12],[26,227,376,19,12,14],[27,1,377,19,2,2],[27,2,377,19,2,3],[27,3,377,19,3,4],[27,4,377,19,4,5],[27,5,377,19,5,6],[27,6,377,19,6,7],[27,7,377,19,7,8],[27,8,377,19,8,10],[27,9,377,19,10,10],[27,10,377,19,10,12],[27,11,377,19,12,13],[27,12,377,19,13,14],[27,13,377,19,15,15],[27,14,378,19,1,2],[27,15,378,19,2,3],[27,16,378,19,4,5],[27,17,378,19,5,6],[27,18,378,19,7,8],[27,19,378,19,9,11],[27,20,378,19,12,13],[27,21,378,19,13,14],[27,22,378,19,14,15],[27,23,379,19,1,2],[27,24,379,19,2,4],[27,25,379,19,4,5],[27,26,379,19,5,6],[27,27,379,19,6,7],[27,28,379,19,7,8],[27,29,379,19,8,9],[27,30,379,19,9,10],[27,31,379,19,10,10],[27,32,379,19,11,12],[27,33,379,19,12,13],[27,34,379,19,13,14],[27,35,379,19,15,15],[27,36,380,19,1,2],[27,37,380,19,2,3],[27,38,380,19,3,4],[27,39,380,19,5,6],[27,40,380,19,6,9],[27,41,380,19,9,10],[27,42,380,19,10,11],[27,43,380,19,12,12],[27,44,380,19,13,15],[27,45,381,19,1,2],[27,46,381,19,2,4],[27,47,381,19,4,5],[27,48,381,19,5,6],[27,49,381,19,6,8],[27,50,381,19,8,9],[27,51,381,19,9,10],[27,52,381,19,11,12],[27,53,381,19,12,13],[27,54,381,19,13,14],[27,55,381,19,14,15],[27,56,382,20,1,2],[27,57,382,20,2,3],[27,58,382,20,3,4],[27,59,382,20,4,5],[27,60,382,20,6,8],[27,61,382,20,9,11],[27,62,382,20,11,13],[27,63,382,20,13,15],[27,64,383,20,1,2],[27,65,383,20,3,4],[27,66,383,20,4,5],[27,67,383,20,5,6],[27,68,383,20,6,7],[27,69,383,20,8,8],[27,70,383,20,9,9],[27,71,383,20,10,10],[27,72,383,20,10,11],[27,73,383,20,11,12],[27,74,383,20,12,13],[27,75,383,20,13,14],[27,76,383,20,14,15],[27,77,384,20,1,1],[27,78,384,20,1,2],[27,79,384,20,2,3],[27,80,384,20,3,4],[27,81,384,20,4,5],[27,82,384,20,5,7],[27,83,384,20,7,8],[27,84,384,20,8,9],[27,85,384,20,10,10],[27,86,384,20,10,12],[27,87,384,20,12,14],[27,88,384,20,14,15],[27,89,385,20,1,1],[27,90,385,20,2,3],[27,91,385,20,3,5],[27,92,385,20,5,6],[27,93,385,20,6,7],[28,1,385,20,10,10],[28,2,385,20,10,10],[28,3,385,20,10,11],[28,4,385,20,11,14],[28,5,385,20,14,15],[28,6,386,20,1,2],[28,7,386,20,2,4],[28,8,386,20,5,6],[28,9,386,20,7,8],[28,10,386,20,8,10],[28,11,386,20,10,11],[28,12,386,20,12,13],[28,13,386,20,14,15],[28,14,387,20,1,2],[28,15,387,20,2,5],[28,16,387,20,6,7],[28,17,387,20,7,8],[28,18,387,20,8,10],[28,19,387,20,10,12],[28,20,387,20,13,14],[28,21,387,20,15,15],[28,22,388,20,1,2],[28,23,388,20,2,5],[28,24,388,20,5,6],[28,25,388,20,6,9],[28,26,388,20,9,10],[28,27,388,20,11,14],[28,28,388,20,14,15],[28,29,389,20,1,3],[28,30,389,20,4,6],[28,31,389,20,6,8],[28,32,389,20,8,11],[28,33,389,20,11,12],[28,34,389,20,12,13],[28,35,389,20,14,15],[28,36,390,20,1,2],[28,37,390,20,2,4],[28,38,390,20,4,7],[28,39,390,20,7,9],[28,40,390,20,9,10],[28,41,390,20,11,12],[28,42,390,20,12,13],[28,43,390,20,13,15],[28,44,391,20,1,2],[28,45,391,20,2,4],[28,46,391,20,4,6],[28,47,391,20,7,9],[28,48,391,20,9,11],[28,49,391,20,12,13],[28,50,391,20,13,15],[28,51,392,20,1,1],[28,52,392,20,1,2],[28,53,392,20,2,3],[28,54,392,20,4,5],[28,55,392,20,5,7],[28,56,392,20,7,8],[28,57,392,20,8,11],[28,58,392,20,11,13],[28,59,392,20,13,15],[28,60,393,20,1,2],[28,61,393,20,2,4],[28,62,393,20,4,5],[28,63,393,20,5,7],[28,64,393,20,7,8],[28,65,393,20,8,9],[28,66,393,20,9,10],[28,67,393,20,10,11],[28,68,393,20,11,13],[28,69,393,20,13,14],[28,70,393,20,14,15],[28,71,394,20,1,2],[28,72,394,20,3,5],[28,73,394,20,5,6],[28,74,394,20,7,8],[28,75,394,20,8,10],[28,76,394,20,10,12],[28,77,394,20,13,15],[28,78,395,20,1,3],[28,79,395,20,3,5],[28,80,395,20,5,7],[28,81,395,20,7,9],[28,82,395,20,9,12],[28,83,395,20,12,13],[28,84,395,20,14,15],[28,85,396,20,1,2],[28,86,396,20,2,4],[28,87,396,20,4,6],[28,88,396,20,6,7],[29,1,396,20,10,10],[29,2,396,20,10,11],[29,3,396,20,11,12],[29,4,396,20,12,13],[29,5,396,20,13,14],[29,6,396,20,14,15],[29,7,397,20,1,2],[29,8,397,20,2,4],[29,9,397,20,5,5],[29,10,397,20,6,8],[29,11,397,20,9,9],[29,12,397,20,10,12],[29,13,397,20,12,13],[29,14,397,20,14,15],[29,15,398,20,1,1],[29,16,398,20,2,3],[29,17,398,20,3,6],[29,18,398,20,6,8],[29,19,398,20,8,9],[29,20,398,20,9,11],[29,21,398,20,11,12],[29,22,398,20,12,14],[29,23,398,20,14,15],[29,24,399,20,1,2],[29,25,399,20,3,6],[29,26,399,20,6,7],[29,27,399,20,7,9],[29,28,399,20,10,11],[29,29,399,20,12,14],[29,30,399,20,15,15],[29,31,400,20,1,2],[29,32,400,20,3,4],[29,33,400,20,4,7],[29,34,400,20,7,8],[29,35,400,20,9,9],[29,36,400,20,10,11],[29,37,400,20,12,13],[29,38,400,20,13,15],[29,39,401,20,1,2],[29,40,401,20,3,6],[29,41,401,20,6,9],[29,42,401,20,9,10],[29,43,401,20,10,11],[29,44,401,20,12,13],[29,45,401,20,13,15],[29,46,402,21,1,3],[29,47,402,21,4,6],[29,48,402,21,6,7],[29,49,402,21,7,9],[29,50,402,21,9,11],[29,51,402,21,11,13],[29,52,402,21,13,15],[29,53,403,21,1,2],[29,54,403,21,2,3],[29,55,403,21,3,4],[29,56,403,21,5,5],[29,57,403,21,6,6],[29,58,403,21,6,8],[29,59,403,21,8,9],[29,60,403,21,9,10],[29,61,403,21,10,12],[29,62,403,21,12,13],[29,63,403,21,13,15],[29,64,404,21,1,2],[29,65,404,21,2,4],[29,66,404,21,4,5],[29,67,404,21,5,6],[29,68,404,21,7,8],[29,69,404,21,8,9],[30,1,404,21,12,12],[30,2,404,21,12,12],[30,3,404,21,12,13],[30,4,404,21,13,14],[30,5,404,21,15,15],[30,6,405,21,1,1],[30,7,405,21,2,2],[30,8,405,21,3,5],[30,9,405,21,5,9],[30,10,405,21,9,10],[30,11,405,21,10,11],[30,12,405,21,11,12],[30,13,405,21,12,13],[30,14,405,21,13,14],[30,15,405,21,14,15],[30,16,406,21,1,2],[30,17,406,21,2,3],[30,18,406,21,3,4],[30,19,406,21,4,5],[30,20,406,21,6,7],[30,21,406,21,7,9],[30,22,406,21,9,11],[30,23,406,21,11,13],[30,24,406,21,13,15],[30,25,407,21,1,2],[30,26,407,21,2,3],[30,27,407,21,3,5],[30,28,407,21,5,8],[30,29,407,21,9,10],[30,30,407,21,10,13],[30,31,407,21,13,14],[30,32,407,21,14,15],[30,33,408,21,1,2],[30,34,408,21,2,3],[30,35,408,21,3,4],[30,36,408,21,4,6],[30,37,408,21,6,7],[30,38,408,21,7,9],[30,39,408,21,9,11],[30,40,408,21,11,14],[30,41,408,21,14,15],[30,42,409,21,1,2],[30,43,409,21,2,3],[30,44,409,21,3,4],[30,45,409,21,5,6],[30,46,409,21,6,8],[30,47,409,21,8,10],[30,48,409,21,10,12],[30,49,409,21,13,13],[30,50,409,21,14,15],[30,51,410,21,1,1],[30,52,410,21,2,3],[30,53,410,21,3,4],[30,54,410,21,4,6],[30,55,410,21,7,8],[30,56,410,21,8,10],[30,57,410,21,10,11],[30,58,410,21,11,13],[30,59,410,21,13,14],[30,60,410,21,14,15],[31,1,411,21,3,3],[31,2,411,21,3,3],[31,3,411,21,3,4],[31,4,411,21,4,5],[31,5,411,21,5,6],[31,6,411,21,6,8],[31,7,411,21,8,9],[31,8,411,21,10,10],[31,9,411,21,11,11],[31,10,411,21,11,14],[31,11,411,21,14,15],[31,12,412,21,1,2],[31,13,412,21,2,4],[31,14,412,21,4,6],[31,15,412,21,6,9],[31,16,412,21,9,11],[31,17,412,21,11,13],[31,18,412,21,13,14],[31,19,412,21,14,15],[31,20,413,21,1,3],[31,21,413,21,3,5],[31,22,413,21,5,7],[31,23,413,21,7,8],[31,24,413,21,9,9],[31,25,413,21,10,11],[31,26,413,21,11,12],[31,27,413,21,12,14],[31,28,413,21,14,15],[31,29,414,21,1,3],[31,30,414,21,3,4],[31,31,414,21,4,6],[31,32,414,21,6,8],[31,33,414,21,9,12],[31,34,414,21,12,14],[32,1,415,21,2,2],[32,2,415,21,2,2],[32,3,415,21,3,4],[32,4,415,21,4,7],[32,5,415,21,7,8],[32,6,415,21,8,9],[32,7,415,21,9,10],[32,8,415,21,10,11],[32,9,415,21,11,13],[32,10,415,21,13,14],[32,11,415,21,14,15],[32,12,416,21,1,2],[32,13,416,21,3,4],[32,14,416,21,5,6],[32,15,416,21,6,8],[32,16,416,21,8,10],[32,17,416,21,10,11],[32,18,416,21,11,12],[32,19,416,21,12,13],[32,20,416,21,13,15],[32,21,417,21,1,2],[32,22,417,21,2,3],[32,23,417,21,3,5],[32,24,417,21,5,6],[32,25,417,21,6,7],[32,26,417,21,8,9],[32,27,417,21,10,11],[32,28,417,21,12,12],[32,29,417,21,13,13],[32,30,417,21,14,14],[33,1,418,21,2,3],[33,2,418,21,3,4],[33,3,418,21,4,5],[33,4,418,21,5,8],[33,5,418,21,8,11],[33,6,418,21,12,15],[33,7,419,21,1,2],[33,8,419,21,3,3],[33,9,419,21,4,6],[33,10,419,21,6,8],[33,11,419,21,8,9],[33,12,419,21,9,10],[33,13,419,21,10,13],[33,14,419,21,13,14],[33,15,419,21,14,15],[33,16,420,21,1,2],[33,17,420,21,2,4],[33,18,420,21,4,5],[33,19,420,21,5,9],[33,20,420,21,9,12],[33,21,420,21,12,13],[33,22,420,21,14,15],[33,23,421,21,1,2],[33,24,421,21,2,4],[33,25,421,21,4,6],[33,26,421,21,6,8],[33,27,421,21,8,10],[33,28,421,21,10,12],[33,29,421,21,12,13],[33,30,421,21,14,15],[33,31,422,22,1,2],[33,32,422,22,2,4],[33,33,422,22,4,8],[33,34,422,22,8,9],[33,35,422,22,10,15],[33,36,423,22,1,3],[33,37,423,22,3,7],[33,38,423,22,8,9],[33,39,423,22,9,11],[33,40,423,22,11,12],[33,41,423,22,13,13],[33,42,423,22,13,14],[33,43,423,22,14,15],[33,44,424,22,1,1],[33,45,424,22,1,2],[33,46,424,22,2,3],[33,47,424,22,3,4],[33,48,424,22,4,5],[33,49,424,22,6,8],[33,50,424,22,8,15],[33,51,425,22,1,4],[33,52,425,22,4,6],[33,53,425,22,7,14],[33,54,425,22,14,15],[33,55,426,22,1,3],[33,56,426,22,4,5],[33,57,426,22,5,7],[33,58,426,22,7,8],[33,59,426,22,9,11],[33,60,426,22,11,13],[33,61,426,22,13,14],[33,62,426,22,14,15],[33,63,427,22,1,2],[33,64,427,22,2,3],[33,65,427,22,3,3],[33,66,427,22,4,5],[33,67,427,22,5,6],[33,68,427,22,6,7],[33,69,427,22,7,8],[33,70,427,22,9,9],[33,71,427,22,9,11],[33,72,427,22,11,13],[33,73,427,22,13,15],[34,1,428,22,3,4],[34,2,428,22,4,6],[34,3,428,22,6,9],[34,4,428,22,9,11],[34,5,428,22,11,12],[34,6,428,22,12,14],[34,7,428,22,14,15],[34,8,429,22,1,2],[34,9,429,22,2,5],[34,10,429,22,5,6],[34,11,429,22,6,8],[34,12,429,22,8,10],[34,13,429,22,11,13],[34,14,429,22,13,15],[34,15,430,22,1,2],[34,16,430,22,3,4],[34,17,430,22,5,5],[34,18,430,22,6,7],[34,19,430,22,8,10],[34,20,430,22,10,11],[34,21,430,22,11,13],[34,22,430,22,13,15],[34,23,431,22,1,2],[34,24,431,22,3,4],[34,25,431,22,4,5],[34,26,431,22,5,6],[34,27,431,22,7,8],[34,28,431,22,8,9],[34,29,431,22,10,10],[34,30,431,22,11,11],[34,31,431,22,12,15],[34,32,432,22,1,2],[34,33,432,22,2,6],[34,34,432,22,6,7],[34,35,432,22,8,8],[34,36,432,22,9,10],[34,37,432,22,10,12],[34,38,432,22,12,13],[34,39,432,22,13,15],[34,40,433,22,1,2],[34,41,433,22,2,3],[34,42,433,22,3,5],[34,43,433,22,5,8],[34,44,433,22,8,9],[34,45,433,22,9,11],[34,46,433,22,11,13],[34,47,433,22,14,15],[34,48,433,22,15,15],[34,49,434,22,1,1],[34,50,434,22,1,3],[34,51,434,22,3,4],[34,52,434,22,4,5],[34,53,434,22,5,6],[34,54,434,22,6,7],[35,1,434,22,10,12],[35,2,434,22,12,13],[35,3,434,22,13,15],[35,4,435,22,1,1],[35,5,435,22,2,3],[35,6,435,22,3,4],[35,7,435,22,4,6],[35,8,435,22,6,8],[35,9,435,22,8,10],[35,10,435,22,10,12],[35,11,435,22,13,15],[35,12,436,22,1,4],[35,13,436,22,4,7],[35,14,436,22,7,9],[35,15,436,22,10,11],[35,16,436,22,11,11],[35,17,436,22,12,12],[35,18,436,22,12,15],[35,19,437,22,1,1],[35,20,437,22,1,1],[35,21,437,22,2,2],[35,22,437,22,2,3],[35,23,437,22,3,4],[35,24,437,22,4,5],[35,25,437,22,5,7],[35,26,437,22,7,7],[35,27,437,22,8,10],[35,28,437,22,10,12],[35,29,437,22,12,14],[35,30,437,22,14,15],[35,31,438,22,1,2],[35,32,438,22,2,5],[35,33,438,22,5,6],[35,34,438,22,7,8],[35,35,438,22,8,9],[35,36,438,22,9,11],[35,37,438,22,11,14],[35,38,438,22,14,15],[35,39,439,22,1,3],[35,40,439,22,3,6],[35,41,439,22,6,8],[35,42,439,22,8,10],[35,43,439,22,10,12],[35,44,439,22,13,15],[35,45,440,22,1,3],[36,1,440,22,6,6],[36,2,440,22,6,6],[36,3,440,22,6,6],[36,4,440,22,6,7],[36,5,440,22,7,7],[36,6,440,22,7,8],[36,7,440,22,8,9],[36,8,440,22,9,10],[36,9,440,22,10,11],[36,10,440,22,11,12],[36,11,440,22,12,14],[36,12,440,22,14,15],[36,13,441,22,1,1],[36,14,441,22,2,3],[36,15,441,22,3,4],[36,16,441,22,4,5],[36,17,441,22,5,5],[36,18,441,22,6,7],[36,19,441,22,7,8],[36,20,441,22,8,9],[36,21,441,22,9,10],[36,22,441,22,10,11],[36,23,441,22,11,13],[36,24,441,22,13,13],[36,25,441,22,13,14],[36,26,441,22,14,15],[36,27,441,22,15,15],[36,28,442,23,1,2],[36,29,442,23,2,2],[36,30,442,23,3,4],[36,31,442,23,4,5],[36,32,442,23,5,5],[36,33,442,23,6,7],[36,34,442,23,7,8],[36,35,442,23,8,9],[36,36,442,23,9,11],[36,37,442,23,11,12],[36,38,442,23,12,13],[36,39,442,23,13,14],[36,40,442,23,14,15],[36,41,443,23,1,1],[36,42,443,23,1,2],[36,43,443,23,2,3],[36,44,443,23,3,3],[36,45,443,23,3,4],[36,46,443,23,5,5],[36,47,443,23,6,8],[36,48,443,23,8,8],[36,49,443,23,9,9],[36,50,443,23,10,10],[36,51,443,23,11,11],[36,52,443,23,12,13],[36,53,443,23,13,14],[36,54,443,23,14,15],[36,55,444,23,1,1],[36,56,444,23,1,2],[36,57,444,23,2,3],[36,58,444,23,3,3],[36,59,444,23,3,4],[36,60,444,23,4,5],[36,61,444,23,5,6],[36,62,444,23,6,7],[36,63,444,23,7,7],[36,64,444,23,8,8],[36,65,444,23,8,10],[36,66,444,23,10,11],[36,67,444,23,11,12],[36,68,444,23,13,13],[36,69,444,23,14,14],[36,70,444,23,15,15],[36,71,445,23,1,2],[36,72,445,23,2,2],[36,73,445,23,3,3],[36,74,445,23,3,4],[36,75,445,23,4,5],[36,76,445,23,5,6],[36,77,445,23,6,7],[36,78,445,23,7,8],[36,79,445,23,9,9],[36,80,445,23,10,11],[36,81,445,23,11,12],[36,82,445,23,13,13],[36,83,445,23,14,14],[37,1,446,23,2,2],[37,2,446,23,2,2],[37,3,446,23,2,2],[37,4,446,23,3,3],[37,5,446,23,3,4],[37,6,446,23,4,4],[37,7,446,23,4,5],[37,8,446,23,5,6],[37,9,446,23,6,6],[37,10,446,23,6,7],[37,11,446,23,7,8],[37,12,446,23,8,9],[37,13,446,23,9,9],[37,14,446,23,9,9],[37,15,446,23,10,10],[37,16,446,23,10,11],[37,17,446,23,11,11],[37,18,446,23,11,11],[37,19,446,23,12,12],[37,20,446,23,12,13],[37,21,446,23,13,13],[37,22,446,23,14,14],[37,23,446,23,14,15],[37,24,446,23,15,15],[37,25,447,23,1,1],[37,26,447,23,1,1],[37,27,447,23,1,2],[37,28,447,23,2,2],[37,29,447,23,3,3],[37,30,447,23,3,4],[37,31,447,23,4,4],[37,32,447,23,5,5],[37,33,447,23,5,5],[37,34,447,23,6,6],[37,35,447,23,6,7],[37,36,447,23,7,8],[37,37,447,23,8,8],[37,38,447,23,8,9],[37,39,447,23,9,9],[37,40,447,23,10,10],[37,41,447,23,10,10],[37,42,447,23,11,11],[37,43,447,23,11,11],[37,44,447,23,11,11],[37,45,447,23,12,12],[37,46,447,23,12,12],[37,47,447,23,13,13],[37,48,447,23,13,14],[37,49,447,23,14,14],[37,50,447,23,14,15],[37,51,447,23,15,15],[37,52,448,23,1,1],[37,53,448,23,1,2],[37,54,448,23,2,2],[37,55,448,23,2,3],[37,56,448,23,3,3],[37,57,448,23,3,4],[37,58,448,23,4,4],[37,59,448,23,4,5],[37,60,448,23,5,5],[37,61,448,23,6,6],[37,62,448,23,6,7],[37,63,448,23,7,7],[37,64,448,23,7,8],[37,65,448,23,8,8],[37,66,448,23,9,9],[37,67,448,23,9,10],[37,68,448,23,10,10],[37,69,448,23,11,11],[37,70,448,23,11,11],[37,71,448,23,12,12],[37,72,448,23,12,13],[37,73,448,23,13,13],[37,74,448,23,14,14],[37,75,448,23,14,15],[37,76,448,23,15,15],[37,77,449,23,1,1],[37,78,449,23,1,1],[37,79,449,23,1,2],[37,80,449,23,2,2],[37,81,449,23,2,3],[37,82,449,23,3,3],[37,83,449,23,3,4],[37,84,449,23,4,4],[37,85,449,23,4,5],[37,86,449,23,5,5],[37,87,449,23,6,6],[37,88,449,23,6,6],[37,89,449,23,7,7],[37,90,449,23,7,7],[37,91,449,23,7,8],[37,92,449,23,8,8],[37,93,449,23,8,9],[37,94,449,23,9,9],[37,95,449,23,9,9],[37,96,449,23,10,10],[37,97,449,23,10,11],[37,98,449,23,11,11],[37,99,449,23,12,12],[37,100,449,23,12,12],[37,101,449,23,13,13],[37,102,449,23,13,15],[37,103,450,23,1,1],[37,104,450,23,1,1],[37,105,450,23,1,2],[37,106,450,23,2,3],[37,107,450,23,3,3],[37,108,450,23,3,4],[37,109,450,23,4,4],[37,110,450,23,4,4],[37,111,450,23,5,5],[37,112,450,23,5,6],[37,113,450,23,6,7],[37,114,450,23,7,8],[37,115,450,23,8,8],[37,116,450,23,9,9],[37,117,450,23,9,10],[37,118,450,23,10,10],[37,119,450,23,10,11],[37,120,450,23,11,11],[37,121,450,23,12,12],[37,122,450,23,12,13],[37,123,450,23,13,13],[37,124,450,23,14,14],[37,125,450,23,14,15],[37,126,450,23,15,15],[37,127,451,23,1,1],[37,128,451,23,1,1],[37,129,451,23,2,2],[37,130,451,23,2,2],[37,131,451,23,2,3],[37,132,451,23,3,3],[37,133,451,23,3,4],[37,134,451,23,4,4],[37,135,451,23,4,5],[37,136,451,23,5,5],[37,137,451,23,5,6],[37,138,451,23,6,6],[37,139,451,23,6,7],[37,140,451,23,7,7],[37,141,451,23,7,8],[37,142,451,23,8,8],[37,143,451,23,8,9],[37,144,451,23,9,9],[37,145,451,23,10,10],[37,146,451,23,10,11],[37,147,451,23,11,11],[37,148,451,23,12,12],[37,149,451,23,12,13],[37,150,451,23,13,14],[37,151,451,23,14,14],[37,152,451,23,14,15],[37,153,451,23,15,15],[37,154,452,23,1,1],[37,155,452,23,1,1],[37,156,452,23,1,1],[37,157,452,23,2,2],[37,158,452,23,2,3],[37,159,452,23,3,4],[37,160,452,23,4,4],[37,161,452,23,4,4],[37,162,452,23,5,5],[37,163,452,23,5,5],[37,164,452,23,5,6],[37,165,452,23,6,6],[37,166,452,23,6,6],[37,167,452,23,7,7],[37,168,452,23,7,7],[37,169,452,23,7,8],[37,170,452,23,8,8],[37,171,452,23,8,9],[37,172,452,23,9,9],[37,173,452,23,9,10],[37,174,452,23,10,10],[37,175,452,23,10,11],[37,176,452,23,11,11],[37,177,452,23,11,12],[37,178,452,23,12,12],[37,179,452,23,12,13],[37,180,452,23,13,13],[37,181,452,23,14,14],[37,182,452,23,14,14],[38,1,453,23,2,2],[38,2,453,23,2,2],[38,3,453,23,3,3],[38,4,453,23,3,4],[38,5,453,23,5,5],[38,6,453,23,5,6],[38,7,453,23,7,7],[38,8,453,23,7,8],[38,9,453,23,9,9],[38,10,453,23,9,10],[38,11,453,23,11,11],[38,12,453,23,11,12],[38,13,453,23,12,13],[38,14,453,23,13,14],[38,15,453,23,14,15],[38,16,453,23,15,15],[38,17,454,23,1,1],[38,18,454,23,2,2],[38,19,454,23,2,3],[38,20,454,23,3,4],[38,21,454,23,4,5],[38,22,454,23,5,7],[38,23,454,23,7,8],[38,24,454,23,8,11],[38,25,454,23,12,12],[38,26,454,23,13,15],[38,27,455,23,1,2],[38,28,455,23,2,3],[38,29,455,23,4,5],[38,30,455,23,5,5],[38,31,455,23,6,6],[38,32,455,23,6,7],[38,33,455,23,8,8],[38,34,455,23,8,9],[38,35,455,23,9,10],[38,36,455,23,11,11],[38,37,455,23,11,12],[38,38,455,23,12,12],[38,39,455,23,12,13],[38,40,455,23,13,14],[38,41,455,23,14,15],[38,42,455,23,15,15],[38,43,456,23,1,1],[38,44,456,23,2,3],[38,45,456,23,3,4],[38,46,456,23,4,5],[38,47,456,23,5,5],[38,48,456,23,5,6],[38,49,456,23,6,7],[38,50,456,23,7,7],[38,51,456,23,8,8],[38,52,456,23,9,9],[38,53,456,23,9,10],[38,54,456,23,10,10],[38,55,456,23,10,11],[38,56,456,23,11,11],[38,57,456,23,11,12],[38,58,456,23,12,12],[38,59,456,23,13,13],[38,60,456,23,14,14],[38,61,456,23,15,15],[38,62,457,23,1,1],[38,63,457,23,1,2],[38,64,457,23,2,3],[38,65,457,23,3,3],[38,66,457,23,4,4],[38,67,457,23,4,5],[38,68,457,23,5,5],[38,69,457,23,5,6],[38,70,457,23,6,6],[38,71,457,23,6,7],[38,72,457,23,7,8],[38,73,457,23,8,9],[38,74,457,23,9,9],[38,75,457,23,9,11],[38,76,457,23,11,11],[38,77,457,23,12,12],[38,78,457,23,12,13],[38,79,457,23,13,13],[38,80,457,23,13,14],[38,81,457,23,14,14],[38,82,457,23,14,15],[38,83,457,23,15,15],[38,84,458,23,1,1],[38,85,458,23,1,2],[38,86,458,23,2,2],[38,87,458,23,3,3],[38,88,458,23,3,3],[39,1,458,23,6,6],[39,2,458,23,6,7],[39,3,458,23,7,11],[39,4,458,23,11,12],[39,5,458,23,13,15],[39,6,459,23,1,4],[39,7,459,23,4,7],[39,8,459,23,8,11],[39,9,459,23,11,13],[39,10,459,23,13,15],[39,11,460,23,1,1],[39,12,460,23,1,2],[39,13,460,23,2,2],[39,14,460,23,3,3],[39,15,460,23,3,5],[39,16,460,23,5,6],[39,17,460,23,7,8],[39,18,460,23,8,9],[39,19,460,23,10,10],[39,20,460,23,11,12],[39,21,460,23,12,15],[39,22,461,23,1,2],[39,23,461,23,3,6],[39,24,461,23,6,7],[39,25,461,23,8,9],[39,26,461,23,9,10],[39,27,461,23,10,11],[39,28,461,23,11,12],[39,29,461,23,12,14],[39,30,461,23,14,14],[39,31,461,23,15,15],[39,32,462,24,1,2],[39,33,462,24,2,3],[39,34,462,24,4,4],[39,35,462,24,5,6],[39,36,462,24,6,8],[39,37,462,24,8,9],[39,38,462,24,9,13],[39,39,462,24,13,14],[39,40,462,24,15,15],[39,41,463,24,1,3],[39,42,463,24,3,6],[39,43,463,24,6,7],[39,44,463,24,8,9],[39,45,463,24,9,11],[39,46,463,24,11,13],[39,47,463,24,13,15],[39,48,464,24,1,2],[39,49,464,24,2,4],[39,50,464,24,4,5],[39,51,464,24,5,7],[39,52,464,24,7,8],[39,53,464,24,9,10],[39,54,464,24,11,12],[39,55,464,24,12,14],[39,56,464,24,14,15],[39,57,465,24,1,1],[39,58,465,24,2,3],[39,59,465,24,3,4],[39,60,465,24,4,6],[39,61,465,24,6,7],[39,62,465,24,7,8],[39,63,465,24,8,10],[39,64,465,24,10,11],[39,65,465,24,11,12],[39,66,465,24,12,13],[39,67,465,24,13,15],[39,68,466,24,1,2],[39,69,466,24,3,4],[39,70,466,24,5,5],[39,71,466,24,6,9],[39,72,466,24,10,11],[39,73,466,24,11,13],[39,74,466,24,14,15],[39,75,467,24,1,2],[40,1,467,24,5,5],[40,2,467,24,5,5],[40,3,467,24,5,7],[40,4,467,24,7,8],[40,5,467,24,8,11],[40,6,467,24,11,12],[40,7,467,24,12,15],[40,8,468,24,1,3],[40,9,468,24,3,4],[40,10,468,24,4,6],[40,11,468,24,7,8],[40,12,468,24,8,10],[40,13,468,24,10,11],[40,14,468,24,12,12],[40,15,468,24,13,14],[40,16,468,24,14,15],[40,17,469,24,1,2],[40,18,469,24,2,4],[40,19,469,24,4,4],[40,20,469,24,5,6],[40,21,469,24,6,9],[40,22,469,24,9,11],[40,23,469,24,11,12],[40,24,469,24,12,13],[40,25,469,24,13,15],[40,26,470,24,1,2],[40,27,470,24,3,4],[40,28,470,24,4,8],[40,29,470,24,8,11],[40,30,470,24,11,12],[40,31,470,24,12,13],[40,32,470,24,14,14],[40,33,470,24,14,15],[40,34,471,24,1,4],[40,35,471,24,4,6],[40,36,471,24,6,7],[40,37,471,24,7,10],[40,38,471,24,10,11],[40,39,471,24,12,13],[40,40,471,24,13,15],[40,41,472,24,1,2],[40,42,472,24,2,3],[40,43,472,24,3,5],[40,44,472,24,6,7],[40,45,472,24,7,8],[40,46,472,24,8,10],[40,47,472,24,10,12],[40,48,472,24,13,14],[40,49,472,24,14,15],[40,50,473,24,1,2],[40,51,473,24,3,4],[40,52,473,24,4,5],[40,53,473,24,5,6],[40,54,473,24,6,7],[40,55,473,24,7,9],[40,56,473,24,9,12],[40,57,473,24,12,13],[40,58,473,24,14,15],[40,59,474,24,1,2],[40,60,474,24,2,4],[40,61,474,24,4,6],[40,62,474,24,6,7],[40,63,474,24,8,8],[40,64,474,24,9,12],[40,65,474,24,12,13],[40,66,474,24,13,15],[40,67,475,24,1,4],[40,68,475,24,4,5],[40,69,475,24,5,6],[40,70,475,24,6,7],[40,71,475,24,8,8],[40,72,475,24,9,9],[40,73,475,24,9,10],[40,74,475,24,10,11],[40,75,475,24,12,13],[40,76,475,24,13,14],[40,77,475,24,14,15],[40,78,476,24,1,4],[40,79,476,24,4,5],[40,80,476,24,5,7],[40,81,476,24,7,8],[40,82,476,24,8,10],[40,83,476,24,11,12],[40,84,476,24,12,14],[40,85,476,24,14,15],[41,1,477,24,3,3],[41,2,477,24,3,3],[41,3,477,24,3,4],[41,4,477,24,4,5],[41,5,477,24,5,7],[41,6,477,24,7,9],[41,7,477,24,9,10],[41,8,477,24,10,11],[41,9,477,24,11,12],[41,10,477,24,13,14],[41,11,477,24,14,15],[41,12,478,24,1,3],[41,13,478,24,3,4],[41,14,478,24,4,6],[41,15,478,24,6,8],[41,16,478,24,9,11],[41,17,478,24,11,12],[41,18,478,24,13,13],[41,19,478,24,13,14],[41,20,478,24,14,15],[41,21,479,24,1,2],[41,22,479,24,3,4],[41,23,479,24,5,6],[41,24,479,24,6,7],[41,25,479,24,7,10],[41,26,479,24,10,11],[41,27,479,24,11,12],[41,28,479,24,12,13],[41,29,479,24,14,15],[41,30,480,24,1,3],[41,31,480,24,3,5],[41,32,480,24,5,5],[41,33,480,24,6,7],[41,34,480,24,7,9],[41,35,480,24,9,10],[41,36,480,24,10,11],[41,37,480,24,11,14],[41,38,480,24,14,15],[41,39,481,24,1,3],[41,40,481,24,3,5],[41,41,481,24,5,6],[41,42,481,24,6,7],[41,43,481,24,7,8],[41,44,481,24,9,12],[41,45,481,24,12,14],[41,46,481,24,14,15],[41,47,482,25,1,3],[41,48,482,25,3,4],[41,49,482,25,5,6],[41,50,482,25,6,9],[41,51,482,25,9,10],[41,52,482,25,11,12],[41,53,482,25,12,14],[41,54,482,25,14,15],[42,1,483,25,3,3],[42,2,483,25,3,3],[42,3,483,25,3,4],[42,4,483,25,4,5],[42,5,483,25,5,7],[42,6,483,25,7,8],[42,7,483,25,9,11],[42,8,483,25,11,12],[42,9,483,25,13,14],[42,10,483,25,14,15],[42,11,484,25,1,3],[42,12,484,25,3,4],[42,13,484,25,5,8],[42,14,484,25,8,11],[42,15,484,25,12,15],[42,16,485,25,1,2],[42,17,485,25,3,4],[42,18,485,25,4,6],[42,19,485,25,7,7],[42,20,485,25,8,10],[42,21,485,25,10,12],[42,22,485,25,12,15],[42,23,486,25,1,3],[42,24,486,25,3,5],[42,25,486,25,5,6],[42,26,486,25,7,8],[42,27,486,25,8,10],[42,28,486,25,10,11],[42,29,486,25,11,13],[42,30,486,25,13,14],[42,31,486,25,14,15],[42,32,487,25,1,1],[42,33,487,25,1,2],[42,34,487,25,3,3],[42,35,487,25,3,4],[42,36,487,25,4,6],[42,37,487,25,6,7],[42,38,487,25,7,8],[42,39,487,25,8,9],[42,40,487,25,9,10],[42,41,487,25,10,11],[42,42,487,25,11,13],[42,43,487,25,13,13],[42,44,487,25,14,15],[42,45,488,25,1,4],[42,46,488,25,4,5],[42,47,488,25,5,7],[42,48,488,25,7,10],[42,49,488,25,10,12],[42,50,488,25,12,13],[42,51,488,25,13,15],[42,52,489,25,1,3],[42,53,489,25,3,4],[43,1,489,25,7,7],[43,2,489,25,7,7],[43,3,489,25,7,8],[43,4,489,25,8,9],[43,5,489,25,9,10],[43,6,489,25,10,11],[43,7,489,25,11,11],[43,8,489,25,12,12],[43,9,489,25,13,14],[43,10,489,25,14,15],[43,11,490,25,1,2],[43,12,490,25,2,3],[43,13,490,25,3,5],[43,14,490,25,5,6],[43,15,490,25,6,7],[43,16,490,25,7,8],[43,17,490,25,8,9],[43,18,490,25,9,10],[43,19,490,25,10,12],[43,20,490,25,12,13],[43,21,490,25,13,14],[43,22,490,25,14,15],[43,23,491,25,1,2],[43,24,491,25,3,4],[43,25,491,25,4,5],[43,26,491,25,5,6],[43,27,491,25,6,6],[43,28,491,25,7,7],[43,29,491,25,7,8],[43,30,491,25,9,9],[43,31,491,25,9,10],[43,32,491,25,10,13],[43,33,491,25,13,15],[43,34,492,25,1,1],[43,35,492,25,1,3],[43,36,492,25,3,4],[43,37,492,25,4,5],[43,38,492,25,5,6],[43,39,492,25,6,7],[43,40,492,25,7,8],[43,41,492,25,9,9],[43,42,492,25,9,10],[43,43,492,25,10,11],[43,44,492,25,11,12],[43,45,492,25,12,13],[43,46,492,25,13,15],[43,47,492,25,15,15],[43,48,493,25,1,2],[43,49,493,25,2,3],[43,50,493,25,3,4],[43,51,493,25,4,6],[43,52,493,25,6,7],[43,53,493,25,7,8],[43,54,493,25,8,9],[43,55,493,25,9,10],[43,56,493,25,10,11],[43,57,493,25,11,12],[43,58,493,25,12,13],[43,59,493,25,14,14],[43,60,493,25,15,15],[43,61,494,25,1,2],[43,62,494,25,2,2],[43,63,494,25,3,4],[43,64,494,25,5,5],[43,65,494,25,6,7],[43,66,494,25,7,8],[43,67,494,25,8,9],[43,68,494,25,9,10],[43,69,494,25,10,11],[43,70,494,25,11,12],[43,71,494,25,12,14],[43,72,494,25,14,15],[43,73,494,25,15,15],[43,74,495,25,1,1],[43,75,495,25,1,2],[43,76,495,25,2,2],[43,77,495,25,3,3],[43,78,495,25,3,4],[43,79,495,25,4,5],[43,80,495,25,5,6],[43,81,495,25,6,7],[43,82,495,25,7,8],[43,83,495,25,8,9],[43,84,495,25,9,10],[43,85,495,25,10,11],[43,86,495,25,12,13],[43,87,495,25,13,14],[43,88,495,25,14,15],[43,89,495,25,15,15],[44,1,496,25,3,3],[44,2,496,25,3,3],[44,3,496,25,3,4],[44,4,496,25,4,4],[44,5,496,25,5,5],[44,6,496,25,5,6],[44,7,496,25,6,7],[44,8,496,25,7,8],[44,9,496,25,8,8],[44,10,496,25,9,9],[44,11,496,25,9,10],[44,12,496,25,10,11],[44,13,496,25,11,11],[44,14,496,25,12,12],[44,15,496,25,12,13],[44,16,496,25,13,13],[44,17,496,25,14,15],[44,18,496,25,15,15],[44,19,497,25,1,1],[44,20,497,25,1,2],[44,21,497,25,2,2],[44,22,497,25,2,3],[44,23,497,25,3,4],[44,24,497,25,4,4],[44,25,497,25,4,5],[44,26,497,25,5,5],[44,27,497,25,5,6],[44,28,497,25,6,6],[44,29,497,25,7,7],[44,30,497,25,7,8],[44,31,497,25,8,9],[44,32,497,25,9,10],[44,33,497,25,10,10],[44,34,497,25,11,11],[44,35,497,25,11,12],[44,36,497,25,12,12],[44,37,497,25,12,13],[44,38,497,25,14,14],[44,39,497,25,15,15],[44,40,498,25,1,1],[44,41,498,25,1,2],[44,42,498,25,2,3],[44,43,498,25,3,3],[44,44,498,25,4,4],[44,45,498,25,4,4],[44,46,498,25,4,5],[44,47,498,25,5,5],[44,48,498,25,5,6],[44,49,498,25,6,7],[44,50,498,25,7,7],[44,51,498,25,8,8],[44,52,498,25,8,8],[44,53,498,25,9,9],[44,54,498,25,10,10],[44,55,498,25,10,11],[44,56,498,25,11,12],[44,57,498,25,12,13],[44,58,498,25,13,14],[44,59,498,25,14,14],[45,1,499,25,2,2],[45,2,499,25,2,2],[45,3,499,25,2,3],[45,4,499,25,3,4],[45,5,499,25,4,6],[45,6,499,25,6,7],[45,7,499,25,7,7],[45,8,499,25,7,8],[45,9,499,25,9,10],[45,10,499,25,10,11],[45,11,499,25,11,12],[45,12,499,25,13,14],[45,13,499,25,14,15],[45,14,500,25,1,2],[45,15,500,25,2,3],[45,16,500,25,3,5],[45,17,500,25,5,7],[45,18,500,25,8,9],[45,19,500,25,9,10],[45,20,500,25,11,11],[45,21,500,25,12,14],[45,22,500,25,14,15],[45,23,501,25,1,3],[45,24,501,25,3,4],[45,25,501,25,4,6],[45,26,501,25,6,7],[45,27,501,25,7,8],[45,28,501,25,9,10],[45,29,501,25,10,11],[45,30,501,25,11,12],[45,31,501,25,12,14],[45,32,501,25,14,15],[45,33,502,25,1,1],[45,34,502,25,2,3],[45,35,502,25,3,4],[45,36,502,25,5,5],[45,37,502,25,5,6],[46,1,502,26,9,9],[46,2,502,26,9,9],[46,3,502,26,9,11],[46,4,502,26,11,14],[46,5,502,26,14,15],[46,6,503,26,1,1],[46,7,503,26,1,3],[46,8,503,26,3,5],[46,9,503,26,5,7],[46,10,503,26,7,9],[46,11,503,26,9,11],[46,12,503,26,11,13],[46,13,503,26,13,14],[46,14,503,26,15,15],[46,15,504,26,1,5],[46,16,504,26,5,7],[46,17,504,26,7,10],[46,18,504,26,10,12],[46,19,504,26,12,13],[46,20,504,26,13,15],[46,21,505,26,1,3],[46,22,505,26,3,4],[46,23,505,26,4,5],[46,24,505,26,6,7],[46,25,505,26,7,9],[46,26,505,26,9,12],[46,27,505,26,12,13],[46,28,505,26,14,15],[46,29,506,26,1,2],[46,30,506,26,3,4],[46,31,506,26,5,6],[46,32,506,26,6,8],[46,33,506,26,8,10],[46,34,506,26,10,12],[46,35,506,26,12,14],[47,1,507,26,2,2],[47,2,507,26,2,4],[47,3,507,26,4,6],[47,4,507,26,6,9],[47,5,507,26,9,10],[47,6,507,26,10,10],[47,7,507,26,10,11],[47,8,507,26,11,12],[47,9,507,26,12,13],[47,10,507,26,13,14],[47,11,507,26,15,15],[47,12,508,26,1,3],[47,13,508,26,3,4],[47,14,508,26,4,5],[47,15,508,26,5,9],[47,16,508,26,9,11],[47,17,508,26,11,12],[47,18,508,26,12,14],[47,19,508,26,14,15],[47,20,509,26,1,3],[47,21,509,26,4,5],[47,22,509,26,5,6],[47,23,509,26,6,7],[47,24,509,26,7,8],[47,25,509,26,8,10],[47,26,509,26,10,11],[47,27,509,26,12,13],[47,28,509,26,13,14],[47,29,509,26,14,15],[47,30,510,26,1,2],[47,31,510,26,2,3],[47,32,510,26,3,5],[47,33,510,26,6,7],[47,34,510,26,7,8],[47,35,510,26,8,9],[47,36,510,26,9,11],[47,37,510,26,11,12],[47,38,510,26,12,15],[48,1,511,26,3,3],[48,2,511,26,3,4],[48,3,511,26,5,5],[48,4,511,26,5,7],[48,5,511,26,7,9],[48,6,511,26,9,12],[48,7,511,26,12,13],[48,8,511,26,13,14],[48,9,511,26,14,15],[48,10,512,26,1,3],[48,11,512,26,3,7],[48,12,512,26,7,9],[48,13,512,26,9,10],[48,14,512,26,10,12],[48,15,512,26,12,15],[48,16,513,26,1,3],[48,17,513,26,3,6],[48,18,513,26,6,8],[48,19,513,26,8,9],[48,20,513,26,9,12],[48,21,513,26,12,13],[48,22,513,26,13,14],[48,23,513,26,14,15],[48,24,514,26,1,2],[48,25,514,26,2,7],[48,26,514,26,7,10],[48,27,514,26,11,14],[48,28,514,26,14,15],[48,29,515,26,1,6],[49,1,515,26,9,10],[49,2,515,26,10,12],[49,3,515,26,12,14],[49,4,515,26,14,15],[49,5,516,26,1,2],[49,6,516,26,2,3],[49,7,516,26,4,6],[49,8,516,26,7,7],[49,9,516,26,7,10],[49,10,516,26,11,12],[49,11,516,26,12,15],[49,12,517,26,1,4],[49,13,517,26,4,6],[49,14,517,26,6,8],[49,15,517,26,9,11],[49,16,517,26,11,12],[49,17,517,26,13,14],[49,18,517,26,14,15],[50,1,518,26,3,3],[50,2,518,26,3,4],[50,3,518,26,4,5],[50,4,518,26,5,6],[50,5,518,26,6,6],[50,6,518,26,7,8],[50,7,518,26,8,9],[50,8,518,26,9,10],[50,9,518,26,10,11],[50,10,518,26,11,11],[50,11,518,26,12,12],[50,12,518,26,12,13],[50,13,518,26,13,14],[50,14,518,26,14,14],[50,15,518,26,15,15],[50,16,519,26,1,2],[50,17,519,26,2,2],[50,18,519,26,3,3],[50,19,519,26,3,4],[50,20,519,26,4,5],[50,21,519,26,5,5],[50,22,519,26,5,6],[50,23,519,26,7,7],[50,24,519,26,7,8],[50,25,519,26,8,8],[50,26,519,26,8,9],[50,27,519,26,9,10],[50,28,519,26,10,11],[50,29,519,26,11,11],[50,30,519,26,12,12],[50,31,519,26,12,13],[50,32,519,26,13,13],[50,33,519,26,14,14],[50,34,519,26,14,15],[50,35,519,26,15,15],[50,36,520,26,1,2],[50,37,520,26,2,3],[50,38,520,26,3,5],[50,39,520,26,5,6],[50,40,520,26,6,7],[50,41,520,26,7,7],[50,42,520,26,8,8],[50,43,520,26,8,9],[50,44,520,26,9,10],[50,45,520,26,10,11],[51,1,520,26,14,14],[51,2,520,26,14,14],[51,3,520,26,14,14],[51,4,520,26,15,15],[51,5,520,26,15,15],[51,6,520,26,15,15],[51,7,521,26,1,1],[51,8,521,26,1,1],[51,9,521,26,1,2],[51,10,521,26,2,2],[51,11,521,26,2,2],[51,12,521,26,3,3],[51,13,521,26,3,3],[51,14,521,26,3,4],[51,15,521,26,4,5],[51,16,521,26,5,5],[51,17,521,26,6,6],[51,18,521,26,6,6],[51,19,521,26,7,7],[51,20,521,26,7,8],[51,21,521,26,8,8],[51,22,521,26,8,9],[51,23,521,26,9,10],[51,24,521,26,10,10],[51,25,521,26,11,11],[51,26,521,26,11,12],[51,27,521,26,12,12],[51,28,521,26,13,13],[51,29,521,26,14,14],[51,30,521,26,15,15],[51,31,522,27,1,1],[51,32,522,27,1,2],[51,33,522,27,2,2],[51,34,522,27,2,3],[51,35,522,27,3,3],[51,36,522,27,3,4],[51,37,522,27,4,5],[51,38,522,27,5,6],[51,39,522,27,6,6],[51,40,522,27,6,7],[51,41,522,27,7,8],[51,42,522,27,8,8],[51,43,522,27,9,9],[51,44,522,27,9,10],[51,45,522,27,10,11],[51,46,522,27,11,12],[51,47,522,27,12,12],[51,48,522,27,12,13],[51,49,522,27,13,14],[51,50,522,27,14,14],[51,51,522,27,15,15],[51,52,523,27,1,1],[51,53,523,27,2,2],[51,54,523,27,2,3],[51,55,523,27,3,3],[51,56,523,27,3,4],[51,57,523,27,4,5],[51,58,523,27,5,5],[51,59,523,27,6,6],[51,60,523,27,7,7],[52,1,523,27,10,10],[52,2,523,27,10,10],[52,3,523,27,10,10],[52,4,523,27,10,11],[52,5,523,27,11,11],[52,6,523,27,11,11],[52,7,523,27,11,12],[52,8,523,27,12,12],[52,9,523,27,12,13],[52,10,523,27,13,13],[52,11,523,27,13,13],[52,12,523,27,14,14],[52,13,523,27,14,15],[52,14,523,27,15,15],[52,15,524,27,1,1],[52,16,524,27,1,2],[52,17,524,27,3,3],[52,18,524,27,3,4],[52,19,524,27,4,5],[52,20,524,27,5,6],[52,21,524,27,6,8],[52,22,524,27,8,8],[52,23,524,27,8,9],[52,24,524,27,9,10],[52,25,524,27,10,10],[52,26,524,27,11,11],[52,27,524,27,11,12],[52,28,524,27,12,13],[52,29,524,27,13,14],[52,30,524,27,14,15],[52,31,524,27,15,15],[52,32,525,27,1,1],[52,33,525,27,1,2],[52,34,525,27,2,2],[52,35,525,27,3,3],[52,36,525,27,3,4],[52,37,525,27,4,5],[52,38,525,27,5,6],[52,39,525,27,6,6],[52,40,525,27,7,7],[52,41,525,27,7,8],[52,42,525,27,8,8],[52,43,525,27,9,9],[52,44,525,27,9,10],[52,45,525,27,10,11],[52,46,525,27,11,12],[52,47,525,27,12,13],[52,48,525,27,13,14],[52,49,525,27,14,14],[53,1,526,27,2,2],[53,2,526,27,2,2],[53,3,526,27,2,3],[53,4,526,27,3,3],[53,5,526,27,3,3],[53,6,526,27,4,4],[53,7,526,27,4,4],[53,8,526,27,4,4],[53,9,526,27,5,5],[53,10,526,27,5,5],[53,11,526,27,6,6],[53,12,526,27,6,6],[53,13,526,27,6,7],[53,14,526,27,7,7],[53,15,526,27,7,7],[53,16,526,27,8,8],[53,17,526,27,8,8],[53,18,526,27,8,9],[53,19,526,27,9,9],[53,20,526,27,9,10],[53,21,526,27,10,10],[53,22,526,27,10,11],[53,23,526,27,11,13],[53,24,526,27,13,13],[53,25,526,27,13,14],[53,26,526,27,14,15],[53,27,527,27,1,1],[53,28,527,27,2,3],[53,29,527,27,3,4],[53,30,527,27,4,5],[53,31,527,27,5,7],[53,32,527,27,7,10],[53,33,527,27,10,10],[53,34,527,27,10,10],[53,35,527,27,11,11],[53,36,527,27,11,12],[53,37,527,27,12,12],[53,38,527,27,12,12],[53,39,527,27,13,13],[53,40,527,27,13,14],[53,41,527,27,14,14],[53,42,527,27,14,14],[53,43,527,27,15,15],[53,44,527,27,15,15],[53,45,528,27,1,1],[53,46,528,27,1,1],[53,47,528,27,1,2],[53,48,528,27,2,2],[53,49,528,27,2,3],[53,50,528,27,3,3],[53,51,528,27,3,3],[53,52,528,27,4,4],[53,53,528,27,4,5],[53,54,528,27,5,5],[53,55,528,27,5,5],[53,56,528,27,6,6],[53,57,528,27,6,6],[53,58,528,27,6,7],[53,59,528,27,7,7],[53,60,528,27,7,8],[53,61,528,27,8,8],[53,62,528,27,8,8],[54,1,528,27,11,11],[54,2,528,27,11,12],[54,3,528,27,12,13],[54,4,528,27,13,14],[54,5,528,27,14,14],[54,6,528,27,15,15],[54,7,529,27,1,1],[54,8,529,27,2,2],[54,9,529,27,2,3],[54,10,529,27,3,4],[54,11,529,27,4,4],[54,12,529,27,5,5],[54,13,529,27,6,6],[54,14,529,27,6,7],[54,15,529,27,7,7],[54,16,529,27,7,8],[54,17,529,27,8,8],[54,18,529,27,9,9],[54,19,529,27,9,10],[54,20,529,27,10,11],[54,21,529,27,11,11],[54,22,529,27,11,12],[54,23,529,27,12,12],[54,24,529,27,12,13],[54,25,529,27,13,14],[54,26,529,27,14,15],[54,27,529,27,15,15],[54,28,530,27,1,1],[54,29,530,27,1,2],[54,30,530,27,2,2],[54,31,530,27,2,3],[54,32,530,27,3,4],[54,33,530,27,4,4],[54,34,530,27,4,5],[54,35,530,27,5,6],[54,36,530,27,6,7],[54,37,530,27,7,8],[54,38,530,27,8,8],[54,39,530,27,9,9],[54,40,530,27,9,9],[54,41,530,27,10,10],[54,42,530,27,10,11],[54,43,530,27,11,12],[54,44,530,27,12,12],[54,45,530,27,12,13],[54,46,530,27,13,13],[54,47,530,27,14,14],[54,48,530,27,14,15],[54,49,530,27,15,15],[54,50,531,27,1,1],[54,51,531,27,1,2],[54,52,531,27,2,3],[54,53,531,27,3,3],[54,54,531,27,3,4],[54,55,531,27,4,4],[55,1,531,27,7,7],[55,2,531,27,7,7],[55,3,531,27,7,7],[55,4,531,27,8,8],[55,5,531,27,8,8],[55,6,531,27,8,9],[55,7,531,27,9,9],[55,8,531,27,10,10],[55,9,531,27,10,11],[55,10,531,27,11,11],[55,11,531,27,12,12],[55,12,531,27,12,13],[55,13,531,27,13,13],[55,14,531,27,13,14],[55,15,531,27,14,15],[55,16,531,27,15,15],[55,17,532,27,1,1],[55,18,532,27,1,1],[55,19,532,27,2,2],[55,20,532,27,2,2],[55,21,532,27,2,3],[55,22,532,27,3,3],[55,23,532,27,3,4],[55,24,532,27,4,4],[55,25,532,27,5,5],[55,26,532,27,5,5],[55,27,532,27,5,6],[55,28,532,27,6,6],[55,29,532,27,7,7],[55,30,532,27,7,8],[55,31,532,27,8,8],[55,32,532,27,8,9],[55,33,532,27,9,11],[55,34,532,27,11,11],[55,35,532,27,11,12],[55,36,532,27,12,13],[55,37,532,27,13,13],[55,38,532,27,14,14],[55,39,532,27,14,15],[55,40,532,27,15,15],[55,41,533,27,1,1],[55,42,533,27,1,2],[55,43,533,27,2,2],[55,44,533,27,3,3],[55,45,533,27,3,3],[55,46,533,27,4,4],[55,47,533,27,4,4],[55,48,533,27,5,5],[55,49,533,27,5,5],[55,50,533,27,5,6],[55,51,533,27,6,6],[55,52,533,27,6,7],[55,53,533,27,7,7],[55,54,533,27,7,8],[55,55,533,27,8,9],[55,56,533,27,9,10],[55,57,533,27,10,10],[55,58,533,27,10,11],[55,59,533,27,11,11],[55,60,533,27,11,12],[55,61,533,27,12,12],[55,62,533,27,13,13],[55,63,533,27,13,13],[55,64,533,27,14,14],[55,65,533,27,14,14],[55,66,533,27,14,15],[55,67,533,27,15,15],[55,68,534,27,1,1],[55,69,534,27,1,1],[55,70,534,27,2,2],[55,71,534,27,2,2],[55,72,534,27,2,3],[55,73,534,27,3,3],[55,74,534,27,4,4],[55,75,534,27,4,4],[55,76,534,27,5,5],[55,77,534,27,5,6],[55,78,534,27,6,6],[56,1,534,27,9,9],[56,2,534,27,9,9],[56,3,534,27,9,9],[56,4,534,27,10,10],[56,5,534,27,10,10],[56,6,534,27,11,11],[56,7,534,27,11,11],[56,8,534,27,11,12],[56,9,534,27,12,13],[56,10,534,27,13,13],[56,11,534,27,13,13],[56,12,534,27,14,14],[56,13,534,27,14,14],[56,14,534,27,14,14],[56,15,534,27,15,15],[56,16,534,27,15,15],[56,17,535,27,1,1],[56,18,535,27,1,1],[56,19,535,27,2,2],[56,20,535,27,2,2],[56,21,535,27,3,3],[56,22,535,27,3,3],[56,23,535,27,3,4],[56,24,535,27,4,4],[56,25,535,27,4,5],[56,26,535,27,5,5],[56,27,535,27,5,6],[56,28,535,27,6,6],[56,29,535,27,6,6],[56,30,535,27,6,6],[56,31,535,27,7,7],[56,32,535,27,7,7],[56,33,535,27,7,8],[56,34,535,27,8,8],[56,35,535,27,8,8],[56,36,535,27,8,9],[56,37,535,27,9,9],[56,38,535,27,9,9],[56,39,535,27,9,10],[56,40,535,27,10,10],[56,41,535,27,10,11],[56,42,535,27,11,11],[56,43,535,27,11,11],[56,44,535,27,11,12],[56,45,535,27,12,12],[56,46,535,27,12,13],[56,47,535,27,13,14],[56,48,535,27,14,14],[56,49,535,27,14,15],[56,50,535,27,15,15],[56,51,536,27,1,1],[56,52,536,27,1,1],[56,53,536,27,2,2],[56,54,536,27,2,2],[56,55,536,27,2,3],[56,56,536,27,3,3],[56,57,536,27,3,4],[56,58,536,27,4,4],[56,59,536,27,4,5],[56,60,536,27,5,5],[56,61,536,27,6,6],[56,62,536,27,6,7],[56,63,536,27,7,7],[56,64,536,27,8,8],[56,65,536,27,8,9],[56,66,536,27,9,9],[56,67,536,27,9,9],[56,68,536,27,10,10],[56,69,536,27,10,11],[56,70,536,27,11,11],[56,71,536,27,12,12],[56,72,536,27,12,13],[56,73,536,27,13,13],[56,74,536,27,14,14],[56,75,536,27,14,15],[56,76,536,27,15,15],[56,77,537,27,1,1],[56,78,537,27,1,1],[56,79,537,27,1,2],[56,80,537,27,2,2],[56,81,537,27,2,3],[56,82,537,27,3,3],[56,83,537,27,3,4],[56,84,537,27,4,4],[56,85,537,27,4,5],[56,86,537,27,5,5],[56,87,537,27,6,6],[56,88,537,27,6,6],[56,89,537,27,7,7],[56,90,537,27,7,8],[56,91,537,27,8,8],[56,92,537,27,8,9],[56,93,537,27,9,9],[56,94,537,27,9,9],[56,95,537,27,10,10],[56,96,537,27,10,10],[57,1,537,27,13,13],[57,2,537,27,13,14],[57,3,537,27,15,15],[57,4,538,27,1,4],[57,5,538,27,4,4],[57,6,538,27,5,6],[57,7,538,27,6,7],[57,8,538,27,8,9],[57,9,538,27,9,11],[57,10,538,27,11,14],[57,11,538,27,14,15],[57,12,539,27,1,3],[57,13,539,27,3,6],[57,14,539,27,6,8],[57,15,539,27,8,9],[57,16,539,27,10,12],[57,17,539,27,13,14],[57,18,539,27,14,15],[57,19,540,27,1,3],[57,20,540,27,3,7],[57,21,540,27,8,10],[57,22,540,27,10,12],[57,23,540,27,12,14],[57,24,540,27,14,15],[57,25,541,27,1,4],[57,26,541,27,4,6],[57,27,541,27,6,11],[57,28,541,27,11,13],[57,29,541,27,13,15],[58,1,542,28,3,4],[58,2,542,28,4,7],[58,3,542,28,7,9],[58,4,542,28,9,12],[58,5,542,28,12,14],[58,6,542,28,14,15],[58,7,543,28,1,4],[58,8,543,28,4,8],[58,9,543,28,8,10],[58,10,543,28,10,12],[58,11,543,28,12,15],[58,12,544,28,1,2],[58,13,544,28,3,5],[58,14,544,28,5,7],[58,15,544,28,7,8],[58,16,544,28,8,9],[58,17,544,28,9,10],[58,18,544,28,10,12],[58,19,544,28,12,13],[58,20,544,28,14,14],[58,21,544,28,15,15],[58,22,545,28,1,6],[59,1,545,28,9,9],[59,2,545,28,10,14],[59,3,545,28,14,15],[59,4,546,28,1,2],[59,5,546,28,2,3],[59,6,546,28,3,6],[59,7,546,28,6,9],[59,8,546,28,10,12],[59,9,546,28,12,15],[59,10,547,28,1,3],[59,11,547,28,3,6],[59,12,547,28,7,8],[59,13,547,28,9,10],[59,14,547,28,10,12],[59,15,547,28,13,14],[59,16,547,28,14,15],[59,17,548,28,1,2],[59,18,548,28,2,3],[59,19,548,28,4,5],[59,20,548,28,5,6],[59,21,548,28,6,8],[59,22,548,28,9,10],[59,23,548,28,10,12],[59,24,548,28,13,14],[60,1,549,28,2,6],[60,2,549,28,6,8],[60,3,549,28,8,9],[60,4,549,28,9,14],[60,5,549,28,14,15],[60,6,550,28,1,2],[60,7,550,28,2,3],[60,8,550,28,4,5],[60,9,550,28,6,8],[60,10,550,28,8,13],[60,11,550,28,13,15],[60,12,551,28,1,4],[60,13,551,28,5,6],[61,1,551,28,9,9],[61,2,551,28,10,10],[61,3,551,28,11,11],[61,4,551,28,11,13],[61,5,551,28,13,15],[61,6,552,28,1,3],[61,7,552,28,3,4],[61,8,552,28,5,6],[61,9,552,28,6,7],[61,10,552,28,7,8],[61,11,552,28,8,9],[61,12,552,28,10,11],[61,13,552,28,11,12],[61,14,552,28,12,15],[62,1,553,28,3,4],[62,2,553,28,4,6],[62,3,553,28,6,7],[62,4,553,28,7,8],[62,5,553,28,8,10],[62,6,553,28,11,12],[62,7,553,28,12,13],[62,8,553,28,13,15],[62,9,554,28,1,3],[62,10,554,28,3,4],[62,11,554,28,5,6],[63,1,554,28,9,10],[63,2,554,28,11,12],[63,3,554,28,12,13],[63,4,554,28,13,15],[63,5,555,28,1,2],[63,6,555,28,2,4],[63,7,555,28,4,6],[63,8,555,28,7,9],[63,9,555,28,9,11],[63,10,555,28,11,13],[63,11,555,28,13,14],[64,1,556,28,2,3],[64,2,556,28,3,4],[64,3,556,28,4,5],[64,4,556,28,6,7],[64,5,556,28,7,8],[64,6,556,28,8,10],[64,7,556,28,10,11],[64,8,556,28,11,12],[64,9,556,28,12,15],[64,10,557,28,1,2],[64,11,557,28,2,4],[64,12,557,28,4,5],[64,13,557,28,5,6],[64,14,557,28,6,9],[64,15,557,28,9,10],[64,16,557,28,10,12],[64,17,557,28,12,14],[64,18,557,28,14,14],[65,1,558,28,2,6],[65,2,558,28,6,9],[65,3,558,28,9,11],[65,4,558,28,11,14],[65,5,558,28,14,15],[65,6,559,28,1,4],[65,7,559,28,4,6],[65,8,559,28,6,8],[65,9,559,28,8,8],[65,10,559,28,9,10],[65,11,559,28,10,13],[65,12,559,28,13,15],[66,1,560,28,3,4],[66,2,560,28,4,5],[66,3,560,28,5,7],[66,4,560,28,8,10],[66,5,560,28,10,12],[66,6,560,28,12,14],[66,7,560,28,14,15],[66,8,561,28,1,5],[66,9,561,28,6,7],[66,10,561,28,7,10],[66,11,561,28,11,13],[66,12,561,28,13,15],[67,1,562,29,3,3],[67,2,562,29,3,4],[67,3,562,29,5,6],[67,4,562,29,6,7],[67,5,562,29,7,9],[67,6,562,29,9,9],[67,7,562,29,10,10],[67,8,562,29,10,11],[67,9,562,29,12,13],[67,10,562,29,13,14],[67,11,562,29,14,14],[67,12,562,29,15,15],[67,13,563,29,1,1],[67,14,563,29,1,2],[67,15,563,29,2,3],[67,16,563,29,4,5],[67,17,563,29,5,6],[67,18,563,29,6,7],[67,19,563,29,7,8],[67,20,563,29,8,9],[67,21,563,29,10,11],[67,22,563,29,11,12],[67,23,563,29,12,13],[67,24,563,29,13,14],[67,25,563,29,14,15],[67,26,563,29,15,15],[67,27,564,29,1,2],[67,28,564,29,2,3],[67,29,564,29,3,4],[67,30,564,29,5,5],[68,1,564,29,8,8],[68,2,564,29,8,8],[68,3,564,29,9,9],[68,4,564,29,9,9],[68,5,564,29,10,10],[68,6,564,29,10,10],[68,7,564,29,10,11],[68,8,564,29,11,12],[68,9,564,29,12,12],[68,10,564,29,12,13],[68,11,564,29,13,13],[68,12,564,29,13,14],[68,13,564,29,14,14],[68,14,564,29,14,14],[68,15,564,29,15,15],[68,16,565,29,1,1],[68,17,565,29,1,2],[68,18,565,29,2,2],[68,19,565,29,2,3],[68,20,565,29,3,3],[68,21,565,29,3,3],[68,22,565,29,3,4],[68,23,565,29,4,4],[68,24,565,29,5,5],[68,25,565,29,5,5],[68,26,565,29,5,6],[68,27,565,29,6,6],[68,28,565,29,6,7],[68,29,565,29,7,7],[68,30,565,29,7,8],[68,31,565,29,8,8],[68,32,565,29,8,9],[68,33,565,29,9,10],[68,34,565,29,10,10],[68,35,565,29,11,11],[68,36,565,29,11,11],[68,37,565,29,11,12],[68,38,565,29,12,12],[68,39,565,29,12,13],[68,40,565,29,13,14],[68,41,565,29,14,14],[68,42,565,29,15,15],[68,43,566,29,1,1],[68,44,566,29,2,3],[68,45,566,29,3,3],[68,46,566,29,3,4],[68,47,566,29,4,4],[68,48,566,29,4,5],[68,49,566,29,5,6],[68,50,566,29,6,7],[68,51,566,29,7,8],[68,52,566,29,8,8],[69,1,566,29,11,11],[69,2,566,29,11,11],[69,3,566,29,11,11],[69,4,566,29,11,12],[69,5,566,29,12,12],[69,6,566,29,12,13],[69,7,566,29,13,15],[69,8,566,29,15,15],[69,9,567,29,1,1],[69,10,567,29,1,2],[69,11,567,29,2,2],[69,12,567,29,3,3],[69,13,567,29,3,4],[69,14,567,29,4,4],[69,15,567,29,5,5],[69,16,567,29,5,5],[69,17,567,29,6,6],[69,18,567,29,7,7],[69,19,567,29,7,8],[69,20,567,29,8,9],[69,21,567,29,9,9],[69,22,567,29,9,9],[69,23,567,29,10,10],[69,24,567,29,10,11],[69,25,567,29,11,11],[69,26,567,29,12,12],[69,27,567,29,12,12],[69,28,567,29,12,13],[69,29,567,29,13,13],[69,30,567,29,13,13],[69,31,567,29,13,14],[69,32,567,29,14,14],[69,33,567,29,14,15],[69,34,567,29,15,15],[69,35,568,29,1,1],[69,36,568,29,1,1],[69,37,568,29,1,2],[69,38,568,29,2,2],[69,39,568,29,2,2],[69,40,568,29,3,3],[69,41,568,29,3,3],[69,42,568,29,4,4],[69,43,568,29,4,4],[69,44,568,29,4,5],[69,45,568,29,5,5],[69,46,568,29,5,6],[69,47,568,29,6,6],[69,48,568,29,6,7],[69,49,568,29,7,7],[69,50,568,29,7,8],[69,51,568,29,8,8],[69,52,568,29,8,8],[70,1,568,29,11,11],[70,2,568,29,11,11],[70,3,568,29,11,12],[70,4,568,29,12,13],[70,5,568,29,13,13],[70,6,568,29,14,14],[70,7,568,29,14,14],[70,8,568,29,14,14],[70,9,568,29,15,15],[70,10,568,29,15,15],[70,11,569,29,1,1],[70,12,569,29,2,2],[70,13,569,29,2,2],[70,14,569,29,2,3],[70,15,569,29,3,3],[70,16,569,29,3,3],[70,17,569,29,3,4],[70,18,569,29,4,4],[70,19,569,29,4,4],[70,20,569,29,5,5],[70,21,569,29,5,5],[70,22,569,29,5,6],[70,23,569,29,6,6],[70,24,569,29,6,7],[70,25,569,29,7,7],[70,26,569,29,7,8],[70,27,569,29,8,8],[70,28,569,29,8,9],[70,29,569,29,9,9],[70,30,569,29,9,10],[70,31,569,29,10,11],[70,32,569,29,11,11],[70,33,569,29,12,12],[70,34,569,29,12,12],[70,35,569,29,13,13],[70,36,569,29,13,13],[70,37,569,29,14,14],[70,38,569,29,14,15],[70,39,569,29,15,15],[70,40,570,29,1,1],[70,41,570,29,1,2],[70,42,570,29,2,3],[70,43,570,29,3,3],[70,44,570,29,4,4],[71,1,570,29,7,8],[71,2,570,29,8,8],[71,3,570,29,8,9],[71,4,570,29,9,10],[71,5,570,29,11,11],[71,6,570,29,11,12],[71,7,570,29,12,13],[71,8,570,29,14,14],[71,9,570,29,14,15],[71,10,570,29,15,15],[71,11,571,29,1,1],[71,12,571,29,1,2],[71,13,571,29,2,2],[71,14,571,29,3,3],[71,15,571,29,3,4],[71,16,571,29,4,4],[71,17,571,29,5,5],[71,18,571,29,5,6],[71,19,571,29,6,6],[71,20,571,29,6,7],[71,21,571,29,7,8],[71,22,571,29,8,8],[71,23,571,29,8,10],[71,24,571,29,10,10],[71,25,571,29,11,12],[71,26,571,29,12,13],[71,27,571,29,13,14],[71,28,571,29,14,15],[72,1,572,29,3,4],[72,2,572,29,4,4],[72,3,572,29,5,5],[72,4,572,29,5,6],[72,5,572,29,6,7],[72,6,572,29,7,8],[72,7,572,29,8,9],[72,8,572,29,9,10],[72,9,572,29,10,11],[72,10,572,29,11,12],[72,11,572,29,12,13],[72,12,572,29,13,14],[72,13,572,29,14,15],[72,14,573,29,1,2],[72,15,573,29,2,2],[72,16,573,29,3,3],[72,17,573,29,3,4],[72,18,573,29,4,5],[72,19,573,29,5,6],[72,20,573,29,6,7],[72,21,573,29,7,7],[72,22,573,29,7,8],[72,23,573,29,8,10],[72,24,573,29,10,11],[72,25,573,29,11,12],[72,26,573,29,12,13],[72,27,573,29,13,14],[72,28,573,29,14,15],[73,1,574,29,3,3],[73,2,574,29,3,3],[73,3,574,29,3,3],[73,4,574,29,4,4],[73,5,574,29,4,5],[73,6,574,29,5,5],[73,7,574,29,5,6],[73,8,574,29,6,6],[73,9,574,29,7,7],[73,10,574,29,7,8],[73,11,574,29,8,9],[73,12,574,29,9,9],[73,13,574,29,10,10],[73,14,574,29,10,11],[73,15,574,29,11,12],[73,16,574,29,12,13],[73,17,574,29,13,14],[73,18,574,29,14,14],[73,19,574,29,15,15],[73,20,575,29,1,7],[74,1,575,29,10,10],[74,2,575,29,10,10],[74,3,575,29,10,10],[74,4,575,29,10,10],[74,5,575,29,11,11],[74,6,575,29,11,11],[74,7,575,29,11,11],[74,8,575,29,12,12],[74,9,575,29,12,12],[74,10,575,29,12,13],[74,11,575,29,13,13],[74,12,575,29,13,14],[74,13,575,29,14,14],[74,14,575,29,14,14],[74,15,575,29,14,15],[74,16,575,29,15,15],[74,17,575,29,15,15],[74,18,576,29,1,1],[74,19,576,29,1,1],[74,20,576,29,1,1],[74,21,576,29,1,1],[74,22,576,29,2,2],[74,23,576,29,2,2],[74,24,576,29,2,3],[74,25,576,29,3,3],[74,26,576,29,3,3],[74,27,576,29,3,4],[74,28,576,29,4,4],[74,29,576,29,4,4],[74,30,576,29,4,4],[74,31,576,29,5,9],[74,32,576,29,9,10],[74,33,576,29,10,10],[74,34,576,29,10,10],[74,35,576,29,10,11],[74,36,576,29,11,11],[74,37,576,29,11,11],[74,38,576,29,11,12],[74,39,576,29,12,12],[74,40,576,29,12,12],[74,41,576,29,13,13],[74,42,576,29,13,13],[74,43,576,29,13,14],[74,44,576,29,14,14],[74,45,576,29,14,15],[74,46,576,29,15,15],[74,47,576,29,15,15],[74,48,577,29,1,1],[74,49,577,29,1,1],[74,50,577,29,2,2],[74,51,577,29,2,2],[74,52,577,29,2,3],[74,53,577,29,3,4],[74,54,577,29,4,4],[74,55,577,29,4,4],[74,56,577,29,5,5],[75,1,577,29,8,8],[75,2,577,29,8,8],[75,3,577,29,8,9],[75,4,577,29,9,9],[75,5,577,29,9,10],[75,6,577,29,10,10],[75,7,577,29,10,10],[75,8,577,29,11,11],[75,9,577,29,11,11],[75,10,577,29,11,12],[75,11,577,29,12,12],[75,12,577,29,12,12],[75,13,577,29,12,13],[75,14,577,29,13,13],[75,15,577,29,13,14],[75,16,577,29,14,14],[75,17,577,29,14,15],[75,18,577,29,15,15],[75,19,577,29,15,15],[75,20,578,29,1,1],[75,21,578,29,1,1],[75,22,578,29,1,1],[75,23,578,29,2,2],[75,24,578,29,2,2],[75,25,578,29,2,2],[75,26,578,29,3,3],[75,27,578,29,3,3],[75,28,578,29,3,3],[75,29,578,29,3,4],[75,30,578,29,4,4],[75,31,578,29,4,4],[75,32,578,29,5,5],[75,33,578,29,5,5],[75,34,578,29,5,6],[75,35,578,29,6,6],[75,36,578,29,6,6],[75,37,578,29,7,7],[75,38,578,29,7,7],[75,39,578,29,7,8],[75,40,578,29,8,8],[76,1,578,29,11,11],[76,2,578,29,12,13],[76,3,578,29,13,13],[76,4,578,29,14,14],[76,5,578,29,14,15],[76,6,579,29,1,1],[76,7,579,29,1,2],[76,8,579,29,2,3],[76,9,579,29,3,3],[76,10,579,29,4,4],[76,11,579,29,4,5],[76,12,579,29,5,5],[76,13,579,29,6,6],[76,14,579,29,7,7],[76,15,579,29,7,8],[76,16,579,29,8,8],[76,17,579,29,9,9],[76,18,579,29,9,9],[76,19,579,29,10,10],[76,20,579,29,11,11],[76,21,579,29,11,13],[76,22,579,29,13,13],[76,23,579,29,13,14],[76,24,579,29,14,15],[76,25,579,29,15,15],[76,26,580,29,1,1],[76,27,580,29,1,2],[76,28,580,29,2,3],[76,29,580,29,4,4],[76,30,580,29,5,5],[76,31,580,29,6,6],[77,1,580,29,9,9],[77,2,580,29,9,9],[77,3,580,29,9,9],[77,4,580,29,10,10],[77,5,580,29,10,10],[77,6,580,29,10,10],[77,7,580,29,10,11],[77,8,580,29,11,11],[77,9,580,29,11,11],[77,10,580,29,12,12],[77,11,580,29,12,12],[77,12,580,29,12,12],[77,13,580,29,13,13],[77,14,580,29,13,13],[77,15,580,29,13,14],[77,16,580,29,14,14],[77,17,580,29,14,14],[77,18,580,29,15,15],[77,19,580,29,15,15],[77,20,581,29,1,1],[77,21,581,29,1,1],[77,22,581,29,1,2],[77,23,581,29,2,2],[77,24,581,29,2,2],[77,25,581,29,3,3],[77,26,581,29,3,3],[77,27,581,29,3,4],[77,28,581,29,4,4],[77,29,581,29,5,5],[77,30,581,29,5,6],[77,31,581,29,6,6],[77,32,581,29,6,7],[77,33,581,29,7,7],[77,34,581,29,7,7],[77,35,581,29,8,8],[77,36,581,29,8,8],[77,37,581,29,8,9],[77,38,581,29,9,9],[77,39,581,29,9,10],[77,40,581,29,10,10],[77,41,581,29,10,11],[77,42,581,29,11,11],[77,43,581,29,11,12],[77,44,581,29,12,12],[77,45,581,29,12,13],[77,46,581,29,13,13],[77,47,581,29,13,14],[77,48,581,29,14,14],[77,49,581,29,14,15],[77,50,581,29,15,15],[78,1,582,30,3,3],[78,2,582,30,3,3],[78,3,582,30,3,3],[78,4,582,30,4,4],[78,5,582,30,4,4],[78,6,582,30,4,4],[78,7,582,30,5,5],[78,8,582,30,5,5],[78,9,582,30,5,5],[78,10,582,30,6,6],[78,11,582,30,6,6],[78,12,582,30,6,7],[78,13,582,30,7,7],[78,14,582,30,7,8],[78,15,582,30,8,8],[78,16,582,30,8,9],[78,17,582,30,9,9],[78,18,582,30,9,10],[78,19,582,30,10,10],[78,20,582,30,10,11],[78,21,582,30,11,11],[78,22,582,30,11,12],[78,23,582,30,12,12],[78,24,582,30,12,12],[78,25,582,30,13,13],[78,26,582,30,13,13],[78,27,582,30,13,14],[78,28,582,30,14,14],[78,29,582,30,14,15],[78,30,582,30,15,15],[78,31,583,30,1,1],[78,32,583,30,1,1],[78,33,583,30,1,1],[78,34,583,30,1,2],[78,35,583,30,2,2],[78,36,583,30,2,3],[78,37,583,30,3,4],[78,38,583,30,4,5],[78,39,583,30,5,6],[78,40,583,30,6,7],[79,1,583,30,10,10],[79,2,583,30,10,10],[79,3,583,30,10,10],[79,4,583,30,11,11],[79,5,583,30,11,11],[79,6,583,30,11,11],[79,7,583,30,12,12],[79,8,583,30,12,12],[79,9,583,30,12,13],[79,10,583,30,13,13],[79,11,583,30,13,14],[79,12,583,30,14,14],[79,13,583,30,14,15],[79,14,583,30,15,15],[79,15,583,30,15,15],[79,16,584,30,1,1],[79,17,584,30,1,1],[79,18,584,30,2,2],[79,19,584,30,2,2],[79,20,584,30,2,3],[79,21,584,30,3,3],[79,22,584,30,3,3],[79,23,584,30,3,4],[79,24,584,30,4,4],[79,25,584,30,4,4],[79,26,584,30,5,5],[79,27,584,30,5,5],[79,28,584,30,6,6],[79,29,584,30,6,6],[79,30,584,30,7,7],[79,31,584,30,7,7],[79,32,584,30,8,8],[79,33,584,30,8,8],[79,34,584,30,8,9],[79,35,584,30,9,9],[79,36,584,30,9,10],[79,37,584,30,10,10],[79,38,584,30,10,10],[79,39,584,30,10,11],[79,40,584,30,11,11],[79,41,584,30,12,12],[79,42,584,30,12,12],[79,43,584,30,13,13],[79,44,584,30,13,13],[79,45,584,30,13,14],[79,46,584,30,14,14],[80,1,585,30,2,2],[80,2,585,30,2,2],[80,3,585,30,2,2],[80,4,585,30,2,3],[80,5,585,30,3,3],[80,6,585,30,3,3],[80,7,585,30,4,4],[80,8,585,30,4,4],[80,9,585,30,4,4],[80,10,585,30,4,5],[80,11,585,30,5,5],[80,12,585,30,5,5],[80,13,585,30,5,5],[80,14,585,30,6,6],[80,15,585,30,6,6],[80,16,585,30,6,6],[80,17,585,30,6,7],[80,18,585,30,7,7],[80,19,585,30,7,7],[80,20,585,30,7,8],[80,21,585,30,8,8],[80,22,585,30,8,8],[80,23,585,30,8,9],[80,24,585,30,9,9],[80,25,585,30,9,9],[80,26,585,30,10,10],[80,27,585,30,10,10],[80,28,585,30,10,10],[80,29,585,30,11,11],[80,30,585,30,11,11],[80,31,585,30,11,11],[80,32,585,30,11,12],[80,33,585,30,12,12],[80,34,585,30,12,12],[80,35,585,30,13,13],[80,36,585,30,13,13],[80,37,585,30,13,14],[80,38,585,30,14,14],[80,39,585,30,14,14],[80,40,585,30,14,15],[80,41,585,30,15,15],[80,42,585,30,15,15],[81,1,586,30,1,1],[81,2,586,30,1,1],[81,3,586,30,1,2],[81,4,586,30,2,2],[81,5,586,30,2,2],[81,6,586,30,3,3],[81,7,586,30,3,3],[81,8,586,30,3,4],[81,9,586,30,4,4],[81,10,586,30,4,4],[81,11,586,30,5,5],[81,12,586,30,5,5],[81,13,586,30,5,6],[81,14,586,30,6,6],[81,15,586,30,6,6],[81,16,586,30,7,7],[81,17,586,30,7,7],[81,18,586,30,7,7],[81,19,586,30,8,8],[81,20,586,30,8,8],[81,21,586,30,8,9],[81,22,586,30,9,9],[81,23,586,30,9,9],[81,24,586,30,10,10],[81,25,586,30,10,10],[81,26,586,30,11,11],[81,27,586,30,11,11],[81,28,586,30,11,12],[81,29,586,30,12,12],[82,1,587,30,2,2],[82,2,587,30,2,2],[82,3,587,30,2,3],[82,4,587,30,3,3],[82,5,587,30,3,4],[82,6,587,30,4,4],[82,7,587,30,4,5],[82,8,587,30,5,5],[82,9,587,30,6,6],[82,10,587,30,6,6],[82,11,587,30,6,7],[82,12,587,30,7,7],[82,13,587,30,7,7],[82,14,587,30,7,8],[82,15,587,30,8,8],[82,16,587,30,8,8],[82,17,587,30,9,9],[82,18,587,30,9,9],[82,19,587,30,10,10],[83,1,587,30,13,13],[83,2,587,30,13,13],[83,3,587,30,14,14],[83,4,587,30,14,15],[83,5,587,30,15,15],[83,6,587,30,15,15],[83,7,588,30,1,1],[83,8,588,30,1,1],[83,9,588,30,1,2],[83,10,588,30,2,2],[83,11,588,30,2,2],[83,12,588,30,3,3],[83,13,588,30,3,4],[83,14,588,30,4,4],[83,15,588,30,4,5],[83,16,588,30,5,5],[83,17,588,30,5,6],[83,18,588,30,6,6],[83,19,588,30,7,7],[83,20,588,30,7,7],[83,21,588,30,7,7],[83,22,588,30,8,8],[83,23,588,30,8,8],[83,24,588,30,8,9],[83,25,588,30,9,9],[83,26,588,30,10,10],[83,27,588,30,10,11],[83,28,588,30,11,11],[83,29,588,30,11,12],[83,30,588,30,12,13],[83,31,588,30,13,13],[83,32,588,30,14,14],[83,33,588,30,14,15],[83,34,588,30,15,15],[83,35,589,30,1,1],[83,36,589,30,1,1],[84,1,589,30,4,4],[84,2,589,30,4,4],[84,3,589,30,4,4],[84,4,589,30,5,5],[84,5,589,30,5,5],[84,6,589,30,5,6],[84,7,589,30,6,7],[84,8,589,30,7,7],[84,9,589,30,7,8],[84,10,589,30,8,8],[84,11,589,30,8,9],[84,12,589,30,9,9],[84,13,589,30,9,9],[84,14,589,30,10,10],[84,15,589,30,10,10],[84,16,589,30,10,11],[84,17,589,30,11,11],[84,18,589,30,11,11],[84,19,589,30,12,12],[84,20,589,30,12,12],[84,21,589,30,12,13],[84,22,589,30,13,13],[84,23,589,30,14,14],[84,24,589,30,14,14],[84,25,589,30,15,15],[85,1,590,30,1,1],[85,2,590,30,1,1],[85,3,590,30,1,1],[85,4,590,30,2,2],[85,5,590,30,2,2],[85,6,590,30,2,3],[85,7,590,30,3,3],[85,8,590,30,3,4],[85,9,590,30,4,5],[85,10,590,30,5,7],[85,11,590,30,7,8],[85,12,590,30,8,9],[85,13,590,30,9,9],[85,14,590,30,9,9],[85,15,590,30,10,10],[85,16,590,30,10,10],[85,17,590,30,10,10],[85,18,590,30,11,11],[85,19,590,30,11,11],[85,20,590,30,11,12],[85,21,590,30,12,12],[85,22,590,30,12,12],[86,1,591,30,2,2],[86,2,591,30,2,2],[86,3,591,30,2,2],[86,4,591,30,2,3],[86,5,591,30,3,3],[86,6,591,30,3,4],[86,7,591,30,4,4],[86,8,591,30,4,4],[86,9,591,30,5,5],[86,10,591,30,5,5],[86,11,591,30,5,5],[86,12,591,30,6,6],[86,13,591,30,6,6],[86,14,591,30,6,6],[86,15,591,30,6,7],[86,16,591,30,7,7],[86,17,591,30,7,7],[87,1,591,30,10,10],[87,2,591,30,10,10],[87,3,591,30,10,10],[87,4,591,30,11,11],[87,5,591,30,11,11],[87,6,591,30,11,12],[87,7,591,30,12,12],[87,8,591,30,12,13],[87,9,591,30,13,13],[87,10,591,30,13,13],[87,11,591,30,14,14],[87,12,591,30,14,14],[87,13,591,30,14,15],[87,14,591,30,15,15],[87,15,591,30,15,15],[87,16,592,30,1,1],[87,17,592,30,1,1],[87,18,592,30,1,2],[87,19,592,30,2,2],[88,1,592,30,5,5],[88,2,592,30,5,5],[88,3,592,30,6,6],[88,4,592,30,6,6],[88,5,592,30,6,6],[88,6,592,30,7,7],[88,7,592,30,7,7],[88,8,592,30,8,8],[88,9,592,30,8,8],[88,10,592,30,8,8],[88,11,592,30,9,9],[88,12,592,30,9,9],[88,13,592,30,9,9],[88,14,592,30,10,10],[88,15,592,30,10,10],[88,16,592,30,10,10],[88,17,592,30,11,11],[88,18,592,30,11,12],[88,19,592,30,12,12],[88,20,592,30,12,13],[88,21,592,30,13,13],[88,22,592,30,13,14],[88,23,592,30,14,14],[88,24,592,30,14,15],[88,25,592,30,15,15],[88,26,592,30,15,15],[89,1,593,30,3,3],[89,2,593,30,3,3],[89,3,593,30,3,3],[89,4,593,30,3,3],[89,5,593,30,4,4],[89,6,593,30,4,4],[89,7,593,30,5,5],[89,8,593,30,5,5],[89,9,593,30,6,6],[89,10,593,30,6,6],[89,11,593,30,7,7],[89,12,593,30,7,7],[89,13,593,30,7,8],[89,14,593,30,8,8],[89,15,593,30,8,9],[89,16,593,30,10,10],[89,17,593,30,11,11],[89,18,593,30,11,12],[89,19,593,30,12,12],[89,20,593,30,13,13],[89,21,593,30,13,14],[89,22,593,30,14,14],[89,23,593,30,14,15],[89,24,594,30,1,1],[89,25,594,30,1,1],[89,26,594,30,2,2],[89,27,594,30,2,2],[89,28,594,30,2,3],[89,29,594,30,3,3],[89,30,594,30,3,3],[90,1,594,30,6,6],[90,2,594,30,6,6],[90,3,594,30,6,6],[90,4,594,30,7,7],[90,5,594,30,7,8],[90,6,594,30,8,8],[90,7,594,30,8,8],[90,8,594,30,9,9],[90,9,594,30,9,9],[90,10,594,30,9,10],[90,11,594,30,10,10],[90,12,594,30,10,10],[90,13,594,30,11,11],[90,14,594,30,11,11],[90,15,594,30,11,11],[90,16,594,30,12,12],[90,17,594,30,12,13],[90,18,594,30,13,13],[90,19,594,30,13,14],[90,20,594,30,14,14],[91,1,595,30,2,2],[91,2,595,30,2,2],[91,3,595,30,2,2],[91,4,595,30,3,3],[91,5,595,30,3,3],[91,6,595,30,3,3],[91,7,595,30,4,4],[91,8,595,30,4,4],[91,9,595,30,4,5],[91,10,595,30,5,5],[91,11,595,30,5,6],[91,12,595,30,6,6],[91,13,595,30,6,7],[91,14,595,30,7,8],[91,15,595,30,8,8],[92,1,595,30,11,11],[92,2,595,30,11,11],[92,3,595,30,11,11],[92,4,595,30,12,12],[92,5,595,30,12,12],[92,6,595,30,12,12],[92,7,595,30,13,13],[92,8,595,30,13,13],[92,9,595,30,13,13],[92,10,595,30,14,14],[92,11,595,30,14,14],[92,12,595,30,14,15],[92,13,595,30,15,15],[92,14,595,30,15,15],[92,15,596,30,1,1],[92,16,596,30,1,1],[92,17,596,30,1,2],[92,18,596,30,2,2],[92,19,596,30,2,3],[92,20,596,30,3,3],[92,21,596,30,3,3],[93,1,596,30,6,6],[93,2,596,30,6,6],[93,3,596,30,6,6],[93,4,596,30,7,7],[93,5,596,30,7,8],[93,6,596,30,8,8],[93,7,596,30,8,9],[93,8,596,30,9,9],[93,9,596,30,9,9],[93,10,596,30,10,10],[93,11,596,30,10,10],[94,1,596,30,13,13],[94,2,596,30,13,13],[94,3,596,30,13,14],[94,4,596,30,14,14],[94,5,596,30,14,14],[94,6,596,30,14,15],[94,7,596,30,15,15],[94,8,596,30,15,15],[95,1,597,30,3,3],[95,2,597,30,3,3],[95,3,597,30,3,3],[95,4,597,30,4,4],[95,5,597,30,4,4],[95,6,597,30,5,5],[95,7,597,30,6,6],[95,8,597,30,6,6],[96,1,597,30,9,9],[96,2,597,30,9,9],[96,3,597,30,9,10],[96,4,597,30,10,10],[96,5,597,30,10,10],[96,6,597,30,10,11],[96,7,597,30,11,11],[96,8,597,30,11,11],[96,9,597,30,11,12],[96,10,597,30,12,12],[96,11,597,30,12,12],[96,12,597,30,12,13],[96,13,597,30,13,13],[96,14,597,30,13,13],[96,15,597,30,13,14],[96,16,597,30,14,14],[96,17,597,30,14,14],[96,18,597,30,15,15],[96,19,597,30,15,15],[97,1,598,30,3,3],[97,2,598,30,3,3],[97,3,598,30,4,4],[97,4,598,30,4,5],[97,5,598,30,5,5],[98,1,598,30,8,9],[98,2,598,30,9,9],[98,3,598,30,10,10],[98,4,598,30,10,11],[98,5,598,30,11,13],[98,6,598,30,13,14],[98,7,598,30,14,15],[98,8,599,30,1,2],[99,1,599,30,5,5],[99,2,599,30,5,5],[99,3,599,30,6,6],[99,4,599,30,6,6],[99,5,599,30,7,7],[99,6,599,30,7,8],[99,7,599,30,8,9],[99,8,599,30,9,9],[100,1,599,30,12,12],[100,2,599,30,12,12],[100,3,599,30,12,12],[100,4,599,30,13,13],[100,5,599,30,13,13],[100,6,599,30,13,14],[100,7,599,30,14,14],[100,8,599,30,14,15],[100,9,599,30,15,15],[100,10,600,30,1,1],[100,11,600,30,1,1],[101,1,600,30,4,4],[101,2,600,30,4,4],[101,3,600,30,4,4],[101,4,600,30,5,5],[101,5,600,30,6,6],[101,6,600,30,6,7],[101,7,600,30,7,7],[101,8,600,30,8,8],[101,9,600,30,8,8],[101,10,600,30,9,9],[101,11,600,30,9,9],[102,1,600,30,12,12],[102,2,600,30,12,12],[102,3,600,30,12,13],[102,4,600,30,13,13],[102,5,600,30,13,14],[102,6,600,30,14,14],[102,7,600,30,14,15],[102,8,600,30,15,15],[103,1,601,30,3,3],[103,2,601,30,3,3],[103,3,601,30,3,4],[104,1,601,30,7,7],[104,2,601,30,7,7],[104,3,601,30,8,8],[104,4,601,30,8,8],[104,5,601,30,9,9],[104,6,601,30,9,9],[104,7,601,30,9,10],[104,8,601,30,10,10],[104,9,601,30,10,10],[105,1,601,30,13,13],[105,2,601,30,13,14],[105,3,601,30,14,14],[105,4,601,30,14,15],[105,5,601,30,15,15],[106,1,602,30,3,3],[106,2,602,30,3,3],[106,3,602,30,4,4],[106,4,602,30,4,5],[107,1,602,30,8,8],[107,2,602,30,8,9],[107,3,602,30,9,9],[107,4,602,30,10,10],[107,5,602,30,10,10],[107,6,602,30,11,11],[107,7,602,30,11,11],[108,1,602,30,14,14],[108,2,602,30,14,14],[108,3,602,30,15,15],[109,1,603,30,3,3],[109,2,603,30,3,3],[109,3,603,30,4,4],[109,4,603,30,4,4],[109,5,603,30,5,5],[109,6,603,30,5,5],[110,1,603,30,8,8],[110,2,603,30,8,9],[110,3,603,30,9,10],[111,1,603,30,13,13],[111,2,603,30,13,14],[111,3,603,30,14,14],[111,4,603,30,14,15],[111,5,603,30,15,15],[112,1,604,30,3,3],[112,2,604,30,3,3],[112,3,604,30,3,4],[112,4,604,30,4,4],[113,1,604,30,7,7],[113,2,604,30,7,7],[113,3,604,30,7,8],[113,4,604,30,8,9],[113,5,604,30,9,9],[114,1,604,30,12,12],[114,2,604,30,12,12],[114,3,604,30,12,13],[114,4,604,30,13,13],[114,5,604,30,13,14],[114,6,604,30,15,15]];


// Indeks cepat pencarian (Lookup Cache)
const ayahCoordinateMap = new Map<string, QuranAyahCoordinate>();
const pageToAyahsMap = new Map<number, QuranAyahCoordinate[]>();
const surahToAyahsMap = new Map<number, QuranAyahCoordinate[]>();
const juzToAyahsMap = new Map<number, QuranAyahCoordinate[]>();
const surahByIdMap = new Map<number, QuranSurahInfo>();
const surahByNameMap = new Map<string, QuranSurahInfo>();
const juzByIdMap = new Map<number, QuranJuzInfo>();

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Alias dan variasi transliterasi nama surat umum (khususnya mushaf Indonesia & Kemenag)
const SURAH_ALIASES: Record<string, number> = {
  // Al-Mujadilah / Al-Mujadalah
  almujadalah: 58,
  mujadalah: 58,
  almujadilah: 58,
  mujadilah: 58,
  // An-Naba / Naba
  annaba: 78,
  naba: 78,
  annabaa: 78,
  // An-Nas / Nas
  annas: 114,
  nas: 114,
  // At-Tahrim / Tahrim
  attahrim: 66,
  tahrim: 66,
  // Ali Imran
  aliimran: 3,
  alimran: 3,
  imran: 3,
  // Al-Baqarah
  albaqarah: 2,
  baqarah: 2,
  // Al-Fatihah
  alfatihah: 1,
  fatihah: 1,
  // Al-An'am
  alanam: 6,
  anam: 6,
  // Al-A'raf
  alaraf: 7,
  araf: 7,
  // At-Taubah
  attaubah: 9,
  taubah: 9,
  baraah: 9,
  albaraah: 9,
  // Al-Isra / Bani Israil
  alisra: 17,
  isra: 17,
  baniisrail: 17,
  // Al-Anbiya
  alanbiya: 21,
  anbiya: 21,
  // Al-Mu'minun
  almuminun: 23,
  muminun: 23,
  // Asy-Syu'ara
  asysyuara: 26,
  syuara: 26,
  ashsyuara: 26,
  // Al-Ankabut
  alankabut: 29,
  ankabut: 29,
  // Ar-Rum
  arrum: 30,
  rum: 30,
  // As-Sajdah
  assajdah: 32,
  sajdah: 32,
  // Al-Ahzab
  alahzab: 33,
  ahzab: 33,
  // Fatir / Fathir
  fatir: 35,
  fathir: 35,
  // Yasin
  yasin: 36,
  // As-Saffat
  assaffat: 37,
  saffat: 37,
  // Az-Zumar
  azzumar: 39,
  zumar: 39,
  // Ghafir / Al-Mu'min
  ghafir: 40,
  almumin: 40,
  // Asy-Syura
  asysyura: 42,
  syura: 42,
  ashsyura: 42,
  // Ad-Dukhan
  addukhan: 44,
  dukhan: 44,
  // Al-Jasiyah
  aljasiyah: 45,
  aljatsiyah: 45,
  jatsiyah: 45,
  // Al-Hujurat
  alhujurat: 49,
  hujurat: 49,
  // Az-Zariyat
  azzariyat: 51,
  zariyat: 51,
  // Ar-Rahman
  arrahman: 55,
  rahman: 55,
  // Al-Waqi'ah
  alwaqiah: 56,
  waqiah: 56,
  // Al-Hadid
  alhadid: 57,
  hadid: 57,
  // Al-Hasyr
  alhasyr: 59,
  hasyr: 59,
  // Al-Jumu'ah
  aljumuah: 62,
  jumuah: 62,
  // Al-Munafiqun
  almunafiqun: 63,
  munafiqun: 63,
  // At-Talaq
  attalaq: 65,
  talaq: 65,
  // Al-Mulk / Tabarak
  almulk: 67,
  mulk: 67,
  tabarak: 67,
  // Al-Qalam
  alqalam: 68,
  qalam: 68,
  // Al-Insan / Ad-Dahr
  alinsan: 76,
  insan: 76,
  addahr: 76,
  dahr: 76,
  // An-Nazi'at
  annaziat: 79,
  naziat: 79,
  // 'Abasa
  abasa: 80,
  // Al-Mutaffifin
  almutaffifin: 83,
  mutaffifin: 83,
  almuthaffifin: 83,
  muthaffifin: 83,
  // Al-Insyiqaq
  alinsyiqaq: 84,
  insyiqaq: 84,
  // Al-Ghasyiyah
  algasyiyah: 88,
  alghasyiyah: 88,
  gasyiyah: 88,
  ghasyiyah: 88,
  // Asy-Syams
  asysyams: 91,
  syams: 91,
  ashsyams: 91,
  // Ad-Dhuha
  addhuha: 93,
  adduha: 93,
  dhuha: 93,
  duha: 93,
  // Asy-Syarh / Al-Insyirah / Alam Nasyrah
  asysyarh: 94,
  syarh: 94,
  alinsyirah: 94,
  insyirah: 94,
  alamnasyrah: 94,
  // At-Tin
  attin: 95,
  tin: 95,
  // Al-'Alaq / Iqra
  alalaq: 96,
  alaq: 96,
  iqra: 96,
  // Al-Bayyinah
  albayyinah: 98,
  bayyinah: 98,
  // Az-Zalzalah
  alzalzalah: 99,
  azzalzalah: 99,
  zalzalah: 99,
  // Al-'Adiyat
  aladiyat: 100,
  adiyat: 100,
  // Al-Qari'ah
  alqariah: 101,
  qariah: 101,
  // At-Takatsur
  attakatsur: 102,
  takatsur: 102,
  attakasur: 102,
  takasur: 102,
  // Al-'Asr
  alasr: 103,
  asr: 103,
  // Al-Humazah
  alhumazah: 104,
  humazah: 104,
  // Al-Fil
  alfil: 105,
  fil: 105,
  // Quraisy
  quraisy: 106,
  quraysh: 106,
  alquraisy: 106,
  // Al-Ma'un
  almaun: 107,
  maun: 107,
  // Al-Kautsar
  alkautsar: 108,
  kautsar: 108,
  alkausar: 108,
  kausar: 108,
  // Al-Kafirun
  alkafirun: 109,
  kafirun: 109,
  // An-Nasr
  annasr: 110,
  nasr: 110,
  // Al-Lahab / Al-Masad
  allahab: 111,
  lahab: 111,
  almasad: 111,
  masad: 111,
  // Al-Ikhlas
  alikhlas: 112,
  ikhlas: 112,
  // Al-Falaq
  alfalaq: 113,
  falaq: 113
};

// Inisialisasi struktur map indeks
for (const s of SURAHS_DATA) {
  surahByIdMap.set(s.id, s);
  surahByNameMap.set(normalizeName(s.name), s);
  const stripped = normalizeName(s.name).replace(/^(al|an|at|as|ar|ad|az|ash|adh|adz|ath|asy)/, '');
  if (stripped && !surahByNameMap.has(stripped)) {
    surahByNameMap.set(stripped, s);
  }
}

for (const j of JUZ_DATA) {
  juzByIdMap.set(j.juz, j);
}

for (const raw of RAW_QURAN_COORDINATES) {
  const [surah, ayah, page, juz, startLine, endLine] = raw;
  const item: QuranAyahCoordinate = {
    surah,
    ayah,
    page,
    juz,
    startLine,
    endLine,
    line: endLine
  };
  const key = `${surah}:${ayah}`;
  ayahCoordinateMap.set(key, item);

  if (!pageToAyahsMap.has(page)) pageToAyahsMap.set(page, []);
  pageToAyahsMap.get(page)!.push(item);

  if (!surahToAyahsMap.has(surah)) surahToAyahsMap.set(surah, []);
  surahToAyahsMap.get(surah)!.push(item);

  if (!juzToAyahsMap.has(juz)) juzToAyahsMap.set(juz, []);
  juzToAyahsMap.get(juz)!.push(item);
}

/**
 * Mencari metadata surat berdasarkan nomor (1-114) atau nama surat (misal 'Al-Ahzab', 'al ahzab', 'Annaba', 'Almujadalah')
 */
export function getSurahInfo(surah: number | string): QuranSurahInfo | undefined {
  if (typeof surah === 'number') {
    return surahByIdMap.get(surah);
  }
  const parsed = parseInt(surah, 10);
  if (!isNaN(parsed) && surahByIdMap.has(parsed)) {
    return surahByIdMap.get(parsed);
  }
  const norm = normalizeName(surah);
  if (!norm) return undefined;

  // 1. Cek langsung di alias dictionary
  if (SURAH_ALIASES[norm]) {
    return surahByIdMap.get(SURAH_ALIASES[norm]);
  }

  // 2. Cek di nama surat terdaftar
  if (surahByNameMap.has(norm)) {
    return surahByNameMap.get(norm);
  }

  // 3. Cek setelah membuang prefix (al, an, at, as, ar, ad, dll)
  const stripped = norm.replace(/^(al|an|at|as|ar|ad|az|ash|adh|adz|ath|asy)/, '');
  if (SURAH_ALIASES[stripped]) {
    return surahByIdMap.get(SURAH_ALIASES[stripped]);
  }
  if (surahByNameMap.has(stripped)) {
    return surahByNameMap.get(stripped);
  }

  // 4. Fuzzy / substring match
  for (const s of SURAHS_DATA) {
    const sNorm = normalizeName(s.name);
    if (sNorm.includes(stripped) || stripped.includes(sNorm)) {
      return s;
    }
  }

  return undefined;
}

/**
 * Mencari metadata juz (1-30)
 */
export function getJuzInfo(juz: number): QuranJuzInfo | undefined {
  return juzByIdMap.get(juz);
}

/**
 * Mengambil koordinat spesifik ayat (Surat & Ayat -> Halaman, Juz, Baris Awal, Baris Akhir)
 */
export function getAyahCoordinate(surah: number | string, ayah: number): QuranAyahCoordinate | undefined {
  const sInfo = getSurahInfo(surah);
  if (!sInfo) return undefined;
  return ayahCoordinateMap.get(`${sInfo.id}:${ayah}`);
}

/**
 * Mengambil daftar seluruh ayat yang terdapat pada halaman tertentu (1 - 604)
 */
export function getAyahsByPage(page: number): QuranAyahCoordinate[] {
  return pageToAyahsMap.get(page) || [];
}

/**
 * Mengambil daftar seluruh ayat dalam sebuah surat
 */
export function getAyahsBySurah(surah: number | string): QuranAyahCoordinate[] {
  const sInfo = getSurahInfo(surah);
  if (!sInfo) return [];
  return surahToAyahsMap.get(sInfo.id) || [];
}

/**
 * Mengambil daftar seluruh ayat dalam juz tertentu
 */
export function getAyahsByJuz(juz: number): QuranAyahCoordinate[] {
  return juzToAyahsMap.get(juz) || [];
}

/**
 * Format string standar untuk tampilan di UI
 * Contoh: "QS. Al-Ahzab [33]: 4 (Hlm. 418, Brs. 8, Juz 21)"
 */
export function formatAyahCoordinate(surah: number | string, ayah: number): string {
  const sInfo = getSurahInfo(surah);
  if (!sInfo) return `Surat ${surah} Ayat ${ayah}`;
  const coord = getAyahCoordinate(sInfo.id, ayah);
  if (!coord) return `QS. ${sInfo.name} [${sInfo.id}]: ${ayah}`;
  return `QS. ${sInfo.name} [${sInfo.id}]: ${ayah} (Hlm. ${coord.page}, Brs. ${coord.line}, Juz ${coord.juz})`;
}

/**
 * KALKULASI HAFALAN RUTE MUNDUR (An-Nas s.d Target Surat & Ayat)
 * 
 * Sesuai metode tahfidz standar di pesantren/halaqah:
 * - Urutan surat mundur: 114, 113, ..., (targetSurah + 1), targetSurah
 * - Di dalam surat berjalan (targetSurah): urutan ayat maju: 1 s.d targetAyah
 * 
 * Contoh Kasus:
 * Santri hafal An-Nas s.d Al-Ahzab [33] ayat 4 (Halaman 418 baris 8/9):
 * 1. Surat 34 (Saba) s.d Surat 114 (An-Nas) = 177 halaman penuh (Halaman 428 - 604)
 * 2. Surat 33 (Al-Ahzab) ayat 1 s.d 4 = berhenti di halaman 418 baris 8 (~0.53 - 0.6 halaman)
 * 3. Total Halaman = ~177.53 - 177.60 Halaman
 * 4. Juz 30 s.d Juz 23 = 8 Juz penuh (100%)
 * 5. Juz 22 = 14 dari 20 halaman (~70%)
 * 6. Juz 21 = ~0.53 halaman dari 20 halaman (~2.7%)
 * 7. Total Juz Desimal = ~8.73 Juz
 */
/**
 * Menghitung bobot fisik halaman (0 s.d 1.0) berdasarkan baris mushaf yang tercover
 * Termasuk baris judul surat dan basmalah jika ayat 1 surat tersebut dihafal
 */
function computePageWeight(
  pageNum: number,
  memList: QuranAyahCoordinate[],
  allPageAyahs: QuranAyahCoordinate[]
): number {
  if (memList.length === 0) return 0;
  if (memList.length === allPageAyahs.length) return 1.0;

  const lines = new Set<number>();
  for (const item of memList) {
    for (let l = item.startLine; l <= item.endLine; l++) {
      lines.add(l);
    }
  }

  // Sertakan baris judul surat dan basmalah jika ayat 1 dari surat yang mulai di halaman ini dihafal
  for (const s of SURAHS_DATA) {
    if (s.startPage === pageNum) {
      const hasAyah1 = memList.some(item => item.surah === s.id && item.ayah === 1);
      if (hasAyah1) {
        const sAyah1 = getAyahCoordinate(s.id, 1);
        if (sAyah1 && sAyah1.startLine > 1) {
          const prevAyahs = allPageAyahs.filter(a => a.surah !== s.id && a.page === pageNum);
          const maxPrevLine = prevAyahs.length > 0 ? Math.max(...prevAyahs.map(a => a.endLine)) : 0;
          for (let l = maxPrevLine + 1; l < sAyah1.startLine; l++) {
            lines.add(l);
          }
        }
      }
    }
  }

  return Math.min(1.0, Math.max(0.05, Math.round((lines.size / 15) * 1000) / 1000));
}

export function calculateHafalanMundur(
  targetSurahInput: number | string,
  targetAyahInput: number
): HafalanCalculationResult {
  const sInfo = getSurahInfo(targetSurahInput);
  if (!sInfo) {
    throw new Error(`Surat tidak ditemukan: ${targetSurahInput}`);
  }
  const targetSurah = sInfo.id;
  const targetAyah = Math.min(Math.max(1, targetAyahInput), sInfo.totalAyah);
  const targetCoord = getAyahCoordinate(targetSurah, targetAyah)!;

  // Himpunan seluruh ayat yang dihafal
  const memorizedCoords: QuranAyahCoordinate[] = [];
  
  // 1. Surat penuh dari 114 s.d targetSurah + 1
  for (let s = 114; s > targetSurah; s--) {
    const sAyahs = surahToAyahsMap.get(s) || [];
    for (const a of sAyahs) {
      memorizedCoords.push(a);
    }
  }

  // 2. Surat berjalan (targetSurah): ayat 1 s.d targetAyah
  const activeSurahAyahs = surahToAyahsMap.get(targetSurah) || [];
  for (let a = 1; a <= targetAyah; a++) {
    const c = activeSurahAyahs[a - 1];
    if (c) memorizedCoords.push(c);
  }

  // Kelompokkan ayat yang dihafal berdasarkan halaman
  const memorizedPagesMap = new Map<number, QuranAyahCoordinate[]>();
  for (const c of memorizedCoords) {
    if (!memorizedPagesMap.has(c.page)) memorizedPagesMap.set(c.page, []);
    memorizedPagesMap.get(c.page)!.push(c);
  }

  // Hitung bobot fisik halaman:
  // - Halaman penuh (seluruh ayat di halaman tersebut dihafal) = 1.0
  // - Halaman sebagian = dihitung presisi berdasarkan porsi baris mushaf yang tercover
  let totalHalaman = 0;
  const pageWeights = new Map<number, number>();

  for (let p = 1; p <= 604; p++) {
    const memList = memorizedPagesMap.get(p);
    if (!memList || memList.length === 0) continue;

    const allPageAyahs = pageToAyahsMap.get(p) || [];
    const w = computePageWeight(p, memList, allPageAyahs);

    pageWeights.set(p, w);
    totalHalaman += w;
  }

  // Hitung capaian per Juz (1 s.d 30)
  const juzBreakdown: JuzBreakdownItem[] = [];
  let totalJuzDecimal = 0;

  for (const j of JUZ_DATA) {
    let memorizedInJuzPages = 0;
    let minAyahInJuz: QuranAyahCoordinate | null = null;
    let maxAyahInJuz: QuranAyahCoordinate | null = null;

    for (let p = j.startPage; p <= j.endPage; p++) {
      const w = pageWeights.get(p) || 0;
      memorizedInJuzPages += w;

      const memList = memorizedPagesMap.get(p);
      if (memList && memList.length > 0) {
        for (const c of memList) {
          if (!minAyahInJuz || c.surah < minAyahInJuz.surah || (c.surah === minAyahInJuz.surah && c.ayah < minAyahInJuz.ayah)) {
            minAyahInJuz = c;
          }
          if (!maxAyahInJuz || c.surah > maxAyahInJuz.surah || (c.surah === maxAyahInJuz.surah && c.ayah > maxAyahInJuz.ayah)) {
            maxAyahInJuz = c;
          }
        }
      }
    }

    const percentage = Math.min(100, Math.round((memorizedInJuzPages / j.totalPages) * 1000) / 10);
    const status: 'FULL' | 'PARTIAL' | 'EMPTY' = 
      percentage >= 99.5 ? 'FULL' : percentage > 0.5 ? 'PARTIAL' : 'EMPTY';

    const juzFraction = Math.min(1.0, memorizedInJuzPages / j.totalPages);
    totalJuzDecimal += juzFraction;

    let desc = 'Belum dihafal';
    if (status === 'FULL') {
      desc = 'Penuh (100%)';
    } else if (status === 'PARTIAL' && minAyahInJuz && maxAyahInJuz) {
      const sMin = surahByIdMap.get(minAyahInJuz.surah)?.name || minAyahInJuz.surah;
      const sMax = surahByIdMap.get(maxAyahInJuz.surah)?.name || maxAyahInJuz.surah;
      desc = `${sMin}: ${minAyahInJuz.ayah} s.d ${sMax}: ${maxAyahInJuz.ayah}`;
    }

    juzBreakdown.push({
      juz: j.juz,
      name: j.name,
      status,
      pagesMemorized: Math.round(memorizedInJuzPages * 100) / 100,
      totalPages: j.totalPages,
      percentage,
      ayahRangeDescription: desc
    });
  }

  return {
    direction: 'backward',
    targetSurah: sInfo.id,
    targetSurahName: sInfo.name,
    targetAyah,
    targetPage: targetCoord.page,
    targetLine: targetCoord.line,
    targetJuz: targetCoord.juz,
    totalHalaman: Math.round(totalHalaman * 100) / 100,
    totalJuzDecimal: Math.round(totalJuzDecimal * 100) / 100,
    totalAyat: memorizedCoords.length,
    juzBreakdown,
    surahRangeDesc: `An-Nas [114]: 6 s.d ${sInfo.name} [${sInfo.id}]: ${targetAyah}`
  };
}

/**
 * KALKULASI HAFALAN RUTE MAJU (Al-Fatihah 1:1 s.d Target Surat & Ayat)
 */
export function calculateHafalanMaju(
  targetSurahInput: number | string,
  targetAyahInput: number
): HafalanCalculationResult {
  const sInfo = getSurahInfo(targetSurahInput);
  if (!sInfo) {
    throw new Error(`Surat tidak ditemukan: ${targetSurahInput}`);
  }
  const targetSurah = sInfo.id;
  const targetAyah = Math.min(Math.max(1, targetAyahInput), sInfo.totalAyah);
  const targetCoord = getAyahCoordinate(targetSurah, targetAyah)!;

  const memorizedCoords: QuranAyahCoordinate[] = [];
  
  // 1. Surat penuh dari 1 s.d targetSurah - 1
  for (let s = 1; s < targetSurah; s++) {
    const sAyahs = surahToAyahsMap.get(s) || [];
    for (const a of sAyahs) {
      memorizedCoords.push(a);
    }
  }

  // 2. Surat berjalan: ayat 1 s.d targetAyah
  const activeSurahAyahs = surahToAyahsMap.get(targetSurah) || [];
  for (let a = 1; a <= targetAyah; a++) {
    const c = activeSurahAyahs[a - 1];
    if (c) memorizedCoords.push(c);
  }

  const memorizedPagesMap = new Map<number, QuranAyahCoordinate[]>();
  for (const c of memorizedCoords) {
    if (!memorizedPagesMap.has(c.page)) memorizedPagesMap.set(c.page, []);
    memorizedPagesMap.get(c.page)!.push(c);
  }

  let totalHalaman = 0;
  const pageWeights = new Map<number, number>();

  for (let p = 1; p <= 604; p++) {
    const memList = memorizedPagesMap.get(p);
    if (!memList || memList.length === 0) continue;

    const allPageAyahs = pageToAyahsMap.get(p) || [];
    const w = computePageWeight(p, memList, allPageAyahs);

    pageWeights.set(p, w);
    totalHalaman += w;
  }

  const juzBreakdown: JuzBreakdownItem[] = [];
  let totalJuzDecimal = 0;

  for (const j of JUZ_DATA) {
    let memorizedInJuzPages = 0;
    let minAyahInJuz: QuranAyahCoordinate | null = null;
    let maxAyahInJuz: QuranAyahCoordinate | null = null;

    for (let p = j.startPage; p <= j.endPage; p++) {
      const w = pageWeights.get(p) || 0;
      memorizedInJuzPages += w;

      const memList = memorizedPagesMap.get(p);
      if (memList && memList.length > 0) {
        for (const c of memList) {
          if (!minAyahInJuz || c.surah < minAyahInJuz.surah || (c.surah === minAyahInJuz.surah && c.ayah < minAyahInJuz.ayah)) {
            minAyahInJuz = c;
          }
          if (!maxAyahInJuz || c.surah > maxAyahInJuz.surah || (c.surah === maxAyahInJuz.surah && c.ayah > maxAyahInJuz.ayah)) {
            maxAyahInJuz = c;
          }
        }
      }
    }

    const percentage = Math.min(100, Math.round((memorizedInJuzPages / j.totalPages) * 1000) / 10);
    const status: 'FULL' | 'PARTIAL' | 'EMPTY' = 
      percentage >= 99.5 ? 'FULL' : percentage > 0.5 ? 'PARTIAL' : 'EMPTY';

    const juzFraction = Math.min(1.0, memorizedInJuzPages / j.totalPages);
    totalJuzDecimal += juzFraction;

    let desc = 'Belum dihafal';
    if (status === 'FULL') {
      desc = 'Penuh (100%)';
    } else if (status === 'PARTIAL' && minAyahInJuz && maxAyahInJuz) {
      const sMin = surahByIdMap.get(minAyahInJuz.surah)?.name || minAyahInJuz.surah;
      const sMax = surahByIdMap.get(maxAyahInJuz.surah)?.name || maxAyahInJuz.surah;
      desc = `${sMin}: ${minAyahInJuz.ayah} s.d ${sMax}: ${maxAyahInJuz.ayah}`;
    }

    juzBreakdown.push({
      juz: j.juz,
      name: j.name,
      status,
      pagesMemorized: Math.round(memorizedInJuzPages * 100) / 100,
      totalPages: j.totalPages,
      percentage,
      ayahRangeDescription: desc
    });
  }

  return {
    direction: 'forward',
    targetSurah: sInfo.id,
    targetSurahName: sInfo.name,
    targetAyah,
    targetPage: targetCoord.page,
    targetLine: targetCoord.line,
    targetJuz: targetCoord.juz,
    totalHalaman: Math.round(totalHalaman * 100) / 100,
    totalJuzDecimal: Math.round(totalJuzDecimal * 100) / 100,
    totalAyat: memorizedCoords.length,
    juzBreakdown,
    surahRangeDesc: `Al-Fatihah [1]: 1 s.d ${sInfo.name} [${sInfo.id}]: ${targetAyah}`
  };
}

/**
 * Menghitung volume rentang setoran antara 2 titik ayat (untuk setoran Ziyadah atau Murojaah harian)
 */
export function calculateRentangHafalan(
  fromSurahInput: number | string,
  fromAyah: number,
  toSurahInput: number | string,
  toAyah: number,
  direction: 'forward' | 'backward' | 'auto' = 'auto'
): HafalanRangeResult {
  const sStart = getSurahInfo(fromSurahInput);
  const sEnd = getSurahInfo(toSurahInput);
  if (!sStart || !sEnd) {
    throw new Error('Surat awal atau akhir tidak valid');
  }

  const cStart = getAyahCoordinate(sStart.id, fromAyah) || {
    surah: sStart.id, ayah: fromAyah, page: sStart.startPage, juz: sStart.startJuz, startLine: 1, endLine: 1, line: 1
  };
  const cEnd = getAyahCoordinate(sEnd.id, toAyah) || {
    surah: sEnd.id, ayah: toAyah, page: sEnd.endPage, juz: sEnd.endJuz, startLine: 15, endLine: 15, line: 15
  };

  // 1. RUTE MUNDUR (Hafalan Belakang: dari An-Nas [114] mundur ke target surat & ayat)
  const isBackwardRoute = direction === 'backward' || (direction === 'auto' && (sStart.id === 114 || sEnd.id === 114));
  if (isBackwardRoute) {
    let targetSurah = sStart.id;
    let targetAyah = fromAyah;
    if (sStart.id === 114 && sEnd.id !== 114) {
      targetSurah = sEnd.id;
      targetAyah = toAyah;
    } else if (sEnd.id === 114 && sStart.id !== 114) {
      targetSurah = sStart.id;
      targetAyah = fromAyah;
    } else {
      // Jika keduanya bukan 114 atau keduanya 114: target adalah surat dengan urutan lebih awal (angka lebih kecil)
      if (sStart.id < sEnd.id || (sStart.id === sEnd.id && fromAyah <= toAyah)) {
        targetSurah = sStart.id;
        targetAyah = fromAyah;
      } else {
        targetSurah = sEnd.id;
        targetAyah = toAyah;
      }
    }

    const res = calculateHafalanMundur(targetSurah, targetAyah);
    return {
      startSurah: sStart.id,
      startAyah: fromAyah,
      endSurah: sEnd.id,
      endAyah: toAyah,
      startPage: cStart.page,
      startLine: cStart.startLine,
      endPage: cEnd.page,
      endLine: cEnd.endLine,
      totalHalaman: res.totalHalaman,
      totalJuzDecimal: res.totalJuzDecimal,
      totalAyat: res.totalAyat
    };
  }

  // 2. RUTE MAJU (Hafalan Depan: dari Al-Fatihah [1] maju ke target surat & ayat)
  const isForwardRoute = direction === 'forward' || (direction === 'auto' && (sStart.id === 1 || sEnd.id === 1));
  if (isForwardRoute && (sStart.id === 1 || sEnd.id === 1)) {
    let targetSurah = sStart.id === 1 ? sEnd.id : sStart.id;
    let targetAyah = sStart.id === 1 ? toAyah : fromAyah;
    const res = calculateHafalanMaju(targetSurah, targetAyah);
    return {
      startSurah: sStart.id,
      startAyah: fromAyah,
      endSurah: sEnd.id,
      endAyah: toAyah,
      startPage: cStart.page,
      startLine: cStart.startLine,
      endPage: cEnd.page,
      endLine: cEnd.endLine,
      totalHalaman: res.totalHalaman,
      totalJuzDecimal: res.totalJuzDecimal,
      totalAyat: res.totalAyat
    };
  }

  // 3. Rentang fisik kontigu (misal setoran ziyadah harian dalam satu segmen mushaf)
  let first = cStart;
  let second = cEnd;
  if (first.page > second.page || (first.page === second.page && first.endLine > second.endLine)) {
    first = cEnd;
    second = cStart;
  }

  let totalHalaman = 0;
  if (first.page === second.page) {
    const lines = Math.max(1, second.endLine - first.startLine + 1);
    totalHalaman = lines / 15;
  } else {
    const firstPageFrac = (15 - first.startLine + 1) / 15;
    const lastPageFrac = second.endLine / 15;
    const middlePages = Math.max(0, second.page - first.page - 1);
    totalHalaman = firstPageFrac + middlePages + lastPageFrac;
  }

  const totalJuzDecimal = totalHalaman / 20;

  return {
    startSurah: first.surah,
    startAyah: first.ayah,
    endSurah: second.surah,
    endAyah: second.ayah,
    startPage: first.page,
    startLine: first.startLine,
    endPage: second.page,
    endLine: second.endLine,
    totalHalaman: Math.round(totalHalaman * 100) / 100,
    totalJuzDecimal: Math.round(totalJuzDecimal * 100) / 100,
    totalAyat: 0
  };
}

/**
 * MENGHITUNG ZIYADAH BERSIH (Net Addition)
 * Mencegah pelaporan ganda saat santri mengulang halaman yang sama karena belum lancar.
 * 
 * Logika:
 * Hanya menghitung selisih pertambahan dari posisi terjauh yang pernah dicapai sebelumnya.
 * Jika santri menyetor halaman yang sama dengan posisi terakhir (remidi), netZiyadah = 0.
 */
export function calculateNetZiyadah(
  previousPosition: { surah: number | string; ayah: number } | null | undefined,
  currentPosition: { surah: number | string; ayah: number },
  direction: 'backward' | 'forward' = 'backward'
): { netHalaman: number; netJuz: number; isRemidi: boolean } {
  if (!previousPosition) {
    const res = direction === 'backward'
      ? calculateHafalanMundur(currentPosition.surah, currentPosition.ayah)
      : calculateHafalanMaju(currentPosition.surah, currentPosition.ayah);
    return {
      netHalaman: res.totalHalaman,
      netJuz: res.totalJuzDecimal,
      isRemidi: false
    };
  }

  const prevRes = direction === 'backward'
    ? calculateHafalanMundur(previousPosition.surah, previousPosition.ayah)
    : calculateHafalanMaju(previousPosition.surah, previousPosition.ayah);

  const currRes = direction === 'backward'
    ? calculateHafalanMundur(currentPosition.surah, currentPosition.ayah)
    : calculateHafalanMaju(currentPosition.surah, currentPosition.ayah);

  const diffHalaman = Math.max(0, currRes.totalHalaman - prevRes.totalHalaman);
  const diffJuz = Math.max(0, currRes.totalJuzDecimal - prevRes.totalJuzDecimal);
  const isRemidi = diffHalaman === 0;

  return {
    netHalaman: Math.round(diffHalaman * 100) / 100,
    netJuz: Math.round(diffJuz * 100) / 100,
    isRemidi
  };
}

/**
 * Hasil perhitungan halaman setoran harian (mushaf fisik)
 */
export interface SetoranHalamanResult {
  halaman: number;
  startPage: number;
  endPage: number;
  startSurah: QuranSurahInfo;
  endSurah: QuranSurahInfo;
  startAyah: number;
  endAyah: number;
  totalAyat: number;
}

/**
 * Parsing string rentang hafalan/setoran, misal:
 * - "Annaba 1 - annas 6"
 * - "Almujadalah 1 - attahrim 12"
 * - "Al-Baqarah 1 - 20"
 * - "An-Naba 1 s.d An-Nas 6"
 */
export function parseRentangHafalanString(str: string): {
  startSurah: string;
  startAyah: number;
  endSurah: string;
  endAyah: number;
} | null {
  if (!str) return null;
  const cleaned = str.trim();
  const parts = cleaned.split(/\s+[-–—]\s+|\s+s\.?d\.?\s+|\s+sampai\s+/i);
  if (parts.length !== 2) return null;

  const parsePart = (p: string) => {
    const match = p.match(/^(.+?)(?:\s*(?:ayat|:)\s*|\s+)(\d+)$/i);
    if (match) {
      return { surah: match[1].trim(), ayah: parseInt(match[2], 10) };
    }
    const numOnly = p.match(/^(\d+)$/);
    if (numOnly) {
      return { surah: '', ayah: parseInt(numOnly[1], 10) };
    }
    return { surah: p.trim(), ayah: 1 };
  };

  const p1 = parsePart(parts[0]);
  const p2 = parsePart(parts[1]);
  if (!p2.surah && p1.surah) {
    p2.surah = p1.surah;
  }
  return {
    startSurah: p1.surah,
    startAyah: p1.ayah,
    endSurah: p2.surah,
    endAyah: p2.ayah
  };
}

/**
 * Menghitung jumlah halaman setoran harian (Ziyadah/Sabqi/Manzil/Murojaah) secara presisi
 * Contoh:
 * - Annaba 1 - annas 6 => 23 halaman (Hal 582 s.d 604)
 * - Almujadalah 1 - attahrim 12 => 20 halaman (Hal 542 s.d 561)
 * - An-Naba 1 - 40 => 1.5 halaman
 * - Al-Mulk 1 - 30 => 2.5 halaman
 * - Al-Baqarah 1 - 141 => 20 halaman
 */
export function calculateHalamanSetoran(
  fromSurahInput: number | string,
  fromAyah: number,
  toSurahInput: number | string,
  toAyah: number
): SetoranHalamanResult | null {
  const s1 = getSurahInfo(fromSurahInput);
  const s2 = getSurahInfo(toSurahInput);
  if (!s1 || !s2) return null;

  let startS = s1, endS = s2, startA = Math.max(1, fromAyah || 1), endA = Math.max(1, toAyah || 1);
  if (s1.id > s2.id || (s1.id === s2.id && startA > endA)) {
    startS = s2; endS = s1; startA = Math.max(1, toAyah || 1); endA = Math.max(1, fromAyah || 1);
  }

  const cStart = getAyahCoordinate(startS.id, startA) || {
    surah: startS.id, ayah: startA, page: startS.startPage, juz: startS.startJuz, startLine: 1, endLine: 1, line: 1
  };
  const cEnd = getAyahCoordinate(endS.id, endA) || {
    surah: endS.id, ayah: endA, page: endS.endPage, juz: endS.endJuz, startLine: 15, endLine: 15, line: 15
  };

  // Jika mulai dari ayat 1 di awal surat yang terletak di atas halaman, hitung efektif baris 1 (termasuk judul & basmalah)
  const startEffectiveLine = (startA === 1 && cStart.page === startS.startPage) ? 1 : cStart.startLine;
  // Jika selesai di ayat terakhir surat yang terletak di akhir halaman, hitung efektif baris 15
  const endEffectiveLine = (endA === endS.totalAyah && cEnd.page === endS.endPage && cEnd.endLine >= 13) ? 15 : cEnd.endLine;

  let halaman = 0;
  if (cStart.page === cEnd.page) {
    const lines = Math.max(1, endEffectiveLine - startEffectiveLine + 1);
    const frac = lines / 15;
    if (frac <= 0.6) {
      halaman = 0.5;
    } else {
      halaman = 1;
    }
  } else {
    const firstPageFrac = (15 - startEffectiveLine + 1) / 15;
    const lastPageFrac = endEffectiveLine / 15;
    const middlePages = Math.max(0, cEnd.page - cStart.page - 1);
    const rawTotal = firstPageFrac + middlePages + lastPageFrac;

    // Jika mendekati bilangan bulat (selisih < 0.18 halaman), bulatkan ke bilangan bulat (contoh: 19.87 -> 20, 22.8 -> 23)
    const nearestInt = Math.round(rawTotal);
    if (Math.abs(rawTotal - nearestInt) < 0.18) {
      halaman = nearestInt;
    } else {
      halaman = Math.round(rawTotal * 2) / 2; // step 0.5
    }
  }

  return {
    halaman,
    startPage: cStart.page,
    endPage: cEnd.page,
    startSurah: startS,
    endSurah: endS,
    startAyah: startA,
    endAyah: endA,
    totalAyat: 0
  };
}

