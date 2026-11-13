# Analiz 02 — Bağımlılık Grafiği

> **LogisticErp notu (2026-11-13):** Bu dosya ZTO Fabrika reposunda, `ZTO_LOGISTIC_Finans_Kopyalama_Promptu.md` için yazıldı ve buraya kopyalandı. O prompttaki K1 (.NET 8 MVC) ve K2 (kodu kopyala) kararları **geçersizdir**; geçerli yön `../00_README.md` ve `04_UYARLAMA_KARAR_MATRISI.md` §0. ZTO bulguları (tablolar, ekranlar, iş kuralları, satır referansları) geçerlidir; `f:\visual studio zto\ZtoFabrika2026\ZtoFabrika` kaynağına göredir.

> **Kapsam:** Faz 0.2 çıktısı. `01_FINANS_ENVANTER.md` tablolarının görsel karşılığıdır; tablo ve controller adları yalnızca [envanter/](envanter/) parçalarında geçenlerdir.
> **Görüntüleme:** VS Code Markdown önizlemesi (Mermaid eklentisi) ya da GitHub.

## 1. Katman görünümü

```mermaid
flowchart TD
    subgraph UI["Layout ve menü"]
        L_PROD["_ProductionLayout - rol kullanıcıları"]
        L_MAIN["_Layout - Admin"]
        L_EXP["_ExpertLayout - ekle ve düzenle sayfaları"]
        L_REP["_ReportLayout - FinanceReport"]
        MENU["_SideMenu_Finance ve _SideMenu_FinanceItems"]
    end

    subgraph G_CARI["Cari"]
        P_AT["AccountTransaction AllTransactions"]
        P_CA["CustomerAccounts Index"]
        P_CCA["CustomerCurrentAccounts"]
    end
    subgraph G_BK["Banka-Kasa"]
        P_BI["BankIntroduction"]
        P_BT["BankTransactions"]
        P_CI["CashIntroduction"]
        P_CT["CashTransactions"]
        P_BS["BankStatement"]
    end
    subgraph G_OT["Ödeme-Tahsilat"]
        P_PAY["CustomerAccountPayment Payments"]
        P_COL["CustomerAccountCollection Collections"]
    end
    subgraph G_CS["Çek-Senet"]
        P_CHK["Checks ve CheckBooks"]
        P_BIL["Bills"]
    end
    subgraph G_KM["Kredi-Mevduat"]
        P_CRD["CreditContracts"]
        P_TD["TimeDeposits"]
        P_AC["AccountCredits"]
    end
    subgraph G_ON["Onay"]
        P_PA["PaymentApproval"]
        P_PM["PaymentManagement"]
    end
    subgraph G_RP["Rapor"]
        P_FBS["FinancialBalanceSheet"]
        P_FR["FinanceReport"]
    end
    subgraph G_SM["Stok-Masraf"]
        P_MSA["MaterialStockAll"]
        P_STE["SalesTruckExpenses"]
        P_PE["ProductionExpenses IndexExpenses"]
    end

    subgraph HELP["Ortak yardımcılar"]
        H_METH["Methods - LogAdd ve ConvertToList"]
        H_GV["GlobalVeriables - adminDatabase"]
        H_SESS["Session userDatabase"]
        H_AUD["IntroductionAuditHelper"]
        H_TCMB["TCMB kur servisi"]
        H_PPH["PaymentPlanHelper"]
        H_AUTH["UserRoleAuthorize ve RequireFinancePersonnel"]
        H_FRS["FrService ve FrWarehouse"]
    end

    DB_T[("Kiracı veritabanı")]
    DB_A[("Admin veritabanı ZTO_ADMIN")]

    MENU --> G_CARI
    MENU --> G_BK
    MENU --> G_OT
    MENU --> G_CS
    MENU --> G_KM
    MENU --> G_ON
    MENU --> G_RP
    MENU --> G_SM
    L_PROD --> MENU
    L_MAIN --> MENU

    G_CARI --> HELP
    G_BK --> HELP
    G_OT --> HELP
    G_CS --> HELP
    G_KM --> HELP
    G_ON --> HELP
    G_RP --> HELP
    G_SM --> HELP

    H_SESS --> DB_T
    H_METH --> DB_T
    H_AUD --> DB_T
    H_PPH --> DB_T
    H_FRS --> DB_T
    H_GV --> DB_A
    L_PROD -.->|"sohbet için ZT_ProductionPlanning"| DB_T
```

