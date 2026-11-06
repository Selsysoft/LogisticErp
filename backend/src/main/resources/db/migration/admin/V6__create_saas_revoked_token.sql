-- Çıkışta geçersiz kılınan SaaS yöneticisi erişim token'ları; süresi dolanlar temizlenir.
CREATE TABLE admin.saas_revoked_token (
    jti        UUID        PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
