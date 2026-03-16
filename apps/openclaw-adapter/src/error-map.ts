export function mapGatewayError(code: string) {
  switch (code) {
    case "AGENT_TIMEOUT":
      return { code: "GATEWAY_TIMEOUT", retryable: true };
    case "UNAVAILABLE":
      return { code: "GATEWAY_UNAVAILABLE", retryable: true };
    default:
      return { code: "GATEWAY_ERROR", retryable: false };
  }
}