Okuma notu: Finans sayfalarının neredeyse tamamı rol kullanıcıları için `_ProductionLayout`, Admin için `_Layout` kullanır; ekle/düzenle sayfaları `_ExpertLayout`, FinanceReport ise menüsüz `_ReportLayout` ile çizilir. Sayfalar ayrı bir veri katmanı olmadan doğrudan kiracı veritabanına bağlanır; bağlantı dizesi Session `userDatabase` anahtarından gelir. Admin veritabanına yalnız `GlobalVeriables.adminDatabase` üzerinden, rol ve kiracı kaydı okumak için gidilir. Kesikli ok, layout'un her finans sayfasına dayattığı üretim tablosu bağımlılığıdır.

## 2. Finans controller'ları arası bağımlılık

```mermaid
flowchart LR
    AT["AccountTransaction"]
    CA["CustomerAccounts"]
    CCA["CustomerCurrentAccounts"]
    BI["BankIntroduction"]
    BT["BankTransactions"]
    CT["CashTransactions"]
    PA["PaymentApproval"]
    PM["PaymentManagement"]
    PAY["CustomerAccountPayment"]
    COL["CustomerAccountCollection"]
    CHK["Checks"]
    BIL["Bills"]
    CRD["CreditContracts"]
    TD["TimeDeposits"]
    FM["FinanceMaintenance"]
    STE["SalesTruckExpenses"]
    PE["ProductionExpenses"]
    MSA["MaterialStockAll"]
    PPH["PaymentPlanHelper"]

    AT -->|"statik"| BT
    AT -->|"statik"| CT
    AT -->|"statik"| PPH
    AT -->|"AJAX"| CA
    AT -->|"AJAX"| PAY
    AT -->|"AJAX"| COL
    CCA -->|"AJAX"| AT
    BI -->|"statik"| CA

    BT -->|"AJAX ve partial"| COL
    BT -->|"AJAX ve partial"| PAY
    BT -->|"AJAX"| CA
    BT -->|"AJAX"| PA
    BT -->|"AJAX"| AT
    BT -->|"AJAX"| PM
    PA -->|"Session"| BT

    CT -->|"AJAX ve partial"| COL
    CT -->|"AJAX ve partial"| PAY
    CT -->|"AJAX"| CA
    CT -->|"AJAX"| AT
    CT -->|"AJAX"| PM
    CT -->|"AJAX"| BT

    PAY -->|"statik"| BT
    PAY -->|"statik"| CT
    PAY -->|"statik"| CRD
    PAY -->|"statik"| PPH
    PAY -->|"AJAX"| CA
    PAY -->|"AJAX"| COL
    PAY -->|"AJAX"| PM
    PAY -->|"AJAX"| AT
    PAY -->|"AJAX ve partial"| CHK

    COL -->|"statik"| BT
    COL -->|"statik"| CT
    COL -->|"statik"| PPH
    COL -->|"AJAX"| CA

    CHK -->|"statik"| BT
    CHK -->|"statik"| PPH
    CHK -->|"AJAX ve partial"| PAY
    CHK -->|"AJAX"| COL
    CHK -->|"AJAX"| CA
    CHK -->|"AJAX"| PM
    CHK -->|"AJAX"| AT

    BIL -->|"statik"| BT
    BIL -->|"AJAX ve partial"| PAY
    BIL -->|"AJAX"| COL
    BIL -->|"AJAX"| CA
    BIL -->|"AJAX"| PM
    BIL -->|"AJAX"| AT

    CRD -->|"statik"| BT
    CRD -->|"statik"| PPH
    TD -->|"derleme"| CRD
    PM -->|"statik"| BT
    PM -->|"statik"| CT
    FM -->|"AJAX"| AT
    STE -->|"AJAX"| AT
    PE -->|"AJAX"| MSA
```

