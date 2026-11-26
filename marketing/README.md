# PulseRetain marketing site

Plain static site (HTML, CSS, a little JavaScript). No build step, no dependencies.

| File | What it is |
|------|------------|
| `index.html` | The page: hero, churn calculator, how it works, features, pricing, demo form, FAQ |
| `styles.css` | Styles, same navy/red/purple/orange palette as the app |
| `roi.js` | Calculator math (pure functions, shared by the page and the tests) |
| `site.js` | Wires up the calculator and posts the demo form |
| `roi.test.js` | `node --test marketing/roi.test.js` |

## Demo form

Posts `{ action: "submit_lead", lead: { name, email, gym, size, plan } }` to the existing
Lambda Function URL. That route is already public in `lambda/index.mjs`, saves to the
`pulseretain-leads` DynamoDB table and emails `NOTIFY_EMAIL` through SES. No Lambda change is
needed. The `plan` field carries the plan the visitor picked plus their calculator result,
e.g. `Demo request: Growth (calculator: $3,094/mo lost, 650 members)`.

## Calculator

Lost per month = members x monthly cancellation rate x average dues. The yearly figure is
that month's cancellations times 12 months of dues. "Hold on to" uses the visitor's own
save-rate assumption (default 20%) and counts one month only. Plan prices mirror
`lambda/billing.mjs`; change them in `roi.js` and in the pricing cards in `index.html`.

## Deploying on Amplify

The current marketing site is a separate Amplify app (`pulseretain-landing`). Either:

- **Quick:** zip the contents of this folder (not the folder itself) and drag it onto that
  app in the Amplify console (Hosting, Deploy updates / Deploy without Git).
- **Auto-deploy from GitHub:** in that app, connect this repository's `main` branch, turn on
  "monorepo" and set the app root to `marketing`. Build settings:

  ```yaml
  version: 1
  applications:
    - appRoot: marketing
      frontend:
        phases:
          build:
            commands: []
        artifacts:
          baseDirectory: .
          files:
            - '**/*'
  ```

The owner app's Amplify app is untouched by this folder, because CRA only builds `src/` and `public/`.
