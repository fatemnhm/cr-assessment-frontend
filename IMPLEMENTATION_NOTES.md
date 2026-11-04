# Implementation Notes

## 1. What I changed

**Task 1: bug fixes**

- Diff: it only compared the price, so a quantity change showed as "unchanged". Now it compares
  description, quantity and price.
- Permissions: Approve was enabled for the viewer because it only checked the status. Now Approve and
  Reject both need the CR to be pending, in the user's org, and the user to have an approve permission.

**Task 2: list**

- Added the status filter, and a message when the filter has no results.

**Task 3 & 4: detail**

- Timeline is sorted oldest first.
- Approve/Reject call the API, with a double-click guard. If one fails, an error is shown and
  the CR is reloaded so the status on screen matches the server.
- Reject needs a reason (not empty, not only spaces).
- The detail page now reloads when you pick another CR (before, it stayed on the first one).

## 2. Component & state model

There are two screens. The list shows the change requests for the user's org, with a status filter.
The detail screen shows one CR: what changed in the line items, the totals, the history, and the
Approve / Reject buttons.

- List: `state` (loading, loaded, empty, error) and `statusFilter`. `visibleRows` is worked out from them.
- Detail: `state`, `submitting`, `actionError` and the reject reason field. The diff, timeline and
  `canApprove` / `canReject` are worked out from the loaded CR.
- Data comes from the mock API using the current user from SessionService, goes into `state`, and the
  template shows something different for each state, so the screen is never blank.

## 3. Invariants I keep

| Invariant                                           | How / where                                    |
| --------------------------------------------------- | ---------------------------------------------- |
| Approve/Reject need pending, same org, permission   | `canDecide`, used by both buttons              |
| A double click sends only one request               | `runAction()` exits if one is already running  |
| A failed action never leaves a stale status         | shows `actionError`, then reloads the CR       |
| A late response never shows on another CR           | `runAction()` drops it if the CR changed       |
| Reject needs a real reason                          | blank/whitespace is blocked; reason is trimmed |
| The UI never changes the API data                   | the timeline sorts a copy                      |

## 4. Testing strategy

The diff is a pure function, so I tested it directly. For the screens I used component/DOM tests with
TestBed, because what matters is what the user sees (disabled buttons, errors, order).

- diff: quantity, price and description changes, and identical items
- list: filter and the no-results message
- detail: timeline order, viewer can't act, non-pending CR can't be approved
- approve works, double click sends one request
- approve failure shows an error and reloads the CR, so a saved approval can't be sent twice
- reject is blocked without a reason, and reject works with a trimmed reason

For failures I used the mock API's `failNext` instead of real delays. I didn't test switching CRs
quickly while one is loading.

## 5. Assumptions

- A description change counts as a change. CR-2 ("Replace SKU-B supplier") only changes the description,
  so without this it would look like nothing changed.
- Any approve permission (cr_a_u, cr_a_w, cr_a_o) is enough. I couldn't check "own CR" or "workspace"
  because the CR data has no owner or workspace field.
- Reject uses the same permission as Approve.
- For the viewer, the Approve button is shown but disabled, and the reject form is hidden.

## 6. Where I used AI

- I used Claude to help me understand the project, review my fixes, and help write parts of the
  actions, the tests and these notes. I went through and ran everything myself.

## 7. What I'd improve with more time

- Refresh the list after approve/reject (it shows the old status until reload)
- Handle fast switching between CRs while one is still loading, and test it
- Show exactly which field changed in the diff, plus line totals
- Accessibility: keyboard support for list rows and screen-reader messages
- "Approving..." text on the button while it's working
