# Tasarım Sistemi

`ui-ux-pro-max` skill'inden üretilip `src/constants/theme.ts` içine uygulandı. Yeni ekran yazarken buradaki token'ları kullan, ham hex değer/serbest boşluk değeri yazma.

## Yön

Minimalism & Swiss Style (temiz tipografi, bol boşluk) + Bento Box Grid'in kart dili (yumuşak radius, ince gölge) karışımı. Klişe kırmızı/turuncu "enerji" paletleri yerine sıcak nötr graphite + tek vurgu rengi olarak sıcak bir bronz/amber.

**v2 (tasarım yenilemesi):** İlk sürümdeki teal vurgu rengi, kullanıcı geri bildirimiyle ("yeşil beyaz pek istediğim gibi değil") sıcak bronz/amber ile değiştirildi — terracotta ve klişe fitness turuncusu (`#F97316` gibi doygun/parlak tonlar) bilinçli olarak elendi; bunun yerine düşük doygunluklu, koyu bir "eskimiş pirinç/bronz" tonu (`H32 S62`) seçildi ki hem premium hem sakin dursun. Aynı yenilemede koyu mod nötrleri de ısıtıldı: eski `backgroundElement`/`backgroundSelected`/`border`/`textSecondary` mavi-gri bir tonda (hue ~207-216°) idi, açık moddaki sıcak nötrlerle (hue ~43-60°) tutarsızdı — aynı lightness adımları korunarak hue sıcak tarafa (hue ~40°) kaydırıldı. `background` (`#000000`, gerçek siyah) bilinçli olarak değişmedi; OLED-dostu ve zaten "premium karanlık" hissi veriyordu.

## Renkler (`Colors.light` / `Colors.dark`)

- `background` / `backgroundElement` (kart yüzeyi) / `backgroundSelected` — nötr, sıcak (saf beyaz/siyah değil, `#FAFAF8` / `#0E0E12` uçları arası; koyu moddaki ara yüzeyler `#15151C` / `#1B1B23`)

**2026-09-06 düzeltme:** Koyu mod `background` daha önce gerçek siyah (`#000000`) olarak belgelenmişti ama fiilen ekranların büyük çoğunluğu (Today/Insights/Nutrition/History/Settings) zaten ayrı bir yerde tanımlı `nutritionPalette.background` (`#0E0E12`) kullanıyordu; ayrıca antrenman ekranları üçüncü bir değer (`#0A0A0A`) kullanıyordu. Üç farklı "siyah" arasındaki fark gözle görülür bir tutarsızlık yaratıyordu. Kanonik değer, en yaygın fiili kullanımı yansıtacak şekilde `#0E0E12`'ye sabitlendi (`src/constants/theme.ts` ve `nutritionPalette` artık aynı değerleri paylaşıyor) — "gerçek OLED siyahı" gerekçesi geçersiz kılındı, pratik tutarlılık tercih edildi.
- `text` / `textSecondary` / `border`
- `accent` — tek vurgu rengi (bronz/amber: light `#8C5A21`, dark `#E3AC6D` — kontrast için dark modda daha açık/parlak), buton/aktif tab/chart çizgisi/link için kullan. `accentOn` her modda `accent` zemininde okunaklı düz renk (light `#FFFFFF`, dark `#241004`).
- `destructive` — sadece silme/hata durumları için, başka yerde kullanma

Yeni bir "success" rengi ekleme — `accent` zaten pozitif/health anlamı taşıyor (örn. "set tamamlandı" göstergesi de accent kullanabilir).

Tüm renk çiftleri WCAG AA (metin için ≥4.5:1) hedefiyle seçildi/doğrulandı; `accent` hem arka plana hem `accentOn`'a karşı ayrı ayrı kontrol edildi (buton dolgusu + üstündeki yazı için).

## Tipografi

Tek aile: **Inter** (`@expo-google-fonts/inter`, sadece kullanılan ağırlık alt-path'lerinden import et — `@expo-google-fonts/inter/400Regular` gibi, barrel import tüm ağırlıkları bundle'a ekliyor). `ThemedText`'in `type` prop'u zaten doğru `fontFamily`'i seçiyor, elle `fontFamily` yazma.

Sayısal veri gösterimlerinde (ağırlık, tekrar, set sayısı) hizalı rakamlar için `style={{ fontVariant: ['tabular-nums'] }}` ekle.

## Spacing / Radius

`Spacing` (4/8pt ritim) ve `Radius` (`sm:8 md:12 lg:16 xl:24 full:999`) zaten tanımlı. Kart köşeleri için `Radius.lg`/`xl`, buton için `Radius.md`/`full`.

## Gölge / Derinlik

İnce, tek katmanlı gölge kullan (Karpathy "Simplicity First" ile de uyumlu — çok katmanlı skeuomorphic gölge yok):

```ts
// light mode kart gölgesi
{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 }
```

Dark modda gölge siyah zeminde görünmez — onun yerine `backgroundElement`/`backgroundSelected` ile yüzeyi arka plandan renk farkıyla ayır, shadow ekleme.

## İkon

`@expo/vector-icons` → `Ionicons`, outline stil (dolgu değil), tutarlı boyut: sm 18 / md 24 / lg 28. Emoji ikon olarak kullanılmayacak.

## Grafik (Hareket İlerleme)

Tek seri çizgi/alan grafik: çizgi rengi `accent`, dolgu %15-20 opaklık, grid çizgileri `border` rengi. Çoklu seri/karmaşık legend gerekmiyor (bir seferde tek hareketin geçmişi gösteriliyor).

## Dokunma / Etkileşim

`Pressable` kullan (`TouchableOpacity` değil), min 44×44pt dokunma alanı (küçük ikonlarda `hitSlop`), basılı durumda opacity/ripple geri bildirimi, 150-300ms geçiş süresi.
