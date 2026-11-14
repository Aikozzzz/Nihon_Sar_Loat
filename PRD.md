# Nihon Sar Loat — Product Requirements Document

**Status** Draft for review · **Date** November 13, 2026 · **Launch audience** JLPT N2 learners

## 1. Product overview

Nihon Sar Loat is a web app that turns Japanese study materials into a personal review library. A learner uploads a PDF, checks the kanji and vocabulary Groq extracts, and saves the items they have studied. They can recall kanji with flashcards, spend extra time on difficult characters, compare look-alikes, and read new Japanese passages that reuse what they have studied.

The primary user is a self-directed learner preparing for JLPT N2 who studies from several books and wants a single place to track and practice the material. The first release assumes an English interface and English meanings, with Japanese text and kana readings. The official JLPT N2 reading description is the reference for passage difficulty. [JLPT level summary](https://www.jlpt.jp/e/about/levelsummary.html)

## 2. Source materials

| Reference | Use in the app |
| --- | --- |
| *N2 Kanji Speed Master* (日本語能力試験問題集 N2漢字 スピードマスター) | Extract kanji and associated vocabulary from learner-selected pages. [Book listing](https://www.hanmoto.com/bd/isbn/9784863924093) |
| *Shin Kanzen Master N2 Reading* (新完全マスター読解 日本語能力試験 N2) | Use as a reference for reading difficulty and formats such as notices and short explanatory texts. Learners can also import study terms from pages they provide. [Publisher listing](https://www.3anet.co.jp/np/books/3612/) |
| *Hajimete no Nihongo Nōryoku Shiken N2 Tango 2500* (はじめての日本語能力試験 N2単語2500) | Extract vocabulary headwords, kana readings, and the associated kanji from learner-selected pages. [Publisher listing](https://ask-books.com/book-details/?slug=9784872179842) |

At launch, learners supply PDFs they have permission to process. Each account has a private library. Any bundled textbook pages, decks, or exercises require publisher permission before release. Groq receives approved study terms and a passage format for reading generation. The app produces original passages and labels them AI-generated.

## 3. Core learner flow

**First visit** · Landing page → Sign up → Verify email → Onboarding → First study activity

**Returning learner** · Log in → Resume onboarding or open Home

**Study loop** · Import → Check and save → Review → Read in context

The home screen shows due kanji, a **Review hard kanji** shortcut, and the latest import status. The library has **Kanji** and **Vocabulary** views. A kanji character such as 確 and a vocabulary word such as 確認（かくにん, confirmation）are separate records. In this app, **learnt** means the learner confirmed an item as studied. Recall difficulty is tracked separately.

## 4. MVP requirements and acceptance criteria

### R1. Import kanji and vocabulary from PDFs

- Accept text-based PDFs and scanned pages. The learner selects the page range and can set a source title. Proposed limits for the pilot are 50 MB per file and 20 pages per import. A learner can import another range from the same file.
- Extract Japanese text page by page. For pages without a usable text layer, run Japanese OCR and show which pages need extra checking. Use Groq to identify kanji and vocabulary candidates, connect readings to the correct entries, and suggest missing English meanings. Keep the source page with each candidate. Show low-confidence entries and fields supplied by AI in the preview.
- Let the learner edit Japanese text, kana readings, and meanings, select items in bulk, and save them as learnt. Require a reading and meaning before saving. Single-kanji entries store relevant readings separately from the kana reading of a whole word.
- Show queued, processing, ready to check, and failed states. Keep completed pages available when another page fails, and let learners retry failed pages. Give a clear error for unreadable, password-protected, or oversized files. Manual entry gives learners a way to add missed items.

**Acceptance.** A text PDF and a scan each produce an editable preview. Candidates appear in the learnt library only after confirmation. Reimporting the same pages keeps one copy of each card and source reference and preserves flags and review history. Finding a saved item on a different page adds that page as a source. An OCR failure on one page leaves other pages available for review.

### R2. Review kanji with flashcards

The front shows one kanji. The learner recalls the reading and meaning, then taps or presses a keyboard control to flip the card. The back shows the meaning, relevant kana readings, and a saved example word when available. The learner then rates the card and advances.

| Rating | Display | Proposed next review |
| --- | --- | --- |
| Hard | Red · Review soon | 1 day |
| Normal | Blue · Review periodically | 3 days |
| Easy | Green · Review less often | 7 days |

New cards start unrated and are eligible for a first review immediately. The default session serves due cards. Learners can also start an all-kanji session. The last rating sets the flag and recalculates the next review date. These intervals are pilot defaults.

**Acceptance.** The answer and rating controls appear after flipping. A rating persists across sessions, updates the due date, and advances exactly once even if the learner taps twice. The session works on a phone and with a keyboard. Each rating uses a visible text label alongside its color.

### R3. Review only hard kanji

Start a Hard-only session from Home, Review, or the filtered library. Include kanji currently flagged Hard, even when their next review date is in the future.

**Acceptance.** With Hard, Normal, Easy, and unrated items in the same library, the session serves only Hard kanji. Changing a card to Normal or Easy removes it from the next Hard-only session. An empty queue explains how to flag a card and offers regular review.

### R4. Browse and correct the learnt library

Show each saved entry with its English meaning, Japanese reading, and source references. For words with kanji, show furigana as ruby text above the word or its kanji segments where alignment is available. For individual kanji, list the relevant kana readings and show furigana on example words. Allow search by Japanese text, kana, or meaning and filters by source and difficulty. Learners can edit or remove saved entries.

**Acceptance.** Searching for `かくにん` retrieves a saved `確認` entry. Filtering Kanji by Hard and a source returns only matching entries. Editing an entry’s reading or meaning updates the corresponding flashcard and preserves its review history.

### R5. Find and compare similar kanji

Add a **Similar kanji** filter to the Kanji view. A learner selects a saved character and sees visually similar saved characters side by side, with meanings, kana readings, and furigana on any example words. Launch with a curated list of common look-alike groups. Let learners record a pair they personally confuse. Offer a short flashcard session using the matched characters when there are at least two saved items in the group.

**Acceptance.** With `未` and `末` saved, choosing `未` displays both in comparison with their own readings and meanings. A learner-added pair appears in both directions. The UI explains when a character has no saved match.

### R6. Generate personalised reading practice

Let learners generate a short Japanese passage in an N2-style format, such as a notice or short article. They can use their whole learnt library, choose a source, or select specific entries. Default selection prioritises recently studied terms and vocabulary containing Hard kanji. Groq can use common connective language and supporting vocabulary for natural prose. The reader highlights matched learnt terms, lets learners reveal readings and meanings, and shows which targets the passage actually used.

When the selection contains enough material, request 3–6 vocabulary words and 2–4 kanji per passage. The app verifies target usage against the passage text and requires at least three target words and two target kanji for a full practice passage. Count a vocabulary word at a valid word boundary or as a verified inflection. Count target kanji inside words. For a smaller selection, offer a shorter practice text and verify at least one selected target from each available type. If no learnt targets are available, offer a link to import or add items.

**Acceptance.** A generated passage identifies the saved terms that appear, allows furigana to be toggled, and can be saved for rereading. If the response misses required targets or returns invalid data, the app retries once and then lets the learner try again without saving an invalid passage.

### R7. Public landing page

- At `/`, use a headline such as **Turn your Japanese study PDFs into flashcards and reading practice.** Put **Get started** and **Log in** in the header. Use **Get started** as the primary action in the hero.
- Show how learners import a PDF, review kanji, and practise reading with saved terms. Include a small interactive flashcard using an original example. Visitors can flip it to see the kana reading and English meaning before creating an account.
- Include links to the privacy policy and terms. Show **Open study dashboard** as the primary action for signed-in learners. Route it through onboarding if setup is pending.

**Acceptance.** On mobile and desktop, a visitor can understand the study flow, flip the demo card by touch or keyboard, and reach sign-up or login from the page. A signed-in learner can open or resume their study workspace.

### R8. Sign-up and login pages

- At `/sign-up`, collect email and password and show the password requirements before submission. Send a verification link, show a confirmation screen with a resend option, and open onboarding once the account is verified and the learner has an active session.
- At `/log-in`, let learners sign in with email and password. Provide a **Forgot password?** link and a path to sign-up. Send a time-limited password reset link and return learners to login after a successful reset. Both forms show pending states and actionable feedback for invalid input, expired links, and temporary failures.
- After login, send learners with pending setup to onboarding. Learners who finished or skipped setup go to the private page they originally requested, or Home by default. Provide a sign-out action in the app.

**Acceptance.** A new learner can create an account, verify their email, and reach onboarding. A returning learner can log in, reset a forgotten password, and sign out. A signed-out visitor who opens a private study link is prompted to log in, and an authenticated learner can access only their own study data.

### R9. First-run onboarding

- At `/onboarding`, use one welcome screen to explain the study loop and offer **Upload a PDF**, **Add a kanji manually**, and **Try a sample flashcard**. Introduce the launch defaults of JLPT N2 practice and English meanings without requiring a profile form.
- Link the first two paths to the existing import and manual-entry screens. Offer a short session with original example kanji for learners without a PDF. Keep sample cards and ratings out of the learner's saved library and due counts.
- Provide **Skip for now** to open Home. Record completion when the learner saves their first entry or finishes the sample session. Save the onboarding state per account so learners who leave midway can resume setup after signing in again. If they skip with an empty library, Home offers the same starting actions.

**Acceptance.** A first-time learner can reach the PDF importer or manual-entry form in one action from onboarding. A learner without study material can finish a sample session. Closing the app before completion allows the learner to resume onboarding, while completing or skipping it opens Home on subsequent visits by default.

## 5. Technical and operational requirements

| Area | Requirement |
| --- | --- |
| Web app | Use Next.js App Router with TypeScript, Tailwind CSS for styling, and `lucide-react` for icons. Provide responsive layouts, visible keyboard focus, and accessible labels for icon-only controls. [Next.js App Router](https://nextjs.org/docs/app), [Tailwind for Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs), [Lucide React](https://lucide.dev/guide/packages/lucide-react) |
| Groq | Call Groq from the server for candidate extraction and passage generation. Keep the API key server-side. Use schema-constrained responses on a supported model, validate content server-side, and benchmark Japanese extraction and writing quality before choosing a model. [Groq Structured Outputs](https://console.groq.com/docs/structured-outputs) |
| Accounts | Use the chosen authentication provider for password handling, verification, reset, and sessions. Rate-limit login and email requests. Check sessions on the server for study pages and API operations. Accept only internal return destinations after sign-in. |
| PDF processing | Use a page-aware parser with a Japanese OCR fallback. Test horizontal and vertical layouts, multi-column word lists, and small furigana. Run imports as durable jobs so users can leave the page and return. Save progress per page and make retries safe. |
| Data | Use authenticated accounts, a relational datastore for saved items, ratings, review events, source references, look-alike pairs, and saved passages, and private temporary storage for uploads. Deduplicate kanji by normalized character and vocabulary by normalized spelling and reading. Keep different readings distinct and allow multiple meanings under the same vocabulary entry. |
| Privacy | Check account ownership on every read and write. Explain before upload that selected page text is sent to Groq for extraction. Keep page contents out of app logs. Delete raw PDFs and OCR text after confirmation or cancellation, with a 24-hour expiry for abandoned imports. Keep saved items and page references until the learner removes them. Confirm Groq data controls and disclose applicable retention before launch. [Groq data controls](https://console.groq.com/docs/your-data) |
| Reliability and cost | Limit concurrent imports and reading requests per account. Preserve study data when Groq times out or rate-limits a request. Track job duration, page failures, retries, and AI usage without logging learner content. Library browsing and flashcards work independently of Groq availability. |

## 6. Release priorities

- **MVP** — Public landing page, account creation and login, first-run onboarding, PDF import and correction, manual entry, learnt library, kanji flashcards, fixed review intervals, Hard-only review, similar-kanji comparison, and personalised reading with furigana and a glossary.
- **Next release** — Add one comprehension question per passage with an answer explanation grounded in the text. Add vocabulary flashcards and adapt review intervals based on recall history. Add CSV or Anki-compatible export so learners can reuse their study library.
- **Later** — Evaluate Burmese meanings and interface localisation, audio for vocabulary readings, and support for other JLPT levels based on pilot feedback.

## 7. Pilot success and release checks

These are proposed pilot targets. Measure them using permission-cleared sample pages and a small group of N2 learners.

| Measure | Proposed target |
| --- | --- |
| First study session | At least 70% of pilot learners who start an import save an entry and rate a flashcard within 10 minutes. |
| Import accuracy | At least 90% of sampled text-PDF candidates and 80% of scanned candidates have the correct Japanese form and reading before correction. Separately measure recall against a manually labelled page set, with at least 80% of intended headwords found across each input type. |
| Review habit | At least 40% of learners who complete a first session rate a card on a different day within the next seven days. |
| Reading quality | Every practice passage shown to learners passes automated target validation. An N2-proficient reviewer rates at least 8 of 10 sampled passages natural, level-appropriate, and correct in their use of target terms. |

Before the pilot, verify the journey from landing page to first study activity and the full upload-to-reading flow on desktop and mobile. Test verification and reset links, protected links, and each onboarding path, including skip and resume. Exercise scanned and vertical pages, duplicate imports, partial OCR failures, Hard-only filtering, an empty library, and Groq downtime. Use cleared fixtures for all three named book formats where available.

## 8. Open decisions

- Confirm the exact book editions and obtain permission-cleared sample pages before finalising OCR support and pilot accuracy targets.
- Confirm whether English meanings cover the first learner group and whether Burmese support belongs in the first release.
- Select the hosting, authentication, storage, and Japanese OCR providers after testing representative pages and estimating per-import cost.
