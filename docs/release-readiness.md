# Release readiness and review

Repair is an **internal educational prototype**, not therapy, an emergency service, a validated assessment, or a safe substitute for individualized support. Do not distribute it to the public or use it with real patients or sensitive information until the requirements below are met and independently verified. A working build, passing automated tests, or a content status of `in_review` is not clinical or security approval.

## Clinical and content review

- A licensed clinician with relevant couples-therapy experience must review each activity and its safety implications before its module is marked `published`. The reviewer should check clarity, cultural and relationship inclusivity, informed choice, realistic use of the players, and that every interaction can be declined or stopped. Record reviewer, date, content version, findings, and approval in the release process.
- A domestic-violence specialist must review the end-to-end safety system, including screening, coercive control, escalation, technology monitoring, safe entry and exit, wording, and referral pathways. Couples work must not be suggested as a remedy for abuse. A negative screen cannot establish that someone is safe.
- The current safety questions are original drafts, not a validated instrument. Before release, choose an appropriate validated approach with qualified review, obtain any required permission or license, verify language and thresholds, and test how the app responds to incomplete or positive answers.
- All assessment scores and thresholds are educational heuristics, not clinical diagnoses or validated measures. Have qualified reviewers assess their use, language, missing-answer behavior, recommendations, and whether scoring should be shown at all.
- Verify emergency numbers, service availability, geographic scope and destination URLs at release. The bundled crisis listings are US-focused; provide appropriate localized alternatives before serving other regions. Device use and external sites may be monitored and may leave traces.
- Special topics such as infidelity, physical intimacy, separation, parenting and finances require additional subject-matter review. The app must never reveal an affair or imply that a partner has consented, that relationship repair is mandatory, or that legal, medical or financial advice has been provided.

## Privacy and security

- The current prototype is local-first and uses device storage without an application lock or application-level encryption. Someone with device access may be able to inspect saved information or settings. It does not have separate accounts, partner verification, sharing, sync, or a secure two-person experience. Do not use it on a device where this could increase risk.
- Design and independently test encrypted local persistence, secure key handling, optional app locking, safe backup/recovery, deletion and export before collecting sensitive data. Account for shared devices, backups, screenshots, app-switcher previews, accessibility, crash reports, and device monitoring. Do not claim that an exit button erases traces.
- Supabase is a proposed backend, not connected to the app. Before enabling it, perform an independent security and privacy review, run RLS and concurrency tests against the actual deployed configuration, protect pairing from brute-force attempts, and prove that safety data and private answers cannot reach a partner. Sharing must be explicit and scoped to the correct relationship; unlinking and re-pairing require particular attention. Do not enable or infer functionality merely because a migration exists.
- Publish a plain-language privacy notice, terms, data-retention policy, deletion and export procedures, incident response plan, and named contact before public distribution.

## Product and operations

- Exercise real native builds on supported iOS and Android devices, including screen readers, large text, offline use, interrupted sessions, app backgrounding, device rotation, storage failure, and deep links. Automated tests and web exports do not replace device testing.
- Have an independent reviewer test safety-mode entry, direct links, recommendations, shared-device behavior, positive and incomplete screens, emergency access, resource links, and opt-out/stop paths. Document failures and resolutions.
- Establish a responsible owner for clinical review, safety, support, security updates, accessibility, content maintenance, and periodic contact-detail verification. Only then plan a limited, appropriately consented pilot and app-store release.

## References for reviewers

- [National Domestic Violence Hotline: safety planning](https://www.thehotline.org/plan-for-safety/)
- [National Domestic Violence Hotline: technology safety](https://www.thehotline.org/plan-for-safety/internet-safety/)
- [988 Suicide & Crisis Lifeline](https://988lifeline.org/)
- [RAINN National Sexual Assault Hotline](https://rainn.org/get-help/)