Okuma notu: Ok yönü "çağıran → çağrılan" demektir; "statik" C# içinden statik metot çağrısı, "partial" başka controller'a ait modal partial'ının gömülmesi, "Session" iki controller'ın aynı Session anahtarını paylaşması, "derleme" başka controller dosyasındaki sınıflara derleme bağımlılığıdır. BankTransactions ve CashTransactions statik `CreateBankTransaction` / `CreateCashTransaction` metotlarıyla grubun ortak hareket yazıcılarıdır; bu iki controller ve PaymentPlanHelper kopyalanmadan ödeme, tahsilat, çek, senet ve kredi derlenmez. CustomerAccountPayment, CustomerAccountCollection, CustomerAccounts ve PaymentManagement uçları beş ayrı sayfaya gömülü ödeme ve tahsilat modalları üzerinden çağrılır; bu dörtlü bir arada taşınmalıdır. Yalnız bağlantı ve yönlendirme olan çağrılar çizilmedi.

## 3. Finans sayfası → çekirdek finans tabloları

### 3.1 Cari ve onay grubu

```mermaid
flowchart LR
    AT["AccountTransaction"]
    CA["CustomerAccounts"]
    CCA["CustomerCurrentAccounts"]
    PA["PaymentApproval"]
    PM["PaymentManagement"]
    PPH["PaymentPlanHelper"]
    FM["FinanceMaintenance"]

    T_CUS[("ZT_CustomerAccounts")]
    T_DEB[("ZT_AccountDebts")]
    T_DEBI[("ZT_AccountDebtsInvoice")]
    T_CRE[("ZT_AccountCredits")]
    T_CREI[("ZT_AccountCreditsInvoice")]
    T_PAYM[("ZT_AccountPayments")]
    T_COLL[("ZT_AccountCollections")]
    T_ROLL[("ZT_AccountRollover")]
    T_TRH[("ZT_AccountTransferHistory")]
    T_CHK[("ZT_Checks")]
    T_BIL[("ZT_Bills")]
    T_BTX[("ZT_BankTransactions")]
    T_CTX[("ZT_CashTransactions")]
    T_CAPP[("ZT_CustomerAccountPaymentPlans")]
    T_DENS[("ZT_PaymentDensityCurrencies")]
    T_BACC[("ZT_BankAccounts")]
    T_BPID[("ZT_BankPaymentInstructionDetails")]
    T_PPL[("ZT_PaymentPlans")]
    T_PAP[("ZT_PaymentApprovals")]
    T_PAD[("ZT_PaymentApprovalDetails")]
    T_DDL[("ZT_AccountDebtsDeleteLog")]

    AT --> T_CUS
    AT --> T_DEB
    AT --> T_DEBI
    AT --> T_CRE
    AT --> T_CREI
    AT --> T_PAYM
    AT --> T_COLL
    AT --> T_ROLL
    AT --> T_TRH
    AT --> T_CHK
    AT --> T_BIL
    AT --> T_BTX
    AT --> T_CTX
    CA --> T_CUS
    CA --> T_CAPP
    CA --> T_DENS
    CA --> T_BACC
    CCA --> T_CUS
    PA --> T_CAPP
    PA --> T_BPID
    PPH --> T_CAPP
    PM --> T_PPL
    PM --> T_PAP
    PM --> T_PAD
    PM --> T_PAYM
    PM --> T_DEB
    FM --> T_DEB
    FM --> T_DDL
```

### 3.2 Banka, kasa ve mevduat grubu

```mermaid
flowchart LR
    BI["BankIntroduction"]
    BT["BankTransactions"]
    BA["BankAccounts"]
    CI["CashIntroduction"]
    CT["CashTransactions"]
    BS["BankStatement"]
    TD["TimeDeposits"]

    T_BINT[("ZT_BankIntroduction")]
    T_BTX[("ZT_BankTransactions")]
    T_BACC[("ZT_BankAccounts")]
    T_BPI[("ZT_BankPaymentInstructions")]
    T_BPID[("ZT_BankPaymentInstructionDetails")]
    T_CAPP[("ZT_CustomerAccountPaymentPlans")]
    T_CINT[("ZT_CashIntroduction")]
    T_CTX[("ZT_CashTransactions")]
    T_BTR[("ZT_BankTransfers")]
    T_EBS[("ZT_ExchangeBreakSource")]
    T_PAYM[("ZT_AccountPayments")]
    T_COLL[("ZT_AccountCollections")]
    T_ACO[("ZT_AccountCollectionOrders")]
    T_TDEP[("ZT_TimeDeposits")]
    T_INT[("ZT_InterestCollections")]
    T_FIE[("ZT_FinIncomeExpense")]

    BI --> T_BINT
    BI --> T_BACC
    BI --> T_BPI
    BI --> T_BPID
    BI --> T_CAPP
    BT --> T_BTX
    BT --> T_CAPP
    BT -->|"kalıcı silme"| T_COLL
    BT -->|"kalıcı silme"| T_ACO
    BA --> T_BACC
    CI --> T_CINT
    CT --> T_CTX
    BS --> T_BTR
    BS --> T_BTX
    BS --> T_CTX
    BS --> T_EBS
    BS -->|"iş yeri carisi yansıması"| T_PAYM
    BS -->|"iş yeri carisi yansıması"| T_COLL
    BS --> T_ACO
    TD --> T_TDEP
    TD --> T_INT
    TD --> T_FIE
    TD -->|"Balance dahil"| T_BINT
    TD --> T_BTX
```

