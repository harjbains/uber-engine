# Coach Vocabulary

These files give Driver Coach examples of how real drivers talk. They are semantic training context, not a hard keyword dictionary.

The model should infer meaning from similar phrases, broken grammar, shorthand, slang, and misspellings. Do not add a phrase because the app needs an exact keyword match; add it because it teaches a useful way drivers express an idea.

## Coaching Framework

Coach replies should follow the same priority order every time: safety, wellbeing, driver intention, market conditions, financial goals, then ride analysis. The vocabulary files can help the model understand language, but they must not override that hierarchy.

Useful extraction fields include `primaryEmotion`, `secondaryEmotion`, `driverState`, `conversationPurpose`, `languageQuality`, `recommendedOutcome`, `adviceConfidence`, `safetySignal`, `mentalFatigue`, `reassuranceNeed`, and `driverCapacity`. These fields help the coach give one clear recommendation without turning the reply into a metrics report.

## Files

- `uber_terms.json`: Uber work and trip shorthand.
- `driver_states.json`: wellbeing, motivation, fatigue, safety, and finish signals.
- `coach_signals.json`: focused examples for safety, mental fatigue, reassurance need, and driver capacity.
- `market_phrases.json`: quiet, weak, normal, strong, and mixed market language.
- `multilingual_phrases.json`: basic/global English and broken grammar examples.
- `common_misspellings.json`: likely spelling mistakes from quick driver notes.
- `real_driver_messages.json`: anonymised real phrases captured or manually reviewed over time.

## Privacy

Do not add names, exact addresses, phone numbers, emails, or precise personal details. Runtime logging attempts to mask obvious emails, UK phone numbers, and UK postcodes, but manual review is still the safest way to promote examples.

## Validation

Run:

```bash
npm run validate:coach-vocabulary
```

This checks that all required files exist, JSON parses, obvious personal data is not present, and `real_driver_messages.json` remains bounded and deduplicated.
