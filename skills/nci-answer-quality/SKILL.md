---
name: nci-answer-quality
description: Produce high-confidence answers using NCI with explicit signature proof, operator direction checks, and a wrong-alternative validation step. Use when the user asks "using nci", requests type-level explanations, or wants strict correctness for composition operators.
disable-model-invocation: true
---

# NCI Answer Quality Guardrails

## Goal

Prevent incorrect type-level claims by requiring evidence-first reasoning from NCI declarations.

## Required Protocol

For every "using nci" question, follow this order:

1. **Identify decision operators/symbols first**
   - List the exact symbols that determine correctness.
   - Examples include directional combinators (`provide`, `compose`, `pipe`) and inference pivots (`...handle`, `...ClientAPI`), depending on the library.
2. **Fetch signature proof**
   - Use NCI to retrieve the declaration signature for each decision symbol.
3. **Derive conclusion from signature only**
   - Explain the result as a direct consequence of the generic positions and return type.
4. **Wrong-alternative check (mandatory)**
   - Show one plausible wrong version and why its type direction or constraints do not match the retrieved signature.
5. **Call-site confirmation**
   - Provide a concrete usage snippet that reflects the derived type direction.
6. **Confidence line**
   - State whether the answer is fully signature-backed or includes non-signature assumptions.

## Output Format (Concise)

Use this structure:

1. **Relevant signatures**
2. **Derived conclusion**
3. **Wrong alternative and why**
4. **Correct usage snippet**
5. **Confidence**

Keep each section brief. Do not add long narrative.

## Hard Rules

- Do not rely on memory for operator direction or composition semantics.
- If an operator is directional, always quote its full generic signature before concluding.
- If NCI evidence is missing or ambiguous, say so explicitly and stop short of strong claims.
- When user asks for strict correctness, include at least one disconfirming test (the wrong-alternative check).

## Quick Checklist

- [ ] Did I fetch signatures for all decision symbols?
- [ ] Did I map conclusion to exact generic positions?
- [ ] Did I include one wrong alternative and reject it with type reasoning?
- [ ] Did I mark assumptions vs signature-backed facts?
