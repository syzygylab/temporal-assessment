"""Build the standalone, customer-facing Juniper PDF slides.

Requires reportlab and pypdf. Run from any directory with a Python runtime
containing those packages. Uses Windows fonts when available, with PDF built-ins
as a portable fallback. No network or running application is required.
"""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "juniper-salon-proposal.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
W, H = 960, 540
GREEN, CREAM, INK, MUTED = "#244D41", "#F7F8F3", "#293D35", "#657262"
fonts = Path("C:/Windows/Fonts")
if (fonts / "georgia.ttf").exists():
    for name, file in [("Title", "georgia.ttf"), ("Body", "calibri.ttf"), ("Strong", "calibrib.ttf")]:
        pdfmetrics.registerFont(TTFont(name, str(fonts / file)))
else:
    for name, base in [("Title", "Times-Roman"), ("Body", "Helvetica"), ("Strong", "Helvetica-Bold")]:
        pdfmetrics.registerFont(pdfmetrics.Font(name, base, "WinAnsiEncoding"))

c = canvas.Canvas(str(OUT), pagesize=(W, H))
c.setTitle("Juniper Salon | Earlier appointments with reliable follow-up")
c.setAuthor("Juniper Salon prototype assessment")
c.setSubject("Problem, prototype behavior, Temporal reliability, simulation boundaries, and proposed pilot")

def text(value, x, y, width, size=18, font="Body", color=INK, leading=None, max_height=None):
    p = Paragraph(value, ParagraphStyle("p", fontName=font, fontSize=size, leading=leading or size * 1.28, textColor=HexColor(color)))
    _, height = p.wrap(width, H)
    if max_height is not None:
        assert height <= max_height, (value, height, max_height)
    assert y + height <= H - 20, (value, y, height)
    p.drawOn(c, x, H - y - height)
    return height

def page(number, dark=False):
    c.setFillColor(HexColor(GREEN if dark else CREAM))
    c.rect(0, 0, W, H, fill=1, stroke=0)
    color = "#D7E1CD" if dark else MUTED
    text("JUNIPER SALON", 52, 29, 400, 11, "Strong", color)
    text(f"{number} / 5", 853, 29, 55, 11, "Body", color)

def footer(value, dark=False):
    text(value, 52, 501, 856, 10, color="#D7E1CD" if dark else MUTED, max_height=24)

def item(number, title, body, y, width=560):
    text(number, 52, y, 35, 22, "Title", GREEN)
    text(title, 98, y, width-46, 20, "Strong", GREEN, max_height=30)
    text(body, 98, y+31, width-46, 17, max_height=80)

# 1. Business problem and a clearly labeled target.
page(1)
text("Earlier appointments,<br/>less chasing", 52, 84, 550, 44, "Title", GREEN, max_height=116)
text("A proposal for Lena and Carla", 52, 210, 530, 20, color=MUTED)
text("Today, a Google Sheet and manual texts make it hard to track replies and remember the next person. Empty chairs cost the salon an opportunity to serve a client.", 52, 276, 490, 20, max_height=115)
text("Texting several people at once has also left two clients believing they had the same appointment.", 52, 401, 490, 19, max_height=75)
text("LENA'S GOAL", 632, 92, 260, 12, "Strong", MUTED)
text("50%+", 628, 124, 285, 66, "Title", GREEN, max_height=90)
text("of last-minute cancellations refilled, without repeated staff checking", 632, 220, 265, 21, max_height=116)
text("The priority", 632, 356, 265, 20, "Strong", GREEN)
text("Keep offers moving reliably and avoid promising the same opening twice.", 632, 391, 265, 19, max_height=80)
footer("Source: Lena's discovery conversation. The refill target is a future pilot goal, not a measured prototype result.")
c.showPage()

# 2. Complete normal flow, with an actual mobile screenshot.
page(2)
text("An opening, from review to acceptance", 52, 76, 856, 34, "Title", GREEN, max_height=47)
item("01", "Staff review the matches", "Match service, required stylist, full availability, and duration. Earliest joined comes first. Remove unsuitable candidates and approve contact now.", 147, 558)
item("02", "One client gets the offer", "The phone page shows service, stylist, date and time. The client has 15 minutes to accept or decline.", 260, 558)
item("03", "The queue moves or the opening fills", "Decline, timeout, or failed delivery moves to the next client. Acceptance holds the opening and ends outreach. Staff update Square manually.", 365, 558)
image_path = ROOT / "evidence" / "client-offer.jpg"
reader = ImageReader(str(image_path))
iw, ih = reader.getSize()
image_height = 347
image_width = image_height * iw / ih
c.drawImage(reader, 682, H - 136 - image_height, width=image_width, height=image_height, mask="auto")
text("Actual prototype client page", 649, 482, 255, 10, color=MUTED)
footer("Declining keeps a client on the waitlist. Accepting removes that entry from consideration for other openings.")
c.showPage()

