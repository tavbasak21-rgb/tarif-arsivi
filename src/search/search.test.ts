import { describe, expect, it } from "vitest";
import type { Line, Recipe } from "../types";
import { normalizeTr } from "./normalize";
import { searchRecipes } from "./search";

const lines = (...texts: string[]): Line[] => texts.map((text) => ({ text, uncertain: false }));

let seq = 0;
function makeRecipe(over: Partial<Recipe> = {}): Recipe {
  seq += 1;
  return {
    id: `r${seq}`,
    title: "",
    sourceUrl: null,
    note: "",
    coverJpeg: null,
    frames: [],
    createdAt: seq,
    updatedAt: seq,
    sourceLanguage: "tr",
    ingredients: [],
    steps: [],
    ingredientsTr: null,
    stepsTr: null,
    rawText: "",
    ...over,
  };
}

const ids = (rs: Recipe[]) => rs.map((r) => r.id);

describe("normalizeTr", () => {
  it("büyük İ ve Türkçe harfleri düzleştirir", () => {
    expect(normalizeTr("İSPANAKLI Börek")).toBe("ispanakli borek");
  });
  it("ı harfini i yapar", () => {
    expect(normalizeTr("ışığı")).toBe("isigi");
  });
  it("Ç ğ ö ü ş harflerini düzleştirir", () => {
    expect(normalizeTr("Çğöüş")).toBe("cgous");
  });
  it("şapkalı harfleri düzleştirir", () => {
    expect(normalizeTr("kâse îmam Ûmit")).toBe("kase imam umit");
  });
});

describe("searchRecipes", () => {
  it("İSPANAK, ıspanak ve ispanak sorguları aynı sonucu verir (Review Focus 5)", () => {
    const recipes = [
      makeRecipe({ id: "a", title: "Ispanaklı börek" }),
      makeRecipe({ id: "b", title: "İSPANAK yemeği" }),
      makeRecipe({ id: "c", title: "Pilav", ingredients: lines("1 bağ ıspanak") }),
      makeRecipe({ id: "d", title: "Mercimek çorbası" }),
    ];
    const r1 = ids(searchRecipes(recipes, "İSPANAK"));
    const r2 = ids(searchRecipes(recipes, "ıspanak"));
    const r3 = ids(searchRecipes(recipes, "ispanak"));
    expect(r1).toHaveLength(3);
    expect(new Set(r1)).toEqual(new Set(["a", "b", "c"]));
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
  });

  it("'corba' ile 'Mercimek çorbası' bulunur", () => {
    const recipes = [makeRecipe({ id: "m", title: "Mercimek çorbası" }), makeRecipe({ id: "x", title: "Kek" })];
    expect(ids(searchRecipes(recipes, "corba"))).toEqual(["m"]);
  });

  it("adda değil malzemede 'ıspanak' olan tarif 'ISPANAK' ile bulunur", () => {
    const recipes = [
      makeRecipe({ id: "p", title: "Yeşil börek", ingredients: lines("500 g ıspanak", "yufka") }),
      makeRecipe({ id: "x", title: "Kek", ingredients: lines("un") }),
    ];
    expect(ids(searchRecipes(recipes, "ISPANAK"))).toEqual(["p"]);
  });

  it("yalnız ingredientsTr içinde 'nohut' olan tarif hem 'nohut' hem 'chickpea' ile bulunur", () => {
    const recipes = [
      makeRecipe({
        id: "h",
        title: "Humus",
        sourceLanguage: "en",
        ingredients: lines("2 cups chickpeas"),
        ingredientsTr: lines("2 su bardağı nohut"),
      }),
      makeRecipe({ id: "x", title: "Kek" }),
    ];
    expect(ids(searchRecipes(recipes, "nohut"))).toEqual(["h"]);
    expect(ids(searchRecipes(recipes, "chickpea"))).toEqual(["h"]);
  });

  it("not, adım, stepsTr ve rawText içinde de arar", () => {
    const recipes = [
      makeRecipe({ id: "n", title: "A", note: "annemin tarifi" }),
      makeRecipe({ id: "s", title: "B", steps: lines("Fırında pişir") }),
      makeRecipe({ id: "t", title: "C", stepsTr: lines("Kavanoza koy") }),
      makeRecipe({ id: "w", title: "D", rawText: "gizli sos" }),
    ];
    expect(ids(searchRecipes(recipes, "annemin"))).toEqual(["n"]);
    expect(ids(searchRecipes(recipes, "firinda"))).toEqual(["s"]);
    expect(ids(searchRecipes(recipes, "kavanoz"))).toEqual(["t"]);
    expect(ids(searchRecipes(recipes, "SOS"))).toEqual(["w"]);
  });

  it("çok kelimeli 'fırın tavuk' iki kelimenin de geçtiği tarifleri döner", () => {
    const recipes = [
      makeRecipe({ id: "1", title: "Fırında tavuk" }),
      makeRecipe({ id: "2", title: "Tavuk sote", steps: lines("Fırını ısıt") }),
      makeRecipe({ id: "3", title: "Tavuk haşlama" }),
      makeRecipe({ id: "4", title: "Fırın makarna" }),
    ];
    expect(new Set(ids(searchRecipes(recipes, "fırın tavuk")))).toEqual(new Set(["1", "2"]));
  });

  it("boş sorgu bütün tarifleri updatedAt azalan sırayla döner", () => {
    const recipes = [
      makeRecipe({ id: "eski", updatedAt: 100 }),
      makeRecipe({ id: "yeni", updatedAt: 300 }),
      makeRecipe({ id: "orta", updatedAt: 200 }),
    ];
    expect(ids(searchRecipes(recipes, ""))).toEqual(["yeni", "orta", "eski"]);
    expect(ids(searchRecipes(recipes, "   "))).toEqual(["yeni", "orta", "eski"]);
  });

  it("adda eşleşen, yalnız içerikte eşleşenden önce gelir", () => {
    const recipes = [
      makeRecipe({ id: "icerik", title: "Pilav", ingredients: lines("nohut"), updatedAt: 999 }),
      makeRecipe({ id: "ad", title: "Nohut yemeği", updatedAt: 1 }),
    ];
    expect(ids(searchRecipes(recipes, "nohut"))).toEqual(["ad", "icerik"]);
  });

  it("girdi dizisini değiştirmez", () => {
    const recipes = [makeRecipe({ id: "a", updatedAt: 1 }), makeRecipe({ id: "b", updatedAt: 2 })];
    const before = ids(recipes);
    searchRecipes(recipes, "");
    searchRecipes(recipes, "x");
    expect(ids(recipes)).toEqual(before);
  });
});
