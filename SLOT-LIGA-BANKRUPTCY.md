# Slot Liga & Bankruptcy Doc

**Version:** 0.1
**Status:** Draft
**Scope:** Club Owner mode — financial collapse, slot trading, league restructuring

---

## 1. Core Concept

Every league slot is an asset. Clubs occupy slots. When a club collapses, its slot
does not disappear — it enters the market. Other entities can buy it and place a
new/existing club into it.

This enables lower-league clubs to "buy up" without winning promotion,
and creates a financial instrument for Owner mode.

---

## 2. Club Financial State

```
Club {
    ...
    cash            : int          // liquid cash
    debt            : int          // total outstanding loans
    monthly_costs   : int          // wages + facilities + staff
    monthly_income  : int          // matchday + TV + sponsor + prize
    credit_score    : 0–100        // affects loan availability + interest
    consecutive_missed_payments : int
    bankrupt        : bool
    slot_id         : int          // FK to LeagueSlot
}
```

### Monthly cash flow tick

```
cash += monthly_income
cash -= monthly_costs

if cash < 0:
    consecutive_missed_payments += 1
else:
    consecutive_missed_payments = 0
    credit_score = min(100, credit_score + 1)
```

---

## 3. Bankruptcy Trigger

```
if consecutive_missed_payments >= 3:
    trigger_bankruptcy(club)
```

Three consecutive months unable to cover costs → club enters bankruptcy.

### What happens at bankruptcy

```
bankruptcy_sequence:
    1. all_players.free_agent = true
    2. all_staff released
    3. sponsor contracts voided
    4. bank_loan.status = "defaulted"  → credit_score = 0
    5. club.bankrupt = true
    6. slot.status = "available"       → enters slot market
    7. media_feed: bankruptcy headline fires
    8. league notified: replacement rules apply (see §6)
```

Owner loses:

- Club ownership
- All shares in club
- Personal credit score hit: −30

Owner does **not** lose personal cash already withdrawn from club.

---

## 4. Bank Loans

Available to Club (Owner mode) and Agent (Agent mode).

```
Loan {
    entity_id   : int
    entity_type : "club" | "agent"
    principal   : int
    interest_rate: float         // per month
    duration_months: int
    monthly_payment: int
    missed_payments: int
    status      : "active" | "defaulted" | "repaid"
}
```

### Interest rates by credit score

| Credit score  | Monthly rate | Notes                            |
| ------------- | ------------ | -------------------------------- |
| 80–100        | 0.8%         | Best terms                       |
| 60–79         | 1.2%         | Standard                         |
| 40–59         | 2.0%         | Elevated risk                    |
| 20–39         | 3.5%         | High risk                        |
| 0–19          | 6.0%         | Near-bankruptcy terms            |
| 0 (defaulted) | No new loans | Blacklisted until score recovers |

### Loan shark (illegal option)

Available when credit_score = 0 and club needs cash. Triggered via event.

```
LoanShark {
    principal       : int
    monthly_rate    : 8.0%       // flat, non-negotiable
    duration_months : 6          // short window
    missed_payments_before_threat: 1   // only one miss allowed
}
```

If loan shark payment missed:

- Event fires: threat/intimidation
- Player can: pay immediately, go to police (legal case), ignore (escalating events)
- After 2 misses: match fixing offer fires as "only way out"

---

## 5. Slot System

### LeagueSlot

```
LeagueSlot {
    id          : int
    league_id   : int
    league_level: int          // 1 = top, higher = lower division
    club_id     : int | null   // null if available
    status      : "occupied" | "available" | "suspended"
    market_value: int          // base price when available
}
```

### Slot market value

```
slot_market_value = base_value(league_level)
                  * location_multiplier
                  * recent_attendance_multiplier

base_value per level:
    Level 1 (top flight)    : 50_000_000
    Level 2                 : 15_000_000
    Level 3                 : 4_000_000
    Tarkan                  : 200_000
```

`location_multiplier`: city size. Capital = 2.0, major city = 1.5, small town = 0.8.
`recent_attendance_multiplier`: 0.7–1.3 based on last 3 seasons avg attendance.

---

## 6. Buying a Slot

Any Owner-mode entity (or NPC club) can bid for an available slot.

```
slot_purchase:
    1. Buyer submits bid >= slot_market_value
    2. League board approves (auto-approve if bid >= market_value)
    3. Buyer assigns an existing club OR creates new club into the slot
    4. New club starts next season at that league level
    5. Slot status = "occupied"
```

### Who can buy

| Buyer               | Condition                                                          |
| ------------------- | ------------------------------------------------------------------ |
| Club Owner (player) | Has cash >= slot price. Can buy slot for existing club or new club |
| NPC club            | AI-driven. Lower-league clubs with high cash occasionally bid      |
| Consortium (NPC)    | Group of investors, buys and creates new club                      |

### Buying up without promotion

A lower-league club can purchase a slot at a higher level directly:

```
if buyer_club.league_level > slot.league_level:
    // buying up — additional fee applies
    slot_price *= 1.5       // premium for skipping promotion
    // buyer's current slot becomes available
    old_slot.status = "available"
```

Old slot enters market — another club can buy it.

---

## 7. Slot Suspension

Slots can be suspended (not available for sale) if:

- League restructuring event fires (rare, changes number of slots per division)
- Continental body sanctions league (match fixing scandal at league level)
- Government intervention (financial fair play violation by majority of clubs)

Suspended slots return to market after suspension period (1–3 seasons).

---

## 8. Agent Bankruptcy

Different from club bankruptcy — simpler.

```
Agent {
    cash            : int
    monthly_costs   : int    // office rent + staff salaries
    monthly_income  : int    // commissions
    consecutive_missed: int
    bankrupt        : bool
}

if consecutive_missed >= 2:     // agents have less buffer
    trigger_agent_bankruptcy()
```

### Agent bankruptcy sequence

```
1. all clients released (free_agent = true, agent_id = null)
2. office downgraded to level 0 (no office)
3. staff released
4. credit_score = 0
5. reputation -= 30
6. media_feed: agency collapse headline
```

Agent can rebuild from scratch — start with 0 clients, no office.

---

## 9. Recovery from Bankruptcy (Club)

After bankruptcy, ex-owner can:

1. **Buy back the slot** — if still available, at market price
2. **Buy a different slot** — start fresh in a lower league (cheaper)
3. **Join as minority shareholder** — buy < 51% of another club (Owner mode feature)
4. **Switch mode** — become Manager or Agent instead

Credit score recovery:

```
credit_score += 5 per season (passive, max recovery: 60 without repayment)
credit_score += 20 on full repayment of defaulted loan (if negotiated)
```

Full blacklist lift requires credit_score >= 20.

---

## 10. Cross-Mode Effects

| Event                               | Cross-mode effect                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| Club bankrupt                       | All players free agents — floods transfer market (Agent + Manager see spike) |
| Slot bought by NPC at higher level  | Existing clubs in that level face stronger competition                       |
| Multiple clubs bankrupt same league | League quality drops — affects national team pool                            |
| Agent bankrupt                      | Players without agent get lower contract offers (no negotiator)              |
| Loan shark default                  | Match fixing event fires — visible to Manager mode (suspicious results)      |

---

## 11. Open Items

| Item                                     | Note                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| Slot inheritance on promotion/relegation | Does a promoted club's old slot become available, or auto-merge?           |
| New club name/badge                      | Can owner name a club when buying a slot? Brand new identity?              |
| Partial sale                             | Can owner sell 49% stake to stay as minority while raising cash?           |
| Loan shark escalation path               | How many events before it forces match fixing — needs event chain designed |
