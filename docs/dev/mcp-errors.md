# MCP errors from a Delivery Practice run

Exact tool calls and exact responses. Only calls that returned errors.

JSON payloads below are historical fixtures (Swedish process titles left as captured).

---

## 1. `apply_model_proposal` — objectType gateway

### Request

```json
{
  "namespace": "user-2c8",
  "toolName": "apply_model_proposal",
  "arguments": {
    "repositoryId": "f1b2e0c5-26b0-48a0-8a62-00c4fd950e50",
    "languageId": "c3d48e77-f3a8-436e-adbb-7bdb08cf9f36",
    "permissionGroup": "8ea77d81-d79c-40f8-8cfc-279fe9e7b2eb",
    "proposal": {
      "modelType": "process",
      "title": "Leverera tjänst eller projekt",
      "processTitle": "Leverera tjänst eller projekt",
      "chain": [
        {"kind": "businessObject", "title": "Undertecknat avtal", "objectType": "businessObject"},
        {"kind": "activity", "title": "Initiera projekt", "objectType": "activity"},
        {"kind": "businessObject", "title": "Projektmandat", "objectType": "businessObject"},
        {"kind": "activity", "title": "Planera leverans", "objectType": "activity"},
        {"kind": "businessObject", "title": "Leveransplan", "objectType": "businessObject"},
        {"kind": "gateway", "title": "Är leveransen stage-gated?", "objectType": "gateway"},
        {"kind": "activity", "title": "Genomföra stage-gated leverans", "objectType": "activity"},
        {"kind": "businessObject", "title": "Verifierat leveransresultat", "objectType": "businessObject"},
        {"kind": "activity", "title": "Granska i Project Delivery Board", "objectType": "activity"},
        {"kind": "businessObject", "title": "Styrningsbeslut för leverans", "objectType": "businessObject"},
        {"kind": "activity", "title": "Acceptera och avsluta leverans", "objectType": "activity"},
        {"kind": "businessObject", "title": "Accepterad leverans och lessons learned", "objectType": "businessObject"}
      ],
      "activities": [
        {"title": "Initiera projekt", "performers": ["Project Manager"]},
        {"title": "Planera leverans", "performers": ["Project Manager"]},
        {"title": "Genomföra stage-gated leverans", "performers": ["Project Manager"]},
        {"title": "Genomföra agil leverans", "performers": ["Project Manager"]},
        {"title": "Granska i Project Delivery Board", "performers": ["Project Manager"]},
        {"title": "Acceptera och avsluta leverans", "performers": ["Project Manager"]}
      ],
      "branches": [
        {
          "fromTitle": "Är leveransen stage-gated?",
          "label": "Ja",
          "toTitle": "Genomföra stage-gated leverans",
          "toKind": "activity",
          "objectType": "activity"
        },
        {
          "fromTitle": "Är leveransen stage-gated?",
          "label": "Nej",
          "toTitle": "Genomföra agil leverans",
          "toKind": "activity",
          "objectType": "activity"
        }
      ],
      "steps": [
        {"title": "Undertecknat avtal", "objectType": "businessObject"},
        {
          "title": "Initiera projekt",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Undertecknat avtal"],
          "outputs": ["Projektmandat"]
        },
        {"title": "Projektmandat", "objectType": "businessObject"},
        {
          "title": "Planera leverans",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Projektmandat"],
          "outputs": ["Leveransplan"]
        },
        {"title": "Leveransplan", "objectType": "businessObject"},
        {"title": "Är leveransen stage-gated?", "objectType": "gateway"},
        {
          "title": "Genomföra stage-gated leverans",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Leveransplan"],
          "outputs": ["Verifierat leveransresultat"]
        },
        {
          "title": "Genomföra agil leverans",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Leveransplan"],
          "outputs": ["Verifierat leveransresultat"]
        },
        {"title": "Verifierat leveransresultat", "objectType": "businessObject"},
        {
          "title": "Granska i Project Delivery Board",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Verifierat leveransresultat"],
          "outputs": ["Styrningsbeslut för leverans"]
        },
        {"title": "Styrningsbeslut för leverans", "objectType": "businessObject"},
        {
          "title": "Acceptera och avsluta leverans",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Styrningsbeslut för leverans"],
          "outputs": ["Accepterad leverans och lessons learned"]
        },
        {"title": "Accepterad leverans och lessons learned", "objectType": "businessObject"}
      ],
      "namingChecks": [
        {"title": "Projektmandat", "objectType": "businessObject", "pass": true},
        {"title": "Leveransplan", "objectType": "businessObject", "pass": true},
        {"title": "Verifierat leveransresultat", "objectType": "businessObject", "pass": true},
        {"title": "Styrningsbeslut för leverans", "objectType": "businessObject", "pass": true},
        {"title": "Accepterad leverans och lessons learned", "objectType": "businessObject", "pass": true}
      ]
    }
  }
}
```

