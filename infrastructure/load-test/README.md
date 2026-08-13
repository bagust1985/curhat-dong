# Load test — E17-T13

```bash
k6 run -e BASE_URL=https://api.staging.curhatdong.com -e TOKEN="<access token>" peak-night.js
```

## Rules

- **Staging only.** The script writes posts. Against production those are real
  rows in a real feed, seen by real people.
- **Production spec.** 4 vCPU / 8 GB, or the numbers mean nothing.
- **Evening shape.** The ramp models 20:00 → 01:00, which is when this product
  is busiest. A flat midday load measures a shape it never takes.

## Recording the result

The thresholds fail the run by themselves, so a green run needs no
interpretation. What still has to be written down after each run:

| Field | Why |
|---|---|
| Date, commit SHA, VPS spec | A number without them cannot be compared to the next one |
| p95 for feed and post | The two paths people actually wait on |
| The bottleneck, if any | Named, with a plan — a target that was missed becomes a task, not a footnote |

**A missed target becomes a new task in `.agents/tasks/`, never a line in a
report nobody reopens.** That is the acceptance criterion, and it is the part
that usually does not happen.

## Not yet run

No staging VPS exists yet. This script has never been executed, so there are no
numbers on this page — deliberately, rather than filling it with estimates that
would read like measurements.
