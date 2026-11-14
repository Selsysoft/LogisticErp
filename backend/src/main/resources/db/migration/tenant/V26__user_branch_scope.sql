-- Z05 · Faz 12.1a · MX5 D17 · 12.1a_TASARIM §2.5
-- Varsayılan ALL: mevcut kullanıcılar etkilenmez. Kapsam token'a yazılmaz, her istekte okunur.
ALTER TABLE app_user
    ADD COLUMN branch_scope      VARCHAR(10) NOT NULL DEFAULT 'ALL',
    ADD COLUMN default_branch_id UUID REFERENCES branch (id),
    ADD CONSTRAINT app_user_branch_scope_ck CHECK (branch_scope IN ('ALL', 'LIMITED'));

CREATE TABLE user_branch (
    user_id   UUID NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branch (id),
    PRIMARY KEY (user_id, branch_id)
);
CREATE INDEX user_branch_branch_idx ON user_branch (branch_id);
