# Measured on the hackathon matter, 2026-10-02

Everything here was measured on the live Clio matter, not estimated. Token counts are the ones the
Anthropic API reported and are stored with each step in Supabase. Dollar figures use list prices per
million tokens: Haiku 4.5 $1 in and $5 out, Opus 5.5 $4 in and $20 out, Sonnet 5.5 $2 in and $10 out.

## The case as Clio holds it

| | |
|---|---|
| Entries read from Clio | 218 |
| Notes | 42 |
| Emails | 56 |
| Phone calls | 13 |
| Tasks | 14 |
| Calendar entries | 17 |
| Expense entries | 14 (5 paid by the firm, 9 provider charges recorded on the matter) |
| Custom fields | 16 |
| Contacts | 15 |
| Documents | 31 files, 361 pages, 14.7 MB |
| Requests to Clio for a full read | about 12, plus one per document not yet copied |

## Reading the case once

A full read from nothing, run through the app at 11:29 (the "fresh read" page):

| Step | Model | Time | Tokens in | Tokens out | Cost |
|---|---|---|---|---|---|
| Read the case from Clio and copy 31 documents | none | 59 s | | | $0 |
| Index 361 pages of documents | claude-haiku-4-5 | 3 min 41 s | 808,090 | 47,317 | $1.04 |
| Write the brief | claude-opus-5-5 | 2 min 35 s | 93,773 | 17,416 | $0.72 |
| **Total** | | **7 min 15 s** | **901,863** | **64,733** | **$1.77** |

The first read this morning cost the same: index 808,090 in and 45,065 out ($1.03), brief 90,586 in
and 18,951 out ($0.74), $1.77 in all.

## After the first read

| What | Time | Cost |
|---|---|---|
| Opening a case | instant; no call to Clio or to a model | $0 |
| "Check Clio" with nothing changed | 3 s | $0 |
| "Check Clio" after a note was added in Clio | 3 s; the note appears and the brief is marked out of date | $0 |
| Rewriting the brief after a change (documents are not read again) | about 2 min 30 s | about $0.80 (90,517 in, 22,443 out) |
| Drafting an update for one provider (claude-sonnet-5-5) | about 20 s | not measured; a few cents |

## How far the brief can be trusted

Every statement in the brief must cite the entries it rests on, and code checks each one.

| Check on the brief stored at 10:33 | Result |
|---|---|
| Cited sources that exist in the case file | 133 of 133 |
| Quotes found word for word in their source | 133 of 133 |
| Citations that point at a specific page of a document | 58 |

The two earlier drafts of the brief, before the page index existed: 127 of 127 sources and 100 of 101
quotes; then 117 of 117 and 108 of 108.

## What the reader gets

| | |
|---|---|
| Brief page height before the ninety-second cut | 16,001 px (about 18 screens at 1440x900) |
| Brief page height now | 5,088 px; everything above the full file ends at 4,204 px |
| First screen | header, bottom line, what is new, worth against coverage |
| Moments picked out of the 187 dated entries | 10 |
| Red flags | 8, each with the passages that disagree |
| Provider update shared with the orthopaedic practice | 7 lines shared, 10 kept in the firm |

## Built in

| | |
|---|---|
| Clio connected and first full read | 10:23 |
| First brief written | 10:26 |
| All documents indexed | 10:30 |
| Brief with page citations | 10:33 |
| Provider update published end to end | 11:06 |
