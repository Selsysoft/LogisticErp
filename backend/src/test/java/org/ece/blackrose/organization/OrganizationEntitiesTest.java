package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.organization.Branch.BranchData;
import org.ece.blackrose.organization.BranchGroup.BranchGroupData;
import org.ece.blackrose.organization.Company.CompanyData;
import org.junit.jupiter.api.Test;

/** Şirket, şube ve iş yeri değiştiricileri güncelleme sayacını artırır. */
class OrganizationEntitiesTest {

  @Test
  void sirketKartiGuncellenirVeSayacArtar() {
    UUID fund = UUID.randomUUID();
    CompanyData data =
        new CompanyData(
            "Örnek Lojistik A.Ş.",
            "Örnek",
            null,
            "1234567890",
            "Kadıköy",
            "0123456789012345",
            "12345",
            "SGK1",
            "Adres",
            "İstanbul",
            "Kadıköy",
            "34710",
            "02120000000",
            "info@ornek.test",
            "ornek@hs01.kep.tr",
            "https://ornek.test",
            null);
    Company company = new Company("ORNEK", data);
    assertThat(company.getId()).isNotNull();
    assertThat(company.getTaxIdType()).isEqualTo(TaxIdType.VKN);
    assertThat(company.getCountry()).isEqualTo("TR");
    assertThat(company.isActive()).isTrue();
    assertThat(company.isDefaultCompany()).isFalse();
    assertThat(company.getUpdateCount()).isZero();

    company.update(
        "ORNEK2",
        new CompanyData(
            "Yeni Unvan",
            "Yeni",
            TaxIdType.TCKN,
            "10000000146",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            fund));
    company.updateIdentity(TaxIdType.VKN, "1234567890", "Moda", "Yeni adres");
    UUID logo = UUID.randomUUID();
    company.setLogo(logo);
    company.markDefault(true);
    company.deactivate();
    company.activate();

    assertThat(company.getCode()).isEqualTo("ORNEK2");
    assertThat(company.getTitle()).isEqualTo("Yeni Unvan");
    assertThat(company.getShortName()).isEqualTo("Yeni");
    assertThat(company.getTaxIdType()).isEqualTo(TaxIdType.VKN);
    assertThat(company.getTaxNumber()).isEqualTo("1234567890");
    assertThat(company.getTaxOffice()).isEqualTo("Moda");
    assertThat(company.getAddress()).isEqualTo("Yeni adres");
    assertThat(company.getDefaultFundAccountId()).isEqualTo(fund);
    assertThat(company.getLogoFileId()).isEqualTo(logo);
    assertThat(company.isDefaultCompany()).isTrue();
    assertThat(company.isActive()).isTrue();
    assertThat(company.getUpdateCount()).isEqualTo(6);
    assertThat(company.getMersisNo()).isNull();
    assertThat(company.getTradeRegistryNo()).isNull();
    assertThat(company.getSgkWorkplaceNo()).isNull();
    assertThat(company.getCity()).isNull();
    assertThat(company.getDistrict()).isNull();
    assertThat(company.getPostalCode()).isNull();
    assertThat(company.getPhone()).isNull();
    assertThat(company.getEmail()).isNull();
    assertThat(company.getKepAddress()).isNull();
    assertThat(company.getWebsite()).isNull();
  }

  @Test
  void eBelgeAyariVarsayilanlaBaslar() {
    UUID companyId = UUID.randomUUID();
    CompanyEDocumentSettings settings = new CompanyEDocumentSettings(companyId);
    assertThat(settings.getCompanyId()).isEqualTo(companyId);
    assertThat(settings.getProvider()).isEqualTo("TEST");
    assertThat(settings.isTestMode()).isTrue();
    assertThat(settings.isEnabled()).isFalse();
    assertThat(settings.getDefaultProfile()).isEqualTo("TICARIFATURA");

    settings.update(
        true, false, "https://efatura.test", "kullanici", "EARSIVFATURA", "ABC", "IRS", true, true);
    settings.setPasswordEnc("sifreli");

    assertThat(settings.isEnabled()).isTrue();
    assertThat(settings.isTestMode()).isFalse();
    assertThat(settings.getServiceUrl()).isEqualTo("https://efatura.test");
    assertThat(settings.getUsername()).isEqualTo("kullanici");
    assertThat(settings.getPasswordEnc()).isEqualTo("sifreli");
    assertThat(settings.getDefaultProfile()).isEqualTo("EARSIVFATURA");
    assertThat(settings.getInvoiceSeries()).isEqualTo("ABC");
    assertThat(settings.getDespatchSeries()).isEqualTo("IRS");
    assertThat(settings.isDespatchEnabled()).isTrue();
    assertThat(settings.isInboxEnabled()).isTrue();
    assertThat(settings.getInboxLastSync()).isNull();
  }

  @Test
  void subeVeIsYeriDegistiricileri() {
    UUID company = UUID.randomUUID();
    BranchGroup group =
        new BranchGroup(
            company,
            new BranchGroupData(
                "Ege", BranchGroupType.MAIN, "2320000000", "ege@x.test", "İzmir", "Ali", "1", "V"));
    assertThat(group.isActive()).isTrue();
    group.update(
        new BranchGroupData("Ege Bölge", BranchGroupType.SUB, null, null, null, null, null, null));
    UUID other = UUID.randomUUID();
    group.moveTo(other);
    group.deactivate();
    group.activate();
    assertThat(group.getId()).isNotNull();
    assertThat(group.getCompanyId()).isEqualTo(other);
    assertThat(group.getName()).isEqualTo("Ege Bölge");
    assertThat(group.getGroupType()).isEqualTo(BranchGroupType.SUB);
    assertThat(group.getPhone()).isNull();
    assertThat(group.getEmail()).isNull();
    assertThat(group.getAddress()).isNull();
    assertThat(group.getManagerName()).isNull();
    assertThat(group.getTaxNumber()).isNull();
    assertThat(group.getTaxOffice()).isNull();
    assertThat(group.getUpdateCount()).isEqualTo(4);

    Branch branch = new Branch("IY-0001", "Merkez", company);
    assertThat(branch.isActive()).isTrue();
    branch.update(
        "IY-0002",
        new BranchData(
            "Liman",
            "2320000001",
            "Alsancak",
            "İzmir",
            "Konak",
            new BigDecimal("38.4"),
            new BigDecimal("27.1"),
            "SGK"));
    branch.moveTo(other, group.getId());
    branch.deactivate();
    assertThat(branch.getCode()).isEqualTo("IY-0002");
    assertThat(branch.getName()).isEqualTo("Liman");
    assertThat(branch.getCompanyId()).isEqualTo(other);
    assertThat(branch.getBranchGroupId()).isEqualTo(group.getId());
    assertThat(branch.getPhone()).isEqualTo("2320000001");
    assertThat(branch.getAddress()).isEqualTo("Alsancak");
    assertThat(branch.getCity()).isEqualTo("İzmir");
    assertThat(branch.getDistrict()).isEqualTo("Konak");
    assertThat(branch.getLatitude()).isEqualByComparingTo("38.4");
    assertThat(branch.getLongitude()).isEqualByComparingTo("27.1");
    assertThat(branch.getSgkWorkplaceNo()).isEqualTo("SGK");
    assertThat(branch.isActive()).isFalse();
    branch.activate();
    assertThat(branch.getUpdateCount()).isEqualTo(4);
  }
}
