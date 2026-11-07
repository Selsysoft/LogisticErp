import { api, linkFromMail, newPassword, TenantState } from "./support";

/**
 * Testin konusu olmayan ön verileri (şube, cari, araç, sürücü, sefer) API ile hazırlar; ekranda
 * yalnız denenen akış yürütülür.
 */
export class Owner {
  private constructor(
    readonly state: TenantState,
    private readonly token: string,
  ) {}

  static async login(state: TenantState) {
    const { accessToken } = await api<{ accessToken: string }>("POST", "/auth/login", {
      tenant: state.code,
      body: { email: state.email, password: state.password },
    });
    return new Owner(state, accessToken);
  }

  request<T>(method: string, path: string, body?: unknown) {
    return api<T>(method, path, { token: this.token, tenant: this.state.code, body });
  }

  private async create(path: string, body: unknown) {
    return (await this.request<{ id: string }>("POST", path, body)).id;
  }

  branch() {
    return this.create("/organization/branches", { code: unique("S"), name: "Merkez" });
  }

  account(type: "CUSTOMER" | "SUPPLIER" | "CARRIER", name: string) {
    return this.create("/finance/accounts", { code: unique("C"), name, type });
  }

  /** Muayene ve sigortası geçerli, atanabilir çekici. */
  async vehicle(plate: string) {
    const id = await this.create("/fleet/vehicles", {
      plate,
      kind: "TRUCK",
      ownership: "OWNED",
      status: "ACTIVE",
    });
    for (const docType of ["INSPECTION", "TRAFFIC_INSURANCE"]) {
      await this.create(`/fleet/VEHICLE/${id}/documents`, { docType, expiresOn: FAR });
    }
    return id;
  }

  /** Ehliyet, SRC ve psikoteknik belgesi geçerli sürücü. */
  async driver(fullName: string) {
    const id = await this.create("/fleet/drivers", {
      code: unique("D"),
      fullName,
      status: "ACTIVE",
    });
    for (const docType of ["LICENSE", "SRC", "PSYCHOTECHNIC"]) {
      await this.create(`/fleet/DRIVER/${id}/documents`, { docType, expiresOn: FAR });
    }
    return id;
  }

  /** Verilen rolle kullanıcı davet eder, davet bağlantısıyla şifresini belirler. */
  async user(roleCode: string, email: string) {
    const roles = await this.request<{ id: string; code: string }[]>("GET", "/identity/roles");
    const role = roles.find((item) => item.code === roleCode);
    if (!role) throw new Error(`Rol yok: ${roleCode}`);
    await this.request("POST", "/identity/users", {
      email,
      fullName: "Deneme Kullanıcı",
      roleIds: [role.id],
    });
    const invite = new URL(await linkFromMail(email, "Hesabınızı etkinleştirin"));
    const password = newPassword();
    await api("POST", "/auth/password-reset/confirm", {
      tenant: this.state.code,
      body: { token: invite.searchParams.get("token"), newPassword: password },
    });
    return { code: this.state.code, email, password } satisfies TenantState;
  }

  linkDriverUser(driverId: string, email: string) {
    return this.request("PUT", `/fleet/drivers/${driverId}/user`, { email });
  }

  /** Yarın yüklenip ertesi gün teslim edilecek, 10.000 TL'lik tek etaplı sefer. */
  shipment(customerId: string, branchId: string) {
    const pickup = new Date(Date.now() + DAY);
    return this.request<{ id: string; number: string; legs: { id: string }[] }>(
      "POST",
      "/shipment/shipments",
      {
        accountId: customerId,
        branchId,
        shipperName: "Gönderici Tekstil",
        consigneeName: "Alıcı Mağazacılık",
        origin: "İstanbul",
        destination: "Ankara",
        plannedPickup: pickup.toISOString(),
        plannedDelivery: new Date(pickup.getTime() + DAY).toISOString(),
        currency: "TRY",
        manualNet: "10000",
        cargo: [{ description: "Kumaş", quantity: "10", packaging: "Palet", weightKg: "5000" }],
      },
    );
  }

  assign(legId: string, vehicleId: string, driverId: string) {
    return this.request("POST", `/shipment/legs/${legId}/assign`, { vehicleId, driverId });
  }

  moveTo(shipmentId: string, status: string) {
    return this.request("POST", `/shipment/shipments/${shipmentId}/status`, { status });
  }

  async shipmentStatus(shipmentId: string) {
    return (await this.request<{ status: string }>("GET", `/shipment/shipments/${shipmentId}`))
      .status;
  }
}

const DAY = 24 * 60 * 60 * 1000;
const FAR = new Date(Date.now() + 365 * DAY).toISOString().slice(0, 10);

let counter = 0;
export function unique(prefix: string) {
  counter += 1;
  return `${prefix}${Date.now().toString(36).toUpperCase()}${counter}`;
}

/** Türk plakası biçiminde benzersiz plaka. */
export function plate() {
  const n = Math.floor(Math.random() * 9000) + 1000;
  const letters = String.fromCharCode(65 + (n % 26), 65 + ((n >> 3) % 26));
  return `34${letters}${n}`;
}
