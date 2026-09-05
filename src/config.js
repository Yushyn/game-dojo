// Єдине місце, де щось треба вставити руками.
// Обидва значення публічні — вони летять у браузер кожного гравця.
// Захист бази роблять RLS-політики (schema.sql), а не секретність ключа.
// sb_secret_* сюди НЕ клади ніколи.

export const SUPABASE_URL = 'https://tesfdjanxmhxvcwpnsjs.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__jCD7IQesadXZtxcA0e1SA_jxDChmzF';

// Внутрішній розмір полотна. Сторінка масштабує його під вікно,
// але всі координати всередині коду рахуються саме в цих числах.
export const GAME = {
  width: 1920,
  height: 1080,
};
