package org.ece.blackrose.tenant.web;

import jakarta.validation.Valid;
import org.ece.blackrose.tenant.service.TenantService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/tenants")
public class AdminTenantController {

  private final TenantService service;
  private final TenantMapper mapper;

  public AdminTenantController(TenantService service, TenantMapper mapper) {
    this.service = service;
    this.mapper = mapper;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  TenantResponse create(@Valid @RequestBody CreateTenantRequest request) {
    return mapper.toResponse(service.create(request));
  }
}