# 3. Reliability in customer language, with honest outage boundaries.
page(3, True)
text("Reliable follow-up, even after an interruption", 52, 77, 856, 33, "Title", "#FFFFFF", max_height=48)
text("Temporal remembers the offer and its deadline", 52, 154, 830, 25, "Strong", "#FFFFFF", max_height=37)
text("Temporal saves progress if the background service stops. When it restarts, overdue offers expire using their original deadlines and the queue resumes. Closing a browser does not stop the process.", 52, 203, 805, 21, color="#E2E9DC", max_height=89)
text("The first valid acceptance gets the opening", 52, 321, 405, 22, "Strong", "#FFFFFF", max_height=60)
text("Only the current, unexpired offer can win. Old links cannot claim it. A client can accept only one opening from their waitlist entry.", 52, 388, 390, 18, color="#E2E9DC", max_height=93)
text("Staff can stop outreach", 509, 321, 399, 22, "Strong", "#FFFFFF", max_height=60)
text("Canceling closes pending links and stops new offers. If the service cannot confirm a response, the page must not promise a booking.", 509, 388, 399, 18, color="#E2E9DC", max_height=93)
footer("Verified locally: automatic timeout, failed delivery, competing claims, cancellation, and recovery with the original deadline.", True)
c.showPage()

# 4. Explicit boundaries. No claims that simulated integrations are live.
page(4)
text("What this prototype does today", 52, 77, 856, 36, "Title", GREEN, max_height=50)
text("Working locally", 52, 161, 390, 23, "Strong", GREEN)
text("Staff see the current offer, remaining clients, and timestamped outcomes. Outreach ends when someone accepts, staff cancel, candidates run out, or the appointment starts.", 52, 207, 385, 20, max_height=112)
text("Temporal runs the queue and timers. Client pages accept or decline. The demo can shorten the 15-minute window to 20 seconds.", 52, 339, 385, 20, max_height=112)
text("Simulated or excluded", 509, 161, 399, 23, "Strong", GREEN)
text("Texts and notifications appear in a demo inbox. No real SMS goes out. Client records and phone numbers are fictional.", 509, 207, 399, 20, max_height=100)
text("Staff still update Square, including the original appointment. Google Sheets and the full stylist calendar are not connected.", 509, 321, 399, 20, max_height=100)
text("No production login or automatic quiet hours. Staff decide when to begin contact.", 509, 421, 399, 18, max_height=60)
footer("Local demo only. A hold in the prototype does not prove that Square has been updated. No public deployment.")
c.showPage()

# 5. Owned, measurable pilot proposal, clearly not a commitment from Lena.
page(5)
text("A small, supervised pilot", 52, 77, 856, 36, "Title", GREEN, max_height=50)
text("Proposed next step for Lena and Carla", 52, 135, 856, 19, color=MUTED)
item("01", "Agree on the operating rules", "Walk through decline, timeout, and a late acceptance together. Confirm service durations, availability, and who updates Square.", 190, 555)
item("02", "Prepare for real clients", "Add secure staff access and private client links. Connect a real texting provider and check that retries do not send duplicate messages.", 294, 555)
item("03", "Try a two-week pilot", "Lena and Carla supervise each opening and keep Square current. Pause the pilot if a conflicting confirmation occurs.", 401, 555)
text("What to measure", 650, 192, 258, 23, "Strong", GREEN)
text("Refill rate", 650, 239, 258, 19, "Strong", GREEN)
text("Filled openings divided by last-minute cancellations entered. Target: at least half.", 650, 269, 258, 18, max_height=95)
text("Staff effort and trust", 650, 378, 258, 19, "Strong", GREEN)
text("Track manual follow-ups and any conflicting confirmations. Review the results together.", 650, 409, 258, 18, max_height=72)
footer("Proposed pilot, subject to Lena's approval. Local demo: http://localhost:3000 after starting the application.")
c.showPage()
c.save()

pdf = PdfReader(str(OUT))
assert len(pdf.pages) == 5
for i, page in enumerate(pdf.pages, 1):
    extracted = page.extract_text()
    assert extracted and len(extracted) > 200, f"Missing content on slide {i}"
    assert float(page.mediabox.width) == W and float(page.mediabox.height) == H
print(f"Created {OUT} ({len(pdf.pages)} slides)")
