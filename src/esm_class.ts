export enum SmppMessagingMode {
  Default = 0,
  DataGram = 1,
  Forward = 2,
  StoreAndForward = 3,
}

export enum SmppMessageType {
  NormalMessage = 0,
  SmscDeliveryReceipt = 4,
  DeliveryAcknowledgement = 8,
  ManualUserAcknowledgement = 16,
  ConversationAbort = 24,
  IntermediateDeliveryNotification = 32,
}

export enum SmppFeature {
  UdhiIndicator = 64, // 2^6 = 64
  SetReplyPath = 128, // 2^7 = 128
}

export class SmppEsmClass {
  constructor(
    public messagingMode: SmppMessagingMode,
    public messageType: SmppMessageType,
    public features: Set<SmppFeature> = new Set(),
  ) {}

  toByte(): number {
    let resultByte = 0;
    resultByte |= this.messagingMode;
    resultByte |= this.messageType;

    for (const feature of this.features) {
      resultByte |= feature;
    }

    return resultByte;
  }

  // Factory function to create an EsmClass instance from Byte
  static fromByte(b: number): SmppEsmClass {
    const messagingMode = b & 3;
    const messageType = b & 60;
    const featuresMask = b & 192;

    const featuresValueSet = new Set<SmppFeature>();

    if ((featuresMask & SmppFeature.UdhiIndicator) === SmppFeature.UdhiIndicator) {
      featuresValueSet.add(SmppFeature.UdhiIndicator);
    }

    if ((featuresMask & SmppFeature.SetReplyPath) === SmppFeature.SetReplyPath) {
      featuresValueSet.add(SmppFeature.SetReplyPath);
    }

    return new SmppEsmClass(messagingMode, messageType, featuresValueSet);
  }
}
