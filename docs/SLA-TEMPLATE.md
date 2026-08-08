# Service Level Agreement — Template (V3 Task 15)

A template for when a customer (typically Enterprise / "Contact
Sales") asks for a written SLA. NOT a published commitment: nothing in
the product promises these numbers today, and no number below should be
promised until the monitoring in docs/OPERATIONS.md has measured a
quarter of real traffic.

---

## Service Level Agreement — Ionexa AI

**Between** Ionexa AI ("Provider") and ____________ ("Customer"),
effective ____________.

### 1. Service commitment

Provider will use commercially reasonable efforts to make the Service
available **99.5%** of each calendar month, excluding Exclusions (§4).
[Set from measured uptime; do not promise 99.9% on serverless +
managed-database infrastructure you have not measured.]

### 2. Measurement

Availability is measured by the external uptime monitor polling
`/api/health` at 1-minute intervals. A minute counts as unavailable
when the probe fails twice consecutively. Monthly availability =
(total minutes − unavailable minutes) / total minutes.

### 3. Support response times

| Severity | Definition | First response |
|----------|------------|----------------|
| S1 | Service down or data at risk | 4 business hours |
| S2 | Core feature unusable, no workaround | 1 business day |
| S3 | Degraded / cosmetic / question | 2 business days |

Channel: the contact page (or the Customer's named contact address).
Business hours: ____________ (state timezone).

### 4. Exclusions

Scheduled maintenance (announced ≥48h ahead), failures of the
Customer's own network or equipment, force majeure, abuse or use in
breach of the Acceptable Use Policy, and failures of third-party
subprocessors' platforms beyond Provider's control (each subprocessor's
own SLA applies to its layer).

### 5. Remedies

Sole remedy for missing §1 in a month: service credit of ___% of that
month's fee per full percentage point of missed availability, capped at
50% of the monthly fee, claimed in writing within 30 days.

### 6. AI outputs

AI-generated outputs are provided as-is (see Terms §4); availability
of the Service is covered by this SLA, correctness of model outputs is
not, and no SLA on model-provider latency is offered.
