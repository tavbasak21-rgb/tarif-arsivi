import * as z from "zod/v4";
import type { RecipeContent } from "../types";

export const LineSchema = z.object({
  text: z.string().describe("Satırın görüntüde okunduğu hâli"),
  uncertain: z.boolean().describe("Okunamayan/emin olunmayan satırlar için true"),
});

export const RecipeContentSchema = z.object({
  sourceLanguage: z.string().describe("Kaynak dilin ISO 639-1 kodu, ör. tr, en, it"),
  ingredients: z.array(LineSchema),
  steps: z.array(LineSchema),
  ingredientsTr: z.array(LineSchema).nullable(),
  stepsTr: z.array(LineSchema).nullable(),
  rawText: z.string(),
});

// Derleme zamanı kontrolü: şema ile `RecipeContent` birebir aynı olmalı (iki yönlü atanabilirlik).
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _schemaMatchesType: Equals<z.infer<typeof RecipeContentSchema>, RecipeContent> = true;
void _schemaMatchesType;
