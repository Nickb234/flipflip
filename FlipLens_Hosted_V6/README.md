# FlipLens Market Scanner — Hosted V6

A Vercel-ready fix-and-flip scanner that bulk-compares active single-family listings against recently sold single-family homes.

## What it does

- Search any US 5-digit ZIP code
- Search any `City, ST`
- Pull active single-family listings automatically
- Pull recent sold single-family property records automatically
- Bulk-process the market server-side
- Score nearby sold comps using:
  - distance
  - square-footage similarity
  - bedrooms
  - bathrooms
  - sale recency
- Calculate:
  - conservative ARV
  - base ARV
  - upside ARV
  - comp confidence
  - ask-to-ARV spread
  - rehab screening estimate
  - contingency
  - financing
  - holding
  - selling costs
  - projected profit
  - MAO
  - opportunity score
  - A+ through F grade
- Drill into each property to see exact weighted sold comps
- One-click Zillow and Google verification

## Deploy on Vercel — no local server required

1. Create a new GitHub repository.
2. Upload the contents of this folder to the repository.
3. In Vercel, click **Add New → Project** and import the repository.
4. Under **Environment Variables**, add:

   `RENTCAST_API_KEY` = your RentCast API key

5. Deploy.

Vercel automatically detects Next.js.

Important: Do **not** rename the variable to `NEXT_PUBLIC_RENTCAST_API_KEY`. The API key must remain server-side.

## Data source

This build uses RentCast's API:
- `/v1/listings/sale` for sale listings
- `/v1/properties` with `saleDateRange` for sold-property records

The scanner requests up to 500 records per page and paginates in parallel.

## Zillow

FlipLens does not scrape Zillow. Each detail panel contains a Zillow property-search link for manual verification of photos, condition and listing details.

## Current underwriting defaults

The model assumes:
- 12% rehab contingency
- ~2.5% acquisition costs
- 88% purchase financing assumption for interest modeling
- 11.5% annual interest
- 2 points
- 6-month project duration
- ~7.5% selling costs
- required profit = max($40,000, 12% of ARV)

These are screening assumptions, not lender quotes. They can be customized in a future version.

## Important limitations

- Public sale records may lag the actual closing date by weeks/months.
- Listing feeds may differ from Zillow/MLS in timing or coverage.
- Photo condition is not automatically analyzed yet.
- HOA, septic, well, structural issues, title, liens, permit issues and taxes require diligence.
- A high grade means "investigate first," not "buy automatically."
