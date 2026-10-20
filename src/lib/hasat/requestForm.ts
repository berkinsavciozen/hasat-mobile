export type RequestUnit = "kg" | "g" | "L";

export function normalizeRequestUnit(unit: string | null | undefined): RequestUnit {
  return unit === "g" || unit === "L" ? unit : "kg";
}

export function validateMobileCropRequest(input: {
  cropName: string;
  quantity: string;
}): string | null {
  if (!input.cropName.trim()) return "Talep etmek istediğiniz ürünü yazın.";
  if (input.quantity.trim()) {
    const quantity = Number(input.quantity.replace(",", "."));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return "Miktar giriyorsanız 0'dan büyük bir değer yazın.";
    }
  }
  return null;
}

export function convertRequestQuantity(
  quantityText: string,
  fromUnit: RequestUnit,
  toUnit: RequestUnit,
): { quantityText: string; converted: boolean } {
  if (!quantityText.trim() || fromUnit === toUnit) {
    return { quantityText, converted: true };
  }
  if (fromUnit === "L" || toUnit === "L") {
    return { quantityText, converted: false };
  }

  const quantity = Number(quantityText.replace(",", "."));
  if (!Number.isFinite(quantity)) return { quantityText, converted: false };
  const converted = fromUnit === "g" ? quantity / 1000 : quantity * 1000;
  return {
    quantityText: String(Math.round(converted * 1e8) / 1e8),
    converted: true,
  };
}