### Response

```
2c8 API POST /api/v1/repositories/f1b2e0c5-26b0-48a0-8a62-00c4fd950e50/symbols failed with 400: {"message":"No such object type exists: gateway","timestamp":"2026-11-20T22:39:52Z"}
```

---

## 2. `apply_model_proposal` — objectType decision (mapped to gateway)

### Request

```json
{
  "namespace": "user-2c8",
  "toolName": "apply_model_proposal",
  "arguments": {
    "repositoryId": "f1b2e0c5-26b0-48a0-8a62-00c4fd950e50",
    "languageId": "c3d48e77-f3a8-436e-adbb-7bdb08cf9f36",
    "permissionGroup": "8ea77d81-d79c-40f8-8cfc-279fe9e7b2eb",
    "proposal": {
      "modelType": "process",
      "title": "Leverera tjänst eller projekt",
      "processTitle": "Leverera tjänst eller projekt",
      "chain": [
        {"kind": "businessObject", "title": "Undertecknat avtal", "objectType": "businessObject"},
        {"kind": "activity", "title": "Initiera projekt", "objectType": "activity"},
        {"kind": "businessObject", "title": "Projektmandat", "objectType": "businessObject"},
        {"kind": "activity", "title": "Planera leverans", "objectType": "activity"},
        {"kind": "businessObject", "title": "Leveransplan", "objectType": "businessObject"},
        {"kind": "gateway", "title": "Är leveransen stage-gated?", "objectType": "decision"},
        {"kind": "activity", "title": "Genomföra stage-gated leverans", "objectType": "activity"},
        {"kind": "businessObject", "title": "Verifierat leveransresultat", "objectType": "businessObject"},
        {"kind": "activity", "title": "Granska i Project Delivery Board", "objectType": "activity"},
        {"kind": "businessObject", "title": "Styrningsbeslut för leverans", "objectType": "businessObject"},
        {"kind": "activity", "title": "Acceptera och avsluta leverans", "objectType": "activity"},
        {"kind": "businessObject", "title": "Accepterad leverans och lessons learned", "objectType": "businessObject"}
      ],
      "activities": [
        {"title": "Initiera projekt", "performers": ["Project Manager"]},
        {"title": "Planera leverans", "performers": ["Project Manager"]},
        {"title": "Genomföra stage-gated leverans", "performers": ["Project Manager"]},
        {"title": "Genomföra agil leverans", "performers": ["Project Manager"]},
        {"title": "Granska i Project Delivery Board", "performers": ["Project Manager"]},
        {"title": "Acceptera och avsluta leverans", "performers": ["Project Manager"]}
      ],
      "branches": [
        {
          "fromTitle": "Är leveransen stage-gated?",
          "label": "Ja",
          "toTitle": "Genomföra stage-gated leverans",
          "toKind": "activity",
          "objectType": "activity"
        },
        {
          "fromTitle": "Är leveransen stage-gated?",
          "label": "Nej",
          "toTitle": "Genomföra agil leverans",
          "toKind": "activity",
          "objectType": "activity"
        }
      ],
      "steps": [
        {"title": "Undertecknat avtal", "objectType": "businessObject"},
        {
          "title": "Initiera projekt",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Undertecknat avtal"],
          "outputs": ["Projektmandat"]
        },
        {"title": "Projektmandat", "objectType": "businessObject"},
        {
          "title": "Planera leverans",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Projektmandat"],
          "outputs": ["Leveransplan"]
        },
        {"title": "Leveransplan", "objectType": "businessObject"},
        {"title": "Är leveransen stage-gated?", "objectType": "decision"},
        {
          "title": "Genomföra stage-gated leverans",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Leveransplan"],
          "outputs": ["Verifierat leveransresultat"]
        },
        {
          "title": "Genomföra agil leverans",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Leveransplan"],
          "outputs": ["Verifierat leveransresultat"]
        },
        {"title": "Verifierat leveransresultat", "objectType": "businessObject"},
        {
          "title": "Granska i Project Delivery Board",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Verifierat leveransresultat"],
          "outputs": ["Styrningsbeslut för leverans"]
        },
        {"title": "Styrningsbeslut för leverans", "objectType": "businessObject"},
        {
          "title": "Acceptera och avsluta leverans",
          "objectType": "activity",
          "performers": ["Project Manager"],
          "inputs": ["Styrningsbeslut för leverans"],
          "outputs": ["Accepterad leverans och lessons learned"]
        },
        {"title": "Accepterad leverans och lessons learned", "objectType": "businessObject"}
      ],
      "namingChecks": [
        {"title": "Projektmandat", "objectType": "businessObject", "pass": true},
        {"title": "Leveransplan", "objectType": "businessObject", "pass": true},
        {"title": "Verifierat leveransresultat", "objectType": "businessObject", "pass": true},
        {"title": "Styrningsbeslut för leverans", "objectType": "businessObject", "pass": true},
        {"title": "Accepterad leverans och lessons learned", "objectType": "businessObject", "pass": true}
      ]
    }
  }
}
```

