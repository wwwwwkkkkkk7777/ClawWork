# ClawWork Mobile Doubao-Style Redesign Spec

## 1. Context

ClawWork already has a working mobile foundation and backend task flow, but the current mobile shell does not yet express the intended product feel. The approved redesign direction is to make the mobile experience visibly closer to Doubao's mobile interaction model while preserving ClawWork's task-oriented office assistant identity.

This redesign applies to the mobile app only. It does not change backend contracts, task execution semantics, or OpenClaw Gateway integration boundaries.

## 2. Approved Product Direction

The approved redesign direction is:

- reference Doubao at a high similarity level
- borrow both visual language and interaction model
- keep ClawWork branding, task language, and office-oriented capabilities
- use the home screen as the primary entry point
- treat conversation, history, and settings as secondary destinations

This is intentionally not a generic dashboard redesign and not a backend rewrite.

## 3. Scope

### 3.1 In Scope

- Home screen redesign
- Conversation screen redesign
- History screen redesign
- Settings screen redesign
- Navigation restructuring for a home-led flow
- Shared component redesign for message cards, chips, list cards, and the input bar
- Reconnection of existing task store and API flows to the new UI shell

### 3.2 Out Of Scope

- backend API redesign
- new task types
- real voice capture
- result rendering model changes
- authentication flow redesign
- tablet-specific layouts

## 4. Design Principles

The redesign must follow these principles:

- Light, calm, assistant-like UI rather than enterprise dashboard chrome
- Large rounded surfaces, shallow shadows, and sparse borders
- White primary surfaces on a soft cool gray background
- Blue reserved for user speech bubbles, active accents, and primary interaction states
- Strong title hierarchy and short helper copy
- Home should feel inviting and immediate, not operationally dense
- Conversation should feel like the clear center of the product
- History and settings should remain lightweight and secondary

## 5. Visual Reference Rules

The target is a high-similarity reference, not a direct clone.

Must feel similar to Doubao in:

- white and pale gray canvas
- large-radius cards and pills
- floating bottom input treatment
- horizontally scrollable capability chips
- right-aligned bright user bubble
- left-aligned white AI response card with secondary action row
- compact, quiet top bar treatment

Must remain distinct as ClawWork in:

- product name and copy
- office-task capability labels
- iconography details
- capability taxonomy
- settings labels

## 6. Navigation Model

The approved navigation model is home-led, not tab-led.

### 6.1 Primary Structure

- Home is the root screen
- Conversation is pushed from home when the user starts or resumes a task
- History is opened from home through a secondary action such as "view all" or a top-right entry
- Settings is opened from home through the top-right more menu or profile entry

### 6.2 Rationale

This structure preserves the strongest Doubao-like impression:

- users land on recommendations and a bottom input first
- conversation remains the main working surface
- history and settings do not compete with the entry experience

## 7. Screen Designs

## 7.1 Home Screen

### Responsibility

The home screen exists to help the user start a task quickly.

### Layout

From top to bottom:

1. Compact top bar
2. Welcome headline
3. Horizontal quick chips
4. Core capability card grid
5. Recent conversations block
6. Floating bottom input bar

### Top Bar

- left: small ClawWork label or subtle greeting marker
- right: lightweight more/profile trigger
- no heavy navigation chrome

### Welcome Block

- main line should feel conversational, such as "What should I help with today?"
- optional short helper copy may explain that ClawWork handles writing, summaries, and task drafting

### Quick Chips

Horizontal pill row with 3-6 quick starts such as:

- document summary
- weekly report
- write email
- meeting notes
- quick mode

These chips should be visually soft and tappable, with no high-contrast borders.

### Capability Cards

A 2-column rounded grid showing common office actions.

Examples:

- meeting minutes
- photo Q&A
- SOP draft
- daily or weekly report

Each card should contain:

- short title
- one-line explanation
- optional small icon marker

### Recent Conversations

This block shows a short preview list only, not the full archive.

Each item should contain:

- title
- short subtitle or time
- soft card container

The block should include a clear path to the full history page.

### Floating Input Bar

The input bar should visually anchor the screen in the same way Doubao does.

It includes:

- placeholder text such as "Send a message or hold to speak..."
- voice placeholder icon
- plus icon for future attachments

### Interaction Rules

- tapping a quick chip opens conversation with a prefilled prompt
- tapping a capability card opens conversation with a task template
- tapping a recent conversation resumes that conversation
- submitting text opens a new or resumed conversation immediately

## 7.2 Conversation Screen

### Responsibility

This is the main execution and iteration screen.

### Layout

From top to bottom:

1. Compact conversation header
2. Message stream
3. Optional horizontal tool-chip row
4. Floating input bar

