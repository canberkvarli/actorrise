# Gmail Primary Tab Delivery: Research & Action Plan

**Compiled: 2026-03-24**

---

## 1. How Gmail Classifies Emails (The Algorithm)

Gmail uses ML-based classification with these weighted signals:

### Strongest Signals (User Behavior)
- **Recipient engagement**: Opens, replies, stars, "move to Primary" actions
- **Per-user learning**: Two people can get the same email — one sees Primary, another Promotions
- **Reply rates**: Conversation-style engagement is the strongest signal for Primary placement
- **Domain sending history**: If your domain historically sends marketing, Gmail keeps routing to Promotions

### Content Signals That Trigger Promotions
- **Link count**: Personal emails have 1-2 links max. 5+ links = marketing signal
- **HTML complexity**: Logo banners, navigation menus, colored buttons, multi-column layouts
- **Footer disclaimers**: Physical addresses, legal text, unsubscribe links in footer (required for bulk, but signals "marketing")
- **Promotional language**: "Buy now", "Free offer", "Limited time", "Exclusive deal", "20% off"
- **Image-heavy emails**: High image-to-text ratio
- **Call-to-action buttons**: Styled HTML buttons are a strong promotional signal

### Sender Identity Signals
- **From address**: `canberk@actorrise.com` (personal) > `hello@actorrise.com` > `promotions@actorrise.com`
- **Sending pattern**: Consistent, human-like volumes vs. sudden bulk blasts

---

## 2. Plain Text vs HTML: The Verdict

**Plain text reliably lands in Primary. This is not a myth.**

- Plain text emails resemble personal 1:1 messages, bypassing promotional filters
- One documented case: same content sent as HTML went to Promotions, plain text went to Primary
- HTML emails with images, colors, and formatting signal marketing content
- **Recommendation**: For ActorRise marketing/onboarding emails, use plain text or extremely minimal HTML (no images, no banners, no buttons, 1-2 links max)

### If You Must Use HTML
- Maintain 60% text / 40% HTML ratio
- Use multipart MIME (include both plain text and HTML versions)
- No banner images, no logo headers, no navigation
- Maximum 1-2 links
- No styled buttons — use plain text links

---

## 3. Headers That Trigger Promotions

### Headers to Watch
| Header | Effect |
|--------|--------|
| `Precedence: bulk` | Tells ISPs this is bulk mail. Suppresses auto-replies but signals mass sending |
| `List-Unsubscribe` | Does NOT directly trigger Promotions. Gmail requires it for 5K+/day senders. It's a compliance signal, not a classification trigger |
| `X-Mailer` | Identifies the sending platform. If Gmail recognizes a known ESP, it factors this in |
| `X-Entity-Ref-ID` | Used to prevent Gmail threading. Unique per email = separate threads |

### Key Finding: List-Unsubscribe Is NOT the Problem
The List-Unsubscribe header itself does not force Promotions placement. Gmail sorts by intent and behavior patterns, not individual headers. You should keep it for compliance.

---

## 4. Resend-Specific Considerations

### What Resend Likely Adds
- Resend sends via their own infrastructure (shared/dedicated IPs)
- Resend supports custom headers via API
- Resend offers both API and SMTP sending
- Gmail can detect that emails originate from known ESP infrastructure (IP reputation databases)

