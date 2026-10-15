# Legal System Doc

**Version:** 0.1
**Status:** Draft
**Scope:** All four modes — Player, Manager, Agent, Club Owner

---

## 1. Overview

Legal cases are **never random** — only triggered by deliberate player choices.
The player always has agency before a case opens. Once open, three resolution paths.

---

## 2. Case Triggers per Mode

### 2.1 Player Mode

| Case              | Trigger condition                                                                   |
| ----------------- | ----------------------------------------------------------------------------------- |
| Tax evasion       | Player chooses "don't pay" when tax bill event fires (annual)                       |
| Sexual harassment | Player chooses aggressive option during social/dating event                         |
| Doping            | Player approves doping request from event `aks_m14` equivalent                      |
| Match fixing      | Player accepts match fixing offer from event `aks_m15` equivalent                   |
| Assault           | Player chooses violent option in conflict event (training, nightclub)               |
| Drink driving     | Player chooses to drive after party/nightclub event                                 |
| Drug possession   | Player accepts drug offer in social event (risk_taker trait raises chance of offer) |

### 2.2 Manager Mode

| Case               | Trigger condition                                                  |
| ------------------ | ------------------------------------------------------------------ |
| Tax evasion        | Manager chooses not to declare bonus income                        |
| Bribery of referee | Manager accepts referee bribe offer event                          |
| Match fixing       | Manager accepts club-level fixing offer                            |
| Contract fraud     | Manager signs player with forged documents (agent-collusion event) |
| Embezzlement       | Manager approves false expense claims over multiple seasons        |

### 2.3 Agent Mode

| Case                      | Trigger condition                                                             |
| ------------------------- | ----------------------------------------------------------------------------- |
| Tax evasion               | Agent skips tax declaration on commission income                              |
| Fraud                     | Agent pockets transfer fee without client knowledge                           |
| Media collusion           | Agent's fake transfer rumor gets exposed (outcome of failed rumor event)      |
| Unlicensed representation | Agent takes on client without valid license (early career, no office upgrade) |

### 2.4 Club Owner Mode

| Case                     | Trigger condition                                                   |
| ------------------------ | ------------------------------------------------------------------- |
| Tax evasion              | Owner skips tax on club revenue                                     |
| Money laundering         | Owner uses club to cycle illegal funds (high-risk investment event) |
| Wage theft               | Owner fails to pay player wages for 3+ months                       |
| Stadium safety violation | Owner ignores maintenance warnings — incident occurs                |

---

## 3. Resolution Paths

When a case opens, player chooses one of three paths immediately:

### Path A — Bribe Police

```
success_chance = base_bribability(officer)
              + money_offered_bonus
              - case_severity_penalty
              - media_exposure_penalty

money_offered_bonus   = (money_offered / case_value) * 0.30   # cap at +0.30
case_severity_penalty = severity_level * 0.10                 # 0.10–0.50
media_exposure_penalty = 0.20 if case_already_in_media else 0
```

`base_bribability` per officer (set at world gen, 0.0–1.0):

| Tier          | base_bribability | Description                          |
| ------------- | ---------------- | ------------------------------------ |
| Corrupt       | 0.60–0.80        | Actively open to bribe               |
| Greedy        | 0.35–0.59        | Will consider for right price        |
| Neutral       | 0.15–0.34        | Unlikely but possible                |
| Clean         | 0.00–0.14        | Almost impossible                    |
| Incorruptible | 0.00 (hard)      | Attempting bribe adds assault charge |

Player does not know officer tier upfront — revealed only after outcome.
Scout/connection network can provide intel on officer tier (Agent mode feature).

**Outcome:**

```
roll = random(0.0, 1.0)

if roll < success_chance:
    case_closed()
    money_deducted(money_offered)
    reputation -= 5           # quiet rumor regardless
else:
    bribe_attempt_recorded()
    case_continues()
    additional_charge = "attempted bribery"
    money_deducted(money_offered)  # money gone either way
```

---

### Path B — Fight with Lawyer

```
win_chance = lawyer.skill_level * 0.08        # 0.08–0.80 base
           + evidence_strength_bonus
           - case_severity_penalty
           - media_pressure_penalty

evidence_strength_bonus = 0.0 to 0.25         # from investigation events
case_severity_penalty   = severity_level * 0.08
media_pressure_penalty  = 0.15 if media_coverage > 70 else 0
```

`lawyer.skill_level` range 1–10. Hired from lawyer pool (city/country):

