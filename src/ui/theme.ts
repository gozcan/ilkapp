// src/ui/theme.ts
// Tek noktadan tema & tasarım tokenları

export const colors = {
  // Marka
  primary: '#000089',
  primary600: '#1212A8',

  // Metin & yüzey
  text: '#111111',
  mutedText: '#6B7280',
  bg: '#FFFFFF',
  surface: '#FFFFFF',

  // Çerçeve & ayırıcı
  border: '#E6E6E6',

  // Durum renkleri (Görev)
  task: {
    todo: '#6B7280', // yapılacak (gri-500)
    doing: '#000089', // yapılıyor (primary)
    done: '#16A34A', // tamamlandı (yeşil)
    canceled: '#9CA3AF', // iptal (gri-400)
    high: '#DC2626', // öncelik: yüksek
    medium: '#D97706', // öncelik: orta
    low: '#64748B', // öncelik: düşük
  },

  // Geri bildirim
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
};

export const radius = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
};

export const spacing = {
  x0: 0,
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 20,
  x6: 24,
  x7: 28,
  x8: 32,
};

export const font = {
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
  },
  // Not: Montserrat/Unistans ekleyeceğimiz zaman burada family ekleyeceğiz.
  family: {
    regular: undefined, // sistem font
    medium: undefined,
    bold: undefined,
  },
};

export const shadow = {
  // iOS shadow + Android elevation için basit presetler
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

// Yardımcı: px → style spacing
export const s = (k: keyof typeof spacing) => spacing[k];

// Yardımcı: görev durum/öncelik rengi
export const taskStatusColor = (
  status: 'yapılacak' | 'yapılıyor' | 'tamamlandı' | 'iptal'
) => {
  switch (status) {
    case 'yapılıyor':
      return colors.task.doing;
    case 'tamamlandı':
      return colors.task.done;
    case 'iptal':
      return colors.task.canceled;
    default:
      return colors.task.todo;
  }
};

export const taskPriorityColor = (
  priority: 'high' | 'medium' | 'low' = 'medium'
) => {
  switch (priority) {
    case 'high':
      return colors.task.high;
    case 'low':
      return colors.task.low;
    default:
      return colors.task.medium;
  }
};

// Örnek buton teması (ileride UI/Button.tsx içinde kullanacağız)
export const buttonTheme = {
  primary: {
    container: {
      backgroundColor: colors.primary,
      borderRadius: radius.lg,
      paddingVertical: s('x4'),
      paddingHorizontal: s('x6'),
    },
    text: {
      color: '#fff',
      fontSize: font.sizes.md,
      fontWeight: '700' as const,
    },
    pressed: { opacity: 0.9 },
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.lg,
      paddingVertical: s('x4'),
      paddingHorizontal: s('x6'),
    },
    text: {
      color: colors.primary,
      fontSize: font.sizes.md,
      fontWeight: '700' as const,
    },
    pressed: { opacity: 0.85 },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderRadius: radius.lg,
      paddingVertical: s('x3'),
      paddingHorizontal: s('x4'),
    },
    text: {
      color: colors.primary,
      fontSize: font.sizes.md,
      fontWeight: '600' as const,
    },
    pressed: { opacity: 0.8 },
  },
};
