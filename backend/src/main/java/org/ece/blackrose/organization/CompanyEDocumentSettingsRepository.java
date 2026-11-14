package org.ece.blackrose.organization;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CompanyEDocumentSettingsRepository
    extends JpaRepository<CompanyEDocumentSettings, UUID> {}