| Skill | Cost per season | Win rate base |
| ----- | --------------- | ------------- |
| 1–3   | Low             | 8–24%         |
| 4–6   | Medium          | 32–48%        |
| 7–9   | High            | 56–72%        |
| 10    | Very high       | 80%           |

**Outcomes:**

```
if roll < win_chance:
    case_dismissed()
    lawyer_fee_paid()
    reputation += 3    # "fought and won" bump

elif roll < win_chance + 0.15:    # partial win range
    charge_reduced()
    sentence = reduced_sentence()
    lawyer_fee_paid()

else:
    convicted()
    sentence = full_sentence()
    lawyer_fee_paid()
```

---

### Path C — Surrender

No cost. No chance roll. Straight to sentencing.
Reputation damage is slightly lower than Path B loss (shows remorse).

---

## 4. Sentencing

If convicted (Path B loss or Path C):

```
prison_days = base_sentence(case_type)
            * severity_multiplier
            * repeat_offender_multiplier
            - remorse_reduction        # Path C only: -20%
            - lawyer_reduction         # Path B partial win: -40%
```

### Base sentences

| Case                             | Base sentence                             |
| -------------------------------- | ----------------------------------------- |
| Tax evasion (small)              | 90–180 days                               |
| Tax evasion (large)              | 180–365 days                              |
| Sexual harassment                | 180–365 days                              |
| Assault                          | 90–270 days                               |
| Doping                           | Ban 180–365 days (no prison, career ban)  |
| Match fixing                     | 365–730 days + lifetime ban from football |
| Fraud (agent)                    | 180–540 days                              |
| Money laundering                 | 365–1095 days                             |
| Drink driving                    | 30–90 days                                |
| Drug possession                  | 60–180 days                               |
| Attempted bribery (added charge) | +30–90 days                               |

`repeat_offender_multiplier`: 1.0 first offence, 1.5 second, 2.0 third+

### Effects while imprisoned

```
per_season_imprisoned:
    attacking   -= rand(1, 3)
    technical   -= rand(1, 2)
    physical    -= rand(2, 4)
    speed       -= rand(1, 3)
    mental      -= rand(0, 2)
    stamina      = 0.40       # fixed floor
    form         = 0.20       # fixed floor
    ca           = max(1, ca - rand(2, 5))
```

Player still ages. Contracts can be terminated by clubs during imprisonment.

### After release

- Attributes stay at reduced values — no auto-recovery
- `free_agent = true` if club terminated contract
- `reputation` takes permanent hit (visible to clubs, agents)
- Career ban cases: `transfer_ban = permanent`

---

## 5. Reputation Impact

| Outcome                  | Reputation delta          |
| ------------------------ | ------------------------- |
| Bribe success (quiet)    | −5                        |
| Bribe fail → exposed     | −25                       |
| Lawyer win               | +3                        |
| Lawyer loss — convicted  | −20                       |
| Surrender — convicted    | −15                       |
| Case becomes media story | −10 additional            |
| Repeat offender          | −10 additional per repeat |

---

## 6. Media Exposure

Cases have a `media_exposure` value (0–100) that grows each week the case is open.

```
media_exposure += rand(5, 15) per week    # base growth
               + 20 if rival/media_collusion event fires
               - 10 if PR agency hired (Manager/Agent/Owner modes)
```

High `media_exposure` affects:

- Sponsor contracts: chance of sponsor pulling deal if exposure > 60
- Bribe success chance: −0.20 if exposure > 50
- Lawyer win chance: −0.15 if exposure > 70 (jury/public pressure)
- Team morale: −5 per week exposure > 40

---

## 7. Cross-Mode Interactions

| Situation                         | Effect                                              |
| --------------------------------- | --------------------------------------------------- |
| Player on Player mode gets case   | Manager in same world sees news, may sell/terminate |
| Agent's client gets case          | Agent reputation hit, client market value drops     |
| Club Owner convicted              | Club gets points deduction + forced sale of club    |
| Manager convicted of match fixing | Club banned from competitions for 1–3 seasons       |

---

## 8. Open Items

| Item             | Note                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| Evidence system  | How does player gather evidence to boost lawyer win chance? Mini-event chain?   |
| Lawyer pool size | How many lawyers per city? Does level of league affect availability?            |
| Appeal mechanic  | Should convicted player be able to appeal (second lawyer roll, reduced cost)?   |
| Doping ban       | Differs from prison — player can train but not play. Attribute decay different? |
