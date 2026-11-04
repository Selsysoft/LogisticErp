# Yerelde Çalıştırma

Bu dosyadaki bilgiler yalnız yerel geliştirme içindir. Gerçek ortamda kullanılmaz.

## Başlatma
```
docker compose up -d --wait
cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=dev -Djava.version=17
cd frontend && npm run dev
```
Uygulama: http://localhost:5173. `-Djava.version=17` yalnız JDK 21 kurulu değilse gerekir.

## Deneme hesapları
`docker compose down -v` veritabanını siler; bu hesaplar da silinir.

| Kullanım | Firma kodu | E-posta | Şifre |
|---|---|---|---|
| SaaS yöneticisi (yalnız API) | — | `admin@blackrose.local` | `Dev-Admin-12345` |
| Patron/Yönetici | `acme` | `patron@acme.test` | `Demo-Acme-2026` |
| Finans | `acme` | `finans@acme.test` | `Demo-Acme-2026` |

## Davet ve şifre bağlantıları
`dev` profilinde e-posta gönderilmez; bağlantı backend günlüğüne `[DEV]` önekiyle yazılır.

## Yeni firma açma
`POST /api/v1/admin/auth/login` ile SaaS token'ı alın, ardından `POST /api/v1/admin/tenants` çağırın:
```json
{"code":"acme","name":"Acme Lojistik","defaultCurrency":"TRY","timeZone":"Europe/Istanbul",
 "ownerEmail":"patron@acme.test","ownerFullName":"Firma Sahibi"}
```
