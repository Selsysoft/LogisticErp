package org.ece.blackrose.driverapp.web;

import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.driverapp.domain.DriverExpense;
import org.ece.blackrose.driverapp.service.DriverAppService;
import org.ece.blackrose.driverapp.service.DriverExpenseReviewService;
import org.ece.blackrose.driverapp.web.DriverAppDtos.ClientOpResponse;
import org.ece.blackrose.driverapp.web.DriverAppDtos.DriverPositionRequest;
import org.ece.blackrose.driverapp.web.DriverAppDtos.DriverUserResponse;
import org.ece.blackrose.driverapp.web.DriverAppDtos.LinkDriverUserRequest;
import org.ece.blackrose.driverapp.web.DriverAppDtos.MyExpenseResponse;
import org.ece.blackrose.driverapp.web.DriverAppDtos.RejectExpenseRequest;
import org.ece.blackrose.driverapp.web.DriverAppDtos.ReviewExpenseResponse;
import org.ece.blackrose.driverapp.web.DriverAppDtos.TripEventRequest;
import org.ece.blackrose.driverapp.web.DriverAppDtos.TripResponse;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class DriverAppController {

  private static final String DRIVER = "hasAuthority('DRIVER_APP')";
  private static final String REVIEW = "hasAuthority('SHIPMENT_DISPATCH')";
  private static final String REVIEW_VIEW = "hasAuthority('SHIPMENT_VIEW')";

  private final DriverAppService app;
  private final DriverExpenseReviewService review;
  private final DriverRepository drivers;
  private final ShipmentRepository shipments;

  public DriverAppController(
      DriverAppService app,
      DriverExpenseReviewService review,
      DriverRepository drivers,
      ShipmentRepository shipments) {
    this.app = app;
    this.review = review;
    this.drivers = drivers;
    this.shipments = shipments;
  }

  @GetMapping("/api/v1/driver/trips")
  @PreAuthorize(DRIVER)
  List<TripResponse> trips() {
    return app.trips();
  }

  @PostMapping("/api/v1/driver/trips/{id}/events")
  @PreAuthorize(DRIVER)
  ClientOpResponse event(@PathVariable UUID id, @Valid @RequestBody TripEventRequest request) {
    return app.recordEvent(id, request);
  }

  @PostMapping(
      path = "/api/v1/driver/trips/{id}/pod",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(DRIVER)
  ClientOpResponse pod(
      @PathVariable UUID id,
      @RequestParam UUID clientId,
      @RequestParam(required = false) String recipientName,
      @RequestParam Instant deliveredAt,
      @RequestParam(required = false) BigDecimal latitude,
      @RequestParam(required = false) BigDecimal longitude,
      @RequestParam(required = false) String note,
      @RequestParam(required = false) MultipartFile signature,
      @RequestParam(required = false) MultipartFile photo) {
    return app.deliver(
        id, clientId, recipientName, deliveredAt, latitude, longitude, note, signature, photo);
  }

  @PostMapping(
      path = "/api/v1/driver/trips/{id}/expenses",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(DRIVER)
  ClientOpResponse expense(
      @PathVariable UUID id,
      @RequestParam UUID clientId,
      @RequestParam CostKind kind,
      @RequestParam BigDecimal amount,
      @RequestParam String currency,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
      @RequestParam(required = false) String description,
      @RequestParam(required = false) MultipartFile receipt) {
    return app.addExpense(id, clientId, kind, amount, currency, date, description, receipt);
  }

  @GetMapping("/api/v1/driver/expenses")
  @PreAuthorize(DRIVER)
  List<MyExpenseResponse> myExpenses() {
    return app.myExpenses().stream()
        .map(
            row ->
                new MyExpenseResponse(
                    row.getId(),
                    row.getShipmentId(),
                    row.getKind(),
                    new Money(row.getAmount(), row.getCurrency()),
                    row.getExpenseDate(),
                    row.getDescription(),
                    row.getStatus(),
                    row.getReviewNote()))
        .toList();
  }

  @PostMapping("/api/v1/driver/positions")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(DRIVER)
  void position(@Valid @RequestBody DriverPositionRequest request) {
    app.recordPosition(request);
  }

  // Ofis tarafı

  @GetMapping("/api/v1/shipment/driver-expenses")
  @PreAuthorize(REVIEW_VIEW)
  PageResponse<ReviewExpenseResponse> reviewList(
      @RequestParam(defaultValue = "PENDING") DriverExpense.Status status, Pageable pageable) {
    return PageResponse.from(review.list(status, pageable), this::toReview);
  }

  @PostMapping("/api/v1/shipment/driver-expenses/{id}/approve")
  @PreAuthorize(REVIEW)
  ReviewExpenseResponse approve(@PathVariable UUID id) {
    return toReview(review.approve(id));
  }

  @PostMapping("/api/v1/shipment/driver-expenses/{id}/reject")
  @PreAuthorize(REVIEW)
  ReviewExpenseResponse reject(
      @PathVariable UUID id, @Valid @RequestBody RejectExpenseRequest request) {
    return toReview(review.reject(id, request.note()));
  }

  @GetMapping("/api/v1/fleet/drivers/{id}/user")
  @PreAuthorize("hasAuthority('FLEET_VIEW')")
  DriverUserResponse linkedUser(@PathVariable UUID id) {
    return new DriverUserResponse(review.linkedEmail(id));
  }

  @PutMapping("/api/v1/fleet/drivers/{id}/user")
  @PreAuthorize("hasAuthority('FLEET_EDIT')")
  DriverUserResponse link(
      @PathVariable UUID id, @Valid @RequestBody LinkDriverUserRequest request) {
    return new DriverUserResponse(review.link(id, request.email()));
  }

  private ReviewExpenseResponse toReview(DriverExpense row) {
    return new ReviewExpenseResponse(
        row.getId(),
        drivers.findById(row.getDriverId()).map(Driver::getFullName).orElse(null),
        row.getShipmentId(),
        shipments.findById(row.getShipmentId()).map(Shipment::getNumber).orElse(null),
        row.getKind(),
        new Money(row.getAmount(), row.getCurrency()),
        row.getExpenseDate(),
        row.getDescription(),
        row.getStatus(),
        row.getReviewNote(),
        row.getReceiptFileId());
  }
}
