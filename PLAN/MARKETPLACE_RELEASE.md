# Marketplace release track

Updated 20 November 2026. Priority destinations: Amazon KDP eBook, Etsy digital downloads, Gumroad, then other stores. A downloadable PDF is not evidence that a manuscript is publishable or saleable. Marketplace acceptance and sales cannot be guaranteed.

## Implemented in this iteration

- Manuscript protection: bounded document grammar validation; explicit Save; per-owner, per-chapter, per-editor-instance IndexedDB drafts; recovery review; failed-save and conflict pause; offline state; backup download; stale AI suggestion rejection.
- Owner-protected `GET /api/v1/books/:bookId/publishing-checks?destination=...` with shared destination contracts and dated rule version.
- Export screen destination selector, live checks, refresh, official guidance links and downloadable JSON review record with chapter versions.
- KDP language/format checks, disclosure and exclusivity review; Etsy file-size check and attachment-limit review; Gumroad PDF/EPUB check; common editorial, rights, listing and file-freshness review.
- Removed the unverified “print-ready” label from the existing PDF workflow.

This is initial S14 preparation, not completed distribution packaging. Reports do not validate file bytes, prove ownership rights, publish listings, track seller-account status, or certify approval. Completed export metadata is currently used to identify candidate delivery files; immutable snapshots and storage revalidation remain S10 work.

## Required implementation sequence for the sale edition

1. Finish S02 resilience validation: actual simultaneous browser tabs, account switching/logout, IndexedDB write-quota failures and interrupted in-flight saves. Add draft retention/deletion settings and full backup import. The current backup is a JSON download, not a one-click restore workflow.
2. S03 core implemented and tested (see ACCEPTANCE.md): transactional reservation/job/outbox creation, exclusive leases with fencing, ordered section checkpoints, durable input snapshots, bounded retry and reconciliation. Verify worker termination at every commit boundary and concurrent requests before charging customers.
3. S04 core implemented and tested (see ACCEPTANCE.md): durable encrypted short-lived OTP delivery, expiration-aware retries, resend supersession, observable operator recovery. Verify production email independently of Mailpit.
4. S05–S09: versioned planning, private assets, editable cover typography, digital layout profiles, front/back matter, sources and actionable quality review are implemented (see ACCEPTANCE.md). Quality review produces anchored findings, not an aggregate score. Track AI-generated text/images/translations separately from AI-assisted edits; user review must not erase provenance.
5. S10: immutable export snapshots; EPUB 3 with navigation, metadata, direction and safe assets; EPUBCheck as a release gate; representative Kindle Previewer review; DOCX for destinations/languages requiring it; validated PDF for direct sales. Separate KDP print from eBook workflows and validate trim, bleed, margins, fonts and covers before any print-ready claim.
6. S14 packaging: destination-specific metadata and seller-reviewed disclosure; ZIP or separate files with a manifest, exact bytes/hashes, source snapshot and validation report. Etsy: at most five selected delivery files within its current per-file limit; do not interpret export history as listing attachments. Gumroad: customer PDF/EPUB plus accurate previews and clear delivery instructions. Prevent stale files from receiving a current-manuscript approval.
7. S12–S13: choose a payment provider supported by the seller's business country, resolve currency/refund/credit policy, test signed webhooks and entitlement reconciliation, implement operator permissions/audit, restore database plus assets, and verify alerts.
8. S15–S16: editable listing materials grounded in the actual book; production-provider output review, accessibility, load testing, release migrations and rollback rehearsal. Launch only after critical gates have recorded evidence.

KDP Select enrollment must remain an explicit seller decision: its digital exclusivity can conflict with distributing the same eBook through Etsy, Gumroad or the author's website. Do not enable it automatically.

## Official requirements checked

- [KDP eBook manuscript formats](https://kdp.amazon.com/help?topicId=G200634390)
- [KDP supported languages](https://kdp.amazon.com/en_US/help/topic/G200673300): app-supported languages are not automatically Kindle-supported. Bengali and Simplified Chinese, among others in this app, are absent from the current eBook list.
- [KDP Indian-language publishing](https://kdp.amazon.com/en_US/help/topic/G202124400): current guidance calls for Word files for the supported Indian languages, including the app's Hindi and Tamil.
- [KDP content and AI disclosure](https://kdp.amazon.com/en_US/help/topic/G200644110)
- [KDP Select digital exclusivity](https://kdp.amazon.com/en_US/select)
- [Etsy digital files](https://help.etsy.com/hc/en-us/articles/115015628347-How-to-Manage-Your-Digital-Listings): up to five files, 20 MB each.
- [Etsy creativity standards](https://www.etsy.com/legal/creativity/) and [current AI/listing-image guidance](https://www.etsy.com/seller-handbook/article/1522733284810)
- [Gumroad eBook delivery](https://gumroad.com/help/article/357-sell-an-ebook)

Recheck these sources before each destination release. Version policy changes and rerun the destination fixtures; do not silently apply one marketplace's requirements to another.