### Response

```
2c8 API POST /api/v1/repositories/f1b2e0c5-26b0-48a0-8a62-00c4fd950e50/symbols failed with 400: {"message":"No such object type exists: gateway","timestamp":"2026-11-20T22:40:31Z"}
```

---

## 3. `add_process_step` — objectType decision

### Request

```json
{
  "namespace": "user-2c8",
  "toolName": "add_process_step",
  "arguments": {
    "repositoryId": "f1b2e0c5-26b0-48a0-8a62-00c4fd950e50",
    "modelId": "7d3d349d-327a-4e76-97f1-1c1f992d7e4f",
    "title": "Är leveransen stage-gated?",
    "languageId": "c3d48e77-f3a8-436e-adbb-7bdb08cf9f36",
    "objectType": "decision",
    "connectFromVertexId": "e6847392-35d9-4261-961e-7ba41da39076",
    "edgeType": "FLOW",
    "x": 450,
    "y": 129
  }
}
```

### Response

```
2c8 API POST /api/v1/repositories/f1b2e0c5-26b0-48a0-8a62-00c4fd950e50/symbols failed with 400: {"message":"No such object type exists: gateway","timestamp":"2026-11-20T22:41:09Z"}
```

---

## 4. `set_activity_performer` — missing performerSymbolId

### Request

```json
{
  "namespace": "user-2c8",
  "toolName": "set_activity_performer",
  "arguments": {
    "repositoryId": "f1b2e0c5-26b0-48a0-8a62-00c4fd950e50",
    "modelId": "7d3d349d-327a-4e76-97f1-1c1f992d7e4f",
    "activityVertexId": "325ecbbb-1fbf-4811-bf04-5a2b46cbe033",
    "performerTitle": "Project Manager",
    "languageId": "c3d48e77-f3a8-436e-adbb-7bdb08cf9f36"
  }
}
```

### Response

```
MCP error -32602: Input validation error: Invalid arguments for tool set_activity_performer: Invalid input: expected string, received undefined at performerSymbolId
```

---

## 5. `create_process_map` — sideLoop fromBoTitle missing on chain

### Request

