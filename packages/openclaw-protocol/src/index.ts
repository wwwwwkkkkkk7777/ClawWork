export type GatewayChallengeFrame = {
  type: "event";
  event: "connect.challenge";
  payload: {
    nonce?: string;
  };
};

export type GatewaySuccessResponse = {
  type: "res";
  id: string;
  ok: true;
  payload: {
    runId?: string;
    status?: string;
    snapshot?: {
      sessionDefaults?: {
        mainSessionKey?: string;
      };
    };
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
  | GatewayErrorResponse
  | GatewayEventFrame;

export type GatewayEventFrame = {
  type: "event";
  event: "agent" | "chat" | string;
  payload: {
    runId?: string;
    sessionKey?: string;
    state?: string;
    errorMessage?: string;
    stream?: string;
    ts?: number;
    data?: Record<string, unknown>;
    message?: unknown;
  };
};

export type GatewayRequest = {
  type: "req";
  id: string;
  method: "connect" | "chat.send";
  params: Record<string, unknown>;
};
