import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker, PSM } from "tesseract.js";
import { AppError } from "./database.ts";

const require = createRequire(import.meta.url);
const pdfAssets = dirname(dirname(require.resolve("pdfjs-dist")));
const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

function usable(text: string) {
  const count = text.match(japanese)?.length ?? 0;
  const broken = text.match(/[\uFFFD\uE000-\uF8FF]/g)?.length ?? 0;
  return count >= 2 && broken < Math.max(2, count / 5);
}

async function readPage(bytes: Uint8Array, number: number, layout: string) {
  const pdf = getDocument({
    data: bytes, verbosity: VerbosityLevel.ERRORS, stopAtErrors: true, useSystemFonts: true,
    maxImageSize: 40_000_000, canvasMaxAreaInBytes: 64_000_000,
    cMapUrl: join(pdfAssets, "cmaps") + "/", cMapPacked: true,
    standardFontDataUrl: join(pdfAssets, "standard_fonts") + "/",
    wasmUrl: join(pdfAssets, "wasm") + "/", useWorkerFetch: false,
  });
  try {
    const doc = await pdf.promise;
    if (number > doc.numPages) throw new AppError(`This PDF has only ${doc.numPages} pages.`);
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const items = content.items.flatMap((item) => "str" in item && item.str.trim() ? [item] : []);
    const plain = items.map((item) => item.str).join("");
    if (usable(plain)) {
      // Keep coordinates and size for multi-column lists, vertical text and small furigana.
      const text = items.map(({ str, transform, dir, height, hasEOL }) => ({
        text: str, x: Math.round(transform[4]), y: Math.round(transform[5]), size: Math.round(height), dir, lineEnd: hasEOL,
      }));
      if (JSON.stringify(text).length > 90_000) throw new AppError("This page contains too much text. Use a PDF with less content on this page.");
      return { text, ocr: false };
    }
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(300 / 72, 3300 / Math.max(natural.width, natural.height));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
    const image = canvas.toBuffer("image/png");
    const languages = layout === "vertical" ? ["jpn_vert"] : layout === "horizontal" ? ["jpn"] : ["jpn", "jpn_vert"];
    let best = { text: "", score: 0 };
    for (const language of languages) {
      const langPath = join(dirname(require.resolve(`@tesseract.js-data/${language}`)), "4.0.0_best_int");
      const worker = await createWorker(language, 1, { langPath, cacheMethod: "none", errorHandler: () => {} });
      try {
        await worker.setParameters({ tessedit_pageseg_mode: language === "jpn_vert" ? PSM.SINGLE_BLOCK_VERT_TEXT : PSM.AUTO });
        const { data } = await worker.recognize(image);
        const text = data.text.trim();
        const count = text.match(japanese)?.length ?? 0;
        const score = count * (data.confidence / 100) ** 2;
        if (usable(text) && score > best.score) best = { text, score };
      } finally {
        await worker.terminate();
      }
    }
    if (!best.text) throw new AppError("Japanese OCR could not read this page. Try a clearer scan or add entries manually.");
    if (best.text.length > 24_000) throw new AppError("This page contains too much text. Use a PDF with less content on this page.");
    return { text: best.text, ocr: true };
  } finally {
    await pdf.destroy();
  }
}

try {
  const { bytes, page, layout } = workerData;
  parentPort?.postMessage({ ok: true, ...await readPage(bytes, page, layout) });
} catch (error) {
  let message = "This PDF page could not be read. Check the file and retry.";
  if (error instanceof AppError) message = error.message;
  if (error instanceof Error && error.name === "PasswordException") message = "This PDF is password-protected. Upload an unlocked copy.";
  parentPort?.postMessage({ ok: false, message });
}
