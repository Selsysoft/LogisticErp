// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { computeDefinitionFormClasses, missingDefinitionFormClasses } from "./definitionFormDecor";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): HTMLFormElement {
  document.body.innerHTML = html;
  return document.querySelector("form") as HTMLFormElement;
}

function classesOf(form: Element) {
  const result: Record<string, string[]> = {};
  for (const [element, classes] of computeDefinitionFormClasses(form)) {
    result[element.getAttribute("data-k") ?? element.tagName.toLowerCase()] = classes;
  }
  return result;
}

describe("computeDefinitionFormClasses (introduction-details.js enhanceDefinitionForm)", () => {
  it("ZTO WorkPlace/Add: tek alanlı satırlar grid olmaz; input-group → --wide; düğme sarmalayıcısı actions", () => {
    const form = mount(`
      <ol class="breadcrumb"></ol><h4 data-k="title">Yeni İş Yeri</h4><hr/>
      <form>
        <div class="row" data-k="r1"><div class="col-md-12" data-k="name"><label>Ad</label><input/></div></div>
        <div class="row" data-k="r2"><div class="col-md-12" data-k="phone"><label>Tel</label><input/></div></div>
        <div class="row" data-k="r3">
          <div class="col-md-6" data-k="addr"><label>Adres</label><div class="input-group"><input/></div></div>
          <div class="col-md-6" data-k="loc"><label>Konum</label><div class="input-group"><input/></div></div>
        </div>
        <div class="row"><div class="col-md-12" data-k="act"><button type="submit">Kaydet</button></div></div>
      </form>`);
    expect(classesOf(form)).toEqual({
      form: ["definition-form"],
      title: ["definition-form-title"],
      name: ["definition-form-field"],
      phone: ["definition-form-field"],
      addr: ["definition-form-field", "definition-form-field--wide"],
      loc: ["definition-form-field", "definition-form-field--wide"],
      r3: ["definition-form-grid"],
      act: ["definition-form-actions"],
    });
  });

  it("form-check-label atlanır; aynı köke ikinci etiket bir kez sayılır; denetimsiz kök atlanır", () => {
    const form = mount(`
      <form>
        <div class="row" data-k="row">
          <div class="col-md-6" data-k="a"><label>A</label><label>A2</label><input/></div>
          <div class="col-md-6" data-k="b"><label>B</label><textarea></textarea></div>
          <div class="col-md-6" data-k="c"><div class="form-check"><input type="checkbox"/><label class="form-check-label">Aktif</label></div></div>
          <div class="col-md-6" data-k="d"><label>Yalnız metin</label><input type="hidden"/></div>
          <div class="col-md-6" data-k="e"><fieldset><label>F</label><select></select></fieldset></div>
          <div class="col-md-6" data-k="f"><label class="custom-file-label">x</label><input type="file"/></div>
        </div>
      </form>`);
    expect(classesOf(form)).toEqual({
      form: ["definition-form"],
      a: ["definition-form-field"],
      b: ["definition-form-field", "definition-form-field--wide"],
      e: ["definition-form-field"],
      row: ["definition-form-grid"],
    });
  });

  it("fieldset kök: div atası yoksa fieldset'in kendisi; varsa en yakın div", () => {
    document.body.innerHTML = `<form><fieldset data-k="fs"><label>A</label><input/></fieldset></form>`;
    let form = document.querySelector("form") as HTMLFormElement;
    expect(classesOf(form)).toEqual({ form: ["definition-form"], fs: ["definition-form-field"] });
    form = mount(
      `<form><div data-k="d"><fieldset><label>A</label><input/></fieldset></div></form>`,
    );
    expect(classesOf(form)).toEqual({ form: ["definition-form"], d: ["definition-form-field"] });
  });

  it("düğme formun doğrudan çocuğuysa actions yok; düğmeyle aynı div'de alan varsa actions yok", () => {
    let form = mount(`<div><form><div class="form-group" data-k="g"><label>X</label><input/></div>
      <button type="submit">Güncelle</button></form></div>`);
    expect(classesOf(form)).toEqual({
      form: ["definition-form"],
      g: ["definition-form-field"],
    });
    form = mount(`<form><div data-k="mix"><input/><button type="submit">K</button></div></form>`);
    expect(classesOf(form)).toEqual({ form: ["definition-form"] });
  });

  it("kart içindeki form --nested; başlık nav/header/modal içindeyse ya da formdan sonraysa alınmaz", () => {
    const form = mount(`
      <header><h4>Üst</h4></header><nav><h3>Menü</h3></nav>
      <div class="card"><form><div data-k="x"><label>X</label><input/></div></form></div>
      <h4>Sonra</h4>`);
    expect(classesOf(form)).toEqual({
      form: ["definition-form", "definition-form--nested"],
      x: ["definition-form-field"],
    });
  });

  it("missingDefinitionFormClasses: eksikleri listeler, bildirimsel sınıflar varsa boş", () => {
    let form = mount(
      `<form><div class="row"><div class="col-md-12" id="k"><label>X</label><input/></div></div></form>`,
    );
    expect(missingDefinitionFormClasses(form)).toEqual([
      "form.: definition-form",
      "div#k.col-md-12: definition-form-field",
    ]);
    form = mount(
      `<form class="definition-form"><div class="row"><div class="col-md-12 definition-form-field"><label>X</label><input/></div></div></form>`,
    );
    expect(missingDefinitionFormClasses(form)).toEqual([]);
  });
});
