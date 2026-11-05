package org.ece.blackrose.warehouse.service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.warehouse.domain.StockBalance;
import org.ece.blackrose.warehouse.domain.StockCount;
import org.ece.blackrose.warehouse.domain.StockCountLine;
import org.ece.blackrose.warehouse.domain.StockItem;
import org.ece.blackrose.warehouse.domain.StockMovement;
import org.ece.blackrose.warehouse.domain.Warehouse;
import org.ece.blackrose.warehouse.domain.WarehouseBin;
import org.ece.blackrose.warehouse.domain.WarehouseContract;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.MovementType;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockCountLineRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockItemRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockMovementRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseBinRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseRepository;
import org.ece.blackrose.warehouse.web.WarehouseDtos.BalanceResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.ContractResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CountLineResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CountResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CountSummary;
import org.ece.blackrose.warehouse.web.WarehouseDtos.MovementResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.StockItemResponse;
import org.springframework.stereotype.Component;

/** Kimlikleri ad ve kodlara çevirerek yanıtları üretir. */
@Component
public class WarehouseViews {

  private final WarehouseRepository warehouses;
  private final WarehouseBinRepository bins;
  private final StockItemRepository items;
  private final StockMovementRepository movements;
  private final StockCountLineRepository countLines;
  private final AccountRepository accounts;

  public WarehouseViews(
      WarehouseRepository warehouses,
      WarehouseBinRepository bins,
      StockItemRepository items,
      StockMovementRepository movements,
      StockCountLineRepository countLines,
      AccountRepository accounts) {
    this.warehouses = warehouses;
    this.bins = bins;
    this.items = items;
    this.movements = movements;
    this.countLines = countLines;
    this.accounts = accounts;
  }

  public List<StockItemResponse> items(List<StockItem> list) {
    Map<UUID, String> names =
        accountNames(list.stream().map(StockItem::getAccountId).collect(Collectors.toSet()));
    return list.stream()
        .map(
            item ->
                new StockItemResponse(
                    item.getId(),
                    item.getAccountId(),
                    names.get(item.getAccountId()),
                    item.getSku(),
                    item.getName(),
                    item.getUnit(),
                    item.getUnitsPerBillingUnit()))
        .toList();
  }

  public List<BalanceResponse> balances(List<StockBalance> list) {
    Map<UUID, Warehouse> warehouseById = warehouseIndex(list, StockBalance::getWarehouseId);
    Map<UUID, WarehouseBin> binById = binIndex(list, StockBalance::getBinId);
    Map<UUID, StockItem> itemById = itemIndex(list, StockBalance::getItemId);
    Map<UUID, String> names =
        accountNames(list.stream().map(StockBalance::getAccountId).collect(Collectors.toSet()));
    return list.stream()
        .map(
            balance -> {
              StockItem item = itemById.get(balance.getItemId());
              return new BalanceResponse(
                  balance.getId(),
                  balance.getWarehouseId(),
                  warehouseById.get(balance.getWarehouseId()).getName(),
                  balance.getBinId(),
                  binById.get(balance.getBinId()).getCode(),
                  balance.getItemId(),
                  item.getSku(),
                  item.getName(),
                  item.getUnit(),
                  balance.getAccountId(),
                  names.get(balance.getAccountId()),
                  balance.getLotNo(),
                  balance.getExpiryDate(),
                  balance.getCustomsStatus(),
                  balance.getQuantity());
            })
        .toList();
  }

