CREATE TABLE currency (
    code CHAR(3) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

INSERT INTO currency (code, name) VALUES
    ('TRY', 'Türk Lirası'),
    ('USD', 'ABD Doları'),
    ('EUR', 'Euro'),
    ('GBP', 'İngiliz Sterlini');

-- rate: 1 birim dövizin TL karşılığı (TCMB döviz alış).
CREATE TABLE exchange_rate (
    id         UUID PRIMARY KEY,
    currency   CHAR(3)        NOT NULL,
    rate_date  DATE           NOT NULL,
    rate       NUMERIC(19, 6) NOT NULL,
    source     VARCHAR(20)    NOT NULL,
    created_at TIMESTAMPTZ    NOT NULL,
    UNIQUE (currency, rate_date)
);
