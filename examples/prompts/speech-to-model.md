# Prompt: speech → model

```
I have dictated / attach a transcription of a process.
Use modelM8; target repo <repositoryId>; language <languageId>.

Transcription:
<<<
<STT text from the client — modelM8 does no STT>
>>>

Clean repetitions and uncertainty; keep business content.
Then follow the same chain as text-to-model:
propose → fix BO names → search_symbols in target repo → apply →
businessObjectCount > 0 → describe → review_process_model → fix.
Briefly show what you interpreted before apply if anything is unclear.
```