### The ESP Detection Problem
**This is likely your biggest issue.** Gmail and Outlook can see that emails are sent from ESP infrastructure (like Resend's IPs) and automatically lean toward Promotions/Spam classification. This is true for ALL email APIs: Resend, SendGrid, Postmark, etc.

### Potential Solutions
1. **Use Resend's SMTP with Google Workspace**: Route through your own Google Workspace SMTP instead of Resend's API — emails appear to come from Google's own servers
2. **Dedicated IP** (if Resend offers it): Isolates your reputation from other senders
3. **Custom headers**: Use Resend's custom header support to strip/control promotional signals

---

## 5. SMTP vs API: What Actually Matters

### Critical Finding
> "If you send cold emails through an SMTP provider, your emails will most likely end up in Promotions or Spam because Gmail and Outlook can see that IP addresses are from an SMTP provider."

**This applies to email API providers too** (Resend, SendGrid, etc.). The key distinction:

| Method | Promotions Risk | Why |
|--------|----------------|-----|
| **Email API (Resend, SendGrid)** | High | Gmail detects ESP infrastructure IPs |
| **Google Workspace SMTP** | Low | Emails route through Google's own servers |
| **Cold email tools (Instantly, Lemlist)** | Low | They use account-level SMTP/OAuth, sending AS your Gmail/Workspace account |

### What Cold Email Tools Do Differently
- **Instantly, Lemlist, Woodpecker** connect via OAuth or IMAP/SMTP directly to YOUR email account
- Emails are sent FROM your actual Google Workspace / Gmail account
- Gmail sees the email as originating from its own infrastructure
- This is the single biggest reason cold email tools land in Primary
- They also include: warmup networks, send throttling, spintax variation, rotation across multiple accounts

---

## 6. Email Warmup Strategy

### For a New Domain / New Sending Pattern
| Week | Emails/Day | Focus |
|------|-----------|-------|
| 1 | 5-10 | Plain text to engaged contacts only |
| 2 | 10-20 | Mix of contacts, encourage replies |
| 3 | 20-30 | Gradually expand audience |
| 4+ | 30-50 | Scale slowly, monitor placement |

### Key Rules
- **Never spike volume**: Sudden jumps from 10 to 500 = instant spam/promotions
- **Predictable daily volumes**: Gmail rewards consistency
- **Encourage replies**: The #1 warmup signal. Ask questions, be conversational
- **Takes 2-4 weeks** minimum to establish baseline reputation
- **Stay under 50/day** until trust is firmly established

### Warmup Tools
- **Lemwarm** (by Lemlist): 20,000+ domain network, 150+ countries
- **Mailwarm**: Simulates opens and replies
- **Instantly's warmup**: Built into their cold email platform
- These tools send emails between real accounts, generating opens/replies to build reputation

---

## 7. DMARC/SPF/DKIM Configuration

### Required Setup (Non-Negotiable)
1. **SPF**: Authorize your sending servers (Resend's servers + Google Workspace if applicable)
2. **DKIM**: 2048-bit key length recommended. Ensure alignment between From domain and DKIM domain
3. **DMARC**: Start with `p=none` to monitor, then escalate to `p=quarantine` then `p=reject`

### 2026 Enforcement Changes
- Gmail and Yahoo tightened requirements in 2025: SPF + DKIM + DMARC mandatory for bulk senders (5K+/day)
- 2026: Even stricter alignment checks — mismatch between From address and DKIM domain triggers spam filters
- **Use a dedicated sending subdomain**: e.g., `mail.actorrise.com` to isolate reputation from main domain

---

## 8. Actionable Recommendations for ActorRise

### Immediate Changes (This Week)
1. **Switch marketing emails to plain text** — no HTML templates, no images, no buttons
2. **Write like a human**: Short, conversational, first-person (you already do this)
3. **Limit to 1 link per email** (the CTA link only)
4. **Remove promotional subject line words**: No "free", "exclusive", "limited", "offer"
5. **Verify DMARC/SPF/DKIM** are properly configured and aligned

### Medium-Term (Next 2-4 Weeks)
6. **Consider sending via Google Workspace SMTP** instead of Resend API for marketing emails
   - Keep Resend for transactional emails (password resets, etc.) where Promotions tab is less of a concern
   - Marketing/onboarding emails route through Google Workspace
7. **Start warmup process**: Send to your most engaged users first, encourage replies
8. **Test inbox placement**: Use tools like Mail-tester.com, GlockApps, or MailReach

### Long-Term Strategy
9. **Evaluate cold email tools** (Instantly or Lemlist) for marketing sequences — they solve the ESP detection problem by sending through your actual email account
10. **Build reply culture**: End emails with questions. Every reply signals to Gmail "this is a real conversation"
11. **Ask early subscribers to drag emails to Primary** — this trains Gmail's per-user model
12. **Consider a dedicated sending subdomain** (`mail.actorrise.com`) to isolate marketing reputation

### Subject Line Patterns That Work for Primary
- Short, lowercase, conversational: "quick question about your scenes"
- Personal and specific: "saw your monologue — had a thought"
- No caps, no emojis, no punctuation tricks
- No promotional keywords whatsoever

### Subject Line Patterns That Trigger Promotions
- "Your FREE trial awaits!"
- "Exclusive offer inside"
- "Don't miss out — 50% off"
- ALL CAPS anything
- Excessive punctuation (!!!, ???)

---

## Sources

- [Saleshandy: Avoid Gmail Promotions Tab (2026)](https://www.saleshandy.com/blog/avoid-gmail-promotions-tab/)
- [Woodpecker: How to Avoid Gmail Promotions Tab](https://woodpecker.co/blog/how-to-avoid-gmail-promotions-tab/)
- [MailReach: Why Emails Go to Promotions](https://www.mailreach.co/blog/why-your-emails-are-going-to-promotions-instead-of-primary)
- [EmailChaser: Plain Text vs HTML Deliverability](https://www.emailchaser.com/learn/plain-text-vs-html)
- [EmailChaser: Should You Use SMTP for Cold Emails](https://www.emailchaser.com/learn/should-you-use-an-smtp-provider-to-send-cold-emails)
- [Reply.io: API vs SMTP for Deliverability (2026)](https://reply.io/blog/api-vs-smtp/)
- [TrulyInbox: How to Set Up SPF/DKIM/DMARC (2026)](https://www.trulyinbox.com/blog/how-to-set-up-spf-dkim-and-dmarc/)
- [MailReach: How to Warm Up Email Domain (2026)](https://www.mailreach.co/blog/how-to-warm-up-email-domain)
- [MailReach: Gmail Warmup Guide (2026)](https://www.mailreach.co/blog/gmail-warmup)
- [Instantly: 90%+ Cold Email Deliverability (2026)](https://instantly.ai/blog/how-to-achieve-90-cold-email-deliverability-in-2025/)
- [Mailgun: Why Emails Go to Promotions Tab](https://www.mailgun.com/blog/deliverability/gmails-promotions-tab-how-to-get-emails-classified-as-primary/)
- [SortedIQ: Why Emails Go to Promotions Tab](https://messaging.sortediq.com/why-emails-going-to-gmail-promotions-tab.html)
- [Litmus: Guide to List-Unsubscribe](https://www.litmus.com/blog/the-ultimate-guide-to-list-unsubscribe)
- [Validity: Understanding the Precedence Header](https://www.validity.com/blog/understanding-the-precedence-header/)
- [InboxAlly: Email Deliverability Best Practices 2026](https://www.inboxally.com/blog/11-email-deliverability-best-practices)
- [Mailwarm: Avoid Gmail Promotion Tab (2026)](https://www.mailwarm.com/blog/avoid-gmail-promotion-tab)
