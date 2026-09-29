## Context

Questions are answered in parallel against one shared state and cannot see each other. Any rule a question relies on must therefore be in that question or in state. State is sent once per request. Question text is sent once per question, and there are 3–4 questions per unfinished task.

## Goals / Non-Goals

**Goals:**
- Fewer input bytes per miss, with the same option keys and verdict logic.

**Non-Goals:**
- New accuracy work.
- New questions or options.
- Changing verdict thresholds.
- Changing the non-task questions (alignment, drift, interaction, current_match, board_warranted). They are asked once per request, so shortening them saves little.

## Decisions

1. **Rubric in state, not in a question.**
   - Reason: state is shared by every question in the request, and questions cannot see each other.
   - It is added only when unfinished tasks exist, so empty or all-done boards pay nothing.
2. **Keep the scope in each question.**
   - Each question keeps `ONLY #id "subject"` and the full option set, so per-task independence stays explicit and option keys still validate answers.
3. **Source labels are kind only.**
   - The record id is the option key, and its view is in the record.
4. **Bump the judgment version.**
   - Changed definitions must not reuse old answers.
   - The cost is one re-evaluation per existing session. The user accepted it now, while few sessions depend on it.

## Risks / Trade-offs

- [Rules read from state instead of the question may shift answers] → Measured with a paid A/B on a real session (evidence.md). The user decides whether the observed shifts are acceptable.
- [Saving is proportional to task count, not history length] → On history-dominated requests the relative saving is small (≈5% of input tokens in the A/B). On multi-task boards it is larger (offline 18–35% of bytes).
