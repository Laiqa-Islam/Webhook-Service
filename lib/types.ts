export type DeliveryStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "succeeded"
  | "failed";

export type CircuitState = "closed" | "open" | "half_open";

export interface EndpointRow {
  id: string;
  url: string;
  description: string;
  secret: string;
  active: number;
  created_at: number;
  consecutive_failures: number;
  circuit_state: CircuitState;
  circuit_opened_at: number | null;
  old_secret: string | null;
  old_secret_expires_at: number | null;
  event_types: string;
  strict_ordering: number;
}

/** Rolling per-endpoint delivery health, computed from attempt history. */
export interface EndpointHealth {
  attempts: number;
  delivered: number;
  successRate: number | null;
  avgMs: number | null;
}

export interface EventRow {
  id: string;
  type: string;
  payload: string;
  idempotency_key: string | null;
  created_at: number;
}

export interface DeliveryRow {
  id: string;
  event_id: string;
  endpoint_id: string;
  status: DeliveryStatus;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: number;
  manual_next: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface AttemptRow {
  id: string;
  delivery_id: string;
  attempt_number: number;
  triggered_by: "auto" | "manual";
  status_code: number | null;
  ok: number;
  response_body: string | null;
  error: string | null;
  duration_ms: number;
  created_at: number;
}

export type DestinationMode = "healthy" | "down" | "timeout";

export interface ReceiptRow {
  id: number;
  event_id: string | null;
  event_type: string | null;
  delivery_id: string | null;
  attempt: number | null;
  signature_valid: number;
  responded_status: number;
  received_at: number;
}

/** Delivery joined with event + endpoint info and its attempt history, as served to the UI. */
export interface DeliveryView extends DeliveryRow {
  event_type: string;
  endpoint_url: string;
  payload: string;
  attempts: AttemptRow[];
}

/** One time bucket of delivery-attempt volume, for the header sparkline. */
export interface ActivityBucket {
  t: number;
  ok: number;
  fail: number;
}

export interface Overview {
  now: number;
  activity: ActivityBucket[];
  stats: {
    events: number;
    deliveries: number;
    succeeded: number;
    failed: number;
    inFlight: number;
    successRate: number | null;
  };
  deliveries: DeliveryView[];
  endpoints: EndpointRow[];
  endpointHealth: Record<string, EndpointHealth>;
  destination: {
    mode: DestinationMode;
    demoEndpointId: string | null;
    receipts: ReceiptRow[];
  };
}
