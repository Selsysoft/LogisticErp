package org.ece.blackrose.crm.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;

/** Cari kaydının CRM bilgisi. Cari kökü finans modülüyle ortaktır. */
@Entity
@Table(name = "crm_profile")
public class CrmProfile extends AuditableEntity {

  @Id private UUID accountId;
  private String segment;

  @ElementCollection(fetch = FetchType.EAGER)
  @CollectionTable(name = "crm_profile_tag", joinColumns = @JoinColumn(name = "account_id"))
  @Column(name = "tag")
  private Set<String> tags = new HashSet<>();

  protected CrmProfile() {}

  public CrmProfile(UUID accountId) {
    this.accountId = accountId;
  }

  public void update(String segment, Collection<String> tags) {
    this.segment = segment;
    this.tags = new HashSet<>(tags);
  }

  public UUID getAccountId() {
    return accountId;
  }

  public String getSegment() {
    return segment;
  }

  public Set<String> getTags() {
    return tags;
  }
}
