import { describe, expect, it } from "vitest";
import { withCompany } from "./companyQuery";

describe("withCompany", () => {
  it("konsolidede yolu değiştirmez", () => {
    expect(withCompany("/finance/funds", null)).toBe("/finance/funds");
  });

  it("ilk ya da ek parametre olarak companyId ekler", () => {
    expect(withCompany("/finance/funds", "c1")).toBe("/finance/funds?companyId=c1");
    expect(withCompany("/finance/payments?page=0", "c 2")).toBe(
      "/finance/payments?page=0&companyId=c%202",
    );
  });
});
