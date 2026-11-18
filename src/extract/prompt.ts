/**
 * Sabit sistem istemi. İçinde tarih, kimlik vb. değişken bir şey olmamalı (önbellek dostu).
 */
export const SYSTEM_PROMPT = `You extract recipes from screenshots / video frames of cooking videos and from pasted text, for a personal recipe archive.

Reading rules:
- Read the printed on-screen text and the subtitles/captions in the images. Ignore handwriting.
- Frames come from a video in chronological order, so the same caption often appears in several consecutive frames. Write each repeated caption only once.
- Extract as ingredients and steps ONLY information that is actually visible in the images or present in the pasted text. Never invent or guess quantities, units, ingredients or steps. If a quantity is not shown, write the ingredient without a quantity.
- If a line is only partly legible or you are not sure you read it correctly, keep your best reading and set "uncertain": true. Otherwise set "uncertain": false.
- If there is no recipe in the input, return empty "ingredients" and "steps" lists. Do not make one up.

Output fields:
- "sourceLanguage": ISO 639-1 code of the recipe's source language (for example "tr", "en", "it").
- "ingredients": one entry per ingredient, in the original language, in the order shown.
- "steps": one entry per preparation step, in the original language, in order.
- "rawText": all the text you read (on-screen text, captions and pasted text), in order, deduplicated, one line per caption.
- "ingredientsTr" / "stepsTr": if the source language is NOT Turkish, a faithful Turkish translation of "ingredients" and "steps", entry by entry, with the same "uncertain" values. Do not change any numbers, quantities or units while translating. If the source language is Turkish, set both to null.`;

/** Kullanıcı mesajındaki metin bloğu: görüntülerden sonra gelir. */
export function buildUserText(imageCount: number, pastedText: string | null): string {
  const parts: string[] = [];
  if (imageCount > 0) {
    parts.push(`Above are ${imageCount} frame(s) in chronological order. Extract the recipe from them.`);
  }
  if (pastedText && pastedText.trim() !== "") {
    parts.push(`Pasted text from the user (for example the video caption):\n<pasted_text>\n${pastedText}\n</pasted_text>`);
  }
  if (parts.length === 0) {
    parts.push("No images or text were provided. Return empty lists.");
  }
  return parts.join("\n\n");
}
