# Pawtato Frontend UI Blueprint

This file is the **UI/layout companion** to `PAWTATO_ROADMAP.md` and `PAWTATO_FRONTEND_FLOWS.md`. Those two are about *behavior* (what phases exist, what API calls a flow makes); this one is about **what the pages actually look like** — screen-by-screen layout, key components, and states — so a frontend implementer (or an early design pass) has something concrete to start from before pixels get drawn.

This file was referenced by name back when Phase 10 was scoped (see `PAWTATO_ROADMAP.md`'s Phase 10 provenance note and `PAWTATO_FRONTEND_FLOWS.md`'s own header) but never actually written until Phase 11 — this is that missing file, created now because Phase 11 needed a "how should the pages look" companion and the app has no frontend project in this repo to point at instead.

## How to use this file

- Each screen below is a **layout plan**, not a visual spec — no color/type system exists yet (there is no frontend codebase in this repo). Treat the ASCII boxes as wireframe-level structure: what's on the screen and in what order, not pixel positions.
- Screens are grouped by module. Only the **Dating module** is covered in full detail (that's what Phase 11 needs); other modules get a short one-line-per-screen list so this file has a complete map without duplicating what `PAWTATO_FRONTEND_FLOWS.md` already documents at the API level.
- When a new phase's screens are designed, append a new module section here — same append-only spirit as the roadmap's own Progress Log. Don't delete a screen's plan when it changes; strike it through and note why, same convention as the roadmap.
- PWA-first (per the original Phase 10 scoping conversation): every screen below assumes a single responsive layout that works from a phone up to desktop, not separate mobile/desktop designs.

---

## Screen Index

| Module | Screen | Status |
|---|---|---|
| Dating | Dating Hub (mode picker) | Planned — Phase 11 |
| Dating | Dating Profile Editor | Planned — Phase 11 (extends a Phase 10 layout) |
| Dating | Identity Verification — Submit | Planned — Phase 11 |
| Dating | Identity Verification — Status | Planned — Phase 11 |
| Dating | Discover / Swipe | Planned — Phase 11, gender copy updated Phase 12 |
| Dating | Match Celebration | Planned — Phase 10 layout, unchanged |
| Dating | Matches List | Planned — Phase 10 layout; archived rows added Phase 12 |
| Dating | Chat Thread | Planned — Phase 10 layout; **reworked Phase 12** for real-time + archive/delete/report |
| Dating | Matched Profile Detail (+ NID exchange) | Planned — Phase 11 |
| Dating | Report Profile / Report Chat (modal) | Planned — Phase 10 layout; **extended Phase 12** for chat context |
| Admin | Verification Review Queue | Planned — Phase 11 |
| Admin | Dating Reports Queue | Planned — Phase 10 layout; **extended Phase 12** for chat-context reports |
| Dating | Discover / Swipe | **Phase 13**: pool eligibility now includes a reset/reappearance rule — see Dating Pool Eligibility & Match Notifications section |
| Dating | Matches List | **Phase 13**: new-match indicator now backed by the Notifications unread system — see same section |
| Dating | Dating Hub / Matches List | **Phase 14**: unread chat-message badges (Dating tab, Match & Chats, per-conversation) now backed by a dedicated Dating Chat Notifications system — see Dating Chat Notifications section |
| Other | Lost & Found, Auth, Pet CRUD, Admin dashboard | Not designed here — see note below (Pet Create/Edit gained a mandatory Gender field in Phase 12) |
| Other | Pet Detail / Caretakers | **Phase 15**: shared pet access (caretakers) API now exists — no screens designed here yet, see Shared Pet Access section for the contract to build against |

**Other modules note:** Lost & Found, auth/onboarding, pet profile CRUD, QR/tag management, and the general admin dashboard all have working, e2e-verified API flows (`PAWTATO_FRONTEND_FLOWS.md` Flows 1–2), but no page-layout plan exists yet — out of scope for this pass, which was requested specifically to cover the dating module rework. Add a section here when those get designed.

**One cross-cutting exception, called out here even though Pet Create/Edit itself isn't designed in this file (Phase 12):** `POST /pets` and `PATCH /pets/:id` now require a `gender` field (`MALE` or `FEMALE`) — this is no longer optional, platform-wide, not just for pets that opt into dating. Whatever the Pet Create/Edit screen ends up looking like, it **must** include a mandatory gender selector (e.g. a required two-option segmented control, no default pre-selected) before that form can submit — the API will reject the request with a `400` otherwise. This isn't a dating-specific field cosmetically, but it exists *because of* dating: Breeding-mode matching is strictly opposite-gender (see the Discover screen below), which is only enforceable if every pet has a real sex on file. Flag this to whoever builds the Pet Create/Edit screen even though its full layout isn't planned here yet.

---

## Dating Module

### Navigation shape

```
Bottom nav (mobile) / left rail (desktop):
  [ Home ]  [ My Pets ]  [ Dating ]  [ Notifications ]  [ Profile ]
```

Dating has its own sub-navigation once entered:

```
Dating tab bar:
  [ Discover ]   [ Matches ]   [ My Dating Profile ]
```

---

### 1. Dating Hub (mode picker)

Entry point after tapping the bottom-nav "Dating" tab. First decision a user makes every session: **which pet, which mode.**

```
┌─────────────────────────────────────┐
│  Dating                        ⚙️    │
├─────────────────────────────────────┤
│  Choose a pet                        │
│  ┌───────┐ ┌───────┐ ┌───────┐       │
│  │ 🐕 Rex │ │ 🐈 Mimi│ │  + Add │      │
│  │ (active)│ │(inactive)│ pet to │    │
│  └───────┘ └───────┘ └───────┘       │
│                                       │
│  Rex — choose a mode                 │
│  ┌─────────────────┐ ┌─────────────┐ │
│  │  🐾 Play Date     │ │ 🧬 Breeding  │ │
│  │  Meet any pet     │ │ Meet same-  │ │
│  │  nearby           │ │ species pets│ │
│  │  [ Start ]         │ │ [ Start ]   │ │
│  └─────────────────┘ └─────────────┘ │
│                                       │
│  ⚠ Rex's dating profile is inactive. │
│    [ Activate profile ]              │
└─────────────────────────────────────┘
```

**Notes:**
- Only pets with a `DATABLE_SPECIES`-eligible species (cat/dog) show a dating card at all; an ineligible pet shows a disabled state with a one-line explanation instead of being hidden (avoids "why isn't my pet here" confusion).
- A pet whose profile doesn't have `BREEDING` in `modes` shows the Breeding tile greyed out with "Not enabled — edit profile" rather than hidden, same reasoning.
- A pet with `isActive: false` shows the inactive banner shown above instead of mode tiles.
- Tapping a mode tile goes straight to **Discover / Swipe** pre-filtered to that pet + mode — no intermediate confirmation screen, since the tile itself is already the confirmation.

---

### 2. Dating Profile Editor

Reached via "My Dating Profile" tab, or the "Activate profile" / "Edit profile" CTAs elsewhere. One screen, scrollable sections — this is the "larger than the usual pet profile" screen from the original ask.

```
┌─────────────────────────────────────┐
│  ← Rex's Dating Profile        Save  │
├─────────────────────────────────────┤
│  Photos (1–6)                        │
│  ┌────┐┌────┐┌────┐┌────┐┌ + ┐       │
│  │ 📷1 ││ 📷2 ││ 📷3 ││ 📷4 ││Add│       │
│  └────┘└────┘└────┘└────┘└───┘       │
│  Drag to reorder · first photo is    │
│  the card cover                      │
│                                       │
│  Bio                                  │
│  ┌───────────────────────────────┐   │
│  │ Playful golden retriever who…  │   │
│  └───────────────────────────────┘   │
│                                       │
│  Modes                                │
│  [x] Play Date   [x] Breeding         │
│                                       │
│  Temperament                          │
│  ( playful ) ( calm ) ( good-with-kids)│
│  [ + add tag ]                        │
│                                       │
│  Likes                                │
│  ( fetch ) ( belly rubs ) ( the park ) │
│  [ + add ]                             │
│                                       │
│  Dislikes                             │
│  ( vacuum cleaners ) ( baths )        │
│  [ + add ]                             │
│                                       │
│  Health & Vaccination     ✓ Verified  │
│  ┌───────────────────────────────┐   │
│  │ [ ] Share health summary on    │   │
│  │     my dating profile          │   │
│  │                                 │   │
│  │ Preview (visible when on):     │   │
│  │  Vaccinations: up to date      │   │
│  │  Spayed/Neutered: Yes          │   │
│  └───────────────────────────────┘   │
│                                       │
│  Location (approximate)               │
│  ┌───────────────────────────────┐   │
│  │ Gulshan, Dhaka           [Edit]│   │
│  └───────────────────────────────┘   │
│                                       │
│  Profile Verification                 │
│  ┌───────────────────────────────┐   │
│  │ 🛡 Owner not verified           │   │
│  │ Verify your identity to join   │   │
│  │ the Verified pool and enable   │   │
│  │ safer matching.                │   │
│  │ [ Start verification → ]       │   │
│  └───────────────────────────────┘   │
│                                       │
│  [ Deactivate profile ]               │
└─────────────────────────────────────┘
```

**Notes:**
- The Health & Vaccination card is a single all-or-nothing `shareHealthSummary` toggle (decided 2026-08-25) — when off, the preview lines and the entire section are omitted from the public/candidate-facing profile, not shown-but-blank. When on, the summary is computed live from `medical`/`vaccinations` (never manually typed by the owner, never stored on the dating profile itself).
- "✓ Verified" badge next to the section header refers to `healthVerified` (Phase 10's medical-cross-reference flag), distinct from the *owner's* NID identity verification below it — these are two different badges and must not be visually merged, since a health-verified pet can have a non-identity-verified owner and vice versa.
- The Verification card is a status component with three states: not started (shown above), pending review, and approved (see next two screens) — same card, different content, so its position in the layout stays stable.
- Modes checkboxes: unchecking the only active mode should warn ("Rex won't be discoverable in any mode") rather than silently save to zero modes.

---

### 3. Identity Verification — Submit

Reached from the profile editor's verification card. A short, linear, high-trust flow — this is the most sensitive upload in the app.

```
┌─────────────────────────────────────┐
│  ← Verify Your Identity              │
├─────────────────────────────────────┤
│  Why verify?                         │
│  Verified owners can filter matches  │
│  to other verified profiles, and     │
│  choose to share ID with a specific  │
│  verified match for extra peace of   │
│  mind. This verifies you (the        │
│  owner), not your pet.               │
│                                       │
│  National ID — Front                 │
│  ┌───────────────────────────────┐   │
│  │                                 │   │
│  │     [ Tap to upload photo ]    │   │
│  │                                 │   │
│  └───────────────────────────────┘   │
│                                       │
│  National ID — Back                  │
│  ┌───────────────────────────────┐   │
│  │                                 │   │
│  │     [ Tap to upload photo ]    │   │
│  │                                 │   │
│  └───────────────────────────────┘   │
│                                       │
│  🔒 Your ID is stored privately and   │
│  only ever shown to Pawtato admins    │
│  for review, or to a specific match   │
│  after you both are verified and you  │
│  tap "Share" in that match.           │
│  It is never public, and never        │
│  shared without your action.          │
│                                       │
│  [ Submit for review ]                │
└─────────────────────────────────────┘
```

**Notes:**
- Both images required before "Submit" enables.
- The privacy notice is not optional copy — it's load-bearing given the roadmap's requirement that NID images are never publicly reachable; the UI should state plainly what happens to the image, matching the backend guarantee exactly (signed URLs, admin + matched-verified-party only, every view audit-logged).
- After submit, this screen is replaced by the Status screen — no "your submission was sent" toast-and-stay-here, since there's nothing left to do here.

---

### 4. Identity Verification — Status

The same card position as the profile editor's verification card, expanded to its own screen when tapped, with three states:

```
Pending:                          Approved:                       Rejected:
┌─────────────────────┐          ┌─────────────────────┐        ┌─────────────────────┐
│ 🕒 Under review       │          │ ✓ Verified            │        │ ✗ Not approved        │
│ Submitted 2 days ago │          │ Since 2026-08-20      │        │ Reason:               │
│ We'll notify you once│          │ You're in the         │        │ "Back image is        │
│ this is reviewed.    │          │ Verified pool.        │        │  blurry — please      │
│                       │          │ [Verified-only filter │        │  retake."             │
│ [ Cancel submission ] │          │  is on in Discover]   │        │ [ Resubmit → ]        │
└─────────────────────┘          └─────────────────────┘        └─────────────────────┘
```

**Notes:**
- Pending state offers "cancel submission" (withdraw, resubmit later) rather than leaving the user stuck mid-review with no action.
- Rejected shows the admin's `rejectionReason` verbatim — never a generic "not approved," since the user needs to know what to fix.
- Approved state doubles as where the "verified-only" Discover filter gets explained, since that's the direct payoff of this screen.

---

### 5. Discover / Swipe

Same card-stack pattern for both modes — the mode itself was already chosen on the Dating Hub, so this screen doesn't re-ask.

```
┌─────────────────────────────────────┐
│  ← Discover        🐾 Play Date  ⚙️  │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐   │
│  │                                 │   │
│  │         [ Photo 1/4 ]          │   │
│  │                                 │   │
│  │  Bella, 3 · Cat · Persian       │   │
│  │  ✓ Verified owner               │   │
│  │  "Loves sunbathing and..."      │   │
│  │  Likes: naps, string toys       │   │
│  │  ● ● ○ ○  (photo dots)          │   │
│  └───────────────────────────────┘   │
│                                       │
│      ✕                    ♥          │
│    (Pass)                (Like)      │
│                                       │
│  [ i  View full profile ]            │
└─────────────────────────────────────┘
```

Filter sheet (⚙️, slides up):
```
┌─────────────────────────────────────┐
│  Filters                        ✕    │
├─────────────────────────────────────┤
│  [ ] Verified profiles only          │
│      (only shown if you're verified) │
│  Distance: ○──────●──── 25 km        │
│  [ Apply ]                            │
└─────────────────────────────────────┘
```

**Notes:**
- Header shows the active mode as a static label (not a switcher) — changing mode goes back to the Dating Hub, keeping "which pet + which mode" as one deliberate choice rather than something to fumble mid-swipe.
- "✓ Verified owner" badge appears on the card only when the candidate's owner is `APPROVED` — visible to everyone, not just other verified users, since the badge itself is the signal that makes verified-only filtering worth using.
- In **Breeding** mode, the species is implied (all candidates share the swiper's species) so the card leads with breed instead; in **Play Date** mode, species is shown prominently on the card since candidates are mixed.
- **Breeding mode is strictly opposite-gender (Phase 12), enforced server-side, not just filtered in the UI.** Every candidate `GET /dating/discover?mode=BREEDING` returns is guaranteed to be the opposite gender of the swiping pet — the card should show the candidate's gender (e.g. a small ♂/♀ icon or "Male"/"Female" label next to the breed) so the owner understands why the pool looks the way it does, not because the client needs to filter anything itself. A same-gender pet will never appear here, and a direct `POST /dating/swipe` against one in `BREEDING` mode is rejected `400` regardless — this is a display/trust concern for the frontend, not a validation duty.
- "Verified profiles only" filter checkbox is disabled with a tooltip ("Verify your own profile to use this") when the current user isn't `APPROVED` yet — matches the backend's `400` on that combination, so the UI never lets a user hit that error.
- A mutual like triggers the Match Celebration screen immediately for the swiper (per Phase 10's existing swipe-response contract) — no polling. **Phase 12 adds a second, independent channel for the other side**: if they have an open Socket.IO connection at the moment the match completes, they receive a live `matchCreated` event (see the new Real-Time Chat section below) even if they're nowhere near the Discover screen. Wire both — the swipe response for the swiper, the socket event for the other side.
- **Phase 13 — a passed/skipped (or unrequited-liked) pet is not gone forever.** `GET /dating/discover` used to exclude every pet the swiping pet had ever swiped on, permanently. It now only excludes swipes made within the last `DATING_POOL_RESET_DAYS` (default 3 — see the Dating Pool Eligibility section below for the full rule and why matched pets are the one exception that never times out). There's no client-facing signal that a card is "new again" versus never-seen — don't build UI around that distinction, the pool is just the pool.

---

### 6. Match Celebration

Unchanged from the Phase 10 layout (full-screen modal on a mutual like):

```
┌─────────────────────────────────────┐
│                                       │
│         🎉 It's a Match! 🎉           │
│                                       │
│      ┌────┐         ┌────┐           │
│      │ Rex │  ♥      │Bella│          │
│      └────┘         └────┘           │
│                                       │
│   Rex and Bella liked each other!    │
│                                       │
│      [ Send a message ]              │
│      [ Keep swiping ]                │
└─────────────────────────────────────┘
```

---

### 7. Matches List

Base layout unchanged from Phase 10; **Phase 12 adds an archived state** — `GET /dating/matches` now returns both `ACTIVE` and `UNMATCHED` matches (a match no longer disappears the moment either side unmatches), so the list needs to render both:

```
┌─────────────────────────────────────┐
│  Matches                             │
├─────────────────────────────────────┤
│  🐾 Bella          "Hey! Rex is..."  │
│  🧬 Max            Matched today     │
│  🐾 Luna  🔒        Archived         │
└─────────────────────────────────────┘
```

**Notes:**
- Small icon per row indicates which mode produced the match (🐾 Play Date / 🧬 Breeding), sourced from the `mode` field `listMatches()` reconstructs from the originating reciprocal-LIKE swipe pair (Phase 11).
- A row where `status === 'UNMATCHED'` shows a 🔒 (or similar "archived/ended" glyph) and its preview text is replaced with "Archived" rather than the last message snippet — tapping it still opens the Chat Thread, just in its read-only archived state (see below), never removed from the list on its own. It only disappears from *this user's* list once they've explicitly deleted it (`POST /dating/matches/{id}/delete` — see the Chat Thread section) — the other side, if they haven't also deleted it, keeps seeing it.
- Live updates: a socket-connected client should splice a new row in (or bump an existing one to the top with an unread indicator) on a `newMessage` event, and flip a row to the archived state on `matchUnmatched` — both delivered to the user's personal room, so this works even while the Matches List itself is the active screen, not just the Chat Thread. See the Real-Time Chat section below for the full event contract.
- **Phase 13 — the "Matches" tab badge (new-match indicator).** A new match now also creates a persisted, unread in-app `Notification` (type `dating.match-created`) for each side, on top of the existing live `matchCreated` socket event — see the Dating Pool Eligibility & Match Notifications section below for the full contract. Badge the "Matches" tab in the Dating sub-nav (and/or the top-level "Notifications" nav item) from `GET /notifications?type=dating.match-created&unreadOnly=true`'s `pagination.total`; clear it the same way any other notification gets cleared (`PATCH /notifications/{id}/read` when the user opens that specific match, or `PATCH /notifications/read-all`).

---

### 8. Chat Thread

**Reworked in Phase 12** — real-time delivery over a Socket.IO connection (not just the REST history load), an archived/read-only state once either side unmatches, and a header overflow menu for Delete Conversation / Report Chat. Full connection/event details are in the new **Real-Time Chat (Socket.IO)** section further down this file — this is the screen-level layout and behavior built on top of that contract.

```
┌─────────────────────────────────────┐
│  ← Bella & Rex        [i]      [⋮]   │
├─────────────────────────────────────┤
│                    Hi! Rex is cute 🐕 │
│  Thanks! Bella's gorgeous            │
│                    Want to meet up?  │
│                          ⌨ typing…    │
├─────────────────────────────────────┤
│  [ Type a message...        ] [Send] │
└─────────────────────────────────────┘
```

Overflow menu (`[⋮]`, opens a small action sheet):
```
┌─────────────────────────────┐
│  [ Unmatch ]                 │
│  [ Report this chat ]        │
│  [ Delete conversation ]     │
│      (disabled until         │
│       unmatched)              │
└─────────────────────────────┘
```

Archived state (once either side has unmatched):
```
┌─────────────────────────────────────┐
│  ← Bella & Rex (Archived)      [⋮]   │
├─────────────────────────────────────┤
│                    Hi! Rex is cute 🐕 │
│  Thanks! Bella's gorgeous            │
│                    Want to meet up?  │
│                                       │
│  🔒 This match ended — the           │
│     conversation is archived,        │
│     read-only.                       │
├─────────────────────────────────────┤
│  [ This match has ended — you can't  │
│    send new messages ]  (disabled)   │
└─────────────────────────────────────┘
```

**Notes:**
- **On screen open**: fetch history via `GET /dating/matches/{id}/messages` (unchanged REST call, still the source of truth for anything sent before this screen was open), then connect/join the match's Socket.IO room (`emit('joinMatch', { matchId })`) for anything sent from here on. Don't rely on the socket alone for history — a client that was offline while a message was sent needs the REST fetch to catch up.
- **Sending**: prefer `emit('sendMessage', { matchId, content })` over the socket while connected (lower latency, and it's the same server-side call as the REST endpoint — see the Real-Time Chat section), falling back to `POST /dating/matches/{id}/messages` if the socket is disconnected. Either path ends up broadcasting a `newMessage` event back to this same room, so don't also locally-append the message you just sent from the send-response *and* from the echoed socket event — pick one (the socket echo is the simpler choice, since it's the same code path REST-originated messages already need).
- **Typing indicator**: `emit('typing', { matchId })` on each keystroke (debounced, e.g. every 2–3s while actively typing, not per keystroke), listen for the same event from the other side to show "⌨ typing…". This is fire-and-forget, never persisted.
- **"[i]" (Details)** opens the Matched Profile Detail screen below — unchanged.
- **"[⋮]" overflow menu** is new in Phase 12:
  - **Unmatch** — `POST /dating/matches/{id}/unmatch`. Either side can do this at any time the match is still `ACTIVE`. Immediately flips this screen (and the other side's, live via `matchUnmatched`) into the archived state above — composer disabled, banner shown. Calling unmatch on an already-archived match is harmless (the backend treats it as a no-op, "Already unmatched"), so there's no need to hide the action once archived, though most UIs will just swap it for "Unmatched" (disabled) at that point. **Phase 13**: unmatching is also what hands the pair back to the dating pool — an `ACTIVE` match is the *one* thing the reset window (above) never overrides, so as long as this match stayed `ACTIVE` neither pet could ever resurface in the other's Discover pool, no matter how much time passed. The moment it's unmatched, that permanent exclusion lifts and the pair falls back to the normal reset-window rule (see Dating Pool Eligibility below) — there's no separate "cooldown" applied on top of that, and no extra API call needed to make this happen.
  - **Report this chat** — opens the Report modal (see screen 10 below) with `matchId` pre-attached, so admin reviewing the report can see this actual conversation, not just the other pet's profile in the abstract. Available regardless of archived state — a still-active conversation can be reported mid-chat.
  - **Delete conversation** — `POST /dating/matches/{id}/delete`. **Disabled (greyed out, with a tooltip like "Unmatch first") until the match is archived** — the backend rejects this with a `400` on an `ACTIVE` match, by design: you can't delete a conversation out from under someone you're still matched with. This is a **per-side hide, not a real delete** — say so if the UI has room for a confirmation dialog ("This removes the conversation from your list. [Name] will still be able to see it unless they also delete it.") rather than implying the messages are destroyed, since they aren't (a filed report can still reference them). Once deleted, navigate back to the Matches List; this match no longer appears there for this user.

---

### 9. Matched Profile Detail (+ NID exchange)

Reached from the Chat Thread's "Details" or the Matches List. This is where Phase 11's NID exchange surfaces — **only** when both matched owners are currently `APPROVED`-verified; within that, sharing is explicit and per-direction (decided 2026-08-25), not automatic.

```
┌─────────────────────────────────────┐
│  ← Bella's Profile                   │
├─────────────────────────────────────┤
│  [ Photo carousel, full profile —    │
│    same content as Discover's        │
│    "View full profile" ]             │
│                                       │
│  Health & Vaccination                │
│  Vaccinations: up to date            │
│  (only shown if Bella's owner has     │
│   shareHealthSummary on)              │
│                                       │
├─────────────────────────────────────┤
│  🛡 Identity Sharing                  │
│  You and Bella's owner are both      │
│  verified. You can each choose to    │
│  share your ID within this match.    │
│                                       │
│  Your ID                              │
│  Not shared in this match yet.        │
│  [ Share my ID with this match ]      │
│                                       │
│  Bella's owner's ID                   │
│  Not shared yet.                      │
│  ┌ ─ ─ ─ ─ ─ ┐  ┌ ─ ─ ─ ─ ─ ┐          │
│  │  Front    │  │   Back    │          │
│  │ (hidden)  │  │ (hidden)  │          │
│  └ ─ ─ ─ ─ ─ ┘  └ ─ ─ ─ ─ ─ ┘          │
├─────────────────────────────────────┤
│  [ Unmatch ]      [ Report profile ] │
└─────────────────────────────────────┘
```

Once the other owner has tapped share, "Bella's owner's ID" replaces the hidden placeholder with the real images:

```
│  Bella's owner's ID                   │
│  ┌────────────┐ ┌────────────┐       │
│  │  [ Front ] │ │  [ Back ]  │       │
│  └────────────┘ └────────────┘       │
│  Viewed just now — this view is      │
│  logged.                             │
```

**Notes:**
- The "🛡 Identity Sharing" section is **entirely absent** (not shown-and-disabled) when either owner isn't `APPROVED` — no teaser, no upsell here, since a non-eligible match seeing "you could see their ID if..." creates pressure to verify that isn't this screen's job. Once it's present (both eligible), "Your ID" and the other party's row are two independent states — tapping "Share" only ever affects your own row; you never need the other side to share first, and they never need you to.
- "[ Share my ID with this match ]" is a deliberate, singular action scoped to *this* match only — sharing in one match never shares in another, and the button's copy should make that scope obvious (not a global "become discoverable" toggle).
- The other party's row shows a hidden-placeholder state until they've shared — never a "request to view" button, since this phase's design is opt-in-to-share, not opt-in-to-request.
- Once shared, NID images load via short-lived signed URLs fetched only when that row is actually scrolled into view / tapped open, not eagerly with the rest of the profile — matches the backend's on-demand, audit-logged read path.
- "Viewed just now — this view is logged" is deliberate, visible copy, not a hidden backend-only detail — both sides should know a view is recorded, which is itself part of why this exchange is meant to feel safe rather than covert.
- **[ Unmatch ] / [ Report profile ] (Phase 12 note)**: these call the same `POST /dating/matches/{id}/unmatch` and report flow as the Chat Thread's overflow menu — there's only one Unmatch action in the product, reachable from two screens. The one real difference: a report filed from *here* has no `matchId` attached (it's a pure profile report, same as reporting from the Discover card's "View full profile"), while a report filed from the Chat Thread's "Report this chat" pre-attaches `matchId` so admin can see the conversation. If this screen ever grows its own "Report" entry point that's reached *from* an open chat, attach `matchId` there too rather than treating profile-report and chat-report as the same call with different context only on one screen.

---

### 10. Report Profile / Report Chat (modal)

Base layout unchanged from Phase 10. **Phase 12 gives this same modal a second entry point** — "Report this chat" on the Chat Thread's overflow menu opens it with `matchId` pre-attached and the title adjusted, everything else (reason list, optional details, submit) identical:

```
Reported from Discover / Matched Profile:      Reported from the Chat Thread:
┌─────────────────────────────────────┐        ┌─────────────────────────────────────┐
│  Report Bella's profile         ✕    │        │  Report this conversation        ✕   │
├─────────────────────────────────────┤        ├─────────────────────────────────────┤
│  Reason                              │        │  Reason                              │
│  ( ) Inappropriate photos            │        │  ( ) Inappropriate photos            │
│  ( ) Fake profile                    │        │  ( ) Fake profile                    │
│  ( ) Harassment                      │        │  ( ) Harassment                      │
│  ( ) Other                            │        │  ( ) Other                            │
│  ┌───────────────────────────────┐   │        │  ┌───────────────────────────────┐   │
│  │ Add details (optional)         │   │        │  │ Add details (optional)         │   │
│  └───────────────────────────────┘   │        │  └───────────────────────────────┘   │
│  [ Submit report ]                    │        │  ℹ Our team will be able to see     │
└─────────────────────────────────────┘        │    this conversation while           │
                                                 │    reviewing your report.            │
                                                 │  [ Submit report ]                    │
                                                 └─────────────────────────────────────┘
```

**Notes:**
- Both variants call `POST /dating/report`; the chat variant simply includes `matchId` (and `targetPetId` set to the *other* pet in that match — the backend rejects the request `400` if `targetPetId` doesn't genuinely resolve to the other side of the given `matchId`, so don't let the caller pick an arbitrary pet here when `matchId` is set — derive `targetPetId` from the match itself, don't ask the user to choose).
- The "ℹ Our team will be able to see this conversation…" line is deliberate, visible copy on the chat variant only — matches the backend's on-demand, audit-logged (`dating.chat.viewed`) admin review path, same transparency principle already established for NID viewing ("Viewed just now — this view is logged" on the Matched Profile Detail screen). Don't add this line to the plain profile-report variant, which has no conversation for admin to view.
- Submitting from the chat variant does not delete or hide anything — the reporter's own copy of the conversation is untouched, still fully visible and still sendable-to (unless/until they separately unmatch and delete it). Reporting and deleting are two independent actions with two independent purposes.

---

## Admin Screens

### 11. Verification Review Queue

New for Phase 11 — mirrors the existing Dating Reports Queue's layout/interaction pattern exactly, so admins don't learn two different moderation UIs.

```
┌─────────────────────────────────────────────┐
│  Identity Verifications        [ Pending ▾ ] │
├───────────────────────────────────────────────┤
│  User            Submitted        Action      │
│  ariyan@…         2026-08-23      [ Review ]   │
│  jane@…           2026-08-24      [ Review ]   │
└───────────────────────────────────────────────┘

Review detail (opens on row click):
┌─────────────────────────────────────┐
│  Review — ariyan@…               ✕   │
├─────────────────────────────────────┤
│  ┌────────────┐   ┌────────────┐     │
│  │   Front    │   │    Back    │     │
│  │  [image]   │   │  [image]   │     │
│  └────────────┘   └────────────┘     │
│  (zoom on click)                     │
│                                       │
│  [ Approve ]      [ Reject ]         │
│  Reject reason (required if reject): │
│  ┌───────────────────────────────┐   │
│  │                                 │   │
│  └───────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Notes:**
- Front/back images load via the same on-demand signed-URL pattern as the matched-profile exchange screen — an admin opening this queue and *not* clicking into a specific review never triggers an image fetch for every row.
- Every open of the review detail logs `dating.nid.viewed` with the admin as actor, same as any other NID view — admins are not exempt from the audit trail.
- Reject requires a reason (enforced client-side to match the backend's `rejectionReason` requirement) since the user-facing Status screen displays it verbatim.

### 12. Dating Reports Queue

Base list/status-update pattern unchanged from Phase 10. **Phase 12 adds chat context to reports filed from inside a conversation** — a report row now optionally carries a `matchId`, and its detail view gains an on-demand "View conversation" action, following the exact same pattern as the Verification Review Queue's on-demand NID images above:

```
┌─────────────────────────────────────────────┐
│  Dating Reports              [ Pending ▾ ]   │
├───────────────────────────────────────────────┤
│  Reporter    Target pet   💬  Reason   Action │
│  jane@…      Rex           ·  Fake...  [Review]│
│  ariyan@…    Bella          ✓  Harass. [Review]│
└───────────────────────────────────────────────┘

Review detail (opens on row click), when matchId is present:
┌─────────────────────────────────────┐
│  Review — Report #4821           ✕   │
├─────────────────────────────────────┤
│  Reporter: ariyan@…                  │
│  Target: Bella                       │
│  Reason: Harassment                  │
│  Details: "Kept messaging after I    │
│  said no."                           │
│                                       │
│  [ View conversation ▾ ]             │
│  ┌───────────────────────────────┐   │
│  │  Hi! Rex is cute 🐕            │   │
│  │              Thanks!            │   │
│  │  Want to meet up?              │   │
│  │  ...(loaded on expand)         │   │
│  └───────────────────────────────┘   │
│                                       │
│  [ Dismiss ]   [ Action ]            │
└─────────────────────────────────────┘
```

**Notes:**
- A 💬 icon (or similar) in the list row indicates a report was filed with chat context (`matchId` present) — lets an admin prioritize harassment-in-chat reports, which have direct evidence attached, over profile-only reports.
- "[ View conversation ▾ ]" is collapsed by default and fetches on expand via `GET /admin/dating/reports/{id}/messages` — **on-demand only, same as the Verification Queue's NID images** (screen 11 above): never pre-loaded with the rest of the report list, and every open is audit-logged (`dating.chat.viewed`) server-side, so admins are not exempt from the audit trail here either.
- This action returns a `400` for a report filed without `matchId` (a plain profile report) — hide or disable "View conversation" entirely when the report row has no chat context, rather than showing it and letting the click fail.
- Dismiss/Action buttons are unchanged from Phase 10 — reviewing the conversation is purely informational context for that same existing decision, not a new moderation action of its own.

---

## Dating Pool Eligibility & Match Notifications — Phase 13

This section covers two related backend changes and is the authoritative reference for both — read it before wiring the Discover screen's pool behavior or the Matches List / Notifications badge. Nothing here changes any endpoint's URL, method, or request shape; it changes what `GET /dating/discover` returns and adds one new notification type plus one new query param to the existing Notifications API.

### Dating pool eligibility rules

Before Phase 13, `GET /dating/discover` excluded a pet **forever** once the caller's pet had swiped on it in that mode — a PASS was permanent, same as a LIKE. That's no longer true. There is now exactly one place these rules are evaluated (`DatingService.discover()`), applied in this priority order, and every rule below is enforced **server-side** — there is nothing for the client to filter or reason about beyond displaying what the API returns:

1. **An `ACTIVE` match → never shown, no matter how old.** If the caller's pet and a candidate currently have an `ACTIVE` `Match` document, that candidate is excluded from Discover unconditionally. This is the one exclusion the reset window (next rule) never overrides.
2. **A swipe (LIKE or PASS) inside the reset window → hidden.** Any pet the caller's pet has swiped on — like or pass — within the last `DATING_POOL_RESET_DAYS` days (env-configurable, **default 3**) is excluded. This is what makes a just-skipped (or just-liked-but-not-yet-matched) pet disappear from the very next page of results.
3. **A swipe older than the reset window → eligible again.** Once that many days have passed with no match having resulted, the pet reappears in Discover and can be swiped on again — including flipping a prior PASS to a LIKE, or vice versa (see "Re-swiping" below).
4. **Unmatched → falls back to rule 2/3, not immediately eligible.** Explicitly unmatching (`POST /dating/matches/{id}/unmatch`) removes the *permanent* exclusion from rule 1, but does not reset the clock on the original swipe that created the match — the pair becomes eligible again exactly when that original swipe ages out of the reset window, same as any other swipe. In practice: unmatching right after matching still means a few days' cooldown before either side sees the other in Discover again; unmatching a long-since-matched pair (whose original swipe is already older than the window) makes them eligible immediately.
5. **Everything else is unchanged** — the caller's own pets, BREEDING's species/opposite-gender restriction, `isActive`/mode-enabled profile requirements, and `verifiedOnly` all still apply exactly as before, on top of the above.

**Frontend impact:** none, structurally — same endpoint, same response shape, same pagination. The only behavior change is that the candidate pool is no longer monotonically shrinking forever; a previously-passed pet can legitimately reappear days later. Don't cache "already seen this session" assumptions across app restarts/long sessions as if they were permanent — they aren't, by design.

### Re-swiping a reappeared pet

`POST /dating/swipe` is unchanged in shape (`{ fromPetId, toPetId, action, mode }` in, `{ swipe, match }` out). What changed is what happens once a pet has reappeared per the rules above: swiping on it again is accepted (it's no longer a "duplicate swipe" `400`) and simply records the new decision — a former PASS can become a LIKE, and vice versa. Swiping on a pet that's still inside its reset window (or still in an `ACTIVE` match) continues to `400` with `"You already swiped on this pet in this mode"`, same message as before — the client shouldn't be able to trigger this from the UI at all, since such a pet would never have been in the Discover response to begin with; this remains purely a server-side guard against a direct/replayed API call.

### Match notifications

A new match now does two things it didn't do before, on top of the existing swipe-response (`match` in the `POST /dating/swipe` response body) and the existing live `matchCreated` Socket.IO event (see Real-Time Chat below) — both of those are unchanged:

- **A persisted, in-app `Notification` is created for each side**, type `dating.match-created`, appearing in that user's existing Notifications list (`GET /notifications`) exactly like any other notification — same `readAt`/unread semantics, same `PATCH /notifications/{id}/read` / `PATCH /notifications/read-all` to clear it, same auto-expiry behavior (`STANDARD` priority — kept ~1 day if never read, per the existing priority rules). Title is `"It's a match!"`; message is phrased from that recipient's own pet's perspective (e.g. *"Rex matched with Bella. Say hello!"*) — the two sides get two different notification documents with the copy swapped, not one shared record.
- **`data.matchId` and `data.petId`** (the recipient's own pet in this match) are set on the notification, same pattern as every other pet-scoped notification in this system — useful if the Notifications UI wants to deep-link "View match" straight into the Chat Thread.
- **Duplicates are structurally prevented, not just deduped after the fact.** A match is only ever created once server-side (race-safe via a unique index on the pet pair), and the notification-creation event only fires on the request that actually inserted that Match document — a retried `POST /dating/swipe` call, or the losing side of two near-simultaneous mutual-like requests, resolves to the same match without a second event firing. There is no need for the frontend to defend against seeing a duplicate "It's a match!" notification for the same match.

### The Matchup / Matches-tab indicator

Per the point above (`If the project already has unread/read notification semantics, integrate with them rather than creating a separate mechanism`), the "new match" badge is **not** a separate flag anywhere — it's the existing Notifications unread count, scoped to this one type via a new optional query param:

```
GET /notifications?type=dating.match-created&unreadOnly=true
```

`NotificationQueryDto` already supported `unreadOnly`; `type` is new in Phase 13 and works the same way against any notification type, not just this one. The response shape is unchanged (`{ notifications, pagination }`) — use `pagination.total` as the badge count for the Dating module's "Matches" tab (and/or fold it into whatever the top-level "Notifications" nav badge already aggregates). Clear it the same way any notification gets cleared — `PATCH /notifications/{id}/read` when the user opens that specific match's Chat Thread, or `PATCH /notifications/read-all`.

---

## Dating Chat Notifications (Match & Chats Unread) — Phase 14

A **wholly separate, dedicated unread-message system** for Dating → Match & Chats — not the `dating.match-created` in-app `Notification` described in the section above, and not the general Notifications API at all. Read this section before wiring the Dating tab badge, the Match & Chats badge, or any unread indicator on a specific matched-pet row — none of it comes from `GET /notifications`.

### Why a separate system

The general Notification collection tracks discrete, one-shot events (`dating.match-created`, `pet.marked-lost`, …) that stay unread until explicitly acknowledged. Chat unread state behaves differently on purpose: it should disappear the instant the relevant conversation is opened, it needs to be grouped per-conversation (not per-message) for the Match & Chats list, and it must never share a query/index footprint with unrelated notification types. Rather than bolt those semantics onto the general system, dating chat unread state is tracked in its own backend collection (`DatingChatNotification`) with its own three endpoints below. **A message notification row is deleted outright when read — there is no `IsRead` flag anywhere in this system.** "Read" and "no longer exists" are the same thing.

### Badge hierarchy

```
App Boot
    ↓
GET /dating/notifications/unread-summary
    ↓
Show "Dating 🔴 <totalUnread>"
    ↓
Open Dating
    ↓
Same response's matchChatsUnread → "Match & Chats 🔴 <matchChatsUnread>"
    ↓
Open Match & Chats
    ↓
GET /dating/notifications
    ↓
One row per matched pet/conversation with unread messages — highlight those rows
    ↓
Open a specific conversation (e.g. Bruno)
    ↓
POST /dating/matches/{matchId}/read
    ↓
Remove the local unread indicator for that conversation immediately;
re-fetch the summary (or subtract locally) to update the Dating/Match & Chats badges
```

`totalUnread` and `matchChatsUnread` are currently always the same number — dating chat messages are the only thing this system tracks today — but are returned as two separate fields so the app shell (Dating tab badge) and the Dating hub (Match & Chats badge) can each read their own field without assuming they'll always match if this system ever grows a second notification kind.

### Endpoints

**`GET /dating/notifications/unread-summary`** — lightweight count only, safe to call on every app boot.
```json
{ "totalUnread": 5, "matchChatsUnread": 5 }
```

**`GET /dating/notifications`** — one entry per conversation that currently has at least one unread message, newest-first. Deliberately lightweight: no message content, no chat history — just enough to render the Match & Chats list's per-pet unread state.
```json
[
  {
    "matchId": "6710...",
    "senderPetId": "66f0...",
    "senderPetName": "Bruno",
    "senderPetProfileImage": "https://.../bruno.jpg",
    "recipientPetId": "66f1...",
    "unreadCount": 2,
    "lastMessageAt": "2026-08-29T10:04:00.000Z"
  }
]
```
`matchId` doubles as the conversation id — this backend has no separate Conversation entity, a Match *is* the conversation (same id `GET/POST /dating/matches/{matchId}/messages` already use). `senderPetId`/`recipientPetId` identify the *exact* pet pair, which matters the moment an owner has more than one pet in more than one match at once — never assume "the other owner's pet" without reading these two fields, since the same two owners could have multiple matches across different pet pairs simultaneously.

**`POST /dating/matches/{matchId}/read`** — call this the moment a specific conversation is opened (same trigger point as fetching `GET /dating/matches/{matchId}/messages`). Deletes every currently-unread notification row for that conversation, for the calling user only.
```json
{ "message": "Conversation marked as read", "deletedCount": 2 }
```
Idempotent — calling it again on an already-clear conversation returns `deletedCount: 0`, not an error. `404` means the match doesn't exist or the caller owns neither side — the same IDOR-safe convention as every other `matches/{matchId}/...` route in this API.

### What triggers a notification

Every dating chat message — whether sent over `POST /dating/matches/{matchId}/messages` or the Socket.IO `sendMessage` event (see Real-Time Chat below; both paths converge on the same backend call) — creates exactly one `DatingChatNotification` for the recipient once the message itself has actually persisted. A failed send never produces a stray notification, and the same message can never double-notify the same recipient (enforced by a database-level unique constraint, not just application logic) — so a retried request is always safe to make again.

### Security & scope

Every one of these three endpoints derives the caller from the JWT, exactly like the rest of this API — there is no `userId`/`recipientUserId` parameter anywhere in these requests, and none would be honored if sent. A user can only ever see or clear their own unread dating-chat state.

### Read/delete race safety

If a new message arrives in the same conversation *while* `POST /dating/matches/{matchId}/read` is in flight, the backend guarantees the new message's notification survives — only the notifications that existed at the moment the read call started are deleted. There's nothing the frontend needs to do to benefit from this beyond the normal flow above (fetch messages, then mark read) — just don't assume a `0` unread count immediately after a read call means no message could possibly have arrived in the interim; if one did, it'll simply still show up in the next `GET /dating/notifications` poll or live `newMessage` socket event, with its own still-unread notification intact.

---

## Real-Time Chat (Socket.IO) Integration — Phase 12

This is the contract the Chat Thread, Matches List, and Match Celebration screens above all build on. Read this section fully before wiring any of them — it's written once here rather than repeated across each screen's notes.

### Why this exists

Phase 10/11 shipped matched chat as pure REST (`GET`/`POST /dating/matches/{id}/messages`) — functional, but with no way for either side to learn about a new message except polling. Phase 12 adds a Socket.IO layer alongside the REST API, not instead of it: **REST remains the source of truth for history and works with zero socket connection at all** (e.g. a client that only ever polls); the socket layer is purely additive, for low-latency delivery and live status updates (typing, match created, match ended) while a client happens to be connected.

**Golden rule: never rely on the socket alone.** On opening any screen that needs match/message data, fetch it via REST first (`GET /dating/matches`, `GET /dating/matches/{id}/messages`) — the socket only tells you about things that happen *after* you're connected and listening. A client that was offline, backgrounded, or never connected needs the REST fetch to catch up; the socket is the "and now, live" layer on top of that baseline.

### Connecting

- **Namespace**: `/dating` off the API's base Socket.IO endpoint (e.g. `wss://api.pawtato.example/dating` in production; the exact host/port matches wherever the REST API itself is served — no separate service to stand up).
- **Auth**: pass the same JWT access token already used for REST calls, either via the Socket.IO handshake's `auth` option (preferred) or an `Authorization: Bearer <token>` header:
  ```js
  const socket = io('https://api.pawtato.example/dating', {
    auth: { token: accessToken },
  });
  ```
- Auth happens **once, at connection time** — a socket with a missing/expired/invalid token gets an `error` event (`{ message: 'Unauthorized' }`) followed immediately by a disconnect. There is no per-event re-authentication; once connected, the connection is trusted for its lifetime (until the token would need refreshing — see Reconnection below).
- On successful connection, the server automatically joins the socket to a personal room (`user:<yourUserId>`) — this happens server-side, nothing to emit for it. This is what makes `matchCreated`/`newMessage`/`matchUnmatched` reach you even when you're not on a specific match's chat screen (see Events below).

### Events you emit

| Event | Payload | What it does |
|---|---|---|
| `joinMatch` | `{ matchId }` | Joins that match's room (`match:<matchId>`). **Ownership-checked server-side** — a match you don't own a side of responds with an `error` event (`{ message: 'Match not found' }`), same as the REST 404 convention this codebase uses everywhere else. Call this when opening a Chat Thread screen. |
| `leaveMatch` | `{ matchId }` | Leaves that room. Call when navigating away from a Chat Thread (not strictly required — rooms are per-socket-connection and cleaned up on disconnect — but good hygiene if the same socket connection is reused across a long session visiting many chats). |
| `sendMessage` | `{ matchId, content }` | Persists a message (identical validation to `POST /dating/matches/{id}/messages`: must own a side, match must be `ACTIVE`) and triggers a `newMessage` broadcast (see below). On failure (e.g. match ended), you get an `error` event with a message — there's no ack/response payload on success, listen for your own `newMessage` echo instead (see Sending below). |
| `typing` | `{ matchId }` | Fire-and-forget, broadcast to the match room (excluding yourself). Not persisted. Debounce this client-side (e.g. once per few seconds while actively typing), don't emit per keystroke. |

### Events you listen for

| Event | Payload | Delivered to |
|---|---|---|
| `joinedMatch` | `{ matchId }` | Acks a successful `joinMatch` — safe to consider the room "live" after this. |
| `error` | `{ message }` | Any rejected action above — a failed join, a failed send, a failed connection. Not fatal to the connection itself (except the auth-failure case, which does disconnect) — just surface it. |
| `matchCreated` | `{ matchId, petAId, petBId, ownerAId, ownerBId }` | Both owners' personal rooms (`user:<id>`) — reaches you even if you're not on the Discover/Chat screen at all. Use this to trigger the Match Celebration screen live for the side that *didn't* just swipe (the swiper already gets it synchronously in their `POST /dating/swipe` response). |
| `newMessage` | `{ matchId, messageId, senderUserId, content, createdAt, ownerAId, ownerBId }` | Both the match's room (`match:<matchId>`, for whoever has that thread open) **and** both owners' personal rooms (for badge/notification purposes even when the thread isn't open). Dedupe on `messageId` if you're listening in both places at once with overlapping UI concerns. |
| `matchUnmatched` | `{ matchId, petAId, petBId, unmatchedBy, ownerAId, ownerBId }` | Same dual delivery as `newMessage` (match room + both personal rooms). Flip that match to the archived state wherever it's currently rendered (Chat Thread composer disabled, Matches List row shows 🔒). |
| `typing` | `{ matchId, userId }` | The match room only, excluding the original sender. |

### Sending a message — the recommended flow

1. While connected, prefer `emit('sendMessage', ...)` over the REST `POST` — same backend call, lower latency.
2. Don't locally-append the message you just sent from a "success" callback — there isn't one. Instead, listen for your own `newMessage` echo (it's broadcast to the match room you're already in, including back to the sender) and append from that. This keeps exactly one code path for "a message arrived," whether it originated from you, the other side, or a REST-only client neither of you would otherwise know about.
3. If the socket is disconnected (see Reconnection below), fall back to the plain REST `POST /dating/matches/{id}/messages` — it works identically whether or not any socket is connected, and still triggers a `newMessage` broadcast for anyone who *is* connected.

### Reconnection & connection state

- Socket.IO's client library reconnects automatically by default on a dropped connection (network blip, backgrounding on mobile, etc.) — no custom reconnection logic needed for the common case.
- **A reconnect re-runs the JWT handshake** — if the access token has since expired, the reconnect will fail the same way an initial bad-token connection does (`error` + disconnect). Refresh the token and re-`io(...)` with the new one, same as you'd already need to for a REST call that comes back `401`.
- **A reconnect does not automatically re-join match rooms** — re-`emit('joinMatch', { matchId })` for whatever match's Chat Thread is currently open after any reconnect (Socket.IO client exposes a `connect` event you can hook for this).
- Show a subtle "reconnecting…" state in the Chat Thread's composer area while disconnected (disable send, or queue-and-flush) rather than silently failing a `sendMessage` emit into the void — an emit while disconnected is simply dropped, so a client offline for any length of time should fall back to the REST `POST` per point 3 above rather than trusting an emitted message got through.

### Deployment note (for whoever owns infra, not the frontend build itself, but relevant if latency/delivery looks flaky in a specific environment)

The default Socket.IO adapter only broadcasts within a single server process. If the API is ever run as multiple horizontally-scaled instances behind a load balancer, an event published on the instance handling User A's connection won't reach User B's socket if they're connected to a *different* instance, unless a shared adapter (e.g. Redis-backed) is added server-side. Not a frontend concern to work around — just useful context if "messages sometimes don't arrive live" gets reported in a multi-instance environment; it's an infra follow-up, not a client bug.

---

## Shared Pet Access (Caretakers) — Phase 15

New, non-dating feature (Post-MVP Backlog item: "Multiple authorized caretakers / shared pet access"): an owner can grant another registered user shared access to a pet — the flagship scenario is a vet, family member, or pet-sitter who needs to view/caretake a pet without owning it. **No screens are designed for this in this file yet** (out of this file's dating-focused scope, same as the rest of Pet CRUD) — this section documents the API contract so a Pet Detail screen redesign can build the caretaker UI against it later.

### The access model, in one sentence

A caretaker can **view** the pet and its medical/vaccination/scan/found-report history, and can **report it lost/found** — nothing more. Editing the pet's core profile (name/species/photo), deleting it, managing tags, managing the dating module, and managing *other* caretakers all remain strictly owner-only. There is no role tier (no "viewer" vs "editor") — one flat access level covers every real caretaking scenario this was scoped for.

### Granting access — direct-add, not an invite flow

```
POST /pets/{petId}/caretakers
{ "email": "caretaker@example.com" }
```
Owner-only. The target **must already have a Pawtato account** — there's no email-invite subsystem here, access is granted immediately once the owner supplies an existing account's email. `400` if that email is already a caretaker on this pet or is the owner's own email; `404` if no account exists with that email. Returns the created caretaker record with `userId` populated (`fullName`, `email`).

### Discovering and viewing access

```
GET /pets/{petId}/caretakers      -- who has access to this pet (owner or an existing caretaker can see this list)
GET /caretaking/pets              -- every pet the caller has been granted access to (not pets they own)
```
`GET /caretaking/pets` is the one a caretaker-facing UI needs on load — without it, a caretaker has no way to discover which pets they can act on at all, since the ordinary `GET /pets` only ever lists the caller's own pets. Each row carries the pet's basic info (`name`, `species`, `breed`, `profileImage`) and its owner's `fullName`/`email`, so a caretaker-facing list can render "Milo — owned by Jane Doe" without a second round-trip.

### Revoking access — both directions work independently

```
DELETE /pets/{petId}/caretakers/{caretakerId}   -- owner removes a specific caretaker
DELETE /pets/{petId}/caretakers/me              -- a caretaker voluntarily leaves, self-service
```
Both are idempotent-safe in the sense that a second call on an already-gone grant returns a clean `404`, never a crash. There's no confirmation-required flow baked into the API — if the frontend wants a "are you sure?" dialog before either call, that's a client-side concern.

### What a caretaker can actually do, once added

The exact same existing endpoints a pet's owner already uses — no new caretaker-specific action routes exist beyond the three above, since "caretaking" just widens who's allowed to call these:

```
GET    /pets/{petId}                     -- view
PATCH  /pets/{petId}/report-lost         -- report lost (see the note below on who gets notified)
PATCH  /pets/{petId}/report-found        -- report found
GET    /pets/{petId}/medical-records     -- view
POST   /pets/{petId}/medical-records     -- add a record
GET    /pets/{petId}/vaccinations        -- view
POST   /pets/{petId}/vaccinations        -- add a record
GET    /pets/{petId}/scans               -- view scan history
GET    /pets/{petId}/found-reports       -- view found-report history
```
Every other pet-scoped route (`PATCH /pets/{petId}` profile edits, the photo endpoints, `DELETE /pets/{petId}`, tags, dating) stays owner-only — a caretaker calling any of those gets the same `404` as a stranger, the same IDOR-safe convention used everywhere else in this API (never a distinguishing `403` that would confirm the pet exists).

**Important for the notification/badge UI:** when a caretaker reports a pet lost or found, the resulting `pet.marked-lost`/`pet.marked-found` in-app notification and email always go to the pet's *real owner*, never the acting caretaker — a caretaker reporting an escape shouldn't result in the owner being left in the dark because the notification went to the wrong inbox. The audit trail (admin-visible only) does record which specific user actually performed the action.

### Errors a caretaker-aware UI should handle

| Status | When | UI implication |
|---|---|---|
| `404` on `GET /pets/{petId}` | The pet doesn't exist, or the caller has neither ownership nor caretaker access | Treat identically to "pet not found" — don't try to distinguish the two cases in copy, the API deliberately doesn't either |
| `400` on `POST .../caretakers` | Duplicate caretaker, or adding yourself | Surface the API's own message directly — both are self-explanatory |
| `404` on `POST .../caretakers` | Caller isn't the owner, or the target email has no account | Same shape as above — don't leak which reason it was beyond the message text |

---

## Expanded Medical Records — Document Attachments (Phase 16)

New (Post-MVP Backlog: "Expanded medical records beyond the current medical/vaccinations modules — documents, certificates"): both a pet's medical records and its vaccination records can now carry uploaded file attachments — a scanned certificate, a lab result PDF, a vet's letter. No screens designed here yet (same out-of-scope note as Phase 15) — this documents the contract.

### Uploading a document

```
POST /pets/{petId}/medical-records/{recordId}/documents
POST /pets/{petId}/vaccinations/{vaccinationId}/documents
```
Both are `multipart/form-data`, field name `file`. Accepts JPEG/PNG/WebP or PDF, up to 10MB (`400` otherwise). Callable by the pet's owner or an authorized caretaker (Phase 15's `findAccessiblePet` access model — see that section). Returns the full updated record, `documents` array included.

### Removing a document

```
DELETE /pets/{petId}/medical-records/{recordId}/documents/{documentId}
DELETE /pets/{petId}/vaccinations/{vaccinationId}/documents/{documentId}
```
Same access model. Returns the updated record with that entry gone from `documents`. Idempotent-safe: removing an already-removed document returns `404`, not a crash.

### The `documents` shape

Each entry: `{ _id, url, fileName, mimeType, uploadedAt }`. `url` is a normal public URL (same convention as a pet's `profileImage`) — no signed-URL/audit-log machinery here, unlike dating's NID exchange; these documents aren't treated as identity-sensitive. There's no separate "list documents" endpoint — they're always embedded in the record itself, so `GET /pets/{petId}/medical-records` / `GET /pets/{petId}/vaccinations` already return everything needed to render a document list per record.

### What this does *not* add

No standalone "documents" resource independent of a medical/vaccination record, and no way to edit a document's metadata after upload (remove and re-upload instead) — kept deliberately minimal per the backlog's own scope.

---

## Push & SMS Notification Channels (Phase 17)

New (Post-MVP Backlog: "Push notifications, SMS channel implementations"). No screens designed here — this is background plumbing a client wires into at app-init, not a page.

**Registering a device for push** (call once per install, and again whenever the OS hands the app a new token):
```
POST /notifications/device-tokens
{ "token": "<fcm-or-apns-token>", "platform": "IOS" | "ANDROID" | "WEB" }

DELETE /notifications/device-tokens/{token}   -- on logout / uninstall, if reachable
```
Re-registering an already-known token (e.g. after a re-login) just updates its owner — safe to call unconditionally on every app start, no need to check "have I already registered this" client-side first.

**Important caveat for whoever wires up real push/SMS UI copy later:** as of this phase, push and SMS are both **stub implementations** — the backend logs what it would send instead of actually calling FCM/APNs/Twilio (no provider account exists yet). Device-token registration is fully real and safe to build against now; just don't expect an actual push notification or SMS to arrive on a device until a future phase wires in real credentials. In-app notifications (`GET /notifications`, unchanged from Phase 4) are unaffected and keep working exactly as before.

---

## Nearby Lost-Pet Discovery (Phase 18)

New (Post-MVP Backlog, split from "Nearby lost-pet discovery / community features" — only the geo-search half is built; a shelter/vet/business directory remains unscoped backlog). No screen designed here yet — this documents the contract for a future "pets lost near me" map/list view.

```
GET /public/lost-pets/nearby?lat={lat}&lng={lng}&radiusKm={radiusKm}
```
No authentication required, same public throttle tier as `GET /public/lost-pets`. `radiusKm` is optional (default 10, max 100). Returns the same public-safe fields as `GET /public/lost-pets` (`publicCode`, `name`, `species`, `breed`, `profileImage`, `lastSeenLocation`, `reward`, `lostDate`) plus a computed `distanceKm`, nearest first.

**Important caveat:** only pets whose owner supplied coordinates when reporting lost (`ReportLostDto`'s optional `lat`/`lng`) are returned here — a pet reported lost with only a text location still appears in the plain `GET /public/lost-pets` listing, just not in this geo search. A "report lost" form that wants to make a pet discoverable this way needs to actually capture/send coordinates (e.g. via the browser/device's geolocation API), not just a typed address string.

---

## QR Tag Ordering/Commerce (Phase 19)

New (Post-MVP Backlog: "QR tag ordering/commerce flow"), using Stripe Checkout. No screens designed here yet — this documents the contract for a future "order tags" flow in account settings.

**Starting an order:**
```
POST /tag-orders
{
  "quantity": 5,
  "shippingAddress": {
    "fullName": "...", "line1": "...", "line2": "...",
    "city": "...", "state": "...", "postalCode": "...", "country": "..."
  }
}
→ { "orderId": "...", "checkoutUrl": "https://checkout.stripe.com/..." }
```
Redirect the browser to `checkoutUrl` — this is a real Stripe-hosted checkout page, not something to build a custom payment form against. The order is created `PENDING_PAYMENT` immediately; it only becomes `PAID` once Stripe confirms payment via a server-side webhook (asynchronous — don't assume payment succeeded just because the redirect to Stripe happened). Pricing is currently a single flat per-tag rate (`TAG_UNIT_PRICE_CENTS`, server-configured) — there's no per-item product catalog to render.

**Checking order status:**
```
GET /tag-orders/mine          -- the caller's own orders
GET /tag-orders/{id}          -- one order (owner or admin)
```
`status` is one of `PENDING_PAYMENT | PAID | FULFILLED | CANCELLED`. Poll `GET /tag-orders/{id}` (or `mine`) after redirecting back from Stripe's success URL to find out whether the webhook has landed yet — there's no push/websocket signal for this, same pattern as everywhere else "wait for a domain event to land" already works in this API.

**Once paid**, the ordered tags exist as real inventory (`MANUFACTURED` status, same lifecycle as everything under the existing Tags feature) that an admin ships and marks fulfilled from the admin side — no separate "my ordered tags" listing exists yet; they surface through the same tag inventory a claimed/assigned tag would.

---

## Changelog

- **2026-08-25** — File created (Phase 11). Full page-by-page layout plan for every Dating module screen, including the two new identity-verification screens (owner-facing submit/status) and the new admin verification queue. Other modules (Lost & Found, auth, pet CRUD, general admin dashboard) intentionally left undesigned here — out of scope for this pass.
- **2026-08-25** — Extensive update for Phase 12 (Dating Hardening), driven by a full end-to-end audit of the dating module against this file and the API. Changes: (1) flagged a cross-cutting requirement for whoever builds the not-yet-designed Pet Create/Edit screen — `gender` is now mandatory on every pet, platform-wide, because Breeding-mode matching is strictly opposite-gender and needs it; (2) Discover screen notes updated to explain the opposite-gender guarantee is enforced server-side, not something the client filters; (3) Matches List updated for the new archived-row state (a match no longer vanishes on unmatch — it stays visible, read-only, until explicitly deleted); (4) Chat Thread substantially reworked: a header overflow menu (Unmatch / Report this chat / Delete conversation), an archived read-only state, and the whole screen now built on a real-time Socket.IO layer instead of REST-only; (5) Matched Profile Detail's existing Unmatch/Report actions annotated as the same calls the Chat Thread's overflow menu makes, with the profile-vs-chat report distinction (matchId attached or not) called out explicitly; (6) Report Profile modal extended with a second "Report this chat" entry point that pre-attaches match context, with a visible "our team can see this conversation" disclosure line mirroring the existing NID-view transparency copy; (7) admin Dating Reports Queue extended with an on-demand, audit-logged "View conversation" action for reports filed with chat context, mirroring the Verification Queue's on-demand NID-image pattern exactly; (8) added a new, extensive "Real-Time Chat (Socket.IO) Integration" section — the full connection/auth/event/reconnection contract every chat-related screen above builds on, written once rather than repeated per screen.
- **2026-08-25** — Phase 13 (Dating Pool Reset + Match Notifications). `GET /dating/discover` no longer excludes a skipped/liked pet forever — it now reappears after a configurable reset window (`DATING_POOL_RESET_DAYS`, default 3 days) unless it's in an `ACTIVE` match, which is excluded unconditionally and is the one thing the reset window never overrides; unmatching lifts that permanent exclusion and falls back to the same reset-window rule rather than resetting the clock. `POST /dating/swipe` now accepts a re-swipe on a reappeared pet instead of rejecting it as a duplicate. A new match now also creates a persisted, unread `Notification` (`dating.match-created`) for each side in the existing Notifications system, structurally deduped (fires only on the request that actually inserted the Match, never on a race-loser or retry) rather than deduped after the fact. `NotificationQueryDto` gained an optional `type` filter so the Matches-tab "new match" badge can be read straight from `GET /notifications?type=dating.match-created&unreadOnly=true`'s `pagination.total` — no new endpoint, no parallel unread mechanism. Unmatch itself was already implemented pre-Phase-13 (`POST /dating/matches/{id}/unmatch`, documented in the Phase 12 update above) and is unchanged by this pass except for the pool-eligibility interaction just described. Full details in the new "Dating Pool Eligibility & Match Notifications" section above the Real-Time Chat section.
- **2026-08-29** — Phase 14 (Dating Chat Notifications). Added a wholly separate, dedicated unread-message system for Dating → Match & Chats — explicitly *not* the `dating.match-created` in-app `Notification` from Phase 13 above, and not the general Notifications API at all. Three new endpoints: `GET /dating/notifications/unread-summary` (lightweight `{ totalUnread, matchChatsUnread }` count for the Dating tab and Match & Chats badges), `GET /dating/notifications` (one row per conversation with unread messages — `matchId`, `senderPetId`/`senderPetName`/`senderPetProfileImage`, `recipientPetId`, `unreadCount`, `lastMessageAt`; no message content or chat history), and `POST /dating/matches/{matchId}/read` (deletes every currently-unread notification for that conversation for the caller — idempotent, IDOR-safe same as every other `matches/{matchId}/...` route). A notification is created once per message per recipient (deduped at the database level, so a retried send is always safe), correctly attributed to the exact sender/recipient pet pair (not just the two owners) since a single match is always between exactly two specific pets even when an owner has several. Read state is a hard delete, never an `IsRead` flag — "read" and "no longer exists" are the same thing here — and the delete is race-safe against a message arriving mid-read (only notifications that existed when the read call started are removed). Full contract in the new "Dating Chat Notifications (Match & Chats Unread) — Phase 14" section above the Real-Time Chat section.
- **2026-08-29** — Phase 15 (Shared Pet Access / Caretakers), first non-dating feature documented in this file. An owner can grant another registered user ("caretaker") shared access to a pet via `POST /pets/{petId}/caretakers` (direct-add by email, no invite flow — the account must already exist), listable via `GET /pets/{petId}/caretakers` and, from the caretaker's own side, `GET /caretaking/pets` (since the ordinary `GET /pets` only ever lists owned pets). Revocable both ways: `DELETE /pets/{petId}/caretakers/{caretakerId}` (owner) or `DELETE /pets/{petId}/caretakers/me` (caretaker self-service). Access is a single flat level, no role tiers: a caretaker can view the pet and its medical/vaccination/scan/found-report history and report it lost/found, using the exact same existing endpoints an owner already calls — no new caretaker-specific action routes beyond the three above. Every identity-changing action (profile edits, photo, delete, tags, dating) stays strictly owner-only, same IDOR-safe `404` convention as the rest of this API. When a caretaker reports a pet lost/found, the notification/email still goes to the real owner, never the acting caretaker — only the (admin-visible) audit trail records who actually did it. No screens designed here yet (out of this file's dating-focused scope, same as the rest of Pet CRUD) — full API contract in the new "Shared Pet Access (Caretakers) — Phase 15" section above the Changelog.
- **2026-08-29** — Phase 16 (Expanded Medical Records — Document Attachments), catch-up entry (the section itself already existed but this changelog line was missed at the time). Medical records and vaccination records can each carry uploaded file attachments — `POST`/`DELETE .../medical-records/{recordId}/documents(/{documentId})` and the identical pair under `.../vaccinations/{vaccinationId}/documents`, multipart, image or PDF up to 10MB, same Phase 15 owner-or-caretaker access model. No signed-URL/audit machinery like dating's NID exchange — these aren't treated as identity-sensitive, just a normal public `url` per document embedded directly in the parent record's response. Full contract in "Expanded Medical Records — Document Attachments (Phase 16)" above.
- **2026-08-29** — Phases 17 (Push & SMS Notification Channels), 18 (Nearby Lost-Pet Discovery), and 19 (QR Tag Ordering/Commerce), the last three scoped Phase 9 backlog items. Phase 17: `POST`/`DELETE /notifications/device-tokens` for push registration — real device-token storage today, but push/SMS *sending* is currently a stub (logs instead of calling FCM/APNs/Twilio), so don't expect an actual notification to arrive on a device yet. Phase 18: `GET /public/lost-pets/nearby?lat=&lng=&radiusKm=`, geo search over only the lost pets whose owner supplied coordinates on report-lost — a pet reported lost with just a text location won't appear here even though it still appears in the plain lost-pets listing. Phase 19: `POST /tag-orders` starts a real Stripe Checkout session (redirect the browser to the returned `checkoutUrl`); the order stays `PENDING_PAYMENT` until Stripe's webhook confirms payment asynchronously — poll `GET /tag-orders/{id}` after the redirect back rather than assuming success. No screens designed for any of the three yet — all three sections above document contract only. Full detail in the new "Push & SMS Notification Channels (Phase 17)", "Nearby Lost-Pet Discovery (Phase 18)", and "QR Tag Ordering/Commerce (Phase 19)" sections above.