```json
{
  "namespace": "user-2c8",
  "toolName": "create_process_map",
  "arguments": {
    "repositoryId": "f1b2e0c5-26b0-48a0-8a62-00c4fd950e50",
    "languageId": "c3d48e77-f3a8-436e-adbb-7bdb08cf9f36",
    "title": "Delivery processes",
    "permissionGroup": "8ea77d81-d79c-40f8-8cfc-279fe9e7b2eb",
    "chain": [
      {
        "kind": "businessObject",
        "title": "Undertecknat avtal",
        "symbolId": "df4500f2-7641-4d5d-8f75-acc2da9edf7e"
      },
      {
        "kind": "process",
        "title": "Leverera tjänst eller projekt",
        "symbolId": "49945747-7b8d-44ce-826f-2aa1c4c7a251",
        "detailModelId": "7d3d349d-327a-4e76-97f1-1c1f992d7e4f"
      },
      {
        "kind": "businessObject",
        "title": "Accepterad leverans och lessons learned",
        "symbolId": "b46ae346-46ae-4d42-8836-77022e907402"
      }
    ],
    "sideLoops": [
      {
        "fromBoTitle": "Undertecknat avtal",
        "processTitle": "Leverera produktlicens",
        "symbolId": "3b331624-2820-4148-97e4-9031127545a9",
        "detailModelId": "e585d580-33a8-4b4d-b8dc-8b2b2ed83e37",
        "placement": "below"
      },
      {
        "fromBoTitle": "Överenskommen timtaxa och startdatum",
        "processTitle": "Leverera konsultuppdrag",
        "symbolId": "c52796c1-108f-488b-aeb3-e473798af65e",
        "detailModelId": "adb9ffd2-116f-481e-8029-39071c35bc9f",
        "placement": "below"
      }
    ]
  }
}
```

### Response

```
create_process_map: sideLoop fromBoTitle 'Överenskommen timtaxa och startdatum' not found on chain
```

---

## 6. `create_process_map` — breakdown already exists

### Request

```json
{
  "namespace": "user-2c8",
  "toolName": "create_process_map",
  "arguments": {
    "repositoryId": "f1b2e0c5-26b0-48a0-8a62-00c4fd950e50",
    "languageId": "c3d48e77-f3a8-436e-adbb-7bdb08cf9f36",
    "title": "Delivery processes",
    "permissionGroup": "8ea77d81-d79c-40f8-8cfc-279fe9e7b2eb",
    "chain": [
      {
        "kind": "businessObject",
        "title": "Undertecknat avtal",
        "symbolId": "df4500f2-7641-4d5d-8f75-acc2da9edf7e"
      },
      {
        "kind": "process",
        "title": "Leverera tjänst eller projekt",
        "symbolId": "49945747-7b8d-44ce-826f-2aa1c4c7a251",
        "detailModelId": "7d3d349d-327a-4e76-97f1-1c1f992d7e4f"
      },
      {
        "kind": "businessObject",
        "title": "Accepterad leverans och lessons learned",
        "symbolId": "b46ae346-46ae-4d42-8836-77022e907402"
      }
    ],
    "sideLoops": [
      {
        "fromBoTitle": "Undertecknat avtal",
        "processTitle": "Leverera produktlicens",
        "symbolId": "3b331624-2820-4148-97e4-9031127545a9",
        "detailModelId": "e585d580-33a8-4b4d-b8dc-8b2b2ed83e37",
        "placement": "below"
      },
      {
        "fromBoTitle": "Undertecknat avtal",
        "processTitle": "Leverera konsultuppdrag",
        "symbolId": "c52796c1-108f-488b-aeb3-e473798af65e",
        "detailModelId": "adb9ffd2-116f-481e-8029-39071c35bc9f",
        "placement": "below"
      }
    ]
  }
}
```

### Response

```
2c8 API POST /api/v1/repositories/f1b2e0c5-26b0-48a0-8a62-00c4fd950e50/models/7d3d349d-327a-4e76-97f1-1c1f992d7e4f/broken-down-from failed with 409: {"message":"A breakdown to model with uuid 7d3d349d-327a-4e76-97f1-1c1f992d7e4f already exists from symbol with uuid 49945747-7b8d-44ce-826f-2aa1c4c7a251.","timestamp":"2026-11-20T22:42:20Z"}
```
