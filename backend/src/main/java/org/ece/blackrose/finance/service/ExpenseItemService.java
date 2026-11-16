package org.ece.blackrose.finance.service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.ExpenseItem;
import org.ece.blackrose.finance.domain.ExpenseType;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseItemRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseTypeRepository;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SaveExpenseItemRequest;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Masraf kalemi tanımı (ZTO ExpenseItems; 12.7 §3.1). Ad büyük/küçük harf duyarsız tekildir (DB
 * {@code expense_item_name_active_uq}); kod girilmezse {@code MK-00001} dizisinden üretilir. Sistem
 * kalemi (V3 tohumu) pasifleştirilemez, kodu ve türü değişmez. Kullanımdaki kalem de pasifleşir;
 * pasif kalem yalnız yeni masrafta seçilemez.
 */
@Service
public class ExpenseItemService {

  static final String NAME_INDEX = "expense_item_name_active_uq";
  private static final int CODE_ATTEMPTS = 5;

  private final ExpenseItemRepository items;
  private final ExpenseTypeRepository types;
  private final AuditService audit;

  public ExpenseItemService(
      ExpenseItemRepository items, ExpenseTypeRepository types, AuditService audit) {
    this.items = items;
    this.types = types;
    this.audit = audit;
  }

  /** Tümü (pasifler dahil), ada göre. */
  @Transactional(readOnly = true)
  public List<ExpenseItemResponse> list() {
    Map<UUID, String> typeNames =
        types.findAll().stream()
            .collect(Collectors.toMap(ExpenseType::getId, ExpenseType::getName));
    return items.findAll().stream()
        .sorted(Comparator.comparing(ExpenseItem::getName, String.CASE_INSENSITIVE_ORDER))
        .map(item -> toResponse(item, typeNames::get))
        .toList();
  }

  @Transactional
  public ExpenseItemResponse create(SaveExpenseItemRequest request) {
    requireType(request.expenseTypeId());
    String name = request.name().trim();
    if (items.existsByNameIgnoreCase(name)) {
      throw nameExists();
    }
    String code = blankToNull(request.code());
    if (code == null) {
      code = nextFreeCode();
    } else if (items.existsByCode(code)) {
      throw codeExists();
    }
    ExpenseItem item =
        new ExpenseItem(
            request.expenseTypeId(),
            code,
            name,
            blankToNull(request.description()),
            blankToNull(request.defaultUnit()));
    saveFlush(item);
    audit.record(AuditEvent.EXPENSE_ITEM_UPDATED, "EXPENSE_ITEM:" + item.getId(), "create");
    return toResponse(item);
  }

  @Transactional
  public ExpenseItemResponse update(UUID id, SaveExpenseItemRequest request) {
    ExpenseItem item = find(id);
    requireType(request.expenseTypeId());
    String name = request.name().trim();
    if (items.existsByNameIgnoreCaseAndIdNot(name, id)) {
      throw nameExists();
    }
    String code = blankToNull(request.code());
    boolean codeChanged = code != null && !code.equals(item.getCode());
    if (item.isSystem()
        && (codeChanged || !Objects.equals(request.expenseTypeId(), item.getExpenseTypeId()))) {
      throw systemItem("Sistem kaleminin kodu ve türü değiştirilemez.");
    }
    if (codeChanged && items.existsByCode(code)) {
      throw codeExists();
    }
    item.update(
        request.expenseTypeId(),
        name,
        blankToNull(request.description()),
        blankToNull(request.defaultUnit()));
    saveFlush(item);
    if (codeChanged) {
      items.updateCode(id, code);
      item = find(id);
    }
    audit.record(AuditEvent.EXPENSE_ITEM_UPDATED, "EXPENSE_ITEM:" + id, "update");
    return toResponse(item);
  }

  @Transactional
  public ExpenseItemResponse setActive(UUID id, boolean active) {
    ExpenseItem item = find(id);
    if (item.isSystem() && !active) {
      throw systemItem("Sistem kalemi pasifleştirilemez.");
    }
    item.setActive(active);
    audit.record(AuditEvent.EXPENSE_ITEM_UPDATED, "EXPENSE_ITEM:" + id, "active=" + active);
    return toResponse(item);
  }

  ExpenseItemResponse toResponse(ExpenseItem item) {
    return toResponse(
        item, typeId -> types.findById(typeId).map(ExpenseType::getName).orElse(null));
  }

  private static ExpenseItemResponse toResponse(ExpenseItem item, Function<UUID, String> typeName) {
    return new ExpenseItemResponse(
        item.getId(),
        item.getExpenseTypeId(),
        item.getExpenseTypeId() == null ? null : typeName.apply(item.getExpenseTypeId()),
        item.getCode(),
        item.getName(),
        item.getDescription(),
        item.getDefaultUnit(),
        item.isActive(),
        item.isSystem(),
        item.getCreatedAt());
  }

  private ExpenseItem find(UUID id) {
    return items
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "EXPENSE_ITEM_NOT_FOUND", "Masraf kalemi bulunamadı."));
  }

  private void requireType(UUID typeId) {
    if (typeId == null || !types.existsById(typeId)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "EXPENSE_TYPE_NOT_FOUND", "Gider tipi bulunamadı.");
    }
  }

  /** {@code MK-00001} dizisinden çakışmayan ilk kod (en çok beş deneme). */
  private String nextFreeCode() {
    for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      String code = "MK-%05d".formatted(items.nextCode());
      if (!items.existsByCode(code)) {
        return code;
      }
    }
    throw codeExists();
  }

  /** Eşzamanlı aynı ad yarışı: tekil indeks 409 {@code EXPENSE_ITEM_NAME_EXISTS} olur. */
  private void saveFlush(ExpenseItem item) {
    try {
      items.saveAndFlush(item);
    } catch (DataIntegrityViolationException ex) {
      if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains(NAME_INDEX)) {
        throw nameExists();
      }
      throw ex;
    }
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static BusinessException nameExists() {
    return new BusinessException(
        HttpStatus.CONFLICT, "EXPENSE_ITEM_NAME_EXISTS", "Bu adla bir masraf kalemi var.");
  }

  private static BusinessException codeExists() {
    return new BusinessException(
        HttpStatus.CONFLICT, "EXPENSE_ITEM_CODE_EXISTS", "Bu kodla bir masraf kalemi var.");
  }

  private static BusinessException systemItem(String message) {
    return new BusinessException(HttpStatus.CONFLICT, "EXPENSE_ITEM_SYSTEM", message);
  }
}
