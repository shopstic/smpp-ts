export enum SmppSmscDelivery {
  NoneRequested = 0,
  SuccessAndFailureRequested = 1,
  FailureRequested = 2,
}

export enum SmppSmeAcknowledgement {
  NoneRequested = 0,
  DeliveryRequested = 4,
  ManualUserRequested = 8,
  BothRequested = 12,
}

export enum SmppIntermediateNotification {
  NotRequested = 0,
  Requested = 16,
}

export class SmppRegisteredDelivery {
  constructor(
    public smscDelivery: SmppSmscDelivery,
    public smeAcknowledgement: SmppSmeAcknowledgement,
    public intermediateNotification: SmppIntermediateNotification,
  ) {}

  static fromByte(b: number): SmppRegisteredDelivery {
    return new SmppRegisteredDelivery(
      (b & 3) as SmppSmscDelivery,
      (b & 12) as SmppSmeAcknowledgement,
      (b & ~15) as SmppIntermediateNotification,
    );
  }

  toByte(): number {
    return this.smscDelivery | this.smeAcknowledgement | this.intermediateNotification;
  }

  static All: SmppRegisteredDelivery = new SmppRegisteredDelivery(
    SmppSmscDelivery.SuccessAndFailureRequested,
    SmppSmeAcknowledgement.NoneRequested,
    SmppIntermediateNotification.Requested,
  );

  static None: SmppRegisteredDelivery = new SmppRegisteredDelivery(
    SmppSmscDelivery.NoneRequested,
    SmppSmeAcknowledgement.NoneRequested,
    SmppIntermediateNotification.NotRequested,
  );
}