### 3.3 Ödeme, tahsilat, çek, senet ve kredi grubu

```mermaid
flowchart LR
    PAY["CustomerAccountPayment"]
    COL["CustomerAccountCollection"]
    CHK["Checks"]
    CB["CheckBooks"]
    BIL["Bills"]
    CRD["CreditContracts"]
    AC["AccountCredits"]

    T_PAYM[("ZT_AccountPayments")]
    T_COLL[("ZT_AccountCollections")]
    T_ACO[("ZT_AccountCollectionOrders")]
    T_CHK[("ZT_Checks")]
    T_CHM[("ZT_CheckMovements")]
    T_CHB[("ZT_CheckBooks")]
    T_BIL[("ZT_Bills")]
    T_BTX[("ZT_BankTransactions")]
    T_CTX[("ZT_CashTransactions")]
    T_CUS[("ZT_CustomerAccounts")]
    T_CAPP[("ZT_CustomerAccountPaymentPlans")]
    T_BPID[("ZT_BankPaymentInstructionDetails")]
    T_CC[("ZT_CreditContracts")]
    T_CI[("ZT_CreditInstallments")]
    T_CD[("ZT_CreditDrawdowns")]
    T_BINT[("ZT_BankIntroduction")]
    T_DEB[("ZT_AccountDebts")]
    T_FIE[("ZT_FinIncomeExpense")]
    T_CRE[("ZT_AccountCredits")]

    PAY --> T_PAYM
    PAY --> T_CHK
    PAY --> T_CHM
    PAY --> T_CHB
    PAY --> T_BIL
    PAY --> T_BTX
    PAY --> T_CTX
    PAY --> T_CUS
    PAY --> T_CAPP
    PAY --> T_BPID
    COL --> T_COLL
    COL --> T_ACO
    COL --> T_CHK
    COL --> T_CHM
    COL --> T_CHB
    COL --> T_BIL
    COL --> T_BTX
    COL --> T_CTX
    CHK --> T_CHK
    CHK --> T_CHB
    CHK --> T_CTX
    CHK --> T_BTX
    CHK --> T_PAYM
    CB --> T_CHB
    BIL --> T_BIL
    BIL --> T_BTX
    CRD --> T_CC
    CRD --> T_CI
    CRD --> T_CD
    CRD -->|"kredi hesabı açar"| T_BINT
    CRD --> T_BTX
    CRD --> T_DEB
    CRD --> T_PAYM
    CRD --> T_CAPP
    CRD --> T_FIE
    AC --> T_CRE
```

### 3.4 Stok ve masraf grubu — çekirdek finans tablolarına yazma

```mermaid
flowchart LR
    MSA["MaterialStockAll"]
    STE["SalesTruckExpenses"]
    PE["ProductionExpenses"]
    EI["ExpenseItems"]
    WP["WorkPlace"]

    T_DEB[("ZT_AccountDebts")]
    T_CRE[("ZT_AccountCredits")]
    T_CUS[("ZT_CustomerAccounts")]
    T_PEX[("ZT_ProductionExpenses")]
    T_PED[("ZT_ProductionExpensesDetail")]

    MSA -->|"alış faturası borcu"| T_DEB
    MSA -->|"satış faturası alacağı"| T_CRE
    MSA -->|"tedarikçi carisi"| T_CUS
    STE -->|"sevk nakliye borcu"| T_DEB
    PE --> T_PEX
    PE --> T_PED
    PE -->|"masraf hesabı borcu"| T_DEB
    EI -->|"MSR carisi"| T_CUS
    WP -->|"ISY carisi"| T_CUS
```

