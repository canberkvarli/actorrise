# ActorRise brand colors (for Gmail / email footer)

Use these **hex** values in HTML email (Gmail doesn’t support OKLCH).

| Role | Hex | Use in email |
|------|-----|----------------|
| **Primary (orange)** | `#D97615` | Buttons, links, logo tint, accent line |
| **Primary – darker** | `#B85E0A` | Hover or emphasis |
| **Text on primary** | `#FFFFFF` | Text on orange buttons/backgrounds |
| **Main text** | `#292929` | Body copy (light backgrounds) |
| **Muted text** | `#616161` | Secondary line, “sent from…” |
| **Background (light)** | `#FAFAFA` | Section background |
| **Border / divider** | `#E0E0E0` | Lines, dividers |

### Minimal footer example (HTML)

```html
<div style="font-family: sans-serif; font-size: 12px; color: #616161;">
  <a href="https://actorrise.com" style="color: #D97615; text-decoration: none; font-weight: 600;">ActorRise</a>
  — Find your next monologue
</div>
```

### With divider

```html
<p style="margin: 16px 0 8px; border-top: 1px solid #E0E0E0; padding-top: 12px; font-size: 11px; color: #616161;">
  <a href="https://actorrise.com" style="color: #D97615; text-decoration: none;">ActorRise</a>
</p>
```

Source: `app/globals.css` (primary = oklch(0.58 0.18 45) → ~#D97615).
