# Smart-Reader — Coding Agent Instructions

## Project context

Smart-Reader is a SaaS MVP for immersive language learning through reading ebooks.

The goal is not to build a full ebook store or a generic language-learning platform. The goal is to help users read real content, translate words or phrases in context, save vocabulary, and export study cards to Anki.

## Tech stack

- Next.js latest stable version
- App Router
- TypeScript
- Tailwind CSS
- Supabase for auth, database, and storage
- Stripe for payments
- OpenAI API or compatible AI API for contextual translation
- epub.js for EPUB rendering
- CSV export for Anki compatibility

## Coding rules

- Use TypeScript everywhere.
- Use functional React components.
- Prefer Server Components by default.
- Use Client Components only when needed for interactivity.
- Keep files small and focused.
- Avoid overengineering.
- Avoid unnecessary abstractions.
- Do not add new dependencies unless clearly needed.
- Use Tailwind CSS for styling.
- Keep UI minimal, clean, and focused on reading.

## Architecture rules

Use this general structure:

src/
  app/
    (marketing)/
    (auth)/
    (app)/
    api/
  components/
    layout/
    ui/
    reader/
    vocabulary/
    books/
  lib/
  types/

Route groups should be used to separate:
- marketing pages
- authentication pages
- private application pages

## MVP priorities

Prioritize features in this order:

1. Basic app structure
2. Authentication
3. Book library
4. EPUB upload
5. EPUB reader
6. Contextual translation
7. Vocabulary saving
8. Context sentence extraction
9. CSV export for Anki
10. Stripe payment flow

## What not to build yet

Do not build these unless explicitly requested:

- Native mobile app
- Social features
- Full ebook marketplace
- Complex gamification
- AI tutor/chatbot
- PDF OCR
- Advanced spaced repetition system
- Full .apkg export
- Admin dashboard
- Recommendation engine

## Product principle

If a feature does not help the user get a word from a book into Anki faster, do not prioritize it for the MVP.

## Security rules

- Never expose API keys in client components.
- OpenAI calls must go through server-side routes.
- Stripe secrets must stay server-side.
- Supabase Row Level Security must be assumed and respected.
- User data must always be scoped by user ID.

## Code style

- Use clear names.
- Prefer readability over cleverness.
- Add comments only where logic is not obvious.
- Keep components reusable but not overly generic.
- Use simple error handling first.

## UX principle

The reader experience must feel invisible. The book is the focus, not the interface.