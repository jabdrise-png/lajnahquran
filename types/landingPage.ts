export interface CustomPageSection {
  id: string;
  title?: string;
  subtitle?: string;
  content: string;
  mediaUrl?: string; // Image or youtube link
}

export interface CustomPage {
  id: string;
  slug: string;
  menuTitle: string; // Used in navigation
  title: string;     // Main page title
  subtitle?: string; // Main page subtitle
  sections: CustomPageSection[];
}

export interface LandingPageConfig {
  theme: {
    primaryColor: string;
    logoUrl: string;
    appName: string;
  };
  seo: {
    title: string;
    description: string;
    ogImage: string;
  };
  sections: SectionConfig[];
  customPages?: CustomPage[];
  loginPage?: {
    systemStatusText: string;
    quoteText: string;
    authorName: string;
    authorRole: string;
    authorAvatarUrl: string;
    stats: { value: string; label: string }[];
  };
  footer: {

    description: string;
    whatsapp: string;
    instagram: string;
  };
}

export interface SectionConfig {
  id: string;
  type: string;
  isVisible: boolean;
  data: any;
}

export const defaultLandingPageConfig: LandingPageConfig = {
  theme: {
    primaryColor: '#2563eb',
    logoUrl: 'https://i.ibb.co.com/KcYyzZRz/Tanpa-judul-1080-x-1080-piksel-20260116-084021-0000.png',
    appName: 'Lajnah Quran',
  },
  seo: {
    title: 'Lajnah Quran - Platform Manajemen Tahfidz',
    description: 'Platform Manajemen Tahfidz Generasi Baru',
    ogImage: '',
  },
  loginPage: {
    systemStatusText: 'Sistem Berjalan Normal',
    quoteText: '"Platform ini mengubah total cara kami mengelola progres hafalan santri. Sangat intuitif, cepat, dan laporannya luar biasa rapi. Benar-benar memangkas jam kerja admin."',
    authorName: 'Ust. Ahmad Fatih',
    authorRole: 'Kepala Tahfidz, PPTQ Al-Ikhlas',
    authorAvatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=UstadzBudi',
    stats: [
      { value: '99.9%', label: 'Uptime Keandalan' },
      { value: '50k+', label: 'Santri Aktif' },
      { value: '120+', label: 'Mitra Pesantren' }
    ]
  },
  sections: [
    {
      id: 'hero',
      type: 'hero',
      isVisible: true,
      data: {
        headline: 'Kelola Operasional Halaqah\nLebih Efisien & Terukur',
        subheadline: 'Lajnah Quran membantu pesantren dan rumah Quran menyatukan absensi, evaluasi hafalan, dan pelaporan wali santri.',
        buttonText: 'Coba Demo Gratis',
        buttonLink: '/app',
        heroImages: [
          'https://images.unsplash.com/photo-1720962158883-b0f2021fb51e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBzb2Z0d2FyZSUyMGRhc2hib2FyZCUyMGludGVyZmFjZSUyMFVJfGVufDF8fHx8MTc3ODE3Mjk4MHww&ixlib=rb-4.1.0&q=80&w=1200'
        ]
      }
    },
    {
      id: 'features',
      type: 'features',
      isVisible: true,
      data: {
        title: 'Tinggalkan Cara Manual',
        description: 'Pencatatan konvensional membuang banyak waktu.',
        features: [
          { id: '1', icon: 'FileText', title: 'Absensi Sulit Direkap', description: 'Pencatatan di buku presensi membuat rekapitulasi lambat.' },
          { id: '2', icon: 'TrendingUp', title: 'Hafalan Tidak Terukur', description: 'Perkembangan capaian sulit dipantau.' },
          { id: '3', icon: 'Users', title: 'Wali Santri Kurang Terlibat', description: 'Orang tua kesulitan memantau perkembangan harian.' }
        ]
      }
    },
    {
      id: 'details',
      type: 'details',
      isVisible: true,
      data: {
        title: 'Solusi Manajemen Berbasis Data',
        description: 'Kami menghadirkan antarmuka minimalis dan cepat yang memudahkan pengajar untuk fokus pada hal yang terpenting: perkembangan santri.',
        items: [
          {
            id: '1',
            icon: 'CalendarCheck',
            title: 'Presensi Super Cepat',
            description: 'Musammi dapat melakukan absensi dengan satu klik. Data tersimpan real-time, mengeliminasi pekerjaan rekap manual bulanan untuk selamanya.',
            imageUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
            bullets: ['Rekap harian otomatis', 'Indikator status visual (Hadir, Izin, Sakit)', 'Notifikasi ke orang tua'],
            imageRight: true
          },
          {
            id: '2',
            icon: 'LineChart',
            title: 'Visualisasi Perkembangan',
            description: 'Pantau grafik hafalan, tren kedisiplinan, dan target bulanan melalui komponen chart kelas enterprise yang mudah dibaca.',
            imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
            bullets: ['Grafik statistik interaktif', 'Analisis performa kelas', 'Perbandingan historis semesteran'],
            imageRight: false
          }
        ]
      }
    },
    {
      id: 'pricing',
      type: 'pricing',
      isVisible: true,
      data: {
        title: 'Pilihan Paket Hemat',
        description: 'Pilih paket yang sesuai dengan kebutuhan lembaga Anda.',
        plans: [
          {
            id: '1',
            name: 'Basic Plan',
            description: 'Cocok untuk rumah Qur\'an atau pesantren skala kecil.',
            currency: 'Rp',
            price: '200.000',
            period: '/bulan',
            capacityLabel: 'Kapasitas 0 - 200 Santri',
            features: [
              'Semua fitur manajemen dasar',
              'Akses unlimited Musammi',
              'Laporan bulanan otomatis',
              'Support via Email'
            ],
            buttonText: 'Pilih Basic',
            buttonLink: '/app',
            isRecommended: false
          },
          {
            id: '2',
            name: 'Pro Plan',
            description: 'Solusi tepat untuk lembaga tahfidz menengah ke atas.',
            currency: 'Rp',
            price: '375.000',
            period: '/bulan',
            capacityLabel: 'Kapasitas 201 - 400 Santri',
            features: [
              'Semua fitur di paket Basic',
              'Dashboard statistik lanjutan',
              'Export data format khusus',
              'Prioritas Support via WhatsApp'
            ],
            buttonText: 'Pilih Pro',
            buttonLink: '/app',
            isRecommended: true,
            recommendedLabel: 'PALING DIMINATI'
          }
        ]
      }
    },
    {
      id: 'testimonials',
      type: 'testimonials',
      isVisible: true,
      data: {
        title: 'Dipercaya oleh Praktisi',
        testimonials: [
          { id: '1', quote: 'Rekap absensi sangat mudah.', name: 'Ahmad', role: 'Kepala Tahfidz' },
          { id: '2', quote: 'Sistemnya sangat intuitif.', name: 'Budi', role: 'Admin' }
        ]
      }
    },
    {
      id: 'cta',
      type: 'cta',
      isVisible: true,
      data: {
        title: 'Siap Bertransformasi?',
        description: 'Beralih ke sistem manajemen halaqah generasi modern dan mulailah menghemat waktu operasional harian Anda.',
        buttonText: 'Mulai Gunakan Lajnah',
        buttonLink: '/app',
        secondaryButtonText: 'Hubungi Sales',
        secondaryButtonLink: '#'
      }
    }
  ],
  footer: {
    description: 'Platform Manajemen Tahfidz Generasi Baru.',
    whatsapp: 'https://wa.me/',
    instagram: 'https://instagram.com/'
  }
};
