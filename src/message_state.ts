export enum SmppMessageState {
  Enroute = 1,
  Delivered = 2,
  Expired = 3,
  Deleted = 4,
  Undeliverable = 5,
  Accepted = 6,
  Unknown = 7,
  Rejected = 8,
}

export const SmppMessageStateByValueMap = new Map(
  Array.from(Object.entries(SmppMessageState)).map(([k, v]) => [v, k]),
);