### Header

Should visually reference the provided Doubao screenshot:

- back affordance
- small round assistant avatar
- title and lightweight subtitle
- right-side compact utility actions

The header should remain visually quiet and not consume too much height.

### Message Stream

The stream follows a familiar assistant layout:

- user messages are right-aligned blue bubbles
- assistant replies are left-aligned white rounded cards
- generous spacing and breathing room

### Assistant Reply Card

Every assistant card should support a secondary action row beneath the message body.

Initial actions:

- copy
- read aloud placeholder
- save or favorite placeholder
- share placeholder
- retry or regenerate

These actions should be icon-first and low-emphasis.

### Tool Chip Row

Above the input bar, keep a horizontal row of contextual pills such as:

- quick
- summarize document
- photo Q&A
- continue writing

This row is part of the target Doubao feel and should remain visible when context allows.

### Floating Input Bar

The conversation input shares the same visual structure as home, but remains context-aware.

It should support:

- text entry
- send
- voice placeholder
- plus placeholder

### Interaction Rules

- conversation opens immediately after task creation
- stream updates append into the assistant card flow
- follow-up prompts keep the user on the same page
- tapping retry on an assistant card triggers a rerun
- tapping a tool chip injects or transforms the current prompt rather than navigating away

## 7.3 History Screen

### Responsibility

History is a lightweight archive of recent work, not a task operations console.

### Layout

- simple page title
- optional search entry
- stacked rounded list cards grouped by time recency

### List Item Content

Each item should show:

- task title
- time or date
- one-line summary preview
- optional status pill

### Interaction Rules

- tap item to reopen the corresponding conversation
- support scanning and resuming, not deep filtering

## 7.4 Settings Screen

### Responsibility

Settings should feel like a personal assistant preference page, not a technical admin page.

### Layout

Multiple white rounded groups with row-based settings.

Groups:

- account
- output preferences
- gateway connection status
- cache/help/about

### Row Pattern

Each row should use:

- left-aligned label
- right-aligned value or chevron
- minimal separators

### Interaction Rules

- rows that are not yet implemented may remain present as placeholders if clearly non-destructive
- technical details such as API endpoints should be hidden from the main surface unless exposed inside a dedicated debug area later

## 8. Shared Components

The redesign introduces or refactors these shared mobile components:

- floating input bar
- quick chip
- capability card
- conversation header
- user message bubble
- assistant result card
- assistant action row
- history list card
- settings group card

These components must share radius, spacing, shadow, and typography tokens to avoid screen-by-screen drift.

## 9. State And Data Binding

The redesign must preserve current data flow direction:

- existing task creation APIs remain the source of truth
- current task store remains the first integration point
- stream updates continue to come from the existing task SSE endpoint

UI state additions may include:

- current screen route state
- selected quick capability
- recent conversation preview list
- assistant card action affordance state

The redesign must not introduce a second incompatible task state model.

## 10. Accessibility And Motion

### Accessibility

- maintain adequate contrast on blue bubbles and gray helper text
- preserve large tap targets for chips and icon actions
- avoid hiding key interactions behind tiny icons only

### Motion

Use a few restrained motions:

- subtle screen transition into conversation
- soft chip press feedback
- gentle entry animation for newly streamed assistant cards

Do not add gratuitous animation or overly elastic movement.

## 11. Implementation Boundaries

This redesign is intentionally layered.

### Phase 1

- restructure navigation shell
- rebuild home screen
- rebuild conversation screen
- rebuild history screen
- rebuild settings screen
- wire existing stores and APIs into the new shell

### Phase 2

- refine conversation action affordances
- improve recent history and resume behavior
- add stronger visual polish after functional parity is confirmed

## 12. Testing And Acceptance

### Acceptance Criteria

The redesign is successful when:

- the first impression is recognizably closer to Doubao than the current shell
- all four screens feel part of the same product
- home clearly acts as the main entry point
- conversation clearly acts as the main working surface
- history and settings behave as secondary destinations
- the Android simulator loads the redesigned app without entry or layout failures
- a task can still be started from the mobile app and reach the conversation screen

### Verification

Minimum verification should include:

- screen rendering tests for home and conversation
- one happy-path task creation flow from home into conversation
- manual emulator check of spacing, hierarchy, and bottom input layout

## 13. Risks

Primary redesign risks:

- over-copying Doubao and weakening ClawWork's own task identity
- making home too busy if too many cards and chips are shown at once
- breaking existing mobile task flows while replacing the navigation shell
- allowing placeholder actions to feel interactive without clear boundaries

## 14. Next Step

After user review of this spec, the next step is to write the implementation plan and then execute the redesign in the mobile worktree.
