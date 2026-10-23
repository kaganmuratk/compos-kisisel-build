# Compos

Expo (React Native) tabanlı fitness takip uygulaması, çok kullanıcılı ve hesaplı. Detaylı proje bağlamı için [CLAUDE.md](./CLAUDE.md).

## Geliştirme

```bash
pnpm install
pnpm start
```

Veriler cihaz üzerindeki SQLite'ta tutulur (offline-first), arka planda PowerSync ile Supabase Postgres'e senkronlanır. Custom native modüller (expo-secure-store, react-native-health-connect, react-native-maps vb.) kullanıldığı için **Expo Go ile çalışmaz** — bir dev client build'i gerekir (`eas build --profile development`). `pnpm web` gerçek backend'e bağlanan bir web build'i açar, hızlı iterasyon/teşhis için kullanışlı.

## iPhone PWA test sürümü

`pnpm export:web` komutu Cloudflare Pages'e verilecek statik `dist/` klasörünü oluşturur; PowerSync'in tarayıcı çalışanını da her build'te otomatik ekler. Pages ayarlarında build komutu `pnpm install --frozen-lockfile && pnpm export:web`, çıktı klasörü de `dist` olmalıdır. Ortam değişkeni olarak `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` eklenir; bunlar tarayıcıya açık istemci yapılandırmasıdır, service-role anahtarı eklenmez.

Cloudflare'ın verdiği `*.pages.dev` adresi Supabase Auth'taki izinli yönlendirme adreslerine eklenmelidir. Kullanıcılar iPhone'da bağlantıyı Safari ile açıp Paylaş → Ana Ekrana Ekle yolunu izler. İlk açılış çevrimiçi yapılır; sonrasında kayıtlar çevrimdışı da tutulur ve uygulama tekrar çevrimiçiyken senkronlanır. Apple Watch/Health verisi ile ekran kilitliyken GPS rota takibi PWA'da desteklenmez.
