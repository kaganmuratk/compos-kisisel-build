// Maps raw JS/Supabase/PowerSync error messages to user-facing Turkish text.
// Never surface `error.message` directly in UI — it can leak implementation
// details (stack traces, internal endpoints, library names) to end users.
export function friendlyErrorMessage(error: unknown, fallback = 'Bir şeyler ters gitti, lütfen tekrar dene.'): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout') || lower.includes('offline')) {
    return 'İnternet bağlantısı kurulamadı. Verilerin cihazında güvende; bağlantı geri geldiğinde otomatik olarak senkronlanacak.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'E-posta veya şifre hatalı.';
  }
  if (lower.includes('email not confirmed')) {
    return 'E-posta adresin henüz onaylanmamış. Gelen kutunu kontrol et.';
  }
  if (lower.includes('user already registered')) {
    return 'Bu e-posta adresiyle zaten bir hesap var.';
  }
  if (lower.includes('rate limit')) {
    return 'Çok fazla deneme yapıldı, lütfen biraz bekleyip tekrar dene.';
  }
  return fallback;
}
