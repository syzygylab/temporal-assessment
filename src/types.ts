export const SERVICES = [
  { name: "Haircut", minutes: 45 },
  { name: "Blowout", minutes: 30 },
  { name: "Color", minutes: 90 },
  { name: "Highlights", minutes: 180 },
];
export const STYLISTS = ["Maya", "Alex", "Jordan"];
export const SALON_TIMEZONE = "America/Los_Angeles";
export type ClientEntry = {
  id: string;
  name: string;
  mobile: string;
  service: string;
  stylist: string;
  minutes: number;
  availableFrom: number;
  availableUntil: number;
  joinedAt: number;
  status: "active" | "accepted" | "removed";
  failDelivery: boolean;
};
export type OfferStatus =
  | "sending"
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "delivery_failed"
  | "unavailable";
export type Offer = {
  id: string;
  token: string;
  openingId: string;
  clientId: string;
  status: OfferStatus;
  createdAt: number;
  expiresAt?: number;
  respondedAt?: number;
};
export type OpeningPhase =
  | "review"
  | "offering"
  | "filled"
  | "canceled"
  | "exhausted"
  | "appointment_passed"
  | "canceled_after_acceptance";
export type History = { at: number; kind: string; text: string };
export type Opening = {
  id: string;
  service: string;
  stylist: string;
  startsAt: number;
  minutes: number;
  responseSeconds: number;
  phase: OpeningPhase;
  candidateIds: string[];
  excludedIds: string[];
  currentOfferId?: string;
  winnerId?: string;
  history: History[];
  createdAt: number;
  squareUpdated: boolean;
};
export type Message = {
  id: string;
  openingId: string;
  offerId?: string;
  clientId?: string;
  kind: "offer" | "confirmation";
  text: string;
  at: number;
  status: "queued" | "delivered" | "failed";
};
export type SalonState = {
  clients: ClientEntry[];
  openings: Opening[];
  offers: Offer[];
  messages: Message[];
  createdAt: number;
};
export type Command = { type: string; [key: string]: unknown };
export type Result = { ok: boolean; message: string; id?: string };
