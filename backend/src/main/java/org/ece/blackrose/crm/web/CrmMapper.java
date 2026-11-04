package org.ece.blackrose.crm.web;

import org.ece.blackrose.crm.domain.Contact;
import org.ece.blackrose.crm.domain.Contract;
import org.ece.blackrose.crm.domain.CrmActivity;
import org.ece.blackrose.crm.domain.Opportunity;
import org.ece.blackrose.crm.domain.Tariff;
import org.ece.blackrose.crm.domain.TariffLine;
import org.ece.blackrose.crm.domain.TaxRate;
import org.ece.blackrose.crm.web.CrmDtos.ActivityResponse;
import org.ece.blackrose.crm.web.CrmDtos.ContactResponse;
import org.ece.blackrose.crm.web.CrmDtos.ContractResponse;
import org.ece.blackrose.crm.web.CrmDtos.OpportunityResponse;
import org.ece.blackrose.crm.web.CrmDtos.TariffLineResponse;
import org.ece.blackrose.crm.web.CrmDtos.TariffResponse;
import org.ece.blackrose.crm.web.CrmDtos.TaxRateResponse;
import org.mapstruct.Mapper;

@Mapper
public interface CrmMapper {

  ContactResponse toResponse(Contact contact);

  OpportunityResponse toResponse(Opportunity opportunity);

  ActivityResponse toResponse(CrmActivity activity);

  TaxRateResponse toResponse(TaxRate rate);

  TariffResponse toResponse(Tariff tariff);

  TariffLineResponse toResponse(TariffLine line);

  ContractResponse toResponse(Contract contract);
}
