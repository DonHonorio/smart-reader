import type { CreditPack } from "@/types";

export const CREDIT_PACKS: ReadonlyArray<CreditPack> = [
  {
    id: "single_credit",
    name: "Single Credit",
    credits: 1,
    priceCents: 299,
    displayPrice: "$2.99",
    description: "Unlock one book.",
    pricePerBook: "$2.99/book",
  },
  {
    id: "basic_pack",
    name: "Basic Pack",
    credits: 3,
    priceCents: 700,
    displayPrice: "$7",
    description: "Best for trying several books.",
    pricePerBook: "$2.33/book",
    highlighted: true,
    badge: "Recommended",
  },
  {
    id: "avid_reader_pack",
    name: "Avid Reader Pack",
    credits: 8,
    priceCents: 1500,
    displayPrice: "$15",
    description: "Best value for active readers.",
    pricePerBook: "$1.88/book",
    badge: "Best value",
  },
];

export function getCreditPackById(packId: string) {
  return CREDIT_PACKS.find((pack) => pack.id === packId);
}