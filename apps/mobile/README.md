# Mobile App

The mobile app uses a home-led, task-first interface with a compact conversational workspace:

- `HomeScreen`: primary entry for quick chips, capability cards, recent conversations, and the floating input bar
- `ConversationScreen`: the main working surface with user bubbles, assistant cards, tool chips, and follow-up input
- `LoginScreen`: real API session creation and refresh-token backed sign-in
- `HistoryScreen`: server-backed task/session archive
- `SettingsScreen`: persisted account and output preferences
- `ConversationScreen`: resumable SSE, result versions, and failed-task retry

Set `EXPO_PUBLIC_API_BASE_URL` for a deployed API. Physical-device push builds
also need `EXPO_PUBLIC_EAS_PROJECT_ID`; the app registers after login, removes
the token on logout, opens notification task history, and rechecks active work
after cold start or foreground resume.

## Commands

- `pnpm --filter @clawwork/mobile start -- --clear`
- `pnpm --filter @clawwork/mobile test`
- `pnpm --filter @clawwork/mobile lint`
