export function mapGatewayError(code: string) {
  switch (code) {
    case "AGENT_TIMEOUT":
      return { code: "GATEWAY_TIMEOUT", retryable: true };
    case "UNAVAILABLE":
      return { code: "GATEWAY_UNAVAILABLE", retryable: true };
    case "NOT_PAIRED":
    case "DEVICE_IDENTITY_REQUIRED":
      return { code: "GATEWAY_PAIRING_REQUIRED", retryable: false };
    case "INVALID_REQUEST":
      return { code: "GATEWAY_INVALID_REQUEST", retryable: false };
    case "AUTH_REQUIRED":
    case "UNAUTHORIZED":
      return { code: "GATEWAY_AUTH_REQUIRED", retryable: false };
    case "HTTP_CHAT_COMPLETIONS_DISABLED":
      return { code: "GATEWAY_HTTP_ENDPOINT_DISABLED", retryable: false };
    case "EMPTY_RESPONSE":
      return { code: "GATEWAY_EMPTY_RESPONSE", retryable: false };
    case "ABORTED":
      return { code: "GATEWAY_ABORTED", retryable: true };
    default:
      return { code: "GATEWAY_ERROR", retryable: false };
  }
}