Okuma notu: Yalnız yazma okları çizildi; okumalar gösterilmedi. Ok etiketi yoksa yazma türü INSERT, UPDATE ya da DELETE'in bir birleşimidir; ayrıntı bölüm 5'teki tablo kataloğundadır. Statik metotlar üzerinden yapılan dolaylı yazmalar, örneğin ödeme sayfasının `CreateBankTransaction` ile banka hareketi yazması, çağıran sayfaya bağlanarak gösterildi. Stok ve masraf grubunda yalnız çekirdek finans tablolarına giden oklar çizildi; stok tablolarına yazmalar bölüm 4'te.

## 4. Finans dışı bağımlılıklar

```mermaid
flowchart LR
    AT["AccountTransaction"]
    CA["CustomerAccounts"]
    CCA["CustomerCurrentAccounts"]
    BS["BankStatement"]
    PAY["CustomerAccountPayment"]
    COL["CustomerAccountCollection"]
    AC["AccountCredits"]
    FBS["FinancialBalanceSheet"]
    FR["FinanceReport"]
    FM["FinanceMaintenance"]
    MSA["MaterialStockAll"]
    STE["SalesTruckExpenses"]
    PE["ProductionExpenses"]
    ALL["Tüm _ProductionLayout sayfaları"]
    VIEWS["Ödeme ve tahsilat modal partialları"]

    G_PROD[["Üretim - ZT_ProductionPlanning, Conveyor, Sergeants, Line"]]
    G_SALES[["Satış ve sipariş - ZT_Orders, ZT_OrderHeader, Customer, Product"]]
    G_TRUCK[["Satış sevkiyatı - ZT_SalesTruck ve bağlıları"]]
    G_STOCK[["Stok - ZT_MaterialStockAll, Purchases, Invoice, Pesticide"]]
    G_GARDEN[["Bahçe ve eksper - ZT_ExpertReport, Truck, Finance, Supplier, HarvestManager"]]
    G_PERS[["Personel - ZT_Personnel, maaş akışı"]]
    G_TRANS[["Nakliye ana verisi - TransportCompany, TransportTruck"]]
    G_SET[["Ayar - ZT_Setting Reçeteli Üretim"]]

    ALL -->|"layout sohbet bileşeni"| G_PROD
    AT -->|"borç silme stok geri alır"| G_STOCK
    AT -->|"sevk nakliye borcu silinince araç alanları temizlenir"| G_TRUCK
    AT -->|"detay modalları ve hesap grubu sorguları"| G_GARDEN
    AT -->|"satış düzenleme modalı"| G_SALES
    CA -->|"cari ekleyince referans kayıt yazar"| G_GARDEN
    CA -->|"Müşteri carisi Customer kaydı açar"| G_SALES
    CA -->|"Nakliye carisi firma kaydı açar"| G_TRANS
    CA -->|"Personel carisi kaydı açar"| G_PERS
    CA -->|"Üretim Çavuşu carisi"| G_PROD
    CCA -->|"yalnız Müşteri carileri ve siparişleri"| G_SALES
    BS -->|"sipariş bazlı döviz bozumu"| G_SALES
    PAY -->|"bahçe ödeme paylaştırma"| G_GARDEN
    COL -->|"tahsilatı siparişe tahsis"| G_SALES
    AC -->|"Customer ile INNER JOIN ve OrdersID"| G_SALES
    FBS -->|"stok değerleme"| G_STOCK
    FBS -->|"iş yerleri arası ticari borç"| G_PROD
    FBS -->|"hammadde aracı değeri"| G_GARDEN
    FR -->|"belge tarihi alt sorguları"| G_TRUCK
    FR -->|"bekleyen bahçe araçları"| G_GARDEN
    FM -->|"RefMappings ve araç alanı güncelleme"| G_TRUCK
    MSA -->|"üretim tüketimi ve kullanım kontrolü"| G_PROD
    MSA -->|"stok modülünün kendisi"| G_STOCK
    MSA -->|"kantar nakliye uçları"| G_TRANS
    STE -->|"masraf kolonları sevk kaydında"| G_TRUCK
    STE -->|"firma ve şoför listesi"| G_TRANS
    PE -->|"sipariş referansı"| G_SALES
    PE -->|"üretim hattı"| G_PROD
    PE -->|"malzeme firesi"| G_STOCK
    VIEWS -->|"bahçe bölümünü gizleme bayrağı"| G_SET
    VIEWS -->|"bahçe şablonu Checks ve Bills sayfalarına taşınır"| G_GARDEN
    VIEWS -->|"maaş muhasebe tipleri"| G_PERS
```

