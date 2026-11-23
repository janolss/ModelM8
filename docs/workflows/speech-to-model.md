# Speech-to-model

## When

The user describes the process orally and wants a 2c8 model.

## Important

**modelM8 has no speech-to-text.** Your MCP client / agent (e.g. Copilot) handles STT. modelM8 receives **text** and runs the same chain as text-to-model.

```text
Speech → (client STT) → text → modelM8 propose/apply → model in 2c8
```

## Prerequisites

Same as [text-to-model](text-to-model.md), plus a client that can deliver reliable text from speech.

## Agent prompt

[examples/prompts/speech-to-model.md](../../examples/prompts/speech-to-model.md)

## Steps

1. Receive / summarise the dictation as structured text (preferably prefixed)
2. Let the user confirm the summary when branching or roles are unclear
3. Continue exactly per [text-to-model](text-to-model.md) from `propose_model_from_text` (including source-based activity descriptions — do not guess purpose/considerations from speech that lacks them)

## Definition of done

Same as text-to-model.

## Common mistakes

| Symptom | Action |
|---|---|
| Ambiguous speech (“sometimes A sometimes B”) | Ask a question; do not model both as fact |
| Agent “transcribes” into tools that do not exist | Use only modelM8’s text/write tools |
