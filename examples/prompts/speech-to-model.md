# Prompt: tal → modell

```
Jag har dikterat / bifogar transkription av en process.
Använd modelM8; målrepo <repositoryId>; språk <languageId>.

Transkription:
<<<
<STT-text från klienten — modelM8 gör ingen STT>
>>>

Rensa upprepningar och osäkerhet, behåll affärsinnehåll.
Följ sedan samma kedja som text-to-model:
propose → fixa BO-namn → search_symbols i målrepo → apply →
businessObjectCount > 0 → describe → review_process_model → fixa.
Visa kort vad du tolkade innan apply om något är oklart.
```