Okuma notu: Bu diyagram lojistiğe uyarlamada kesilmesi ya da dönüştürülmesi gereken bağların haritasıdır; her ok etiketi bağımlılığın nedenini söyler. En yaygın bağ layout'un üretim sohbet bileşenidir ve tek noktadan, layout'ta kesilebilir. En derin bağlar CustomerAccounts'un hesap grubuna göre ana veri tablolarına yazması, AccountTransaction'ın borç silme kuralları ve FinancialBalanceSheet'in stok blokları; bunlar kod düzeyinde yeniden yazım ister. Nakliye ana verisi kümesi lojistikte kesilmek yerine çekirdeğe dönüşebilecek tek gruptur.

## 5. Cari hesap polimorfik referans modeli

```mermaid
flowchart LR
    CUS["ZT_CustomerAccounts - AccountGroup ve ReferenceID"]

    R_SUP[("Supplier")]
    R_CUST[("Customer")]
    R_IND[("ZT_IndustrialSupplier")]
    R_HM[("ZT_HarvestManager")]
    R_PS[("ZT_ProductionSergeants")]
    R_TC[("TransportCompany")]
    R_LAB[("ZT_LaboratoryFirms")]
    R_EI[("ZT_ExpenseItems")]
    R_WP[("ZT_WorkPlace")]
    R_PER[("ZT_Personnel")]
    R_NONE["Referans yok - kod CAR"]

    CUS -->|"Tedarikçi - MST"| R_SUP
    CUS -->|"Müşteri - MUS"| R_CUST
    CUS -->|"Malzeme Tedarikçisi - MZT"| R_IND
    CUS -->|"İlaç Tedarikçisi - ILT"| R_IND
    CUS -->|"Kesim Çavuşu - KSC"| R_HM
    CUS -->|"Üretim Çavuşu - URC"| R_PS
    CUS -->|"Nakliye Firması - BHN"| R_TC
    CUS -->|"Sevk Nakliye Firması - SVN"| R_TC
    CUS -->|"Analiz Firması - ANL"| R_LAB
    CUS -->|"Masraf Hesabı - MSR"| R_EI
    CUS -->|"İş Yeri Firması - ISY"| R_WP
    CUS -->|"Personel - PER"| R_PER
    CUS -->|"diğer"| R_NONE

    DEB["ZT_AccountDebts ve ZT_AccountCredits - AccountingType ve ReferenceID"]
    DEB -->|"CustomerAccountID"| CUS

    S_ERTF[("ZT_ExpertReportTruckFinance")]
    S_ERTE[("ZT_ExpertReportTruckExpenses")]
    S_UHM[("ZT_UsedHarvestManager")]
    S_ST[("ZT_SalesTruck")]
    S_RS[("ZT_RecipeShipment")]
    S_MI[("ZT_MaterialInvoice")]
    S_MSI[("ZT_MaterialSalesInvoice")]
    S_PI[("ZT_PesticideInvoice")]
    S_PE[("ZT_ProductionExpenses")]
    S_PSE[("ZT_ProductionSergeantsExpenses")]
    S_OC[("ZT_OrderClaims")]
    S_OE[("ZT_OrderExpenses")]
    S_CC[("ZT_CreditContracts")]

    DEB -->|"Tedarikçi"| S_ERTF
    DEB -->|"Nakliye Firması"| S_ERTE
    DEB -->|"Kesim Çavuşu"| S_UHM
    DEB -->|"Sevk Nakliye Firması - TransportType kara veya gemi"| S_ST
    DEB -.->|"Sevk Nakliye Firması - ReferenceID doğrulanmadı"| S_RS
    DEB -->|"Malzeme Tedarikçisi - borç"| S_MI
    DEB -->|"Malzeme Tedarikçisi - alacak"| S_MSI
    DEB -->|"İlaç Tedarikçisi"| S_PI
    DEB -->|"Masraf Hesabı"| S_PE
    DEB -->|"Üretim Çavuşu"| S_PSE
    DEB -->|"sipariş talebi"| S_OC
    DEB -->|"Müşteri - sipariş masrafı"| S_OE
    DEB -->|"Kredi - açılış borcu"| S_CC
```

