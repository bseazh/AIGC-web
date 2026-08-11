export type DetailPageCard = {
  id: string;
  role: string;
  title: string;
  subtitle: string;
  visualPrompt: string;
};

export type DetailPagePlan = {
  id: string;
  label: string;
  title: string;
  strategy: string;
  suitableFor: string;
  cards: DetailPageCard[];
};

export const DETAIL_PAGE_MIN_CARDS = 4;
export const DETAIL_PAGE_MAX_CARDS = 10;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

export function normalizeDetailCards(value: unknown): DetailPageCard[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, DETAIL_PAGE_MAX_CARDS).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: cleanText(record.id, 64) || `card-${index + 1}`,
      role: cleanText(record.role, 40),
      title: cleanText(record.title, 36),
      subtitle: cleanText(record.subtitle, 90),
      visualPrompt: cleanText(record.visualPrompt, 360),
    };
  }).filter((card) => card.role && card.title && card.visualPrompt);
}

export function normalizeDetailPlans(value: unknown): DetailPagePlan[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: ["A", "B", "C"][index],
      label: `方案 ${["A", "B", "C"][index]}`,
      title: cleanText(record.title, 40),
      strategy: cleanText(record.strategy, 160),
      suitableFor: cleanText(record.suitableFor, 80),
      cards: normalizeDetailCards(record.cards),
    };
  }).filter((plan) => plan.title && plan.strategy && plan.cards.length >= DETAIL_PAGE_MIN_CARDS);
}
