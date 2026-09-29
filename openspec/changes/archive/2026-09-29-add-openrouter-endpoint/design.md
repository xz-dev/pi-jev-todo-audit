## Context

Sources were checked on 2026-09-29.

- **OpenRouter TypeSafe SDK guide.** `POST https://openrouter.ai/api/v1/systemone` implements TypeSafe's request and response shapes. Requests require `model`, `state` and `questions`. Responses carry `model`, `answers` and `usage`, plus `id`, `provider` and `usage.cost`. Bare ids map to `typesafe/…`, and `jev-latest` maps to `~typesafe/jev-latest`. Authentication is `Authorization: Bearer <OpenRouter key>`.
- **Jev 1.13 model page.** One provider (TypeSafe). $0.042 per 1M input tokens; output is free. Context 32K.
- **OpenRouter errors guide.** Error bodies have the shape `{"error":{"code":<status>,"message":…,"metadata":{…}}}`. Provider errors carry a typed `error.metadata.error_type`. `context_length_exceeded` means "the combined input and output tokens exceed the model's context window". `max_tokens_exceeded` is an output-generation stop on that platform. `token_limit_exceeded` is an OpenRouter credit cap.
- **OpenRouter zero-completion insurance.** An errored response with no output is not charged.

## Goals / Non-Goals

**Goals:**
- Work out of the box when `apiUrl` is set to OpenRouter: overflow recovery, pre-split and cost evidence.

**Non-Goals:**
- The alpha Decisions router (`/api/alpha/decisions`). It is a different path with a different model namespace, and the System One path already matches our wire shape.
- Streaming.
- Provider routing preferences.
- Live calls.
- Switching the default endpoint.

## Decisions

1. **Read `error.metadata.error_type` first.**
   - Reason: OpenRouter's `error.code` is the numeric HTTP status, so the typed reason lives in `metadata`.
   - The existing exclusions stay in place: quota, billing, rate and auth are never treated as overflow.
   - Only the existing overflow codes match. OpenRouter's `token_limit_exceeded` (a credit cap) and `string_too_long` stay ordinary failures, because splitting would not fix them.
2. **32k for both OpenRouter dimensions.**
   - Reason: the page publishes a single context window and no separate per-question allowance, so the conservative reading bounds both dimensions. A configured `contextLimits` still overrides it.
3. **The charge is optional, not zero.**
   - `costUsd` appears only when the provider reports it.
   - The total is omitted when no attempt reports a charge (TypeSafe direct), so no fabricated $0 is shown. It is `unknown` when only some attempts report one.

## Risks / Trade-offs

- [Docs-only verification] → The wire shapes are copied from the published examples, and the tests assert them. A live mismatch would surface as an ordinary isolated failure, not as silent cropping.
- [32k on OpenRouter vs 64k direct] → Same content splits into more requests on OpenRouter. That follows from the published limit; users with evidence of a larger window can set `contextLimits`.