Okuma notu: Üst yarı cari kartın hangi ana veri tablosuna `AccountGroup` + `ReferenceID` çiftiyle bağlandığını, etiketteki üç harf hesap kodu önekini gösterir; veritabanında yabancı anahtar yoktur. Alt yarı borç ve alacak satırlarının kaynak belgeye `AccountingType` + `ReferenceID` çiftiyle bağlanmasıdır; `ReferenceID` tek başına benzersiz değildir ve sevk aracında aynı çift altında kara ve gemi için iki borç olabilir, ayrım `TransportType` ile yapılır. Kredi açılış borcundaki referansın sözleşme kimliği olduğu C parçasında açıkça yazmıyor, yalnız `AccountingType='Kredi'` ve belge türü verilmiş; kesikli ok doğrulanmamış bağı gösterir. Lojistik uyarlamasında en çok değişecek nokta bu iki eşleme listesidir.

## 6. Kimlik doğrulama ve kiracı çözümleme akışı

```mermaid
sequenceDiagram
    autonumber
    participant BR as Tarayıcı
    participant AC as AccountController Login
    participant ADB as Admin veritabanı ZTO_ADMIN
    participant TDB as Kiracı veritabanı
    participant SS as Session ve auth çerezi
    participant FP as Finans sayfası controller

    BR->>AC: POST Login kullanıcı adı ve şifre
    AC->>ADB: Customers tablosunda master hesap ara
    alt Master hesap bulundu
        ADB-->>AC: DatabaseName, IPAddress, Port, QrKey, Status, EndingDate
        AC->>AC: rol sabit Admin
    else Alt kullanıcı
        AC->>ADB: Users ve UserRoles ara
        ADB-->>AC: CustomersID, Role, Key
        AC->>ADB: Customers satırını ID ile oku
        AC->>AC: durum, lisans, işletim sistemi ve iki adımlı doğrulama kontrolü
    end
    AC->>AC: kiracı bağlantı dizesini üret - kendi sunucu ya da ortak sunucu ve DatabaseName
    AC->>AC: IntroductionAuditHelper WithActor ile aktör ekle
    opt Rol Finans
        AC->>TDB: ZT_FinancePerson satırını Key ile oku
        TDB-->>AC: SuperStatus
        AC->>AC: rolü Finans super ya da Finans normal yap
    end
    AC->>SS: claim yaz - NameIdentifier, Role, tenant-id, account-kind
    AC->>SS: Session yaz - userDatabase, customerUserRole, customerUserKey ve diğerleri
    AC-->>BR: role göre yönlendir - Finans için AccountTransaction AllTransactions
    BR->>FP: GET finans sayfası
    FP->>SS: UserRoleAuthorize rol claim kontrolü
    FP->>SS: Session userDatabase oku
    FP->>TDB: NpgsqlConnection ile ham SQL
    FP->>TDB: rol personel tablosundan WorkPlaceID ve layout seçimi
    TDB-->>FP: veri
    FP-->>BR: View ya da JSON
```

Okuma notu: Kiracı başına ayrı bir PostgreSQL veritabanı vardır ve kiracı girişte admin veritabanındaki `Customers` satırından çözülür; tam bağlantı dizesi Session `userDatabase` anahtarına yazılır ve her finans action'ı bağlantıyı oradan kurar. `WithActor` bağlantı dizesine kullanıcıyı ekler, kiracı veritabanındaki denetim tetikleyicisi bu değeri okur. Finans rolü girişte `ZT_FinancePerson.SuperStatus` değerine göre iki claim'e ayrılır; iş yeri kapsamı ise her sayfada rol personel tablosundan yeniden okunur ve sunucuda zorunlu filtre olarak uygulanmaz. Session boşken auth çerezi geçerliyse ara katman kullanıcıyı Login'e yönlendirir ve şifreli çerezlerden Session yeniden doldurulur; bu dal şemada gösterilmedi.
