import { useTranslation } from "react-i18next";
import type { Fund } from "../../../../pages/finance/types";
import { currencySymbol, formatN2 } from "../../../components";
import type { CostSummary } from "./fxCalcLogic";
import type { TransferMode } from "./transferRulesLogic";

type Props = {
  mode: TransferMode;
  source: number;
  target: number;
  effectiveRate: number;
  sourceCurrency: string;
  targetCurrency: string;
  costs: CostSummary;
  /** Kaynak iş yerinin vadesiz bankaları (iş yeri seçilmemişse null). */
  banks: Fund[] | null;
  /** Kaynak iş yerinin kasaları (yalnız Banka & Kasa kipinde gösterilir). */
  cashes: Fund[] | null;
};

const balanceClass = (balance: number) => (balance >= 0 ? "text-success" : "text-danger");

function FundRows({ funds, empty }: { funds: Fund[] | null; empty: string }) {
  if (!funds || funds.length === 0) {
    return (
      <tr>
        <td colSpan={3} className="text-center text-muted">
          {empty}
        </td>
      </tr>
    );
  }
  return (
    <>
      {funds.map((fund) => (
        <tr key={fund.id}>
          <td>{fund.bankName ?? fund.name}</td>
          <td>{currencySymbol(fund.currency)}</td>
          <td className={`text-right ${balanceClass(fund.balance)}`}>
            {formatN2(fund.balance)} {currencySymbol(fund.currency)}
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * Sağ panel (ZTO BS:1768-1866): "Hesaplama" (Kaynak Tutar, Efektif Kur 4 hane, Hedef Tutar), Döviz'de
 * "Maliyet" (KMV TL — B13 düzeltmesi), iş yerinin "Bankalar" listesi, Banka & Kasa'da "Kasalar".
 */
export function TransferSidePanel(props: Props) {
  const { t } = useTranslation("ztoFinans");
  const { mode, costs } = props;
  const isFx = mode === "FX";
  const pickText = t("transferCenter.side.pickWorkPlace");
  return (
    <div className="transfer-side-panel-sticky">
      <div className="card mb-2">
        <div className="card-header bg-info text-white">
          <h6 className="mb-0">
            <i className="fas fa-calculator" aria-hidden="true" /> {t("transferCenter.side.calc")}
          </h6>
        </div>
        <div className="card-body">
          <div className="calc-panel" aria-live="off">
            <div className="calc-row">
              <span className="text-muted">{t("transferCenter.side.sourceAmount")}</span>
              <span className="calc-value" id="calcSourceAmount">
                {formatN2(props.source)} {currencySymbol(props.sourceCurrency || "TRY")}
              </span>
            </div>
            <div className="calc-row">
              <span className="text-muted">{t("transferCenter.side.effectiveRate")}</span>
              <span className="calc-value" id="calcEffectiveRate">
                {(props.effectiveRate || 0).toFixed(4)}
              </span>
            </div>
            <div className="calc-row total">
              <span>{t("transferCenter.side.targetAmount")}</span>
              <span className="calc-result" id="calcTargetAmount">
                {formatN2(props.target)} {currencySymbol(props.targetCurrency || "TRY")}
              </span>
            </div>
          </div>
          {isFx && (
            <div className="cost-panel" id="costDetailsPanel">
              <div className="cost-title">
                <i className="fas fa-receipt" aria-hidden="true" /> {t("transferCenter.side.cost")}
              </div>
              <div className="cost-row">
                <span>{t("transferCenter.side.kmv")}</span>
                <span id="calcKmv">{formatN2(costs.kmv)} ₺</span>
              </div>
              <div className="cost-row">
                <span>{t("transferCenter.side.commission")}</span>
                <span id="calcCommission">{formatN2(costs.commission)} ₺</span>
              </div>
              <div className="cost-row">
                <span>{t("transferCenter.side.fee")}</span>
                <span id="calcTransferFee">{formatN2(costs.fee)} ₺</span>
              </div>
              <div className="cost-row">
                <span>{t("transferCenter.side.total")}</span>
                <span id="calcTotalCost" className="text-danger">
                  {formatN2(costs.total)} ₺
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-header bg-secondary text-white">
          <h6 className="mb-0" id="transferSideBanksTitle">
            <i className="fas fa-university" aria-hidden="true" /> {t("transferCenter.side.banks")}
          </h6>
        </div>
        <div className="card-body p-0">
          <div
            className="table-responsive"
            style={{ maxHeight: 200, overflowY: "auto" }}
            role="region"
            aria-labelledby="transferSideBanksTitle"
            tabIndex={0}
          >
            <table className="table bank-list-table table-hover mb-0">
              <thead>
                <tr>
                  <th>{t("transferCenter.side.bank")}</th>
                  <th>{t("transferCenter.side.currency")}</th>
                  <th className="text-right">{t("transferCenter.side.balance")}</th>
                </tr>
              </thead>
              <tbody id="workPlaceBanksTableBody">
                <FundRows funds={props.banks} empty={pickText} />
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {mode === "BANKCASH" && (
        <div className="card" id="workPlaceCashesCard">
          <div className="card-header bg-success text-white">
            <h6 className="mb-0" id="transferSideCashesTitle">
              <i className="fas fa-piggy-bank" aria-hidden="true" />{" "}
              {t("transferCenter.side.cashes")}
            </h6>
          </div>
          <div className="card-body p-0">
            <div
              className="table-responsive"
              style={{ maxHeight: 200, overflowY: "auto" }}
              role="region"
              aria-labelledby="transferSideCashesTitle"
              tabIndex={0}
            >
              <table className="table bank-list-table table-hover mb-0">
                <thead>
                  <tr>
                    <th>{t("transferCenter.side.cash")}</th>
                    <th>{t("transferCenter.side.currency")}</th>
                    <th className="text-right">{t("transferCenter.side.balance")}</th>
                  </tr>
                </thead>
                <tbody id="workPlaceCashesTableBody">
                  <FundRows funds={props.cashes} empty={pickText} />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
