# Selena Site - Pending Changes

## 1. Contact Page (`contact.html`) - "Get In Touch" section
- Center-align the text in `.contact-info` (currently left-aligned)
- Make the text a little bigger (h3 from 1.6rem to ~2rem, paragraph text from 15px to ~17px)
- CSS changes needed in `css/style.css` around line 520

## 2. Booking Page (`booking.html`) - Calendly embed
- Replace full nav header with just a small back button (arrow + "Back" linking to index.html)
- Keep it slim, almost no header at all
- Remove the footer entirely (user is already booking, no need for footer links or "Book A Session" CTA)
- The Calendly widget embed stays as-is: `https://calendly.com/slabrooy?hide_gdpr_banner=1`

## Files to modify
- `selena/css/style.css` (contact-info styles, ~line 520)
- `selena/booking.html` (header and footer removal)
- `selena/contact.html` (no HTML changes needed if CSS handles the centering)
