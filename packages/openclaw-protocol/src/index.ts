export type GatewayChallengeFrame = {
  type: "event";
  event: "connect.challenge";
  payload: Record<string, never>;
};

export type GatewaySuccessResponse = {
  type: "res";
  id: string;
  ok: true;
  payload: {
    runId?: string;
  };
};

export type GatewayErrorResponse = {
  type: "res";
  id: string;
  ok: false;
  error?: {
    code?: string;
    message?: string;
  };
};

export type GatewayFrame =
  | GatewayChallengeFrame
  | GatewaySuccessResponse
  | GatewayErrorResponse;

export type GatewayRequest = {
  type: "req";
  id: string;
  method: "connect" | "chat.send";
  params: Record<string, unknown>;
};
