CREATE TABLE branch (
    id         UUID PRIMARY KEY,
    code       VARCHAR(50)  NOT NULL,
    name       VARCHAR(200) NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_by VARCHAR(100) NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    deleted    BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX branch_code_active_uq ON branch (code) WHERE deleted = FALSE;