  public List<MovementResponse> movements(List<StockMovement> list) {
    Map<UUID, Warehouse> warehouseById = warehouseIndex(list, StockMovement::getWarehouseId);
    Map<UUID, WarehouseBin> binById = binIndex(list, StockMovement::getBinId);
    Map<UUID, StockItem> itemById = itemIndex(list, StockMovement::getItemId);
    Map<UUID, String> names =
        accountNames(list.stream().map(StockMovement::getAccountId).collect(Collectors.toSet()));
    return list.stream()
        .map(
            movement -> {
              StockItem item = itemById.get(movement.getItemId());
              boolean reversible =
                  (movement.getType() == MovementType.RECEIPT
                          || movement.getType() == MovementType.ISSUE)
                      && !movements.existsByReversesId(movement.getId());
              return new MovementResponse(
                  movement.getId(),
                  movement.getType(),
                  warehouseById.get(movement.getWarehouseId()).getName(),
                  binById.get(movement.getBinId()).getCode(),
                  item.getSku(),
                  item.getName(),
                  names.get(movement.getAccountId()),
                  movement.getLotNo(),
                  movement.getCustomsStatus(),
                  movement.getQuantity(),
                  movement.getMovedOn(),
                  movement.getShipmentId(),
                  movement.getReference(),
                  movement.getNote(),
                  movement.getCreatedBy(),
                  reversible);
            })
        .toList();
  }

  public CountSummary countSummary(StockCount count) {
    return new CountSummary(
        count.getId(),
        count.getNumber(),
        count.getWarehouseId(),
        warehouses.findById(count.getWarehouseId()).map(Warehouse::getName).orElse(null),
        count.getCountDate(),
        count.getStatus());
  }

  public CountResponse count(StockCount count) {
    List<StockCountLine> lines = countLines.findByCountId(count.getId());
    Map<UUID, WarehouseBin> binById = binIndex(lines, StockCountLine::getBinId);
    Map<UUID, StockItem> itemById = itemIndex(lines, StockCountLine::getItemId);
    Map<UUID, String> names =
        accountNames(
            itemById.values().stream().map(StockItem::getAccountId).collect(Collectors.toSet()));
    return new CountResponse(
        countSummary(count),
        lines.stream()
            .map(
                line -> {
                  StockItem item = itemById.get(line.getItemId());
                  return new CountLineResponse(
                      line.getId(),
                      binById.get(line.getBinId()).getCode(),
                      item.getSku(),
                      item.getName(),
                      names.get(item.getAccountId()),
                      line.getLotNo(),
                      line.getCustomsStatus(),
                      line.getSystemQuantity(),
                      line.getCountedQuantity(),
                      line.difference());
                })
            .sorted(
                java.util.Comparator.comparing(CountLineResponse::binCode)
                    .thenComparing(CountLineResponse::sku))
            .toList());
  }

  public ContractResponse contract(WarehouseContract contract) {
    return new ContractResponse(
        contract.getId(),
        contract.getAccountId(),
        accounts.findById(contract.getAccountId()).map(Account::getName).orElse(null),
        contract.getWarehouseId(),
        warehouses.findById(contract.getWarehouseId()).map(Warehouse::getName).orElse(null),
        contract.getStartDate(),
        contract.getEndDate(),
        contract.getCurrency(),
        contract.getStorageBasis(),
        contract.getStorageRate(),
        contract.getTaxRateId());
  }

  public String accountName(UUID id) {
    return accounts.findById(id).map(Account::getName).orElse(null);
  }

  private Map<UUID, String> accountNames(Collection<UUID> ids) {
    return accounts.findAllById(ids).stream()
        .collect(Collectors.toMap(Account::getId, Account::getName));
  }

  private <T> Map<UUID, Warehouse> warehouseIndex(List<T> list, Function<T, UUID> key) {
    return warehouses.findAllById(list.stream().map(key).collect(Collectors.toSet())).stream()
        .collect(Collectors.toMap(Warehouse::getId, Function.identity()));
  }

  private <T> Map<UUID, WarehouseBin> binIndex(List<T> list, Function<T, UUID> key) {
    return bins.findAllById(list.stream().map(key).collect(Collectors.toSet())).stream()
        .collect(Collectors.toMap(WarehouseBin::getId, Function.identity()));
  }

  private <T> Map<UUID, StockItem> itemIndex(List<T> list, Function<T, UUID> key) {
    return items.findAllById(list.stream().map(key).collect(Collectors.toSet())).stream()
        .collect(Collectors.toMap(StockItem::getId, Function.identity()));
  }
}
