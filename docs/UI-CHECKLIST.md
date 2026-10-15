# UI checklist (before a release)

Run first:  `cd frontend && npm run check:ui`  (accessibility linter, green-colour contrast, type check)

## Every page
- [ ] Lighthouse accessibility score is 95 or higher (desktop and mobile)
- [ ] Looks right at 360, 768 and 1280 px wide, with nothing off screen
- [ ] Tab reaches everything, in a sensible order, with a visible ring
- [ ] The browser tab has a useful title
- [ ] Loading, empty and error states look fine (stop the backend to see the error state)

## Dialogs
- [ ] Tab stays inside, Escape closes only the top one, focus returns to the button that opened it
- [ ] The page behind does not scroll

## Order screen
- [ ] `/` jumps to search, Enter adds a product, focus returns to search after an order
- [ ] Offline banner appears when the network is off

## Colours
- [ ] Text on green is white on `leo-600` or `leo-700` only (never on `leo-500`)
- [ ] Do not use `text-gray-400` for text that matters (`text-gray-500` or darker)
