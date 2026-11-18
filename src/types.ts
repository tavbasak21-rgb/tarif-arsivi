/** Tariften okunan tek satır (malzeme veya adım). */
export type Line = { text: string; uncertain: boolean };

/** Claude'un kaynaktan çıkardığı tarif içeriği. `*Tr` alanları yalnızca kaynak Türkçe değilse doludur. */
export type RecipeContent = {
  sourceLanguage: string;
  ingredients: Line[];
  steps: Line[];
  ingredientsTr: Line[] | null;
  stepsTr: Line[] | null;
  rawText: string;
};

/** Cano'nun onayladığı, kayıtlı tarif. */
export type Recipe = RecipeContent & {
  id: string;
  title: string;
  sourceUrl: string | null;
  note: string;
  coverJpeg: Blob | null;
  frames: Blob[];
  createdAt: number;
  updatedAt: number;
};

export type QueueStatus = "pending" | "processing" | "draft" | "failed" | "paused";

/** Okuma sırasındaki bir öğe; onaylanana kadar burada bekler. */
export type QueueItem = {
  id: string;
  kind: "video" | "photo" | "text";
  file: Blob | null;
  pastedText: string | null;
  sourceUrl: string | null;
  status: QueueStatus;
  error: string | null;
  frames: Blob[];
  draft: RecipeContent | null;
  createdAt: number;
};
