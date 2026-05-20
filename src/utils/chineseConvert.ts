import OpenCC, { type ConverterFunction } from "opencc-js";

export type ChineseScript = "original" | "simplified" | "traditional";

const converters: Partial<Record<Exclude<ChineseScript, "original">, ConverterFunction>> = {};

function getConverter(target: Exclude<ChineseScript, "original">): ConverterFunction {
  const existing = converters[target];
  if (existing) return existing;

  const converter = target === "traditional"
    ? OpenCC.Converter({ from: "cn", to: "t" })
    : OpenCC.Converter({ from: "t", to: "cn" });

  converters[target] = converter;
  return converter;
}

export function convertChineseScript(text: string, target: ChineseScript): string {
  if (target === "original" || text.length === 0) return text;
  return getConverter(target)(text);
}
