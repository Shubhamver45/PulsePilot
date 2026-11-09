export interface TelemetryRecord {
  id: string;
  timestamp: string;
  experimentFlag: string;
  distinctUserId: string;
  eventType: "EXPOSURE" | "CONVERSION";
  variantKey?: string;
  metricKey?: string;
  properties?: Record<string, any>;
}

export const inMemoryTelemetryLogs: TelemetryRecord[] = [];

