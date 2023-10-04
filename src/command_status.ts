export enum SmppKnownCommandStatus {
  // No Error
  ESME_ROK = 0x00000000,

  // Message Length is invalid
  ESME_RINVMSGLEN = 0x00000001,

  // Command Length is invalid
  ESME_RINVCMDLEN = 0x00000002,

  // Invalid Command ID
  ESME_RINVCMDID = 0x00000003,

  // Incorrect BIND Status for given command
  ESME_RINVBNDSTS = 0x00000004,

  // ESME Already in Bound State
  ESME_RALYBND = 0x00000005,

  // Invalid Priority Flag
  ESME_RINVPRTFLG = 0x00000006,

  // Invalid Registered Delivery Flag
  ESME_RINVREGDLVFLG = 0x00000007,

  // System Error
  ESME_RSYSERR = 0x00000008,

  // Reserved 0x00000009

  // Invalid Source Address
  ESME_RINVSRCADR = 0x0000000A,

  // Invalid Dest Addr
  ESME_RINVDSTADR = 0x0000000B,

  // Message ID is invalid
  ESME_RINVMSGID = 0x0000000C,

  // Bind Failed
  ESME_RBINDFAIL = 0x0000000D,

  // Invalid Password
  ESME_RINVPASWD = 0x0000000E,

  // Invalid System ID
  ESME_RINVSYSID = 0x0000000F,

  // Reserved 0x00000010

  // Cancel SM Failed
  ESME_RCANCELFAIL = 0x00000011,

  // 0x00000012 Reserved

  // Replace SM Failed
  ESME_RREPLACEFAIL = 0x00000013,

  // Message Queue Full
  ESME_RMSGQFUL = 0x00000014,

  // Invalid Service Type
  ESME_RINVSERTYP = 0x00000015,

  // 0x0000016- 0x00000032 Reserved

  // Invalid number of destinations
  ESME_RINVNUMDESTS = 0x00000033,

  // Invalid Distribution List name
  ESME_RINVDLNAME = 0x00000034,

  // 0x00000035- 0x0000003F Reserved

  // Destination flag is invalid (submit_multi)
  ESME_RINVDESTFLAG = 0x00000040,

  // Reserved 0x00000041

  // Invalid 'submit with replace' request (i.e. submit_sm with replace_if_present_flag set)
  ESME_RINVSUBREP = 0x00000042,

  // Invalid esm_class field data
  ESME_RINVESMCLASS = 0x00000043,

  // Cannot Submit to Distribution List
  ESME_RCNTSUBDL = 0x00000044,

  // submit_sm or submit_multi failed
  ESME_RSUBMITFAIL = 0x00000045,

  // 0x00000046 - 0x00000047 Reserved

  // Invalid Source address TON
  ESME_RINVSRCTON = 0x00000048,

  // Invalid Source address NPI
  ESME_RINVSRCNPI = 0x00000049,

  // Invalid Destination address TON
  ESME_RINVDSTTON = 0x00000050,

  // Invalid Destination address NPI
  ESME_RINVDSTNPI = 0x00000051,

  // Reserved 0x00000052

  // Invalid system_type field
  ESME_RINVSYSTYP = 0x00000053,

  // Invalid replace_if_present flag
  ESME_RINVREPFLAG = 0x00000054,

  // Invalid number of messages
  ESME_RINVNUMMSGS = 0x00000055,

  // 0x000056- 0x00000057 Reserved

  // Throttling error (ESME has exceeded allowed message limits)
  ESME_RTHROTTLED = 0x00000058,

  // Reserved 0x00000059- 0x00000060

  // Invalid Scheduled Delivery Time
  ESME_RINVSCHED = 0x00000061,

  // Invalid message validity period (Expiry time)
  ESME_RINVEXPIRY = 0x00000062,

  // Predefined Message Invalid or Not Found
  ESME_RINVDFTMSGID = 0x00000063,

  // ESME Receiver Temporary App Error Code
  ESME_RX_T_APPN = 0x00000064,

  // ESME Receiver Permanent App Error Code
  ESME_RX_P_APPN = 0x00000065,

  // ESME Receiver Reject Message Error Code
  ESME_RX_R_APPN = 0x00000066,

  // query_sm request failed
  ESME_RQUERYFAIL = 0x00000067,

  // Reserved 0x00000068 - 0x000000BF

  // Error in the optional part of the PDU Body.
  ESME_RINVOPTPARSTREAM = 0x000000C0,

  // Optional Parameter not allowed
  ESME_ROPTPARNOTALLWD = 0x000000C1,

  // Invalid Parameter Length.
  ESME_RINVPARLEN = 0x000000C2,

  // Expected Optional Parameter missing
  ESME_RMISSINGOPTPARAM = 0x000000C3,

  // Invalid Optional Parameter Value
  ESME_RINVOPTPARAMVAL = 0x000000C4,

  // Reserved 0x000000C5 - 0x000000FD

  // Delivery Failure (used for data_sm_resp)
  ESME_RDELIVERYFAILUR = 0x000000FE,

  // Unknown Error
  ESME_RUNKNOWNERR = 0x000000FF,
}
