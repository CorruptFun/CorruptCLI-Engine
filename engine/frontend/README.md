# SaaS Boilerplate Service - Website Documentation

## Overview
This is the frontend repository for **SaaS Boilerplate Service** (`yourdomain.com`), a organization designed for everyone. The site is a responsive, single-page marketing and waitlist portal.

## Hosting & Deployment
- **Hosting Provider:** Vercel (Global CDN)
- **Primary Domain:** `https://yourdomain.com`
- **Deployment Strategy:** Vercel is connected directly to the GitHub repository. Any push to the `main` branch automatically triggers a new deployment to production.

## Repository Information
- **GitHub URL:** `https://github.com/Lucidmolt/reform-her`
- **Local Path (OpenClaw):** `/Users/lucid/.openclaw/workspace/projects/reform-her`
- **Branch:** `main`

## Tech Stack
- **HTML5:** Pure HTML structure.
- **CSS Framework:** Tailwind CSS (loaded via CDN for simplicity and rapid prototyping).
- **Fonts:** Playfair Display, Inter, and Great Vibes (via Google Fonts).
- **Forms:** Formspree is currently used for the Waitlist collection (`https://formspree.io/f/xnjgdvzl`).
- **Booking Integration:** Acuity Scheduling (placeholder structure is present in the HTML, pending official embed links).

## File Structure
- `index.html`: The core landing page containing all sections (Hero, About, Classes, Pricing, Waitlist).
- `assets/`: Directory containing static images (e.g., `logo.png`, `favicon.png`, `og-image.jpg`).

## Maintaining the Site
1. **Local Edits:** Changes are made directly to `index.html`.
2. **Version Control:** Edits must be committed to git.
3. **Deployment:** Pushing commits to GitHub (`git push origin main`) will automatically update the live website on Vercel within seconds.

## Upcoming Tasks
- Replace dummy social media links with official URLs once accounts are created.
- Finalize the Acuity booking embed code.